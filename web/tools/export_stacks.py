"""Match page data: Shape Stack, Chance Stack, player moments, goal verdicts and the pre-match dossier.

Reads only files the showcase export already wrote (tracking.bin, meta.json, manifest.json,
analysis.json, traces/, replays.json) and writes showcase/<id>/stacks.json. No engine or debugger
maths: shapes are plain averages of the recorded positions, verdicts are the Debugger's traces as
recorded, and every "did it work?" is a count of what happened next. Standard library only.

    python3 web/tools/export_stacks.py            # every demo match
    python3 web/tools/export_stacks.py p-1017     # one match

Shape documented in web/tools/STACKS.md.
"""

from __future__ import annotations

import array
import json
import re
import sys
from pathlib import Path

SHOWCASE = Path(__file__).resolve().parent.parent / "public" / "showcase"
# The library is one series between the same two clubs, in this order (Meeting 1 to 4).
SERIES = ["p-1008", "p-1009", "p-1014", "p-1017"]
WINDOW_S = 300
STRIDE = 49  # int16 per second: ball x,y; 22 players x,y (decimetres); possession; carrier; period
BEND_M = 5.0  # a bend is a move of at least this many metres, held for two windows (10 minutes)
NEXT_W = 3  # "did it work?" looks at the next 15 minutes against the 15 before


def r1(v: float) -> float:
    return round(v, 1)


def r2(v: float) -> float:
    return round(v, 2)


def load(mid: str) -> dict:
    d = SHOWCASE / mid
    raw = array.array("h")
    raw.frombytes((d / "tracking.bin").read_bytes())
    if sys.byteorder == "big":
        raw.byteswap()
    traces = [json.loads(p.read_text()) for p in sorted((d / "traces").glob("*.json"))]
    replays = json.loads((d / "replays.json").read_text()) if (d / "replays.json").exists() else {}
    return {
        "id": mid,
        "raw": raw,
        "meta": json.loads((d / "meta.json").read_text()),
        "manifest": json.loads((d / "manifest.json").read_text()),
        "analysis": json.loads((d / "analysis.json").read_text()),
        "traces": traces,
        "replays": replays,
    }


def ids(side: str) -> list[str]:
    return [f"{'H' if side == 'home' else 'A'}{i + 1}" for i in range(11)]


def units(m: dict, side: str) -> list[str]:
    """Unit per player, as analysis.json already labels them."""
    by = {p["id"]: p["unit"] for p in m["analysis"]["shapes"][side]["out"]["players"]}
    return [by[i] for i in ids(side)]


# ------------------------------------------------------------------------------- Shape Stack


def home_dirs(m: dict) -> dict[int, int]:
    """+1 when home attacks toward x = 105 in that period (read from where the home keeper stands)."""
    raw, n = m["raw"], len(m["raw"]) // STRIDE
    xs: dict[int, list[float]] = {}
    for s in range(0, n, 5):
        r = s * STRIDE
        xs.setdefault(raw[r + 48], []).append(raw[r + 2] / 10)
    return {p: (1 if sum(v) / len(v) < 52.5 else -1) for p, v in xs.items()}


def windows(m: dict) -> list[dict]:
    """Average position of every player per 5 minutes, with and without the ball, each team in its
    own frame (attacking toward x = 105)."""
    raw, n = m["raw"], len(m["raw"]) // STRIDE
    hd = home_dirs(m)
    out = []
    for w0 in range(0, n, WINDOW_S):
        acc = {(t, k): [[0.0, 0.0, 0] for _ in range(11)] for t in (0, 1) for k in ("in", "out")}
        for s in range(w0, min(n, w0 + WINDOW_S)):
            r = s * STRIDE
            poss, per = raw[r + 46], raw[r + 48]
            for t in (0, 1):
                flip = (hd.get(per, 1) == -1) if t == 0 else (hd.get(per, 1) == 1)
                key = "in" if poss == t else "out"
                for i in range(11):
                    k = 2 + 2 * (t * 11 + i)
                    x, y = raw[r + k] / 10, raw[r + k + 1] / 10
                    if flip:
                        x, y = 105 - x, 68 - y
                    a = acc[(t, key)][i]
                    a[0] += x
                    a[1] += y
                    a[2] += 1
        win: dict = {"from_s": w0, "to_s": min(n, w0 + WINDOW_S)}
        for t, side in ((0, "home"), (1, "away")):
            for key in ("in", "out"):
                pts = acc[(t, key)]
                win[f"{side}_{key}"] = [
                    [r1(a[0] / a[2]), r1(a[1] / a[2])] if a[2] else None for a in pts
                ]
        out.append(win)
    return out


