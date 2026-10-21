"""debugger.trace(match, goal_seq) -> EvidencePackage. The entry point Role 3 calls."""

from __future__ import annotations

from debugger import chain, counterfactual, evidence, fixes
from engine.models import EvidencePackage
from engine.simulate import Match


def trace(match: Match, goal_seq: int, runs: int | None = None) -> EvidencePackage:
    """Explain one goal. `match` must have been run with record_states=True."""
    w = match.ctx.w["debugger"]
    runs = runs or w["runs"]
    if not match.history:
        raise ValueError("run the match with record_states=True so the Debugger can rewind it")

    goals = [e for e in match.events if e.type == "goal"]
    goal = next((e for e in goals if e.seq == goal_seq), None)
    if goal is None:
        raise ValueError(f"no goal event with seq {goal_seq}")
    n = goals.index(goal) + 1
    assert goal.team is not None and goal.player is not None
    team, clock = goal.team, goal.clock_s

    start = chain.chain_window(match.history, team, clock, w["window_s"])
    links = chain.find_candidates(match.history, match.ctx, team, start, clock, w["max_links"])
    if links:  # the chain starts one second before its earliest link
        start = max(start, min(c.clock_s for c in links) - 1)
    plan = counterfactual.build_plan(
        match, next(i for i, e in enumerate(match.events) if e is goal), start
    )

    baseline = counterfactual.goal_rate(plan, match.ctx, runs, seed=n)
    fixed = [
        counterfactual.goal_rate(
            plan, match.ctx, runs, seed=n, intervention=fixes.make_intervention(c, match.ctx)
        )
        for c in links
    ]
    return evidence.build(
        match_id=match.ctx.match_id,
        goal_id=f"{match.ctx.match_id}-g{n}",
        scorer=goal.player,
        team=team,
        clock_s=clock,
        possession_id=goal.possession_id,
        chain_start_s=start,
        baseline=baseline,
        runs=runs,
        links=links,
        fixed_rates=fixed,
    )
