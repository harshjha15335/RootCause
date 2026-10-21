"""Ball-carrier decisions: duel, hold, shoot, pass or carry.

Probabilities come from location, pressure (nearest defender distance) and team style.
All numbers are in config/weights.yaml (decisions, passing, goal_model).
The outcome formulas (pass_success_prob, is_offside, carry_blocker, duel_outcome) are also used
by the Debugger's counterfactual replay, so both judge football the same way.
"""

from __future__ import annotations

import math

import numpy as np

from engine import goal_model, pitch
from engine.state import MatchContext, MatchState, RawEvent, emit, give_ball, reset_for_kickoff


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def act(
    st: MatchState, ctx: MatchContext, rng: np.random.Generator, out: list[RawEvent] | None
) -> bool:
    """Resolve the carrier's action for this second. Returns True if an event was emitted."""
    wd = ctx.w["decisions"]
    c = st.carrier
    team = pitch.team_of(c)
    opp_idx = pitch.TEAM_IDX[1 - team]
    d = pitch.attack_dir(team, st.period)
    tac = ctx.tactics[team]
    p = st.pos[c]

    opp_dist = np.hypot(*(st.pos[opp_idx] - p).T)
    j = int(np.argmin(opp_dist))
    pressure = float(opp_dist[j])
    challenger = int(opp_idx[j])

    # duel
    if pressure < wd["duel_radius_m"] and rng.random() < wd["duel_prob"]:
        _duel(st, ctx, rng, out, team, challenger, pressure)
        return True

    # shot: taken more eagerly the better the chance (xG of shooting from here)
    feats = goal_model.shot_features(p, d, st.pos[opp_idx])
    if feats.distance_m < wd["shot_max_dist_m"]:
        xg = goal_model.goal_probability(feats, ctx.w["goal_model"])
        if rng.random() < min(wd["shot_max_prob"], wd["shot_k"] * xg * (0.5 + tac.risk)):
            _shoot(st, ctx, rng, out, team, feats, pressure)
            return True

    # a free player in the attacking half runs at goal
    in_space = pressure > wd["space_m"] and pitch.progress(p[0], d) > 0.5
    if in_space:
        act_p = wd["act_prob_space"]
    else:
        act_p = wd["act_prob_pressed"] if pressure < wd["pressed_m"] else wd["act_prob"]
    if rng.random() >= act_p:
        return False
    if in_space and rng.random() < wd["carry_prob_space"]:
        _carry(st, ctx, rng, out, team, d, pressure)
        return True

    if rng.random() < wd["pass_prob"] + 0.15 * (tac.directness - 0.5):
        _pass(st, ctx, rng, out, team, d, pressure)
    else:
        _carry(st, ctx, rng, out, team, d, pressure)
    return True


def duel_outcome(st: MatchState, carrier: int, challenger: int, won: bool) -> bool:
    """Apply forced duel results (planted DUEL_LOST, or the Debugger's DUEL_WON fix)."""
    if st.overrides:
        if st.override_for("DUEL_LOST", carrier) or st.override_for("DUEL_WON", challenger):
            return False
        if st.override_for("DUEL_LOST", challenger) or st.override_for("DUEL_WON", carrier):
            return True
    return won


def _duel(st, ctx, rng, out, team, challenger, pressure) -> None:
    c = st.carrier
    won = duel_outcome(st, c, challenger, rng.random() < ctx.w["decisions"]["duel_win_prob"])
    emit(
        st, out, "duel", team, c, "won" if won else "lost", pressure_m=pressure, receiver=challenger
    )
    if not won:
        give_ball(st, challenger)


def _shoot(st, ctx, rng, out, team, feats, pressure) -> None:
    wd = ctx.w["decisions"]
    c = st.carrier
    xg = goal_model.goal_probability(feats, ctx.w["goal_model"])
    gx = pitch.PITCH_X if pitch.attack_dir(team, st.period) > 0 else 0.0
    goal_mouth = np.array([gx, pitch.PITCH_Y / 2 + rng.uniform(-3.0, 3.0)])
    r = rng.random()
    if r < xg:
        st.score[team] += 1
        emit(st, out, "shot", team, c, "goal", end=goal_mouth, pressure_m=pressure, xg=xg)
        emit(st, out, "goal", team, c, "goal", ball=goal_mouth)
        reset_for_kickoff(st, ctx, 1 - team)
        emit(st, out, "kickoff", 1 - team, st.carrier)
        return
    rest = (r - xg) / (1.0 - xg)
    outcome = (
        "blocked"
        if rest < wd["shot_blocked_prob"]
        else ("saved" if rest < wd["shot_blocked_prob"] + wd["shot_saved_prob"] else "off_target")
    )
    emit(st, out, "shot", team, c, outcome, end=goal_mouth, pressure_m=pressure, xg=xg)
    give_ball(st, int(pitch.TEAM_IDX[1 - team][pitch.GK]))


def _is_crossing(p: np.ndarray, d: float, ctx: MatchContext) -> bool:
    return (
        pitch.progress(p[0], d) > ctx.w["passing"]["cross_zone"]
        and abs(p[1] - pitch.PITCH_Y / 2) > ctx.w["movement"]["wide_m"]
    )