def shape_metrics(pts: list, un: list[str]) -> dict | None:
    if any(p is None for p in pts):
        return None
    defs = [pts[i] for i in range(11) if un[i] == "def"]
    field = [pts[i] for i in range(11) if un[i] != "gk"]
    xs, ys = [p[0] for p in field], [p[1] for p in field]
    return {
        "line_m": r1(sum(p[0] for p in defs) / len(defs)),
        "width_m": r1(max(ys) - min(ys)),
        "depth_m": r1(max(xs) - min(xs)),
    }


def bends(series: list[float | None], kind_up: str, kind_down: str) -> list[dict]:
    """A sustained move: the mean of two windows against the mean of the two before, 5 m or more.
    Bends closer than 15 minutes keep only the bigger one."""
    cands = []
    for k in range(2, len(series) - 1):
        a, b, c, d = series[k - 2], series[k - 1], series[k], series[k + 1]
        if None in (a, b, c, d):
            continue
        delta = (c + d) / 2 - (a + b) / 2
        if abs(delta) >= BEND_M:
            cands.append(
                {
                    "w": k,
                    "kind": kind_up if delta > 0 else kind_down,
                    "m": r1(abs(delta)),
                    "from": r1((a + b) / 2),
                    "to": r1((c + d) / 2),
                }
            )
    cands.sort(key=lambda b: -b["m"])
    keep: list[dict] = []
    for b in cands:
        if all(abs(b["w"] - o["w"]) >= NEXT_W for o in keep):
            keep.append(b)
    return sorted(keep, key=lambda b: b["w"])


def after(m: dict, side: str, w: int) -> dict:
    """What happened in the 15 minutes after window w against the 15 before, for this side."""
    mom = m["analysis"]["momentum"]
    other = "away" if side == "home" else "home"

    def tally(a: int, b: int) -> dict:
        rows = mom[max(0, a) : max(0, b)]
        return {
            "shots_for": sum(r[f"{side}_shots"] for r in rows),
            "shots_against": sum(r[f"{other}_shots"] for r in rows),
            "xg_for": r2(sum(r[f"{side}_xg"] for r in rows)),
            "xg_against": r2(sum(r[f"{other}_xg"] for r in rows)),
            "goals_for": sum(1 for r in rows for g in r["goals"] if g["side"] == side),
            "goals_against": sum(1 for r in rows for g in r["goals"] if g["side"] == other),
        }

    before, next_ = tally(w - NEXT_W, w), tally(w, w + NEXT_W)
    # The stack shows the shape without the ball, so "did it work?" is asked of the defending:
    # a goal against in the next 15 minutes, or expected goals against moving by 0.15 (about one
    # half-chance) or more. Smaller moves are called level rather than read as a trend.
    d_against = next_["xg_against"] - before["xg_against"]
    if next_["goals_against"] > 0:
        verdict = "conceded"
    elif d_against <= -0.15:
        verdict = "worked"
    elif d_against >= 0.15:
        verdict = "backfired"
    else:
        verdict = "level"
    return {"before": before, "after": next_, "verdict": verdict}


