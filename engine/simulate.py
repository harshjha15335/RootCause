"""Second-by-second match loop.

    python -m engine.simulate --seed 7            # writes matches/m-0007.events.jsonl + .meta.json

`step()` is the one function everything shares: live matches, snapshot/resume and the
Debugger's counterfactual replays all call it. It mutates the state in place; take a
`Match.snapshot()` (state copy + RNG state) before stepping if you need to come back.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

import numpy as np

from engine import decisions, movement, pitch
from engine.config import load_weights
from engine.models import EventType, MatchEvent, MatchMeta, Outcome, PlayerPos, Point, Score
from engine.state import MatchContext, MatchState, RawEvent, emit, reset_for_kickoff
from engine.teams import DEFAULT_AWAY, DEFAULT_HOME, Club


def step(
    st: MatchState, ctx: MatchContext, rng: np.random.Generator, out: list[RawEvent] | None
) -> None:
    """Advance the match by one second."""
    if st.finished:
        return
    if st.clock_s == pitch.HALF_S and st.period == 1:
        emit(st, out, "half_time", st.possession, st.carrier)
        st.period = 2
        reset_for_kickoff(st, ctx, pitch.AWAY)
        emit(st, out, "kickoff", pitch.AWAY, st.carrier)
    elif st.clock_s >= pitch.FULL_S:
        emit(st, out, "full_time", st.possession, st.carrier)
        st.finished = True
        return

    movement.update(st, ctx, rng)
    seq_before = st.seq
    decisions.act(st, ctx, rng, out)
    if st.seq == seq_before:
        emit(st, out, "tick", st.possession, st.carrier)

    st.clock_s += 1
    if st.overrides:
        st.overrides = [o for o in st.overrides if o.until_s >= st.clock_s]


@dataclass
class Snapshot:
    state: MatchState
    rng_state: dict
    n_events: int
    n_history: int


class Match:
    def __init__(
        self,
        seed: int,
        match_id: str | None = None,
        home: Club = DEFAULT_HOME,
        away: Club = DEFAULT_AWAY,
        weights: dict | None = None,
    ):
        self.ctx = MatchContext(
            match_id=match_id or f"m-{seed:04d}",
            seed=seed,
            clubs=(home, away),
            slots=(home.slots(), away.slots()),
            w=weights or load_weights(),
        )
        self.rng = np.random.default_rng(seed)
        self.state = MatchState(
            clock_s=0,
            period=1,
            pos=np.zeros((22, 2)),
            ball=np.zeros(2),
            possession=pitch.HOME,
            carrier=0,
            score=np.zeros(2, dtype=int),
            possession_id=0,
        )
        reset_for_kickoff(self.state, self.ctx, pitch.HOME)
        self.state.possession_id = 0
        self.events: list[RawEvent] = []
        emit(self.state, self.events, "kickoff", pitch.HOME, self.state.carrier)
        self.history: list[MatchState] = []  # per-second states, filled when record_states=True

    def step(self, record_state: bool = False) -> None:
        if record_state:
            self.history.append(self.state.copy())
        step(self.state, self.ctx, self.rng, self.events)

    def run(self, until_s: int = pitch.FULL_S + 1, record_states: bool = False) -> Match:
        while not self.state.finished and self.state.clock_s < until_s:
            self.step(record_states)
        return self

    def snapshot(self) -> Snapshot:
        return Snapshot(
            self.state.copy(),
            dict(self.rng.bit_generator.state),
            len(self.events),
            len(self.history),
        )

    def restore(self, snap: Snapshot) -> None:
        """Rewind to the snapshot: state, RNG, and the recorded events/history after it."""
        self.state = snap.state.copy()
        self.rng.bit_generator.state = snap.rng_state
        del self.events[snap.n_events :]
        del self.history[snap.n_history :]

    def meta(self) -> MatchMeta:
        home, away = self.ctx.clubs
        return MatchMeta(
            match_id=self.ctx.match_id,
            seed=self.ctx.seed,
            home=home.meta("HOME"),
            away=away.meta("AWAY"),
        )

    def match_events(self) -> list[MatchEvent]:
        return [to_match_event(e, self.ctx.match_id) for e in self.events]


def to_match_event(e: RawEvent, match_id: str) -> MatchEvent:
    pid = lambda i: None if i is None else pitch.player_id(i)
    pt = lambda a: None if a is None else Point(x=round(float(a[0]), 1), y=round(float(a[1]), 1))
    return MatchEvent(
        match_id=match_id,
        seq=e.seq,
        clock_s=e.clock_s,
        period=cast(Literal[1, 2], e.period),
        type=cast(EventType, e.type),
        team=None if e.team is None else pitch.TEAM_CODES[e.team],
        player_id=pid(e.player),
        outcome=cast(Outcome | None, e.outcome),
        ball=Point(x=round(float(e.ball[0]), 1), y=round(float(e.ball[1]), 1)),
        end=pt(e.end),
        receiver_id=pid(e.receiver),
        possession_id=e.possession_id,
        players=[
            PlayerPos(id=pitch.player_id(i), x=round(float(x), 1), y=round(float(y), 1))
            for i, (x, y) in enumerate(e.pos)
        ],
        pressure_m=None if e.pressure_m is None else round(e.pressure_m, 2),
        xg=None if e.xg is None else round(e.xg, 4),
        score=Score(HOME=e.score[0], AWAY=e.score[1]),
    )


def summary(events: list[RawEvent]) -> dict:
    """Realism stats (see config/weights.yaml -> realism)."""
    passes = [e for e in events if e.type == "pass"]
    shots = [e for e in events if e.type == "shot"]
    return {
        "events": sum(e.type != "tick" for e in events),
        "passes": len(passes),
        "pass_accuracy": round(
            sum(e.outcome == "complete" for e in passes) / max(len(passes), 1), 3
        ),
        "shots": len(shots),
        "total_xg": round(sum(e.xg or 0.0 for e in shots), 2),
        "goals": sum(e.type == "goal" for e in events),
        "offsides": sum(e.outcome == "offside" for e in passes),
        "score": events[-1].score if events else (0, 0),
    }


def write_match(match: Match, out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    mid = match.ctx.match_id
    ev_path, meta_path = out_dir / f"{mid}.events.jsonl", out_dir / f"{mid}.meta.json"
    with open(ev_path, "w", encoding="utf-8") as f:
        f.writelines(ev.model_dump_json(exclude_none=False) + "\n" for ev in match.match_events())
    meta_path.write_text(match.meta().model_dump_json(indent=2), encoding="utf-8")
    return ev_path, meta_path


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate a synthetic match.")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", type=Path, default=Path("matches"))
    args = ap.parse_args()
    m = Match(args.seed).run()
    ev_path, meta_path = write_match(m, args.out)
    print(json.dumps(summary(m.events)))
    print(f"wrote {ev_path} and {meta_path}")


if __name__ == "__main__":
    main()
