"""Off-ball movement: formation slots that shift with the ball, a defensive line, pressing.

Not physics: every second each player moves toward a target, capped by a max speed, plus noise.
Planted-mistake hooks (Override) live here so the same code path runs in live play,
in planted matches and in counterfactual replays.
"""

from __future__ import annotations

import numpy as np

from engine import pitch
from engine.state import MatchContext, MatchState

DEFENDERS = np.array(pitch.DEFENDERS)


def targets(st: MatchState, ctx: MatchContext) -> tuple[np.ndarray, np.ndarray]:
    """Target position for every player this second, and a mask of who is pressing."""
    w = ctx.w["movement"]
    active = st.active_overrides() if st.overrides else []
    out = np.empty((22, 2))
    pressing = np.zeros(22, dtype=bool)

    for t in (pitch.HOME, pitch.AWAY):
        d = pitch.attack_dir(t, st.period)
        slots = ctx.slots[t]
        in_poss = st.possession == t
        bu = pitch.progress(st.ball[0], d)
        bv = st.ball[1] / pitch.PITCH_Y if d > 0 else 1.0 - st.ball[1] / pitch.PITCH_Y

        center = (
            w["center_base"]
            + w["center_ball"] * bu
            + (w["poss_push"] if in_poss else -w["def_drop"])
        )
        compact = w["compact_in"] if in_poss else w["compact_out"]
        u = (slots[:, 0] - 0.45) * compact + center
        v = slots[:, 1] * (1 - w["ball_shift"]) + bv * w["ball_shift"]
        u[pitch.GK] = 0.02 + w["gk_ball"] * bu

        if not in_poss:
            line = min(center - 0.2, bu - w["line_gap"])
            line = min(max(line, w["line_min"]), ctx.tactics[t].line_height)
            u[DEFENDERS] = line

        if in_poss:
            # attackers hold their run on the offside line (a late step-up lowers it)
            cap = (
                pitch.offside_line(st.pos, t, st.period, st.ball[0])
                - w["onside_margin_m"] / pitch.PITCH_X
            )
            u[1:] = np.minimum(u[1:], cap)

        tgt = pitch.to_pitch(np.clip(u, 0.01, 0.99), np.clip(v, 0.02, 0.98), d)

        # near their own goal, each outfield player marks one attacker (greedy, nearest pairs first),
        # goal-side; further out the back four hold the line instead
        if not in_poss and bu < w["mark_zone"]:
            attackers = st.pos[pitch.TEAM_IDX[1 - t]][1:]
            gap = np.hypot(
                tgt[1:, None, 0] - attackers[None, :, 0], tgt[1:, None, 1] - attackers[None, :, 1]
            )
            lost = {
                o.player % 11 - 1
                for o in active
                if o.bug == "MARKING_LOST" and pitch.team_of(o.player) == t
            }
            taken_d, taken_a = set(), set()
            for flat in np.argsort(gap, axis=None):
                i, a = divmod(int(flat), gap.shape[1])
                if i in taken_d or a in taken_a:
                    continue
                taken_d.add(i)
                taken_a.add(a)
                if i in lost:
                    # drifts off his runner: ball-watching, a few metres away toward the ball
                    away = st.ball - attackers[a]
                    away /= max(float(np.hypot(*away)), 1e-9)
                    tgt[1 + i] = attackers[a] + away * w["marking_lost_m"]
                else:
                    mark = attackers[a] - np.array([d * w["mark_goal_side_m"], 0.0])
                    tgt[1 + i] += (mark - tgt[1 + i]) * w["mark_pull"]
                if len(taken_d) == gap.shape[0]:
                    break

        if not in_poss:
            for o in active:
                if pitch.team_of(o.player) != t:
                    continue
                k = o.player % 11
                if o.bug == "LATE_STEP_UP":
                    # stays deeper than the line, toward his own goal
                    tgt[k, 0] -= d * o.params.get("metres_behind_line", 5.0)
                elif o.bug == "HOLD_LINE":  # fix: level with the rest of the back four
                    others = [i for i in pitch.DEFENDERS if i != k]
                    tgt[k, 0] = float(np.median(tgt[others, 0]))
                elif o.bug == "FORCE_MARK":  # fix: tight, goal-side of the nearest attacker
                    attackers = st.pos[pitch.TEAM_IDX[1 - t]][1:]
                    a = attackers[int(np.argmin(np.hypot(*(attackers - st.pos[o.player]).T)))]
                    tgt[k] = a - np.array([d * w["mark_goal_side_m"], 0.0])

        out[pitch.TEAM_IDX[t]] = tgt

    # pressing: the defending team's nearest outfield players close the ball down
    defending = 1 - st.possession
    tac = ctx.tactics[defending]
    idx = pitch.TEAM_IDX[defending][1:]
    crosser_wide = abs(st.ball[1] - pitch.PITCH_Y / 2) > ctx.w["movement"]["wide_m"]
    blocked = {
        o.player
        for o in active
        if o.bug == "PRESS_MISSED" or (o.bug == "CROSS_NOT_BLOCKED" and crosser_wide)
    }
    dist = np.hypot(*(st.pos[idx] - st.ball).T)
    own_third = pitch.progress(st.ball[0], pitch.attack_dir(defending, st.period)) < 1 / 3
    n_press = tac.pressers + (w["own_third_extra_pressers"] if own_third else 0)
    n = 0
    for j in np.argsort(dist):
        if n == n_press or dist[j] > tac.press_radius_m:
            break
        n += 1
        if idx[j] in blocked:  # PRESS_MISSED / CROSS_NOT_BLOCKED: slot wasted, nobody covers
            continue
        out[idx[j]] = st.ball
        pressing[idx[j]] = True

    for o in active:  # fix: this player closes the ball down whatever the pressing count
        if (
            o.bug == "FORCE_PRESS"
            and pitch.team_of(o.player) == defending
            and float(np.hypot(*(st.pos[o.player] - st.ball))) <= 2 * tac.press_radius_m
        ):
            out[o.player] = st.ball
            pressing[o.player] = True

    out[st.carrier] = st.pos[st.carrier]
    return out, pressing


def update(st: MatchState, ctx: MatchContext, rng: np.random.Generator) -> None:
    w = ctx.w["movement"]
    tgt, pressing = targets(st, ctx)
    delta = tgt - st.pos
    dist = np.hypot(delta[:, 0], delta[:, 1])
    speed = np.where(pressing, w["press_speed_mps"], w["speed_mps"])
    scale = np.minimum(1.0, speed / np.maximum(dist, 1e-9))
    st.pos += delta * scale[:, None] + rng.normal(0.0, w["noise_m"], (22, 2))
    st.pos[st.carrier] = tgt[st.carrier]
    pitch.clip_to_pitch(st.pos)
    st.ball = st.pos[st.carrier].copy()