def shape_stack(m: dict) -> dict:
    W = windows(m)
    teams = {}
    for side in ("home", "away"):
        un = units(m, side)
        met = [shape_metrics(w[f"{side}_out"], un) for w in W]
        line = [x["line_m"] if x else None for x in met]
        width = [x["width_m"] if x else None for x in met]
        bs = bends(line, "line_higher", "line_deeper") + bends(width, "wider", "narrower")
        bs = sorted(bs, key=lambda b: (b["w"], b["kind"]))
        for b in bs:
            b["from_s"] = W[b["w"]]["from_s"]
            b["next"] = after(m, side, b["w"])
        teams[side] = {
            "units": un,
            "metrics": [{"w": k, **x} if x else None for k, x in enumerate(met)],
            "metrics_in": [shape_metrics(w[f"{side}_in"], un) for w in W],
            "bends": bs,
        }
    return {"window_s": WINDOW_S, "windows": W, "teams": teams}


# ------------------------------------------------------------------------------- Chance Stack


def frame_at(c: dict) -> dict:
    f = next((f for f in c["frames"] if f["second"] == c["second"]), c["frames"][-1])
    return {"ball": [r1(v) for v in f["ball"]], "pos": [[r1(p[0]), r1(p[1])] for p in f["pos"]]}


def player_index(pid: str) -> int:
    return (0 if pid[0] == "H" else 11) + int(pid[1:]) - 1


def chances(m: dict) -> list[dict]:
    """Every shot. A better option is a team-mate whose pass success times shot value beat the
    shot taken by at least 0.01 expected goals, from analysis.json's own alternatives."""
    out = []
    for c in m["analysis"]["chances"]:
        fr = frame_at(c)
        best = None
        for o in c.get("alternatives") or []:
            gain = o["value"] - c["xg"]
            if gain >= 0.01 and (best is None or o["value"] > best["value"]):
                best = {
                    "id": o["id"],
                    "pass_p": r2(o["pass_p"]),
                    "xg": round(o["xg"], 3),
                    "value": round(o["value"], 3),
                    "gain": round(gain, 3),
                    "at": fr["pos"][player_index(o["id"])],
                }
        out.append(
            {
                "seq": c["seq"],
                "s": c["second"],
                "period": c["period"],
                "side": c["side"],
                "dir": c["attack_dir"],
                "shooter": c["shooter"],
                "outcome": c["outcome"],
                "xg": round(c["xg"], 3),
                "d": r1(c["distance_m"]),
                "angle": round(c["angle_deg"]),
                "blockers": c["blockers"],
                "assist": c["assist"]["id"] if c.get("assist") else None,
                "build_up_s": c["build_up_s"],
                "score_before": c["score_before"],
                "frame": fr,
                "best": best,
            }
        )
    return out


# ---------------------------------------------------------------------------------- Goals


BEHIND = re.compile(r"metres behind line:\s*([0-9.]+)")


def fixed_at(m: dict, goal_id: str, ev_id: str, pid: str, second: int) -> list[float] | None:
    """Where the suspect stands at the mistake second in the Debugger's recorded fixed replay."""
    rep = (m["replays"].get(goal_id) or {}).get(ev_id)
    if not rep:
        return None
    frames = rep["frames"]
    if isinstance(frames, str):  # older exports stored the frames as a Python repr
        return None
    f = min(frames, key=lambda f: abs(f["clock_s"] - second))
    p = next((p for p in f["players"] if p["id"] == pid), None)
    return [r1(p["x"]), r1(p["y"])] if p else None


