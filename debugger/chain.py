"""Causal chain: walk backward from a goal and find candidate links.

1. Start at the goal, walk back through the same possession (up to window_s, or the
   last possession change, plus a couple of seconds to catch the duel that won the ball).
2. Every second, run each detector from the bug catalogue on the recorded state.
3. Each detection is a candidate link: time, player, bug type, facts.
4. Keep at most max_links, ordered in time; the earliest is the start of the chain.

Detectors read Match.history (per-second states), so run matches with record_states=True.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from engine import pitch
from engine.state import MatchContext, MatchState


@dataclass
class Candidate:
    clock_s: int
    player: int
    bug: str
    facts: dict = field(default_factory=dict)


# A detector looks at one second and returns zero or more candidates.
# `defending` is the team that conceded the goal.
Detector = Callable[[MatchState, MatchContext, int], list[Candidate]]


def detect_late_step_up(st: MatchState, ctx: MatchContext, defending: int) -> list[Candidate]:
    """A defender more than 4 m behind the rest of the back four while out of possession."""
    if st.possession == defending:
        return []
    d = pitch.attack_dir(defending, st.period)
    idx = pitch.TEAM_IDX[defending][list(pitch.DEFENDERS)]
    depth_m = np.array([pitch.progress(x, d) for x in st.pos[idx, 0]]) * pitch.PITCH_X
    line_m = float(np.median(depth_m))
    out = []
    for i, dm in zip(idx, depth_m):
        behind = line_m - dm
        if behind > 4.0:
            out.append(
                Candidate(
                    st.clock_s, int(i), "LATE_STEP_UP", {"metres_behind_line": round(behind, 1)}
                )
            )
    return out


# TODO(day 6): DUEL_LOST, PRESS_MISSED, MARKING_LOST, CROSS_NOT_BLOCKED detectors
DETECTORS: dict[str, Detector] = {
    "LATE_STEP_UP": detect_late_step_up,
}


def chain_window(history: list[MatchState], team: int, goal_clock: int, window_s: int) -> int:
    """First second of the chain: start of the scoring possession (minus 2 s), capped at window_s."""
    t = goal_clock
    floor = max(0, goal_clock - window_s)
    while t > floor and history[t - 1].possession == team:
        t -= 1
    return max(floor, t - 2)


def find_candidates(
    history: list[MatchState],
    ctx: MatchContext,
    scoring_team: int,
    start_s: int,
    goal_clock: int,
    max_links: int,
) -> list[Candidate]:
    defending = 1 - scoring_team
    found: dict[tuple[int, str], Candidate] = {}
    for t in range(start_s, goal_clock + 1):
        for detector in DETECTORS.values():
            for c in detector(history[t], ctx, defending):
                found.setdefault((c.player, c.bug), c)  # keep the first second each mistake appears
    links = sorted(found.values(), key=lambda c: c.clock_s)
    return links[:max_links]