def _choose_receiver(st, ctx, rng, team, d, c) -> int | None:
    wp = ctx.w["passing"]
    p = st.pos[c]
    idx = pitch.TEAM_IDX[team]
    mates = idx[idx != c]
    opp = st.pos[pitch.TEAM_IDX[1 - team]]
    vec = st.pos[mates] - p
    dist = np.hypot(vec[:, 0], vec[:, 1])
    fwd = vec[:, 0] * d
    recv_press = np.min(
        np.hypot(
            st.pos[mates, None, 0] - opp[None, :, 0], st.pos[mates, None, 1] - opp[None, :, 1]
        ),
        axis=1,
    )
    score = (
        wp["receiver_fwd"] * (0.5 + ctx.tactics[team].directness) * fwd / 10.0
        - wp["receiver_dist"] * dist / 10.0
        + wp["receiver_open"] * np.minimum(recv_press, 6.0) / 6.0
    )
    if _is_crossing(p, d, ctx):  # from a wide area near the box, aim for team-mates in the box
        mate_u = (
            st.pos[mates, 0] / pitch.PITCH_X if d > 0 else 1.0 - st.pos[mates, 0] / pitch.PITCH_X
        )
        in_box = (mate_u > 0.84) & (np.abs(st.pos[mates, 1] - pitch.PITCH_Y / 2) < 20.0)
        score = score + wp["cross_box_bonus"] * in_box
    score[(dist > wp["max_dist_m"]) | (dist < 3.0)] = -np.inf
    if not np.isfinite(score).any():
        return None
    prob = np.exp(score - score[np.isfinite(score)].max())
    cum = np.cumsum(prob)
    return int(mates[int(np.searchsorted(cum, rng.random() * cum[-1]))])


def pass_success_prob(st: MatchState, ctx: MatchContext, c: int, r: int, pressure: float) -> float:
    """Chance a pass from c to r arrives, given defenders' current positions."""
    wp = ctx.w["passing"]
    team = pitch.team_of(c)
    d = pitch.attack_dir(team, st.period)
    p = st.pos[c]
    opp = st.pos[pitch.TEAM_IDX[1 - team]]
    seg = st.pos[r] - p
    dist = float(np.hypot(*seg))
    seg_len2 = max(float(seg @ seg), 1e-9)
    t = np.clip(((opp - p) @ seg) / seg_len2, 0.0, 1.0)
    perp = np.hypot(*(opp - (p + t[:, None] * seg)).T)
    lane = int(((perp < wp["lane_width_m"]) & (t > 0.05) & (t < 0.95)).sum())
    recv_press = float(np.min(np.hypot(*(opp - st.pos[r]).T)))
    z = (
        wp["success_a"]
        - wp["success_b"] * dist
        - wp["success_c"] * lane
        - wp["success_d"] * max(0.0, 3.0 - recv_press)
        - wp["success_e"] * max(0.0, 3.0 - pressure)
        - (wp["cross_closed"] * max(0.0, 4.0 - pressure) if _is_crossing(p, d, ctx) else 0.0)
    )
    return _sigmoid(z)


def is_offside(st: MatchState, team: int, receiver: int) -> bool:
    d = pitch.attack_dir(team, st.period)
    return pitch.progress(st.pos[receiver, 0], d) > pitch.offside_line(
        st.pos, team, st.period, st.pos[st.carrier, 0]
    )


def carry_blocker(st: MatchState, ctx: MatchContext, team: int, end: np.ndarray) -> int | None:
    """The opponent a carry to `end` runs into, if any."""
    opp_idx = pitch.TEAM_IDX[1 - team]
    opp_d = np.hypot(*(st.pos[opp_idx] - end).T)
    j = int(np.argmin(opp_d))
    return int(opp_idx[j]) if opp_d[j] < ctx.w["decisions"]["carry_block_m"] else None


def _pass(st, ctx, rng, out, team, d, pressure) -> None:
    c = st.carrier
    r = _choose_receiver(st, ctx, rng, team, d, c)
    if r is None:
        _carry(st, ctx, rng, out, team, d, pressure)
        return
    p = st.pos[c]
    opp_idx = pitch.TEAM_IDX[1 - team]
    opp = st.pos[opp_idx]

    # offside: receiver beyond the line when the ball is played -> free kick to the defenders
    if is_offside(st, team, r):
        winner = int(opp_idx[np.argmin(np.hypot(*(opp - st.pos[r]).T))])
        emit(st, out, "pass", team, c, "offside", end=st.pos[r], receiver=r, pressure_m=pressure)
        give_ball(st, winner)
        return

    if rng.random() < pass_success_prob(st, ctx, c, r, pressure):
        emit(st, out, "pass", team, c, "complete", end=st.pos[r], receiver=r, pressure_m=pressure)
        give_ball(st, r)
        return
    # intercepted / misplaced: the opponent nearest to where the ball was going wins it
    target = p + (st.pos[r] - p) * rng.uniform(0.4, 1.0)
    winner = int(opp_idx[np.argmin(np.hypot(*(opp - target).T))])
    emit(
        st, out, "pass", team, c, "incomplete", end=st.pos[winner], receiver=r, pressure_m=pressure
    )
    give_ball(st, winner)


def _carry(st, ctx, rng, out, team, d, pressure) -> None:
    wd = ctx.w["decisions"]
    c = st.carrier
    p = st.pos[c].copy()
    end = p + np.array(
        [
            d * rng.uniform(wd["carry_min_m"], wd["carry_max_m"]),
            (pitch.PITCH_Y / 2 - p[1]) * 0.15 + rng.normal(0.0, 1.5),
        ]
    )
    pitch.clip_to_pitch(end)

    # carrying into an opponent becomes a duel
    blocker = carry_blocker(st, ctx, team, end)
    if blocker is not None:
        _duel(st, ctx, rng, out, team, blocker, pressure)
        if st.carrier != c:
            return

    st.pos[c] = end
    emit(st, out, "carry", team, c, "complete", end=end, pressure_m=pressure, ball=p)
    st.ball = st.pos[c].copy()