def goals(m: dict, ch: list[dict]) -> list[dict]:
    traces = {t["goal"]["second"]: t for t in m["traces"]}
    turnovers = m["analysis"]["turnovers"]
    shots = [c for c in ch if c["outcome"] == "goal"]
    out = []
    for n, c in enumerate(sorted(shots, key=lambda c: c["s"]), start=1):
        t = traces.get(c["s"])
        g: dict = {
            "n": n,
            "goal_id": t["goal_id"] if t else f"{m['id']}-g{n}",
            "s": c["s"],
            "side": c["side"],
            "scorer": c["shooter"],
            "assist": c["assist"],
            "seq": c["seq"],
            "xg": c["xg"],
            "d": c["d"],
            "build_up_s": c["build_up_s"],
        }
        if t:
            links = sorted(t["links"], key=lambda l: -(l["blame_percent"] or 0))
            root = next(l for l in t["links"] if l["evidence_id"] == t["root_cause_evidence_id"])
            mb = BEHIND.search(root["description"])
            g["traced"] = True
            g["verdict"] = {
                "culprit": root["player_id"],
                "bug": root["bug_type"],
                "second": root["second"],
                "blame_pct": round(root["blame_percent"] or 0),
                "trials": root["trials"],
                "baseline_goals": root["baseline_goals"],
                "fixed_goals": root["fixed_goals"],
                "behind_m": float(mb.group(1)) if mb else None,
                "suspects": [
                    {
                        "id": l["player_id"],
                        "evidence_id": l["evidence_id"],
                        "bug": l["bug_type"],
                        "second": l["second"],
                        "blame_pct": round(l["blame_percent"] or 0),
                        "fixed_goals": l["fixed_goals"],
                    }
                    for l in links
                ],
            }
        else:
            g["traced"] = False
            # The honest football answer: where the chance came from, from its own numbers.
            to = next((x for x in turnovers if x["goal"] and x["shot_second"] == c["s"]), None)
            g["honest"] = {
                "kind": "tap_in" if c["d"] <= 3 else "close" if c["d"] <= 11 else "long",
                "xg": c["xg"],
                "d": c["d"],
                "build_up_s": c["build_up_s"],
                "assist": c["assist"],
                "won_ball": {
                    "player_id": to["player_id"],
                    "second": to["second"],
                    "kind": to["kind"],
                }
                if to
                else None,
            }
        out.append(g)
    return out


# ---------------------------------------------------------------------------- Player moments


def moments(m: dict, ch: list[dict], gl: list[dict]) -> dict[str, list[dict]]:
    by: dict[str, list[dict]] = {i: [] for s in ("home", "away") for i in ids(s)}
    for c in ch:
        if c["outcome"] == "goal":
            by[c["shooter"]].append(
                {"kind": "goal", "s": c["s"], "seq": c["seq"], "xg": c["xg"], "d": c["d"]}
            )
        elif c["best"]:
            by[c["shooter"]].append(
                {
                    "kind": "better",
                    "s": c["s"],
                    "seq": c["seq"],
                    "xg": c["xg"],
                    "to": c["best"]["id"],
                    "gain": c["best"]["gain"],
                }
            )
        elif c["xg"] >= 0.3:
            by[c["shooter"]].append(
                {
                    "kind": "big_miss",
                    "s": c["s"],
                    "seq": c["seq"],
                    "xg": c["xg"],
                    "d": c["d"],
                    "outcome": c["outcome"],
                }
            )
        if c["assist"] and c["outcome"] == "goal":
            by[c["assist"]].append(
                {"kind": "assist", "s": c["s"], "seq": c["seq"], "to": c["shooter"]}
            )
    for g in gl:
        if not g["traced"]:
            continue
        for sp in g["verdict"]["suspects"]:
            if sp["blame_pct"] <= 0:
                continue
            by[sp["id"]].append(
                {
                    "kind": "mistake",
                    "s": sp["second"],
                    "goal_id": g["goal_id"],
                    "goal_s": g["s"],
                    "bug": sp["bug"],
                    "blame_pct": sp["blame_pct"],
                    "fixed_goals": sp["fixed_goals"],
                    "trials": g["verdict"]["trials"],
                    "baseline_goals": g["verdict"]["baseline_goals"],
                    "fixed_at": fixed_at(
                        m, g["goal_id"], sp["evidence_id"], sp["id"], sp["second"]
                    ),
                }
            )
    seqs = {c["seq"]: c for c in ch}
    for t in m["analysis"]["turnovers"]:
        if t["xg_conceded"] >= 0.1 or t["goal"]:
            by[t["player_id"]].append(
                {
                    "kind": "turnover",
                    "s": t["second"],
                    "seq": t["shot_seq"] if t["shot_seq"] in seqs else None,
                    "xg": round(t["xg_conceded"], 3),
                    "goal": t["goal"],
                    "how": t["kind"],
                }
            )
    return {k: sorted(v, key=lambda x: x["s"]) for k, v in by.items()}


