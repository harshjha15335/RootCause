"""Planted-mistake injector + ground-truth writer.

    python -m engine.mistakes --bug LATE_STEP_UP --player H3 --minute 30 --seed 7
    python -m engine.mistakes --random --seed 7          # random bug / player / minute

inject_mistake(bug, player, minute, seed) runs the match to `minute`, waits for a moment
where the mistake matters (a dangerous attack by the other team), switches the mistake on
and keeps it only if that attack ends in a goal AND the same attack with the same randomness but
without the mistake does not (a "but-for" test, so the mistake really caused the goal).
Otherwise it re-rolls the randomness from the same moment (up to `rerolls` times), then moves on
to the next suitable moment.
Natural, unplanted mistakes still happen everywhere else, which keeps the accuracy test honest.

Everything is deterministic: the same arguments always give the same match and ground truth.

The behaviours are Override hooks inside the engine:
  LATE_STEP_UP       movement.targets  defender sits metres_behind_line deeper, lowering the offside line
  DUEL_LOST          decisions         the player (on the ball) loses his next duel
  PRESS_MISSED       movement.targets  the nearest presser does not close down, nobody covers
  MARKING_LOST       movement.targets  defender stops tracking his runner in his own half
  CROSS_NOT_BLOCKED  movement.targets  full-back does not close the ball carrier in a wide area
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import cast

import numpy as np

from engine import pitch
from engine.models import BugCode, GroundTruth
from engine.simulate import Match, write_match
from engine.state import Override

# Which shirt slots (index within the team, see teams.FORMATIONS) can commit each mistake.
ELIGIBLE: dict[str, tuple[int, ...]] = {
    "LATE_STEP_UP": (1, 2, 3, 4),  # back four
    "DUEL_LOST": (5, 6, 7, 9, 10),  # midfielders and wide players
    "PRESS_MISSED": tuple(range(1, 11)),  # any outfield player
    "MARKING_LOST": (1, 2, 3, 4, 5),  # back four + holding midfielder
    "CROSS_NOT_BLOCKED": (1, 2),  # full-backs
}

DURATION_S = {
    "LATE_STEP_UP": 12,
    "DUEL_LOST": 6,
    "PRESS_MISSED": 8,
    "MARKING_LOST": 12,
    "CROSS_NOT_BLOCKED": 8,
}


class PlantFailed(RuntimeError):
    pass


def apply_override(
    match: Match, bug: str, player: int, duration_s: int | None = None, params: dict | None = None
) -> Override:
    """Force `bug` on `player` from now for duration_s seconds."""
    now = match.state.clock_s
    o = Override(bug, player, now + (duration_s or DURATION_S[bug]), dict(params or {}), from_s=now)
    match.state.overrides.append(o)
    return o


def is_trigger(bug: str, match: Match, player: int) -> bool:
    """Is this a moment where `bug` by `player` could lead to a goal?"""
    st, ctx = match.state, match.ctx
    team = pitch.team_of(player)
    att = 1 - team

    if bug == "DUEL_LOST":
        # the player is on the ball in midfield with an opponent close
        if st.carrier != player:
            return False
        bu = pitch.progress(st.ball[0], pitch.attack_dir(team, st.period))
        near = float(np.min(np.hypot(*(st.pos[pitch.TEAM_IDX[att]] - st.pos[player]).T)))
        return 0.3 <= bu <= 0.7 and near < 4.0

    if st.possession != att:
        return False
    au = pitch.progress(st.ball[0], pitch.attack_dir(att, st.period))
    outfield = pitch.TEAM_IDX[team][1:]
    to_ball = np.hypot(*(st.pos[outfield] - st.ball).T)
    is_nearest = outfield[int(np.argmin(to_ball))] == player

    if bug == "LATE_STEP_UP":
        return 0.5 <= au <= 0.75
    if bug == "PRESS_MISSED":
        return (
            0.4 <= au <= 0.8
            and is_nearest
            and float(to_ball.min()) <= ctx.tactics[team].press_radius_m
        )
    if bug == "MARKING_LOST":
        return au >= 0.6
    if bug == "CROSS_NOT_BLOCKED":
        wide = abs(st.ball[1] - pitch.PITCH_Y / 2) > ctx.w["movement"]["wide_m"]
        return au >= 0.65 and wide and is_nearest
    raise ValueError(f"unknown bug {bug}")


def _play_attack(match: Match, att: int, window_s: int) -> int | None:
    """Step until the attack ends. Returns the index of the goal event if `att` scored."""
    st = match.state
    t0, goals0, other0 = st.clock_s, int(st.score[att]), int(st.score[1 - att])
    had_ball = st.possession == att
    while match.state.clock_s < t0 + window_s and not match.state.finished:
        match.step(record_state=True)
        st = match.state
        if st.score[att] > goals0:
            return max(i for i, e in enumerate(match.events) if e.type == "goal")
        if st.score[1 - att] > other0:
            return None
        if st.possession == att:
            had_ball = True
        elif had_ball:
            return None
    return None


def inject_mistake(
    bug: str,
    player: int | str,
    minute: int,
    seed: int,
    rerolls: int = 20,
    search_s: int = 900,
    match_id: str | None = None,
) -> tuple[Match, GroundTruth]:
    """Plant `bug` by `player` at or after `minute`; returns the full match and its ground truth."""
    p = pitch.player_index(player) if isinstance(player, str) else int(player)
    if p % 11 not in ELIGIBLE[bug]:
        raise ValueError(
            f"{pitch.player_id(p)} cannot commit {bug}; eligible shirts: {[k + 1 for k in ELIGIBLE[bug]]}"
        )
    att = 1 - pitch.team_of(p)

    m = Match(seed, match_id).run(until_s=minute * 60, record_states=True)
    window = m.ctx.w["debugger"]["window_s"]
    deadline = min(minute * 60 + search_s, pitch.FULL_S - window - 1)
    params_rng = np.random.default_rng([seed, 1])
    params: dict[str, float | int | str] = (
        {"metres_behind_line": round(float(params_rng.uniform(4.0, 6.0)), 1)}
        if bug == "LATE_STEP_UP"
        else {}
    )

    while m.state.clock_s < deadline:
        t0 = m.state.clock_s
        crosses_half = t0 < pitch.HALF_S <= t0 + window
        if not crosses_half and is_trigger(bug, m, p):
            snap = m.snapshot()
            for attempt in range(rerolls):
                # but-for test: the same attack, same randomness, WITHOUT the mistake must not score
                m.restore(snap)
                m.rng = np.random.default_rng([seed, t0, attempt])
                if _play_attack(m, att, window) is not None:
                    continue
                m.restore(snap)
                m.rng = np.random.default_rng([seed, t0, attempt])
                o = apply_override(m, bug, p, params=params)
                goal_i = _play_attack(m, att, window)
                if goal_i is None:
                    continue
                root_s = t0
                if bug == "DUEL_LOST":
                    lost = [
                        e
                        for e in m.events[snap.n_events : goal_i]
                        if e.type == "duel" and e.player == p and e.outcome == "lost"
                    ]
                    if not lost:
                        continue  # scored, but not because of the planted duel
                    root_s = lost[0].clock_s
                goal = m.events[goal_i]
                # the mistake also lives in earlier snapshots (inactive until t0), so replays
                # that start before t0 still contain it
                for past in m.history[max(0, t0 - window - 5) : t0]:
                    past.overrides.append(
                        Override(o.bug, o.player, o.until_s, dict(o.params), o.from_s)
                    )
                m.run(record_states=True)
                n = sum(e.type == "goal" for e in m.events[: goal_i + 1])
                gt = GroundTruth(
                    match_id=m.ctx.match_id,
                    seed=seed,
                    goal_id=f"{m.ctx.match_id}-g{n}",
                    goal_seq=goal.seq,
                    goal_clock_s=goal.clock_s,
                    scoring_team=pitch.TEAM_CODES[att],
                    planted_at_s=t0,
                    root_cause_clock_s=root_s,
                    root_cause_player_id=pitch.player_id(p),
                    bug=cast(BugCode, bug),
                    params=dict(params),
                )
                return m, gt
            m.restore(snap)
        m.step(record_state=True)
    raise PlantFailed(
        f"could not plant {bug} by {pitch.player_id(p)} after minute {minute} (seed {seed})"
    )


def random_plant(seed: int, match_id: str | None = None) -> tuple[Match, GroundTruth]:
    """Random bug, conceding team, eligible player and minute; used by the accuracy test."""
    rng = np.random.default_rng([seed, 2])
    bugs = sorted(ELIGIBLE)
    for _ in range(10):
        bug = bugs[int(rng.integers(len(bugs)))]
        team = int(rng.integers(2))
        slot = ELIGIBLE[bug][int(rng.integers(len(ELIGIBLE[bug])))]
        minute = int(rng.integers(3, 75))
        try:
            return inject_mistake(bug, pitch.TEAM_IDX[team][slot], minute, seed, match_id=match_id)
        except PlantFailed:
            continue
    raise PlantFailed(f"random_plant gave up for seed {seed}")


def write_ground_truth(path: Path, truths: list[GroundTruth]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([t.model_dump() for t in truths], indent=2), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Generate a match with one planted mistake that leads to a goal."
    )
    ap.add_argument("--bug", choices=sorted(ELIGIBLE))
    ap.add_argument("--player", help='e.g. "H3"')
    ap.add_argument("--minute", type=int, default=30)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument(
        "--random", action="store_true", help="pick bug, player and minute from the seed"
    )
    ap.add_argument("--out", type=Path, default=Path("matches"))
    args = ap.parse_args()
    if args.random:
        m, gt = random_plant(args.seed)
    else:
        if not (args.bug and args.player):
            ap.error("--bug and --player are required unless --random")
        m, gt = inject_mistake(args.bug, args.player, args.minute, args.seed)
    ev_path, _ = write_match(m, args.out)
    gt_path = args.out / f"{m.ctx.match_id}.ground_truth.json"
    write_ground_truth(gt_path, [gt])
    print(gt.model_dump_json(indent=2))
    print(f"wrote {ev_path} and {gt_path}")


if __name__ == "__main__":
    main()
