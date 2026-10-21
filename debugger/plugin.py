"""Backend plugin: the Role 2 side of api/ingestion.py's DEBUGGER_MODULE contract.

    DEBUGGER_MODULE=debugger.plugin

trace(event_dict) takes a team-contract goal event (api/contracts.py: MatchEvent) and returns a
team-contract Evidence dict with source="debugger". Its numbers are actual goal counts out of
200 replays; drops, blame and ranking are all derived from those counts.

The engine is deterministic, so the match is rebuilt from its ID: "m-0007" is a free match with
seed 7, "p-1012" is engine.mistakes.random_plant(1012).

team_events(match_id) gives the match's events in the team contract, for publishing.
This module produces plain dicts. It only looks at the backend to see whether its Evidence model
still has the original `views` field (the revised contract forbids it).
"""

from __future__ import annotations

import re
from functools import lru_cache

from debugger.catalogue import CATALOGUE
from debugger.trace import trace as engine_trace
from engine import pitch
from engine.decisions import _is_crossing
from engine.mistakes import random_plant
from engine.models import EvidencePackage
from engine.simulate import Match
from engine.state import RawEvent

TRIALS = 200  # api/contracts.py: Link.trials is Literal[200]
_MATCH_ID = re.compile(r"^(?P<kind>[mp])-(?P<seed>\d+)$")
_EVENT_ID = re.compile(r"^(?P<match>.+)-e(?P<seq>\d+)$")


@lru_cache(maxsize=8)
def load_match(match_id: str) -> Match:
    """Rebuild a match (with per-second history for the Debugger) from its ID."""
    m = _MATCH_ID.match(match_id)
    if not m:
        raise ValueError(f"unknown match id {match_id!r}: expected m-<seed> or p-<seed>")
    seed = int(m["seed"])
    if m["kind"] == "p":
        match, _ = random_plant(seed, match_id=match_id)
        return match
    return Match(seed, match_id=match_id).run(record_states=True)


def _team(i: int) -> str:
    return "home" if pitch.team_of(i) == pitch.HOME else "away"


def team_event(e: RawEvent, match: Match) -> dict | None:
    """One engine event in the team contract, or None if the contract has no such type."""
    if e.type == "pass":
        d = pitch.attack_dir(e.team, e.period)  # type: ignore[arg-type]
        kind = "cross" if _is_crossing(e.ball, d, match.ctx) else "pass"
    elif e.type in ("duel", "goal"):
        kind = e.type
    else:
        return None
    assert e.player is not None
    return {
        "id": f"{match.ctx.match_id}-e{e.seq}",
        "match_id": match.ctx.match_id,
        "second": e.clock_s,
        "type": kind,
        "team": _team(e.player),
        "player_id": pitch.player_id(e.player),
        "ball": _point(e.ball if e.type != "goal" else e.pos[e.player]),
        "players": [
            {"player_id": pitch.player_id(i), "team": _team(i), "position": _point(xy)}
            for i, xy in enumerate(e.pos)
        ],
    }


def team_events(match_id: str) -> list[dict]:
    match = load_match(match_id)
    return [x for e in match.events if (x := team_event(e, match)) is not None]


def trace(event: dict) -> dict:
    """DEBUGGER_MODULE entry point: explain one goal in the team Evidence contract."""
    if event.get("type") != "goal":
        raise ValueError("trace expects a goal event")
    m = _EVENT_ID.match(event["id"])
    if not m or m["match"] != event["match_id"]:
        raise ValueError(f"unexpected event id {event['id']!r}: expected <match_id>-e<seq>")
    match = load_match(event["match_id"])
    ev = engine_trace(match, int(m["seq"]), runs=TRIALS)
    return to_team_evidence(ev, event)


def _counts(rate: float, runs: int) -> int:
    """Replay rates are exact goal counts / runs; recover the integer count."""
    count = round(rate * runs)
    if abs(count - rate * runs) > 1e-6:
        raise ValueError(f"rate {rate} is not a whole number of goals out of {runs}")
    return count


def _backend_has_views() -> bool:
    """The original team contract required `views`; the revised one forbids it."""
    try:
        from api.contracts import Evidence  # the backend, when installed alongside
    except ImportError:
        return False
    return "views" in Evidence.model_fields


def to_team_evidence(
    ev: EvidencePackage, goal_event: dict, include_views: bool | None = None
) -> dict:
    """Team-contract Evidence. Counts, drops, blame and ranking all come from the same
    integer goal counts out of TRIALS replays, so displayed numbers always agree."""
    if ev.runs_per_link != TRIALS:
        raise ValueError(f"team contract needs {TRIALS} replays per link, got {ev.runs_per_link}")
    baseline = _counts(ev.baseline_goal_rate, TRIALS)
    fixed = [_counts(link.fixed_goal_rate, TRIALS) for link in ev.links]
    drops = [max(0, baseline - f) for f in fixed]
    total = sum(drops)
    if not ev.links or total <= 0:
        raise ValueError(
            f"{ev.goal_id}: no detected mistake lowered the goal chance; no blame to assign"
        )
    percents = [100.0 * d / total for d in drops]
    top = max(range(len(percents)), key=lambda i: percents[i])
    percents[top] += 100.0 - sum(percents)  # float residual onto the largest share: sums to 100

    links = []
    for link, f, pct in zip(ev.links, fixed, percents, strict=True):
        bug = CATALOGUE[link.bug]
        facts = "; ".join(f"{k.replace('_', ' ')}: {v}" for k, v in link.facts.items())
        description = f"{bug.name}: {bug.description}" + (f" ({facts})" if facts else "")
        links.append(
            {
                "evidence_id": f"{ev.goal_id}-l{link.rank}",
                "player_id": link.player_id,
                "second": link.clock_s,
                "bug_type": link.bug,
                "description": description,
                "blame_percent": pct,
                "baseline_goals": baseline,
                "fixed_goals": f,
                "trials": TRIALS,
            }
        )
    out = {
        "goal_id": ev.goal_id,
        "match_id": ev.match_id,
        "source": "debugger",
        "goal": goal_event,
        "links": links,
        "root_cause_evidence_id": links[0]["evidence_id"],
    }
    if include_views is None:
        include_views = _backend_has_views()
    if include_views:  # transitional: only for the original contract on main
        out["views"] = [
            {"player_id": x["player_id"], "second": x["second"], "observations": [x["description"]]}
            for x in {(x["player_id"], x["second"]): x for x in links}.values()
        ]
    return out


def _point(xy) -> dict:
    return {
        "x": round(min(max(float(xy[0]), 0.0), pitch.PITCH_X), 2),
        "y": round(min(max(float(xy[1]), 0.0), pitch.PITCH_Y), 2),
    }
