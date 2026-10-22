"""Record one real engine match for the web UI's showcase mode.

    .venv/bin/python web/tools/export_showcase.py --match p-1008

Nothing here is invented. The match comes from the engine (a planted-mistake match, rebuilt from
its ID exactly as debugger.plugin does), every goal is traced by debugger.plugin.trace, and the
explanations and reports come from the backend's own Runtime and HTTP handlers, run in-process
with no Azure services (so the output is the evidence-only fallback, as in local demo mode).

Output (web/public/showcase/<match_id>/):
  messages.json    every WebSocket message /live/{match_id} would replay, in order
  meta.json        engine MatchMeta: clubs, kits, player names (docs/ENGINE.md)
  ticks.json       engine MatchEvents (one per second or more, 22 positions) around each goal
  explanations/    GET /goals/{id}/explanation?mode=&lang= responses
  reports/         GET /matches/{id}/report?mode=&lang= responses
  replays.json     one recorded counterfactual replay per link (defenders re-simulated with
                   the fix applied, attackers on their recorded runs), for the morph animation
  ground_truth.json  the planted mistake (p-<seed> matches only), to check the Debugger's answer
  manifest.json    what was exported, from which commit

This script only reads the backend and engine; it does not change them.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import numpy as np
from fastapi.testclient import TestClient

from api.contracts import Evidence, MatchEvent
from api.main import create_app
from api.pipeline import Runtime
from debugger import chain, counterfactual, fixes, plugin
from debugger.counterfactual import _nearest_opponent, _pressure
from engine import decisions, goal_model, movement, pitch
from engine.mistakes import random_plant
from engine.state import give_ball

MODES = ("fan", "analyst", "studio")
LANGS = ("en", "hi", "es")
WINDOW_BEFORE_S = 75
WINDOW_AFTER_S = 8


def dump(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")


def record_replay(plan, ctx, run_seed, intervention):
    """counterfactual.replay_once, step for step, but keeping every second's positions."""
    wd = ctx.w["decisions"]
    st = plan.snapshot.copy()
    idx = pitch.TEAM_IDX[plan.team]
    frames = []

    def frame(s, note=None):
        frames.append(
            {
                "clock_s": s.clock_s,
                "carrier": pitch.player_id(st.carrier),
                "ball": [round(float(st.ball[0]), 1), round(float(st.ball[1]), 1)],
                "players": [
                    {
                        "id": pitch.player_id(i),
                        "x": round(float(p[0]), 1),
                        "y": round(float(p[1]), 1),
                    }
                    for i, p in enumerate(st.pos)
                ],
                **({"note": note} if note else {}),
            }
        )

    for i, s in enumerate(plan.steps):
        rng = np.random.default_rng([*run_seed, s.clock_s])
        if intervention is not None:
            intervention(st)
        movement.update(st, ctx, rng)
        st.pos[idx] = plan.att_pos[i]
        c = st.carrier
        st.ball = st.pos[c].copy()
        team_c = pitch.team_of(c)
        u = rng.random()

        if s.type == "shot" and i == len(plan.steps) - 1:
            d = pitch.attack_dir(team_c, st.period)
            feats = goal_model.shot_features(st.pos[c], d, st.pos[pitch.TEAM_IDX[1 - team_c]])
            xg_new = goal_model.goal_probability(feats, ctx.w["goal_model"])
            scored = u < min(1.0, xg_new / max(s.p_orig, 1e-9))
            frame(s, "goal" if scored else "shot_saved")
            return frames, scored

        broke = None
        if s.type == "hold":
            if (
                not s.pressed_orig
                and _pressure(st.pos, c) < wd["duel_radius_m"]
                and u < wd["duel_prob"]
            ):
                ch = _nearest_opponent(st.pos, c)
                if not decisions.duel_outcome(st, c, ch, rng.random() < wd["duel_win_prob"]):
                    broke = "ball_won"
        elif s.type == "duel":
            gap = float(np.hypot(*(st.pos[s.receiver] - st.pos[c])))
            happens = gap <= 2 * wd["duel_radius_m"] or st.override_for("DUEL_LOST", c) is not None
            won = decisions.duel_outcome(st, c, s.receiver, s.outcome == "won") if happens else True
            if not won:
                give_ball(st, s.receiver)
        elif s.type == "pass":
            if s.outcome == "complete":
                if decisions.is_offside(st, team_c, s.receiver):
                    broke = "offside"
                else:
                    p_new = decisions.pass_success_prob(
                        st, ctx, c, s.receiver, _pressure(st.pos, c)
                    )
                    if u >= p_new / max(s.p_orig, 1e-9):
                        broke = "pass_cut_out"
            if broke is None:
                give_ball(st, s.carrier_after)
        elif s.type == "shot":
            give_ball(st, s.carrier_after)
        elif s.type == "carry":
            blocker = decisions.carry_blocker(st, ctx, team_c, st.pos[c].copy())
            if (
                blocker is not None
                and not s.blocked_orig
                and not decisions.duel_outcome(st, c, blocker, rng.random() < wd["duel_win_prob"])
            ):
                broke = "carry_stopped"
        if broke is None and st.carrier != s.carrier_after:
            broke = "attack_changed"
        frame(s, broke)
        if broke:
            return frames, False
        st.clock_s += 1
        if st.overrides:
            st.overrides = [o for o in st.overrides if o.until_s >= st.clock_s]
    return frames, False


