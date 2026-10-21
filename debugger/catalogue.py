"""Bug catalogue: one fixed list of named mistakes used everywhere (traces, patterns, UI).

Each bug has a code, a plain-words name, a description, a detector (debugger/chain.py)
and a fix (debugger/fixes.py). Starts with the five planted types; grow to ~10
(e.g. SECOND_BALL_LOST, GK_OFF_LINE) and add the code to engine/models.py:BugCode too.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Bug:
    code: str
    name: str
    description: str
    side: str  # which team commits it: "defending" (the team that conceded)


CATALOGUE: dict[str, Bug] = {
    b.code: b
    for b in [
        Bug(
            "LATE_STEP_UP",
            "Late step-up",
            "A defender stays behind the defensive line and plays a runner onside.",
            "defending",
        ),
        Bug(
            "DUEL_LOST",
            "Duel lost",
            "A midfield duel is lost, handing the opponent possession.",
            "defending",
        ),
        Bug(
            "PRESS_MISSED",
            "Press trigger missed",
            "The nearest presser does not close down the ball carrier.",
            "defending",
        ),
        Bug(
            "MARKING_LOST",
            "Marking lost",
            "A defender drifts off his runner in or near the box.",
            "defending",
        ),
        Bug(
            "CROSS_NOT_BLOCKED",
            "Cross not blocked",
            "The wide defender does not close down the crosser.",
            "defending",
        ),
    ]
}
