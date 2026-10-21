"""One fix per bug type: an intervention applied during the counterfactual replay.

A fix undoes exactly one mistake from the link's second on: it removes the mistake (if it was
planted) and adds a corrective override so the player does his job, whether the mistake was
planted or natural. Everything else is left alone.
"""

from __future__ import annotations

from debugger.chain import Candidate
from debugger.counterfactual import Intervention
from engine.state import MatchContext, MatchState, Override

FIX_OVERRIDE = {
    "LATE_STEP_UP": "HOLD_LINE",  # level with the rest of the back four
    "DUEL_LOST": "DUEL_WON",  # wins the duel
    "PRESS_MISSED": "FORCE_PRESS",  # closes the ball down
    "MARKING_LOST": "FORCE_MARK",  # stays tight, goal-side of his runner
    "CROSS_NOT_BLOCKED": "FORCE_PRESS",  # closes the crosser
}
FIX_DURATION_S = 30


def make_intervention(c: Candidate, ctx: MatchContext) -> Intervention:
    if c.bug not in FIX_OVERRIDE:
        raise NotImplementedError(f"no fix for {c.bug} yet")
    fix = FIX_OVERRIDE[c.bug]

    def apply(st: MatchState) -> None:
        if st.clock_s < c.clock_s or any(
            o.bug == fix and o.player == c.player for o in st.overrides
        ):
            return
        st.overrides = [o for o in st.overrides if not (o.bug == c.bug and o.player == c.player)]
        st.overrides.append(
            Override(fix, c.player, st.clock_s + FIX_DURATION_S, {}, from_s=st.clock_s)
        )

    return apply
