"""Data contracts owned by Role 2.

Contract 1: MatchEvent (+ MatchMeta)  -> read by Role 1 (UI) and Role 3 (goal detector).
Contract 2: EvidencePackage           -> read by Role 3's agents.

Frozen after day 1. Any change: raise it in the evening call, then update
docs/ENGINE.md (python scripts/export_schema.py) and samples/engine/ the same day.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "1.0.0"

Team = Literal["HOME", "AWAY"]
EventType = Literal[
    "kickoff",  # start of each half and after a goal
    "tick",  # nothing happened this second; carries positions so the UI can animate
    "pass",
    "carry",
    "duel",
    "shot",
    "goal",  # always follows a shot with outcome "goal"
    "half_time",
    "full_time",
]
Outcome = Literal[
    "complete", "incomplete", "offside", "won", "lost", "goal", "saved", "blocked", "off_target"
]

BugCode = Literal[
    "LATE_STEP_UP",
    "DUEL_LOST",
    "PRESS_MISSED",
    "MARKING_LOST",
    "CROSS_NOT_BLOCKED",
    # grows to ~10 types (e.g. SECOND_BALL_LOST, GK_OFF_LINE); add here and in debugger/catalogue.py
]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Point(_Strict):
    """Pitch coordinates in metres. Pitch is 105 x 68; (0, 0) is a corner flag.
    HOME attacks towards x = 105 in period 1 and towards x = 0 in period 2."""

    x: float = Field(ge=0, le=105)
    y: float = Field(ge=0, le=68)


class PlayerPos(_Strict):
    id: str = Field(description='"H1".."H11" or "A1".."A11"; the number is the shirt number')
    x: float
    y: float


class Score(_Strict):
    HOME: int = 0
    AWAY: int = 0


# ---------------------------------------------------------------- contract 1


class MatchEvent(_Strict):
    """One event. At least one event is emitted every match second (a "tick" if nothing
    else happened), so the stream always carries all 22 positions each second."""

    match_id: str
    seq: int = Field(description="strictly increasing within a match")
    clock_s: int = Field(
        ge=0, description="seconds since kick-off, continuous across halves (0..5400)"
    )
    period: Literal[1, 2]
    type: EventType
    team: Team | None = Field(description="team in possession / acting team")
    player_id: str | None = Field(description="ball carrier / acting player")
    outcome: Outcome | None = None
    ball: Point
    end: Point | None = Field(default=None, description="where the ball ended (pass, carry, shot)")
    receiver_id: str | None = Field(default=None, description="intended receiver of a pass")
    possession_id: int = Field(description="increments each time possession changes team")
    players: list[PlayerPos] = Field(min_length=22, max_length=22)
    pressure_m: float | None = Field(description="distance from ball carrier to nearest opponent")
    xg: float | None = Field(default=None, description="goal probability, shots only")
    score: Score


class PlayerMeta(_Strict):
    id: str
    name: str
    number: int
    position: str


class TeamMeta(_Strict):
    code: Team
    name: str
    short_name: str
    kit_primary: str
    kit_secondary: str
    formation: str
    players: list[PlayerMeta]


class MatchMeta(_Strict):
    match_id: str
    seed: int
    contract_version: str = CONTRACT_VERSION
    pitch_length_m: float = 105.0
    pitch_width_m: float = 68.0
    duration_s: int = 5400
    home: TeamMeta
    away: TeamMeta


# ---------------------------------------------------------------- contract 2


class ChainLink(_Strict):
    rank: int = Field(ge=1, description="1 = most blame = root cause")
    clock_s: int
    player_id: str
    team: Team
    bug: BugCode
    fixed_goal_rate: float = Field(
        ge=0, le=1, description="goal rate when only this mistake is fixed"
    )
    drop: float = Field(ge=0, description="baseline_goal_rate - fixed_goal_rate, floored at 0")
    blame: float = Field(ge=0, le=1, description="drop / sum of drops; sums to 1 across links")
    facts: dict[str, float | int | str] = Field(
        description="the ONLY details the explanation agent may use for this link"
    )


class EvidencePackage(_Strict):
    contract_version: str = CONTRACT_VERSION
    match_id: str
    goal_id: str = Field(description='"<match_id>-g<n>"')
    scorer: str
    team: Team = Field(description="scoring team")
    clock_s: int
    possession_id: int
    chain_start_s: int
    baseline_goal_rate: float = Field(
        ge=0, le=1, description="goal rate replaying the possession unchanged"
    )
    runs_per_link: int
    root_cause_rank: int = 1
    links: list[ChainLink] = Field(description="sorted by rank (blame, descending)")
    weights_version: str = Field(description="hash of config/weights.yaml used")


# ---------------------------------------------------------------- internal: planted-mistake ground truth


class GroundTruth(_Strict):
    match_id: str
    seed: int
    goal_id: str
    goal_seq: int
    goal_clock_s: int
    scoring_team: Team
    planted_at_s: int = Field(description="second the override was switched on")
    root_cause_clock_s: int = Field(
        description="second the mistake took effect (e.g. the lost duel)"
    )
    root_cause_player_id: str
    bug: BugCode
    params: dict[str, float | int | str] = Field(default_factory=dict)
