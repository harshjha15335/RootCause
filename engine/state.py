"""Match state, context and raw events.

MatchState is everything that changes second to second. Copying it (plus the RNG
state) is a full snapshot: resume from it and the match continues identically.
The counterfactual replay in debugger/ is built on this.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from engine import pitch
from engine.teams import Club, Tactics


@dataclass
class Override:
    """A forced behaviour, used by planted mistakes and by Debugger fixes.

    bug: a BugCode, or "FIX:<BugCode>" for a fix that suppresses that behaviour.
    """

    bug: str
    player: int
    until_s: int
    params: dict = field(default_factory=dict)
    from_s: int = 0  # inactive before this second (lets a planted mistake sit in earlier snapshots)


@dataclass
class MatchState:
    clock_s: int
    period: int
    pos: np.ndarray  # (22, 2) metres
    ball: np.ndarray  # (2,)
    possession: int  # pitch.HOME / pitch.AWAY
    carrier: int  # 0..21
    score: np.ndarray  # (2,) int
    possession_id: int
    seq: int = 0
    finished: bool = False
    overrides: list[Override] = field(default_factory=list)

    def copy(self) -> MatchState:
        return MatchState(
            clock_s=self.clock_s,
            period=self.period,
            pos=self.pos.copy(),
            ball=self.ball.copy(),
            possession=self.possession,
            carrier=self.carrier,
            score=self.score.copy(),
            possession_id=self.possession_id,
            seq=self.seq,
            finished=self.finished,
            overrides=[
                Override(o.bug, o.player, o.until_s, dict(o.params), o.from_s)
                for o in self.overrides
            ],
        )

    def active_overrides(self) -> list[Override]:
        return [o for o in self.overrides if o.from_s <= self.clock_s]

    def override_for(self, bug: str, player: int) -> Override | None:
        for o in self.active_overrides():
            if o.bug == bug and o.player == player:
                return o
        return None


@dataclass(frozen=True)
class MatchContext:
    """Everything fixed for a match: clubs, formation slots, weights."""

    match_id: str
    seed: int
    clubs: tuple[Club, Club]
    slots: tuple[np.ndarray, np.ndarray]  # (11, 2) team-frame (u, v) per team
    w: dict

    @property
    def tactics(self) -> tuple[Tactics, Tactics]:
        return self.clubs[0].tactics, self.clubs[1].tactics


@dataclass
class RawEvent:
    """Engine-internal event; converted to models.MatchEvent at the edge (simulate.to_match_event)."""

    seq: int
    clock_s: int
    period: int
    type: str
    team: int | None
    player: int | None
    outcome: str | None
    ball: np.ndarray
    end: np.ndarray | None
    receiver: int | None
    possession_id: int
    pos: np.ndarray
    pressure_m: float | None
    xg: float | None
    score: tuple[int, int]


def emit(
    st: MatchState,
    out: list[RawEvent] | None,
    type_: str,
    team: int | None = None,
    player: int | None = None,
    outcome: str | None = None,
    end: np.ndarray | None = None,
    receiver: int | None = None,
    pressure_m: float | None = None,
    xg: float | None = None,
    ball: np.ndarray | None = None,
) -> None:
    """Record an event. `out=None` (counterfactual replays) skips the copying."""
    if out is not None:
        out.append(
            RawEvent(
                seq=st.seq,
                clock_s=st.clock_s,
                period=st.period,
                type=type_,
                team=team,
                player=player,
                outcome=outcome,
                ball=(st.ball if ball is None else ball).copy(),
                end=None if end is None else end.copy(),
                receiver=receiver,
                possession_id=st.possession_id,
                pos=st.pos.copy(),
                pressure_m=pressure_m,
                xg=xg,
                score=(int(st.score[0]), int(st.score[1])),
            )
        )
    st.seq += 1


def give_ball(st: MatchState, player: int) -> None:
    """Hand the ball to `player`, bumping possession_id if the team changes."""
    team = pitch.team_of(player)
    if team != st.possession:
        st.possession = team
        st.possession_id += 1
    st.carrier = player
    st.ball = st.pos[player].copy()


def reset_for_kickoff(st: MatchState, ctx: MatchContext, team: int) -> None:
    """Both teams in their own half, `team`'s striker on the centre spot with the ball."""
    for t in (pitch.HOME, pitch.AWAY):
        d = pitch.attack_dir(t, st.period)
        u = np.minimum(ctx.slots[t][:, 0] * 0.6, 0.46)
        st.pos[pitch.TEAM_IDX[t]] = pitch.to_pitch(u, ctx.slots[t][:, 1], d)
    kicker = pitch.TEAM_IDX[team][pitch.STRIKER]
    st.pos[kicker] = (pitch.PITCH_X / 2, pitch.PITCH_Y / 2)
    st.possession = 1 - team  # so give_ball counts a possession change
    give_ball(st, kicker)