# ---------------------------------------------------------------------------- Pre-match dossier


def team_numbers(m: dict, side: str) -> dict:
    a = m["analysis"]
    sh = a["shapes"][side]["out"]
    tm = a["teams"][side]
    return {
        "line_m": r1(sh["lines"]["def"]),
        "width_m": r1(sh["width_m"]),
        "depth_m": r1(sh["depth_m"]),
        "press_m": r1(tm["regain_height_m"] or 0),
        "ppda": r2(tm["ppda"]),
        "possession_pct": r1(tm["possession_pct"]),
    }


def dossier(m: dict, all_: dict[str, dict]) -> dict:
    """Per team, before kick-off: the shape it played in this match against its usual numbers from
    the other meetings of the series. Facts only; no reason is ever invented for a change."""
    k = SERIES.index(m["id"]) if m["id"] in SERIES else -1
    others = [all_[x] for x in SERIES if x != m["id"] and x in all_]
    out = {}
    for side in ("home", "away"):
        now = team_numbers(m, side)
        usual = (
            {key: r1(sum(team_numbers(o, side)[key] for o in others) / len(others)) for key in now}
            if others
            else None
        )
        notes = []
        if usual:
            for key, up, down, thr in (
                ("line_m", "line_higher", "line_deeper", 2.0),
                ("width_m", "wider", "narrower", 2.0),
                ("press_m", "press_higher", "press_lower", 3.0),
                ("possession_pct", "more_ball", "less_ball", 4.0),
            ):
                d = now[key] - usual[key]
                if abs(d) >= thr:
                    notes.append(
                        {
                            "key": up if d > 0 else down,
                            "params": {"by": r1(abs(d)), "now": now[key], "usual": usual[key]},
                        }
                    )
            if not notes:
                notes.append({"key": "as_usual", "params": {}})
        if k > 0 and SERIES[k - 1] in all_:
            prev = all_[SERIES[k - 1]]
            sc = prev["analysis"]["score"]
            mine, theirs = (sc[0], sc[1]) if side == "home" else (sc[1], sc[0])
            notes.append(
                {
                    "key": "last_meeting",
                    "params": {
                        "meeting": k,
                        "result": "won" if mine > theirs else "lost" if mine < theirs else "drew",
                        "for": mine,
                        "against": theirs,
                    },
                }
            )
        sh = m["analysis"]["shapes"][side]
        out[side] = {
            "formation": m["meta"][side]["formation"],
            "meeting": k + 1 if k >= 0 else None,
            "out": sh["out"],
            "in": sh["in"],
            **now,
            "usual": usual,
            # flat aliases the Autopsy reads
            "line_usual_m": usual["line_m"] if usual else None,
            "width_usual_m": usual["width_m"] if usual else None,
            "notes": notes,
        }
    return out


# --------------------------------------------------------------------------------------- main


def export(mid: str, all_: dict[str, dict]) -> Path:
    m = all_[mid]
    ch = chances(m)
    gl = goals(m, ch)
    doc = {
        "match_id": mid,
        "meeting": SERIES.index(mid) + 1 if mid in SERIES else None,
        "score": m["analysis"]["score"],
        "duration_s": m["meta"]["duration_s"],
        "names": {
            p["id"]: {"name": p["name"], "number": p["number"], "position": p["position"]}
            for s in ("home", "away")
            for p in m["meta"][s]["players"]
        },
        "shape_stack": shape_stack(m),
        "chances": ch,
        "goals": gl,
        "moments": moments(m, ch, gl),
        "dossier": dossier(m, all_),
    }
    path = SHOWCASE / mid / "stacks.json"
    path.write_text(json.dumps(doc, separators=(",", ":")))
    return path


def main() -> None:
    want = sys.argv[1:] or SERIES
    all_ = {mid: load(mid) for mid in SERIES if (SHOWCASE / mid).exists()}
    for mid in want:
        if mid not in all_:
            all_[mid] = load(mid)
        p = export(mid, all_)
        print(f"{p.relative_to(SHOWCASE.parent.parent)}  {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