def counterfactual_replays(match, goal_seq, evidence, goal_n):
    """Re-derive the Debugger's plan for this goal (as debugger.trace does) and record one
    fixed replay per link: the first run whose outcome matches the link's majority outcome."""
    w = match.ctx.w["debugger"]
    goal = next(e for e in match.events if e.seq == goal_seq)
    start = chain.chain_window(match.history, goal.team, goal.clock_s, w["window_s"])
    links = chain.find_candidates(
        match.history, match.ctx, goal.team, start, goal.clock_s, w["max_links"]
    )
    if links:
        start = max(start, min(c.clock_s for c in links) - 1)
    plan = counterfactual.build_plan(
        match, next(i for i, e in enumerate(match.events) if e is goal), start
    )
    by_player = {pitch.player_id(c.player): c for c in links}
    out = {}
    for link in evidence["links"]:
        cand = by_player[link["player_id"]]
        majority_scores = link["fixed_goals"] * 2 > link["trials"]
        for r in range(link["trials"]):
            frames, scored = record_replay(
                plan,
                match.ctx,
                [match.ctx.seed, goal_n, r],
                fixes.make_intervention(cand, match.ctx),
            )
            if scored == majority_scores:
                break
        out[link["evidence_id"]] = {
            "evidence_id": link["evidence_id"],
            "fix": fixes.FIX_OVERRIDE[cand.bug],
            "run": r,
            "scored": scored,
            "chain_start_s": start,
            "frames": frames,
        }
    return out


async def build(match_id: str, out: Path, commit: str) -> dict:
    match = plugin.load_match(match_id)
    events = plugin.team_events(match_id)
    engine_events = [e.model_dump(mode="json") for e in match.match_events()]
    goal_events = [e for e in events if e["type"] == "goal"]

    runtime = Runtime()
    evidences, replays, skipped = {}, {}, []
    goal_number = {e.seq: n for n, e in enumerate((e for e in match.events if e.type == "goal"), 1)}
    for event in events:
        await runtime.on_event(MatchEvent.model_validate(event))
        if event["type"] != "goal":
            continue
        seq = int(event["id"].rsplit("-e", 1)[1])
        try:
            ev = plugin.trace(event)
        except ValueError as error:  # the Debugger found no mistake that lowered the goal chance
            skipped.append({"event_id": event["id"], "reason": str(error)})
            print(f"untraced {event['id']}: {error}")
            continue
        await runtime.process(Evidence.model_validate(ev))
        evidences[ev["goal_id"]] = ev
        replays[ev["goal_id"]] = counterfactual_replays(match, seq, ev, goal_number[seq])
        print(
            f"traced {ev['goal_id']}: {[(l['player_id'], l['blame_percent']) for l in ev['links']]}"
        )

    stored = await runtime.get_match(match_id)
    stored["status"] = "finished"
    await runtime.save_match(stored)

    client = TestClient(create_app(runtime=runtime))
    for goal_id in [*evidences]:
        r = client.get(f"/goals/{goal_id}/trace")
        r.raise_for_status()
        evidences[goal_id] = r.json()  # what the UI receives over REST
        dump(out / "traces" / f"{goal_id}.json", evidences[goal_id])
        for mode in MODES:
            for lang in LANGS:
                r = client.get(f"/goals/{goal_id}/explanation", params={"mode": mode, "lang": lang})
                r.raise_for_status()
                dump(out / "explanations" / f"{goal_id}.{mode}.{lang}.json", r.json())
    for mode in MODES:
        for lang in LANGS:
            r = client.get(f"/matches/{match_id}/report", params={"mode": mode, "lang": lang})
            r.raise_for_status()
            dump(out / "reports" / f"{mode}.{lang}.json", r.json())
    dump(out / "match.json", client.get(f"/matches/{match_id}").json())

    windows = [(g["second"] - WINDOW_BEFORE_S, g["second"] + WINDOW_AFTER_S) for g in goal_events]
    ticks = [e for e in engine_events if any(a <= e["clock_s"] <= b for a, b in windows)]

    dump(out / "messages.json", runtime.history[match_id])
    dump(out / "meta.json", match.meta().model_dump(mode="json"))
    dump(out / "ticks.json", ticks)
    dump(out / "replays.json", replays)
    if match_id.startswith("p-"):  # the planted mistake, for the Bug Report's verdict
        _, truth = random_plant(int(match_id[2:]), match_id=match_id)
        dump(out / "ground_truth.json", truth.model_dump(mode="json"))
    manifest = {
        "match_id": match_id,
        "commit": commit,
        "goals": [g["id"] for g in goal_events],
        "traced": list(evidences),
        "untraced": skipped,
        "windows": [{"from_s": a, "to_s": b} for a, b in windows],
        "modes": MODES,
        "langs": LANGS,
        "source": "engine + debugger.plugin + api Runtime (local-demo, evidence-only agents)",
    }
    dump(out / "manifest.json", manifest)
    return manifest


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--match", default="p-1008")
    ap.add_argument("--out", default=str(ROOT / "web" / "public" / "showcase"))
    args = ap.parse_args()
    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        check=False,
        cwd=ROOT,
        capture_output=True,
        text=True,
    ).stdout.strip()
    manifest = asyncio.run(build(args.match, Path(args.out) / args.match, commit))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
