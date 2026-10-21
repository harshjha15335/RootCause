"""Counterfactual replay: "would this goal still have happened if that one mistake was fixed?"

Pearl's three steps, applied to one recorded attack:

1. Abduction: keep what actually happened. The attacking team's runs are replayed exactly, the
   carrier repeats every recorded action (same pass, same carry, same shot), and the luck that
   made each action succeed is kept: an action that succeeded with probability p_orig in the
   recording succeeds again with probability p_new / p_orig, where p_new is the engine's own
   formula evaluated against where the defenders are in this replay.
2. Action: apply the fix (e.g. the defender holds the line) from the link's second on.
3. Prediction: re-simulate the defending team second by second (engine movement code, fresh
   noise) and see if the attack still reaches the shot; the final shot scores with
   probability xG_new / xG_orig.

Each replay ends in a goal or not, so the result is an actual count out of the runs (e.g. 140 of
200). Rates, drops, ranking and blame are all derived from those same counts. The count is near
the run total with nothing fixed (only defensive movement noise changes), and lower when a fix
makes a pass offside, a lane busier, a shot more pressed, or wins the ball.

Baseline and every fixed variant use the SAME seed per run and per second (common random
numbers), so a difference comes from the fix, not from luck.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from engine import decisions, goal_model, movement, pitch
from engine.simulate import Match
from engine.state import MatchContext, MatchState, give_ball

# Called once per replayed second, before movement; may edit the state (that is how a fix is applied).
Intervention = Callable[[MatchState], None]


@dataclass(frozen=True)
class Step:
    """What happened in one recorded second."""

    clock_s: int
    type: str  # "hold" | "pass" | "carry" | "shot" | "duel"
    player: int  # carrier at the start of the second
    receiver: int | None  # pass receiver, or duel challenger
    outcome: str | None
    p_orig: float  # probability the recorded outcome had (pass success, xG)
    pressed_orig: bool  # an opponent was within duel range (hold seconds)
    blocked_orig: bool  # the carry ran into an opponent (and the duel was won)
    carrier_after: int


@dataclass
class AttackPlan:
    team: int  # the scoring team
    start_s: int
    goal_s: int
    snapshot: MatchState  # state at the start of start_s
    steps: list[Step]
    att_pos: np.ndarray  # (n_seconds, 11, 2) attacking positions at action time each second


def _pressure(pos: np.ndarray, carrier: int) -> float:
    opp = pos[pitch.TEAM_IDX[1 - pitch.team_of(carrier)]]
    return float(np.min(np.hypot(*(opp - pos[carrier]).T)))


def build_plan(match: Match, goal_event_index: int, start_s: int) -> AttackPlan:
    ctx = match.ctx
    goal = match.events[goal_event_index]
    assert goal.team is not None
    team, goal_s = goal.team, goal.clock_s
    by_second: dict[int, list] = {}
    for e in match.events[: goal_event_index + 1]:
        if start_s <= e.clock_s <= goal_s:
            by_second.setdefault(e.clock_s, []).append(e)

    steps, att_pos = [], []
    for t in range(start_s, goal_s + 1):
        evs = by_second[t]
        first = evs[0]
        att_pos.append(first.pos[pitch.TEAM_IDX[team]])
        carrier = match.history[t].carrier
        main = next((e for e in evs if e.type in ("pass", "carry", "shot")), None) or next(
            (e for e in evs if e.type == "duel"), None
        )
        after = match.history[t + 1].carrier if t < goal_s else -1

        tmp = match.history[t].copy()
        tmp.pos = first.pos.copy()
        p_orig, blocked = 1.0, False
        if main is None:
            kind, receiver, outcome = "hold", None, None
        else:
            kind, receiver, outcome = main.type, main.receiver, main.outcome
            if kind == "pass" and outcome == "complete":
                p_orig = decisions.pass_success_prob(
                    tmp, ctx, carrier, receiver, _pressure(tmp.pos, carrier)
                )
            elif kind == "shot":
                p_orig = main.xg
            elif kind == "carry":
                blocked = any(e.type == "duel" for e in evs)
        steps.append(
            Step(
                t,
                kind,
                carrier,
                receiver,
                outcome,
                p_orig,
                _pressure(first.pos, carrier) < ctx.w["decisions"]["duel_radius_m"],
                blocked,
                after,
            )
        )
    return AttackPlan(team, start_s, goal_s, match.history[start_s], steps, np.stack(att_pos))


def replay_once(
    plan: AttackPlan,
    ctx: MatchContext,
    run_seed: list[int],
    intervention: Intervention | None = None,
) -> bool:
    """Does the recorded goal happen again in this replay of the defence?"""
    wd = ctx.w["decisions"]
    st = plan.snapshot.copy()
    idx = pitch.TEAM_IDX[plan.team]
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
            return u < min(1.0, xg_new / max(s.p_orig, 1e-9))

        if s.type == "hold":
            # a defender who is now close enough (and wasn't originally) may win the ball
            if (
                not s.pressed_orig
                and _pressure(st.pos, c) < wd["duel_radius_m"]
                and u < wd["duel_prob"]
            ):
                ch = _nearest_opponent(st.pos, c)
                if not decisions.duel_outcome(st, c, ch, rng.random() < wd["duel_win_prob"]):
                    return False

        elif s.type == "duel":
            assert s.receiver is not None
            gap = float(np.hypot(*(st.pos[s.receiver] - st.pos[c])))
            happens = gap <= 2 * wd["duel_radius_m"] or st.override_for("DUEL_LOST", c) is not None
            won = decisions.duel_outcome(st, c, s.receiver, s.outcome == "won") if happens else True
            if not won:
                give_ball(st, s.receiver)

        elif s.type == "pass":
            assert s.receiver is not None
            if s.outcome == "complete":
                if decisions.is_offside(st, team_c, s.receiver):
                    return False
                p_new = decisions.pass_success_prob(st, ctx, c, s.receiver, _pressure(st.pos, c))
                if u >= p_new / max(s.p_orig, 1e-9):
                    return False
            give_ball(st, s.carrier_after)

        elif (
            s.type == "shot"
        ):  # an earlier shot (by the other side, before the attack): keep what happened
            give_ball(st, s.carrier_after)

        elif s.type == "carry":
            end = st.pos[
                c
            ].copy()  # attackers (incl. the carrier) are already at their recorded spots
            blocker = decisions.carry_blocker(st, ctx, team_c, end)
            if (
                blocker is not None
                and not s.blocked_orig
                and not decisions.duel_outcome(st, c, blocker, rng.random() < wd["duel_win_prob"])
            ):
                return False

        if st.carrier != s.carrier_after:
            return False  # the attack went differently this time
        st.clock_s += 1
        if st.overrides:
            st.overrides = [o for o in st.overrides if o.until_s >= st.clock_s]
    return False


def _nearest_opponent(pos: np.ndarray, carrier: int) -> int:
    opp_idx = pitch.TEAM_IDX[1 - pitch.team_of(carrier)]
    return int(opp_idx[int(np.argmin(np.hypot(*(pos[opp_idx] - pos[carrier]).T)))])


def goal_count(
    plan: AttackPlan,
    ctx: MatchContext,
    runs: int,
    seed: int,
    intervention: Intervention | None = None,
) -> int:
    """In how many of `runs` replays the goal still happens (an actual count, not an estimate)."""
    return sum(replay_once(plan, ctx, [ctx.seed, seed, r], intervention) for r in range(runs))


def goal_rate(
    plan: AttackPlan,
    ctx: MatchContext,
    runs: int,
    seed: int,
    intervention: Intervention | None = None,
) -> float:
    """goal_count / runs: the share of replays in which the goal still happens."""
    return goal_count(plan, ctx, runs, seed, intervention) / runs
