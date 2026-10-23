"""Full-match tactical analysis of one engine match, for the web UI's Match analysis screen.

    pip install -r web/tools/requirements-analysis.txt   (socceraction, into any path)
    .venv/bin/python web/tools/export_analysis.py --match p-1008 [--train 200]

Everything is measured from the engine's own 90 minutes; nothing is hand-written. The match is
rebuilt from its ID exactly as debugger.plugin does. Football models used:

  xT     socceraction's Expected Threat (Singh 2019), fitted on SPADL actions from --train
         engine-simulated matches (other seeds), then used to value every pass and carry here.
  xG     the engine's own goal model (engine.goal_model), the same one that decides shots.
  pass   the engine's own pass model (engine.decisions.pass_success_prob), to price the passes
         a shooter could have played instead.

Output: web/public/showcase/<match_id>/analysis.json (shape documented in web/tools/ANALYSIS.md).
This script only reads the engine and debugger; it does not change them.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
from socceraction import spadl
from socceraction.spadl import config as spadlconfig
from socceraction.xthreat import ExpectedThreat

from debugger import plugin
from engine import decisions, goal_model, pitch
from engine.simulate import Match

L, W = 16, 12  # xT grid
BUCKET_S = 300  # momentum and line-height buckets (5 minutes)
HEAT_X, HEAT_Y = 12, 8
UNIT = {
    "GK": "gk",
    "RB": "def",
    "LB": "def",
    "RCB": "def",
    "LCB": "def",
    "CB": "def",
    "DM": "mid",
    "RCM": "mid",
    "LCM": "mid",
    "CM": "mid",
    "RM": "mid",
    "LM": "mid",
    "AM": "mid",
    "RW": "att",
    "LW": "att",
    "ST": "att",
    "ST2": "att",
    "CF": "att",
}
T_PASS = spadlconfig.actiontypes.index("pass")
T_CROSS = spadlconfig.actiontypes.index("cross")
T_DRIBBLE = spadlconfig.actiontypes.index("dribble")
T_TAKE_ON = spadlconfig.actiontypes.index("take_on")
T_SHOT = spadlconfig.actiontypes.index("shot")
R_FAIL = spadlconfig.results.index("fail")
R_OK = spadlconfig.results.index("success")
R_OFF = spadlconfig.results.index("offside")
FOOT = spadlconfig.bodyparts.index("foot")


def r2(x: float) -> float:
    return round(float(x), 2)


def r3(x: float) -> float:
    return round(float(x), 3)


def fwd(xy, d: float) -> np.ndarray:
    """A pitch point in the acting team's frame: attacking toward x = 105."""
    xy = np.asarray(xy, dtype=float)
    return xy if d > 0 else np.array([pitch.PITCH_X, pitch.PITCH_Y]) - xy


def spadl_rows(events, game_id: int, ctx) -> list[tuple]:
    """Engine events as SPADL actions (all in the acting team's left-to-right frame)."""
    rows = []
    for e in events:
        if e.type not in ("pass", "carry", "duel", "shot") or e.player is None:
            continue
        d = pitch.attack_dir(e.team, e.period)
        s = fwd(e.ball, d)
        if e.type == "pass":
            end = fwd(e.end, d)
            cross = decisions._is_crossing(e.ball, d, ctx)
            t = T_CROSS if cross else T_PASS
            r = {"complete": R_OK, "offside": R_OFF}.get(e.outcome, R_FAIL)
        elif e.type == "carry":
            end, t, r = fwd(e.end, d), T_DRIBBLE, R_OK
        elif e.type == "duel":
            end, t, r = s, T_TAKE_ON, R_OK if e.outcome == "won" else R_FAIL
        else:
            end, t, r = (
                np.array([pitch.PITCH_X, pitch.PITCH_Y / 2]),
                T_SHOT,
                (R_OK if e.outcome == "goal" else R_FAIL),
            )
        rows.append(
            (
                game_id,
                e.seq,
                e.period,
                float(e.clock_s),
                int(e.team),
                int(e.player),
                float(s[0]),
                float(s[1]),
                float(end[0]),
                float(end[1]),
                t,
                r,
                FOOT,
            )
        )
    return rows


