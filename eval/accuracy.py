"""Accuracy test: the headline number. "Finds the true root cause in N of 100 planted goals."

    python -m eval.accuracy --matches 100 --seed 1000     # writes eval/report.md and eval/accuracy.json

1. Generate N matches, each with one planted mistake that leads to a goal (engine.mistakes).
2. Run the Debugger on each planted goal. It never sees the ground truth.
3. Report top-1 and top-3 accuracy, broken down by bug type.
4. Report how often an innocent player is blamed (rank 1 is not the planted player) and how often
   the Debugger abstains (no link, or no link whose fix lowers the goal rate).

A hit needs both the planted player and the planted bug code. Player-only hits are reported
separately, because the Debugger can name the right defender under a bug it can already detect.
"""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

from debugger.trace import trace
from engine import pitch
from engine.mistakes import ELIGIBLE, PlantFailed, inject_mistake, random_plant

OUT_DIR = Path(__file__).resolve().parent


def plant(seed: int, bug: str | None):
    """random_plant, or the same random team/player/minute choice limited to one bug type."""
    if bug is None:
        return random_plant(seed, match_id=f"acc-{seed}")
    rng = np.random.default_rng([seed, 2])
    for _ in range(10):
        team = int(rng.integers(2))
        slot = ELIGIBLE[bug][int(rng.integers(len(ELIGIBLE[bug])))]
        minute = int(rng.integers(3, 75))
        try:
            return inject_mistake(
                bug, pitch.TEAM_IDX[team][slot], minute, seed, match_id=f"acc-{seed}"
            )
        except PlantFailed:
            continue
    raise PlantFailed(f"could not plant {bug} for seed {seed}")


def run_case(seed: int, runs: int | None, bug: str | None = None) -> dict:
    try:
        match, gt = plant(seed, bug)
    except PlantFailed:
        return {"seed": seed, "planted": False}
    t0 = time.perf_counter()
    ev = trace(match, gt.goal_seq, runs=runs)
    latency = time.perf_counter() - t0
    links = [
        {"rank": c.rank, "player_id": c.player_id, "bug": c.bug, "blame": c.blame} for c in ev.links
    ]
    blamed = [c for c in links if c["blame"] > 0]
    root = blamed[0] if blamed else None

    def hit(c: dict) -> bool:
        return c["player_id"] == gt.root_cause_player_id and c["bug"] == gt.bug

    return {
        "seed": seed,
        "planted": True,
        "goal_id": gt.goal_id,
        "bug": gt.bug,
        "player_id": gt.root_cause_player_id,
        "links": links,
        "abstained": root is None,
        "top1": root is not None and hit(root),
        "top1_player": root is not None and root["player_id"] == gt.root_cause_player_id,
        "top3": any(hit(c) for c in blamed[:3]),
        "innocent_blamed": root is not None and root["player_id"] != gt.root_cause_player_id,
        "trace_s": round(latency, 3),
    }


def _rate(rows: list[dict], key: str) -> float | None:
    return round(sum(r[key] for r in rows) / len(rows), 3) if rows else None


def summarise(rows: list[dict], seed: int, runs: int | None, bug: str | None = None) -> dict:
    cases = [r for r in rows if r["planted"]]
    by_bug: dict[str, list[dict]] = defaultdict(list)
    for r in cases:
        by_bug[r["bug"]].append(r)
    keys = ("top1", "top1_player", "top3", "innocent_blamed", "abstained")
    latencies = sorted(r["trace_s"] for r in cases)
    return {
        "source": "planted-mistake-benchmark",
        "seed": seed,
        "bug_filter": bug,
        "runs_per_link": runs,
        "requested": len(rows),
        "planted": len(cases),
        "plant_failed": len(rows) - len(cases),
        **{k: _rate(cases, k) for k in keys},
        "top1_count": sum(r["top1"] for r in cases),
        "trace_s_median": latencies[len(latencies) // 2] if latencies else None,
        "trace_s_max": latencies[-1] if latencies else None,
        "by_bug": {
            bug: {"n": len(by_bug[bug]), **{k: _rate(by_bug[bug], k) for k in keys}}
            for bug in sorted(ELIGIBLE)
        },
    }


def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{x * 100:.0f}%"


def report_md(s: dict) -> str:
    lines = [
        "# Root-cause accuracy on planted goals",
        "",
        f"`python -m eval.accuracy --matches {s['requested']} --seed {s['seed']}"
        + (f" --bug {s['bug_filter']}" if s["bug_filter"] else "")
        + "`"
        + (f" with {s['runs_per_link']} replays per link" if s["runs_per_link"] else ""),
        "",
        (
            f"The Debugger named the planted player **and** bug first in **{s['top1_count']} of "
            f"{s['planted']}** planted goals ({_pct(s['top1'])}). {s['plant_failed']} seeds could "
            "not plant a goal-causing mistake and are excluded."
        ),
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Top-1 (player and bug) | {_pct(s['top1'])} |",
        f"| Top-1 (player only) | {_pct(s['top1_player'])} |",
        f"| Top-3 (player and bug) | {_pct(s['top3'])} |",
        f"| Innocent player blamed first | {_pct(s['innocent_blamed'])} |",
        f"| Abstained (no link with blame) | {_pct(s['abstained'])} |",
        f"| Trace time, median / max | {s['trace_s_median']} s / {s['trace_s_max']} s |",
        "",
        "| Planted bug | n | Top-1 | Top-1 player | Innocent blamed | Abstained |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for bug, b in s["by_bug"].items():
        lines.append(
            f"| {bug} | {b['n']} | {_pct(b['top1'])} | {_pct(b['top1_player'])} | "
            f"{_pct(b['innocent_blamed'])} | {_pct(b['abstained'])} |"
        )
    lines += [
        "",
        (
            "Bug types without a Debugger detector cannot score a top-1 hit; at best the right player is "
            "named under another bug. The engine plants all five types so the gap stays visible."
        ),
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description="Root-cause accuracy on planted goals.")
    ap.add_argument("--matches", type=int, default=100)
    ap.add_argument("--seed", type=int, default=1000)
    ap.add_argument("--runs", type=int, default=None, help="replays per link (default: weights)")
    ap.add_argument("--bug", choices=sorted(ELIGIBLE), help="plant only this bug type")
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args()
    if args.matches < 1:
        ap.error("--matches must be at least 1")

    seeds = range(args.seed, args.seed + args.matches)
    with ProcessPoolExecutor(args.workers) as pool:
        rows = list(pool.map(run_case, seeds, [args.runs] * len(seeds), [args.bug] * len(seeds)))
    s = summarise(rows, args.seed, args.runs, args.bug)
    args.out.mkdir(parents=True, exist_ok=True)
    stem = f"accuracy.{args.bug}" if args.bug else "accuracy"
    (args.out / f"{stem}.json").write_text(
        json.dumps({"summary": s, "cases": rows}, indent=2), encoding="utf-8"
    )
    (args.out / f"{'report.' + args.bug if args.bug else 'report'}.md").write_text(
        report_md(s), encoding="utf-8"
    )
    print(report_md(s))


if __name__ == "__main__":
    main()
