"""Backend plugin: the Role 2 side of api/ingestion.py's DEBUGGER_MODULE contract.

    DEBUGGER_MODULE=debugger.plugin

trace(event_dict) takes a team-contract goal event (api/contracts.py: MatchEvent) and returns a
team-contract Evidence dict with source="debugger". The engine is deterministic, so the match is
rebuilt from its ID: "m-0007" is a free match with seed 7, "p-1012" is
engine.mistakes.random_plant(1012).

team_events(match_id) gives the match's events in the team contract, for publishing.
This module only produces plain dicts; it does not import the backend.
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


def to_team_evidence(ev: EvidencePackage, goal_event: dict) -> dict:
    total = sum(link.drop for link in ev.links)
    if not ev.links or total <= 0:
        raise ValueError(
            f"{ev.goal_id}: no detected mistake lowered the goal chance; no blame to assign"
        )
    percents = [100.0 * link.drop / total for link in ev.links]
    percents[-1] = 100.0 - sum(percents[:-1])  # exact 100 after float rounding

    links, views = [], {}
    for link, pct in zip(ev.links, percents):
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
                "blame_percent": round(pct, 6),
                "baseline_goals": round(ev.baseline_goal_rate * TRIALS),
                "fixed_goals": round(link.fixed_goal_rate * TRIALS),
                "trials": TRIALS,
            }
        )
        views.setdefault((link.player_id, link.clock_s), []).append(description)
    return {
        "goal_id": ev.goal_id,
        "match_id": ev.match_id,
        "source": "debugger",
        "goal": goal_event,
        "links": links,
        "views": [
            {"player_id": p, "second": s, "observations": obs} for (p, s), obs in views.items()
        ],
        "root_cause_evidence_id": links[0]["evidence_id"],
    }


def _point(xy) -> dict:
    return {
        "x": round(min(max(float(xy[0]), 0.0), pitch.PITCH_X), 2),
        "y": round(min(max(float(xy[1]), 0.0), pitch.PITCH_Y), 2),
    }
