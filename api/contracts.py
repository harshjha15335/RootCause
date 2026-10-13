from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

EntityId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Position(Contract):
    x: float = Field(ge=0, le=105)
    y: float = Field(ge=0, le=68)


class PlayerPosition(Contract):
    player_id: EntityId
    team: Literal["home", "away"]
    position: Position


class MatchEvent(Contract):
    id: EntityId
    match_id: EntityId
    second: int = Field(ge=0)
    type: Literal["pass", "duel", "cross", "goal"]
    team: Literal["home", "away"]
    player_id: EntityId
    ball: Position
    players: list[PlayerPosition] = Field(min_length=22, max_length=22)

    @model_validator(mode="after")
    def unique_players(self):
        ids = {p.player_id for p in self.players}
        if len(ids) != 22 or self.player_id not in ids:
            raise ValueError("Require 22 unique players including the event player")
        if sum(p.team == "home" for p in self.players) != 11:
            raise ValueError("Require 11 players per team")
        if next(p.team for p in self.players if p.player_id == self.player_id) != self.team:
            raise ValueError("Event team must match the event player's team")
        return self


class Link(Contract):
    evidence_id: EntityId
    player_id: EntityId
    second: int = Field(ge=0)
    bug_type: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=1000)
    blame_percent: float = Field(ge=0, le=100)
    baseline_goals: int = Field(ge=0, le=200)
    fixed_goals: int = Field(ge=0, le=200)
    trials: Literal[200] = 200


class View(Contract):
    player_id: EntityId
    second: int = Field(ge=0)
    observations: list[Annotated[str, Field(max_length=1000)]] = Field(max_length=100)


class Evidence(Contract):
    goal_id: EntityId
    match_id: EntityId
    source: Literal["synthetic-fixture", "debugger"]
    goal: MatchEvent
    links: list[Link] = Field(min_length=1, max_length=100)
    views: list[View] = Field(max_length=1000)
    root_cause_evidence_id: EntityId | None = None

    @model_validator(mode="after")
    def consistent(self):
        if self.goal.match_id != self.match_id or self.goal.type != "goal":
            raise ValueError("Evidence must reference its match's goal event")
        if abs(sum(link.blame_percent for link in self.links) - 100) > 0.01:
            raise ValueError("Fixture blame must sum to 100 percent")
        if len({link.evidence_id for link in self.links}) != len(self.links):
            raise ValueError("Evidence IDs must be unique")
        if any(link.second > self.goal.second for link in self.links):
            raise ValueError("Causal links must precede the goal")
        players = {p.player_id for p in self.goal.players}
        if any(x.player_id not in players for x in [*self.links, *self.views]):
            raise ValueError("Evidence must reference players present in the match")
        if any(x.second > self.goal.second for x in self.views):
            raise ValueError("Player views cannot include future observations")
        if len({(x.player_id, x.second) for x in self.views}) != len(self.views):
            raise ValueError("Player view snapshots must be unique")
        if self.root_cause_evidence_id and self.root_cause_evidence_id not in {
            x.evidence_id for x in self.links
        }:
            raise ValueError("Declared engine root cause must reference an evidence link")
        return self


class Claim(Contract):
    evidence_id: EntityId
    player_id: EntityId
    description: str = Field(max_length=1000)
    blame_percent: float = Field(ge=0, le=100)


class Testimony(Contract):
    player_id: EntityId
    source: Literal["evidence-only", "model"]
    claims: list[Claim] = Field(max_length=100)
    statement: str = ""
    rebuttal: bool = False


class Verdict(Contract):
    goal_id: str
    match_id: str
    source: Literal["evidence-only", "model"]
    testimonies: list[Testimony]
    accepted_claims: list[Claim]
    rejected_claims: list[Claim]
    blame_order: list[Link]
    reasoning: str
    recaps: dict[str, str]
    root_cause_evidence_id: str = ""
    latency_ms: float = 0
    warnings: list[str] = Field(default_factory=list)


class JudgeDecision(Contract):
    accepted_evidence_ids: list[str]
    rejected_evidence_ids: list[str]
    root_cause_evidence_id: str


class StoryPlan(Contract):
    evidence_ids: list[str]


class PersonaPlan(Contract):
    style: Literal["fan", "analyst", "studio"]
    detail: Literal["brief", "detailed"] = "brief"


class ReportPlan(Contract):
    goal_ids: list[EntityId]
    top_causes: list[str]


class NeutralPlan(Contract):
    style: Literal["neutral"]


class OrchestrationPlan(Contract):
    player_ids: list[EntityId] = Field(min_length=1, max_length=3)


class StartMatch(Contract):
    seed: int = Field(default=42, ge=0)
