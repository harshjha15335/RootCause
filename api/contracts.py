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


class Evidence(Contract):
    goal_id: EntityId
    match_id: EntityId
    source: Literal["synthetic-fixture", "debugger"]
    goal: MatchEvent
    links: list[Link] = Field(min_length=1, max_length=100)
    events: list[MatchEvent] = Field(default_factory=list, max_length=1000)
    root_cause_evidence_id: EntityId | None = None

    @model_validator(mode="after")
    def consistent(self):
        if self.goal.match_id != self.match_id or self.goal.type != "goal":
            raise ValueError("Evidence must reference its match's goal event")
        if abs(sum(x.blame_percent for x in self.links) - 100) > 0.01:
            raise ValueError("Engine blame must sum to 100 percent")
        if len({x.evidence_id for x in self.links}) != len(self.links):
            raise ValueError("Evidence IDs must be unique")
        players = {p.player_id for p in self.goal.players}
        if any(x.second > self.goal.second or x.player_id not in players for x in self.links):
            raise ValueError("Links must reference known players and precede the goal")
        if any(e.match_id != self.match_id or e.second > self.goal.second for e in self.events):
            raise ValueError(
                "Evidence events must belong to this match and cannot include the future"
            )
        if len({e.id for e in self.events}) != len(self.events):
            raise ValueError("Evidence event IDs must be unique")
        # Stable ties preserve Role 2's ordering. No model computes or changes attribution.
        self.links = sorted(
            self.links, key=lambda x: -(x.baseline_goals - x.fixed_goals) / x.trials
        )
        root = self.links[0].evidence_id
        if self.root_cause_evidence_id and self.root_cause_evidence_id != root:
            raise ValueError("Root cause must be the Debugger's largest counterfactual drop")
        self.root_cause_evidence_id = root
        return self


class CitedSentence(Contract):
    text: str = Field(min_length=1, max_length=2000)
    evidence_ids: list[EntityId] = Field(min_length=1, max_length=100)
    kind: Literal["description", "attribution", "counterfactual", "root", "neutral"]

    def tagged(self) -> str:
        return self.text + " " + " ".join(f"[{eid}]" for eid in self.evidence_ids)


class LinkExplanation(Contract):
    evidence_id: EntityId
    sentences: list[CitedSentence] = Field(min_length=1)


class ClipPlan(Contract):
    evidence_id: EntityId
    start_second: int = Field(ge=0)
    end_second: int = Field(ge=0)


class Highlight(ClipPlan):
    caption: CitedSentence


class Explanation(Contract):
    goal_id: EntityId
    match_id: EntityId
    status: Literal["ready", "pending"]
    source: Literal["model", "evidence-only"]
    root_cause_evidence_id: EntityId
    paragraphs: list[LinkExplanation]
    root_summary: list[CitedSentence] = Field(min_length=1)
    highlights: list[Highlight]
    recaps: dict[str, list[CitedSentence]]
    blame_order: list[Link] = Field(min_length=1)
    latency_ms: float = 0
    warnings: list[str] = Field(default_factory=list)


class ExplainerOutput(Contract):
    paragraphs: list[LinkExplanation] = Field(min_length=1, max_length=100)
    root_summary: list[CitedSentence] = Field(min_length=1, max_length=100)


class HighlightsPlan(Contract):
    clips: list[ClipPlan] = Field(min_length=1, max_length=100)


class StoryPlan(Contract):
    evidence_ids: list[EntityId]


class PersonaPlan(Contract):
    style: Literal["fan", "analyst", "studio"]
    detail: Literal["brief", "detailed"] = "brief"


class ReportPlan(Contract):
    goal_ids: list[EntityId]
    top_causes: list[str]


class NeutralPlan(Contract):
    style: Literal["neutral"]


class StartMatch(Contract):
    seed: int = Field(default=42, ge=0)