def _sim(seed: int) -> list[tuple]:
    m = Match(seed).run()
    return spadl_rows(m.events, seed, m.ctx)


COLS = [
    "game_id",
    "original_event_id",
    "period_id",
    "time_seconds",
    "team_id",
    "player_id",
    "start_x",
    "start_y",
    "end_x",
    "end_y",
    "type_id",
    "result_id",
    "bodypart_id",
]


def to_frame(rows) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=COLS)
    df["action_id"] = df.groupby("game_id").cumcount()
    return spadl.add_names(df)


def fit_xt(n: int, skip: int) -> ExpectedThreat:
    seeds = [s for s in range(20_000, 20_000 + n + 1) if s != skip][:n]
    with Pool(4) as pool:
        rows = [r for chunk in pool.map(_sim, seeds) for r in chunk]
    model = ExpectedThreat(l=L, w=W)
    model.fit(to_frame(rows))
    return model


def xt_at(grid: np.ndarray, x: float, y: float) -> float:
    xi = min(max(int(x / pitch.PITCH_X * L), 0), L - 1)
    yj = min(max(int(y / pitch.PITCH_Y * W), 0), W - 1)
    return float(grid[W - 1 - yj, xi])


class Analysis:
    def __init__(self, match_id: str, train: int, xt_cache: Path | None = None):
        self.match = plugin.load_match(match_id)
        self.ctx = self.match.ctx
        self.meta = self.match.meta().model_dump()
        self.ev = self.match.events
        self.hist = self.match.history
        if xt_cache and xt_cache.exists():
            self.grid = np.asarray(json.loads(xt_cache.read_text()))
        else:
            self.grid = np.asarray(fit_xt(train, getattr(self.ctx, "seed", -1)).xT)
            if xt_cache:
                xt_cache.write_text(json.dumps(self.grid.tolist()))
        self.w = self.ctx.w
        self.pos_name = {}
        for side in ("home", "away"):
            for p in self.meta[side]["players"]:
                self.pos_name[p["id"]] = p["position"]
        self.unit = {i: UNIT.get(self.pos_name[pitch.player_id(i)], "mid") for i in range(22)}

    # helpers -------------------------------------------------------------------------------
    def d(self, team: int, period: int) -> float:
        return pitch.attack_dir(team, period)

    def xt_gain(self, e) -> float:
        """xT added by a successful pass or carry (start and end in the team's frame)."""
        if e.type not in ("pass", "carry") or e.outcome != "complete":
            return 0.0
        d = self.d(e.team, e.period)
        s, t = fwd(e.ball, d), fwd(e.end, d)
        return xt_at(self.grid, *t) - xt_at(self.grid, *s)

    def team_name(self, team: int) -> str:
        return "home" if team == pitch.HOME else "away"

    def state(self, s: int):
        return self.hist[min(max(s, 0), len(self.hist) - 1)]

    # sections --------------------------------------------------------------------------------
    def teams(self) -> dict:
        out = {}
        poss = Counter(int(st.possession) for st in self.hist[1:])
        total = sum(poss.values()) or 1
        final_third = Counter()
        for e in self.ev:
            if (
                e.type in ("pass", "carry", "duel", "shot")
                and e.player is not None
                and fwd(e.ball, self.d(e.team, e.period))[0] >= 70
            ):
                final_third[int(e.team)] += 1
        ft_total = sum(final_third.values()) or 1
        for team in (0, 1):
            mine = [e for e in self.ev if e.team == team and e.player is not None]
            passes = [e for e in mine if e.type == "pass"]
            done = [e for e in passes if e.outcome == "complete"]
            prog = [e for e in done if self._progressive(e)]
            shots = [e for e in mine if e.type == "shot"]
            # PPDA: opponent passes in their own 60% / our defensive actions in that zone
            opp_passes = 0
            def_actions = 0
            win_x = []
            for e in self.ev:
                if e.player is None:
                    continue
                if e.type == "pass" and e.team != team:
                    if fwd(e.ball, self.d(e.team, e.period))[0] <= 63:
                        opp_passes += 1
                        if e.outcome == "incomplete":
                            def_actions += 1
                elif (
                    e.type == "duel"
                    and e.team != team
                    and e.outcome == "lost"
                    and fwd(e.ball, self.d(e.team, e.period))[0] <= 63
                ):
                    def_actions += 1
                    win_x.append(pitch.PITCH_X - fwd(e.ball, self.d(e.team, e.period))[0])
            entries = Counter()
            for e in done:
                d = self.d(e.team, e.period)
                s, t = fwd(e.ball, d), fwd(e.end, d)
                if s[0] < 70 <= t[0]:
                    entries["left" if t[1] > 45.3 else "right" if t[1] < 22.7 else "centre"] += 1
            for e in mine:
                if e.type == "carry" and e.outcome == "complete":
                    d = self.d(e.team, e.period)
                    s, t = fwd(e.ball, d), fwd(e.end, d)
                    if s[0] < 70 <= t[0]:
                        entries[
                            "left" if t[1] > 45.3 else "right" if t[1] < 22.7 else "centre"
                        ] += 1
            duels = [e for e in self.ev if e.type == "duel"]
            won = sum(1 for e in duels if (e.team == team) == (e.outcome == "won"))
            out[self.team_name(team)] = {
                "possession_pct": r2(100 * poss[team] / total),
                "field_tilt_pct": r2(100 * final_third[team] / ft_total),
                "passes": len(passes),
                "pass_pct": r2(100 * len(done) / max(len(passes), 1)),
                "progressive_passes": len(prog),
                "offsides": sum(1 for e in passes if e.outcome == "offside"),
                "ppda": r2(opp_passes / max(def_actions, 1)),
                "regain_height_m": r2(np.mean(win_x)) if win_x else None,
                "shots": len(shots),
                "on_target": sum(1 for e in shots if e.outcome in ("goal", "saved")),
                "goals": sum(1 for e in shots if e.outcome == "goal"),
                "xg": r2(sum(e.xg or 0 for e in shots)),
                "xt": r2(sum(max(self.xt_gain(e), 0) for e in mine)),
                "duels_won_pct": r2(100 * won / max(len(duels), 1)),
                "final_third_entries": {k: entries[k] for k in ("left", "centre", "right")},
            }
        return out

    def _progressive(self, e) -> bool:
        """Wyscout-style: moves the ball at least 25% closer to the opponent goal."""
        d = self.d(e.team, e.period)
        s, t = fwd(e.ball, d), fwd(e.end, d)
        goal = np.array([pitch.PITCH_X, pitch.PITCH_Y / 2])
        return np.hypot(*(goal - t)) <= 0.75 * np.hypot(*(goal - s)) and t[0] > 35

    def momentum(self) -> list[dict]:
        n = math.ceil(pitch.FULL_S / BUCKET_S)
        out = [
            {
                "from_s": i * BUCKET_S,
                "to_s": (i + 1) * BUCKET_S,
                "home_xt": 0.0,
                "away_xt": 0.0,
                "home_xg": 0.0,
                "away_xg": 0.0,
                "home_shots": 0,
                "away_shots": 0,
                "goals": [],
            }
            for i in range(n)
        ]
        for e in self.ev:
            if e.player is None:
                continue
            b = out[min(int(e.clock_s // BUCKET_S), n - 1)]
            side = self.team_name(e.team)
            b[f"{side}_xt"] += max(self.xt_gain(e), 0)
            if e.type == "shot":
                b[f"{side}_xg"] += e.xg or 0
                b[f"{side}_shots"] += 1
                if e.outcome == "goal":
                    b["goals"].append(
                        {"side": side, "second": e.clock_s, "player_id": pitch.player_id(e.player)}
                    )
        for b in out:
            for k in ("home_xt", "away_xt", "home_xg", "away_xg"):
                b[k] = r3(b[k])
        return out

    def shapes(self) -> dict:
        """Average positions in and out of possession, each team drawn attacking right."""
        out = {}
        for team in (0, 1):
            idx = pitch.TEAM_IDX[team]
            acc = {"in": [], "out": []}
            for st in self.hist[1::2]:
                d = self.d(team, st.period)
                p = np.array([fwd(xy, d) for xy in st.pos[idx]])
                acc["in" if int(st.possession) == team else "out"].append(p)
            side = {}
            for k, frames in acc.items():
                a = np.mean(frames, axis=0)
                players = [
                    {
                        "id": pitch.player_id(int(i)),
                        "x": r2(a[j, 0]),
                        "y": r2(a[j, 1]),
                        "unit": self.unit[int(i)],
                    }
                    for j, i in enumerate(idx)
                ]
                outfield = a[[j for j, i in enumerate(idx) if self.unit[int(i)] != "gk"]]
                lines = {}
                for u in ("def", "mid", "att"):
                    js = [j for j, i in enumerate(idx) if self.unit[int(i)] == u]
                    lines[u] = r2(np.mean(a[js, 0]))
                side[k] = {
                    "players": players,
                    "lines": lines,
                    "depth_m": r2(outfield[:, 0].max() - outfield[:, 0].min()),
                    "width_m": r2(outfield[:, 1].max() - outfield[:, 1].min()),
                }
            out[self.team_name(team)] = side
        return out

    def lines_over_time(self) -> list[dict]:
        """Out of possession: how high each back line held, and how compact the block was."""
        n = math.ceil(pitch.FULL_S / BUCKET_S)
        acc = [defaultdict(list) for _ in range(n)]
        for st in self.hist[1:]:
            b = acc[min(int(st.clock_s // BUCKET_S), n - 1)]
            team = 1 - int(st.possession)
            idx = pitch.TEAM_IDX[team]
            d = self.d(team, st.period)
            p = np.array([fwd(xy, d) for xy in st.pos[idx]])
            defs = [j for j, i in enumerate(idx) if self.unit[int(i)] == "def"]
            out = [j for j, i in enumerate(idx) if self.unit[int(i)] != "gk"]
            side = self.team_name(team)
            b[f"{side}_line"].append(float(np.mean(p[defs, 0])))
            b[f"{side}_depth"].append(float(p[out, 0].max() - p[out, 0].min()))
        rows = []
        for i, b in enumerate(acc):
            row = {"from_s": i * BUCKET_S}
            for side in ("home", "away"):
                row[f"{side}_line"] = r2(np.mean(b[f"{side}_line"])) if b[f"{side}_line"] else None
                row[f"{side}_depth"] = (
                    r2(np.mean(b[f"{side}_depth"])) if b[f"{side}_depth"] else None
                )
            rows.append(row)
        return rows

    def networks(self) -> dict:
        out = {}
        for team in (0, 1):
            pairs = Counter()
            spots = defaultdict(list)
            for e in self.ev:
                if e.team != team or e.player is None or e.type != "pass":
                    continue
                d = self.d(team, e.period)
                spots[int(e.player)].append(fwd(e.ball, d))
                if e.outcome == "complete" and e.receiver is not None:
                    pairs[tuple(sorted((int(e.player), int(e.receiver))))] += 1
            nodes = []
            for i in pitch.TEAM_IDX[team]:
                pts = spots.get(int(i)) or [fwd(self.hist[1].pos[i], self.d(team, 1))]
                a = np.mean(pts, axis=0)
                nodes.append(
                    {
                        "id": pitch.player_id(int(i)),
                        "x": r2(a[0]),
                        "y": r2(a[1]),
                        "passes": len(spots.get(int(i), [])),
                    }
                )
            edges = [
                {"a": pitch.player_id(a), "b": pitch.player_id(b), "n": n}
                for (a, b), n in pairs.most_common()
                if n >= 4
            ]
            out[self.team_name(team)] = {"nodes": nodes, "edges": edges}
        return out

    def players(self) -> list[dict]:
        stats = {i: Counter() for i in range(22)}
        heat = {i: np.zeros((HEAT_Y, HEAT_X)) for i in range(22)}
        for st in self.hist[1::3]:
            for i in range(22):
                t = pitch.team_of(i)
                x, y = fwd(st.pos[i], self.d(t, st.period))
                heat[i][
                    min(int(y / pitch.PITCH_Y * HEAT_Y), HEAT_Y - 1),
                    min(int(x / pitch.PITCH_X * HEAT_X), HEAT_X - 1),
                ] += 1
        evs = [e for e in self.ev if e.player is not None]
        for k, e in enumerate(evs):
            i = int(e.player)
            s = stats[i]
            if e.type in ("pass", "carry", "duel", "shot"):
                s["touches"] += 1
            if e.type == "pass":
                s["passes"] += 1
                if e.outcome == "complete":
                    s["passes_done"] += 1
                    if self._progressive(e):
                        s["progressive"] += 1
                    nxt = next(
                        (x for x in evs[k + 1 : k + 4] if x.type in ("shot", "pass", "duel")), None
                    )
                    if nxt is not None and nxt.type == "shot" and nxt.player == e.receiver:
                        s["key_passes"] += 1
                        if nxt.outcome == "goal":
                            s["assists"] += 1
                else:
                    s["losses"] += 1
            elif e.type == "shot":
                s["shots"] += 1
                s["xg"] += e.xg or 0
                if e.outcome == "goal":
                    s["goals"] += 1
            elif e.type == "duel":
                if e.outcome == "won":
                    s["duels_won"] += 1
                else:
                    s["duels_lost"] += 1
                    s["losses"] += 1
                if e.receiver is not None:  # the challenger
                    c = stats[int(e.receiver)]
                    if e.outcome == "lost":
                        c["duels_won"] += 1
                        c["tackles"] += 1
                    else:
                        c["duels_lost"] += 1
            s["xt"] += self.xt_gain(e)
        out = []
        for i in range(22):
            s = stats[i]
            pid = pitch.player_id(i)
            unit = self.unit[i]
            rating = (
                6.0
                + 4.0 * s["xt"]
                + 1.0 * s["goals"]
                + 0.6 * s["assists"]
                + 0.25 * s["key_passes"]
                + 0.6 * s["xg"]
                + 0.03 * s["progressive"]
                + 0.05 * s["tackles"]
                - 0.03 * s["losses"]
                + (0.2 if unit in ("def", "gk") else 0)
            )
            h = heat[i]
            out.append(
                {
                    "id": pid,
                    "side": self.team_name(pitch.team_of(i)),
                    "position": self.pos_name[pid],
                    "unit": unit,
                    "touches": s["touches"],
                    "passes": s["passes"],
                    "pass_pct": r2(100 * s["passes_done"] / max(s["passes"], 1)),
                    "progressive": s["progressive"],
                    "key_passes": s["key_passes"],
                    "assists": s["assists"],
                    "shots": s["shots"],
                    "goals": s["goals"],
                    "xg": r3(s["xg"]),
                    "xt": r3(s["xt"]),
                    "duels_won": s["duels_won"],
                    "duels_lost": s["duels_lost"],
                    "tackles": s["tackles"],
                    "losses": s["losses"],
                    "rating": round(min(max(rating, 4.5), 9.8), 1),
                    "heat": [[round(v / max(h.max(), 1), 2) for v in row] for row in h],
                }
            )
        return out

    def _reach(self, st, team: int, point) -> list[dict]:
        """Seconds each of the nearest defenders needs to reach a point (engine top speed)."""
        speed = self.w["movement"]["press_speed_mps"]
        opp = pitch.TEAM_IDX[1 - team]
        dist = np.hypot(*(st.pos[opp] - np.asarray(point)).T)
        order = np.argsort(dist)[:3]
        return [
            {"id": pitch.player_id(int(opp[j])), "t": r2(dist[j] / speed), "m": r2(dist[j])}
            for j in order
        ]

    def chances(self) -> list[dict]:
        out = []
        evs = [e for e in self.ev if e.player is not None]
        gw = self.w["goal_model"]
        for k, e in enumerate(evs):
            if e.type != "shot":
                continue
            team, shooter = int(e.team), int(e.player)
            d = self.d(team, e.period)
            st = self.state(e.clock_s)
            pos = np.array(e.pos)
            opp_idx = pitch.TEAM_IDX[1 - team]
            f = goal_model.shot_features(np.asarray(e.ball), d, pos[opp_idx])
            # who else could have taken it: pass there (engine pass model) x their shot (xG)
            alts = []
            press = float(np.min(np.hypot(*(pos[opp_idx] - pos[shooter]).T)))
            # the history state for this second, with the positions at the instant of the shot
            st_now = type(st)(**{**st.__dict__, "pos": pos.copy()})
            for r in pitch.TEAM_IDX[team]:
                r = int(r)
                if r == shooter or self.unit[r] == "gk":
                    continue
                if decisions.is_offside(st_now, team, r):
                    continue
                p = decisions.pass_success_prob(st_now, self.ctx, shooter, r, press)
                fr = goal_model.shot_features(pos[r], d, pos[opp_idx])
                xg_r = goal_model.goal_probability(fr, gw)
                alts.append(
                    {
                        "id": pitch.player_id(r),
                        "pass_p": r3(p),
                        "xg": r3(xg_r),
                        "value": r3(p * xg_r),
                    }
                )
            alts.sort(key=lambda a: -a["value"])
            best = alts[0] if alts else None
            xg = float(e.xg or 0)
            # the pass that led to it, and when this possession started
            prev = next(
                (
                    x
                    for x in reversed(evs[max(0, k - 6) : k])
                    if x.type == "pass"
                    and x.team == team
                    and x.outcome == "complete"
                    and x.receiver == shooter
                ),
                None,
            )
            reasons = []
            if best and best["value"] > max(xg * 1.25, xg + 0.03):
                reasons.append("better_pass")
            if f.blockers >= 2:
                reasons.append("crowded")
            if f.distance_m > 22:
                reasons.append("long_range")
            if f.angle_rad < 0.2:
                reasons.append("tight_angle")
            # one second earlier: was the shot already on, and how far away were defenders?
            before = self.state(e.clock_s - 1)
            ball_b = np.asarray(before.pos[shooter])
            xg_b = goal_model.goal_probability(
                goal_model.shot_features(ball_b, d, before.pos[opp_idx]), gw
            )
            if xg_b > max(xg * 1.3, xg + 0.03):
                reasons.append("earlier")
            if f.nearest_opponent_m < 1.0:
                reasons.append("pressured")
            # the assist moment: did the passer have a better target than the shooter?
            assist_alts = []
            if prev is not None:
                pst = self.state(prev.clock_s)
                pp = np.array(prev.pos)
                ppress = float(np.min(np.hypot(*(pp[opp_idx] - pp[int(prev.player)]).T)))
                pst_now = type(pst)(**{**pst.__dict__, "pos": pp.copy()})
                for r in pitch.TEAM_IDX[team]:
                    r = int(r)
                    if r == int(prev.player) or self.unit[r] == "gk":
                        continue
                    if decisions.is_offside(pst_now, team, r):
                        continue
                    p = decisions.pass_success_prob(pst_now, self.ctx, int(prev.player), r, ppress)
                    xg_r = goal_model.goal_probability(
                        goal_model.shot_features(pp[r], d, pp[opp_idx]), gw
                    )
                    assist_alts.append(
                        {
                            "id": pitch.player_id(r),
                            "pass_p": r3(p),
                            "xg": r3(xg_r),
                            "value": r3(p * xg_r),
                            "chosen": r == shooter,
                        }
                    )
                assist_alts.sort(key=lambda a: -a["value"])
                chosen = next((a for a in assist_alts if a["chosen"]), None)
                if (
                    chosen
                    and assist_alts
                    and not assist_alts[0]["chosen"]
                    and (
                        assist_alts[0]["value"] > max(chosen["value"] * 1.3, chosen["value"] + 0.03)
                    )
                ):
                    reasons.append("better_assist")
            if e.outcome != "goal" and xg >= 0.2:
                reasons.append("big_chance")
            start = e.clock_s
            for x in reversed(evs[:k]):
                if x.possession_id != e.possession_id:
                    break
                start = x.clock_s
            frames = []
            for s in range(e.clock_s - 5, e.clock_s + 1):
                h = self.state(s)
                frames.append(
                    {
                        "second": int(h.clock_s),
                        "ball": [r2(v) for v in (e.ball if s == e.clock_s else h.ball)],
                        "pos": [[r2(a), r2(b)] for a, b in (pos if s == e.clock_s else h.pos)],
                    }
                )
            out.append(
                {
                    "seq": e.seq,
                    "second": e.clock_s,
                    "period": e.period,
                    "side": self.team_name(team),
                    "attack_dir": d,
                    "shooter": pitch.player_id(shooter),
                    "outcome": e.outcome,
                    "xg": r3(xg),
                    "distance_m": r2(f.distance_m),
                    "angle_deg": r2(math.degrees(f.angle_rad)),
                    "blockers": f.blockers,
                    "nearest_m": r2(f.nearest_opponent_m),
                    "score_before": list(e.score)
                    if e.outcome != "goal"
                    else [e.score[0] - (team == 0), e.score[1] - (team == 1)],
                    "assist": None
                    if prev is None
                    else {
                        "id": pitch.player_id(int(prev.player)),
                        "second": prev.clock_s,
                        "from": [r2(v) for v in prev.ball],
                        "to": [r2(v) for v in prev.end],
                    },
                    "build_up_s": int(e.clock_s - start),
                    "reach": self._reach(before, team, e.ball),
                    "xg_1s_before": r3(xg_b),
                    "assist_options": assist_alts[:4],
                    "alternatives": alts[:3],
                    "reasons": reasons,
                    "frames": frames,
                }
            )
        return [dict(c, xg=c["xg"]) for c in out]

    def turnovers(self) -> list[dict]:
        """Ball lost in a team's own half, punished by an opponent shot within 20 seconds."""
        evs = [e for e in self.ev if e.player is not None]
        out = []
        for k, e in enumerate(evs):
            lost = (e.type == "pass" and e.outcome == "incomplete") or (
                e.type == "duel" and e.outcome == "lost"
            )
            if not lost:
                continue
            d = self.d(e.team, e.period)
            spot = fwd(e.ball, d)
            if not 16.5 <= spot[0] <= 52.5 or self.unit[int(e.player)] == "gk":
                continue  # build-up losses only, not scrambles in the box
            shot = next(
                (
                    x
                    for x in evs[k + 1 : k + 60]
                    if x.clock_s - e.clock_s <= 25 and x.type == "shot" and x.team != e.team
                ),
                None,
            )
            if shot is None:
                continue
            between = [
                x
                for x in evs[k + 1 : evs.index(shot)]
                if x.team == e.team and x.type in ("pass", "carry") and x.outcome == "complete"
            ]
            if len(between) > 1:  # they won it back first
                continue
            out.append(
                {
                    "second": e.clock_s,
                    "side": self.team_name(e.team),
                    "player_id": pitch.player_id(int(e.player)),
                    "kind": e.type,
                    "ball": [r2(v) for v in e.ball],
                    "own_x": r2(spot[0]),
                    "shot_second": shot.clock_s,
                    "shot_seq": shot.seq,
                    "xg_conceded": r3(shot.xg or 0),
                    "goal": shot.outcome == "goal",
                }
            )
        out.sort(key=lambda t: -t["xg_conceded"])
        return out[:8]

    def mistakes(self) -> list[dict]:
        gt = ROOT / "web/public/showcase" / self.ctx.match_id / "ground_truth.json"
        if not gt.exists():
            return []
        g = json.loads(gt.read_text())
        return [
            {
                "goal_id": g["goal_id"],
                "second": g["root_cause_clock_s"],
                "goal_second": g["goal_clock_s"],
                "player_id": g["root_cause_player_id"],
                "bug": g["bug"],
                "params": g.get("params", {}),
            }
        ]

    def insights(self, teams, shapes, lines, players, chances, turnovers) -> list[dict]:
        """Plain claims the screen turns into sentences (keys are translated in the UI)."""
        h, a = teams["home"], teams["away"]
        out = []
        presser = "home" if (h["regain_height_m"] or 0) > (a["regain_height_m"] or 0) else "away"
        other = "away" if presser == "home" else "home"
        out.append(
            {
                "key": "press",
                "side": presser,
                "params": {
                    "height": teams[presser]["regain_height_m"],
                    "other": teams[other]["regain_height_m"],
                    "ppda": teams[presser]["ppda"],
                    "other_ppda": teams[other]["ppda"],
                },
            }
        )
        for side in ("home", "away"):
            ln = shapes[side]["out"]["lines"]["def"]
            depth = shapes[side]["out"]["depth_m"]
            out.append(
                {
                    "key": "block",
                    "side": side,
                    "params": {
                        "line": r2(ln),
                        "depth": depth,
                        "width": shapes[side]["out"]["width_m"],
                    },
                }
            )
            ent = teams[side]["final_third_entries"]
            tot = sum(ent.values()) or 1
            lane = max(ent, key=ent.get)
            out.append(
                {
                    "key": "lane",
                    "side": side,
                    "params": {"lane": lane, "pct": round(100 * ent[lane] / tot)},
                }
            )
        for side in ("home", "away"):
            t = teams[side]
            out.append(
                {
                    "key": "finishing",
                    "side": side,
                    "params": {"goals": t["goals"], "xg": t["xg"], "shots": t["shots"]},
                }
            )
        late = [r for r in lines if r["from_s"] >= 3600 and r["away_line"] is not None]
        early = [r for r in lines if r["from_s"] < 2700 and r["away_line"] is not None]
        for side in ("home", "away"):
            e1 = np.mean([r[f"{side}_line"] for r in early]) if early else 0
            e2 = np.mean([r[f"{side}_line"] for r in late]) if late else 0
            if abs(e2 - e1) >= 1.5:
                out.append(
                    {"key": "line_drift", "side": side, "params": {"from": r2(e1), "to": r2(e2)}}
                )
        missed = [
            c
            for c in chances
            if c["outcome"] != "goal"
            and {"better_pass", "better_assist", "earlier"} & set(c["reasons"])
        ]
        if missed:
            out.append({"key": "better_options", "side": None, "params": {"n": len(missed)}})
        big = [c for c in chances if c["outcome"] != "goal" and c["xg"] >= 0.2]
        for side in ("home", "away"):
            mine = [c for c in big if c["side"] == side]
            if mine:
                out.append(
                    {
                        "key": "big_missed",
                        "side": side,
                        "params": {"n": len(mine), "xg": r2(sum(c["xg"] for c in mine))},
                    }
                )
        if turnovers:
            t = turnovers[0]
            out.append(
                {
                    "key": "turnover",
                    "side": t["side"],
                    "params": {
                        "player_id": t["player_id"],
                        "second": t["second"],
                        "xg": t["xg_conceded"],
                    },
                }
            )
        return out

    def run(self) -> dict:
        teams = self.teams()
        shapes = self.shapes()
        lines = self.lines_over_time()
        players = self.players()
        chances = self.chances()
        turnovers = self.turnovers()
        final = next(e for e in reversed(self.ev) if e.type == "full_time").score
        return {
            "match_id": self.ctx.match_id,
            "score": list(final),
            "duration_s": pitch.FULL_S,
            "bucket_s": BUCKET_S,
            "models": {
                "xt": f"socceraction ExpectedThreat {L}x{W}",
                "xg": "engine.goal_model",
                "pass": "engine.decisions.pass_success_prob",
            },
            "xt_grid": [[r3(v) for v in row] for row in self.grid],
            "teams": teams,
            "momentum": self.momentum(),
            "shapes": shapes,
            "lines": lines,
            "networks": self.networks(),
            "players": players,
            "chances": chances,
            "turnovers": turnovers,
            "mistakes": self.mistakes(),
            "insights": self.insights(teams, shapes, lines, players, chances, turnovers),
        }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--match", default="p-1008")
    ap.add_argument("--train", type=int, default=200, help="simulated matches to fit xT on")
    ap.add_argument(
        "--xt-cache", type=Path, help="reuse (or save) the fitted xT grid across matches"
    )
    args = ap.parse_args()
    data = Analysis(args.match, args.train, args.xt_cache).run()
    out = ROOT / "web/public/showcase" / args.match / "analysis.json"
    out.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
