"""Role 2 <-> backend integration: debugger.plugin against the team contracts and ingestion."""

import pytest

from api.contracts import Evidence, MatchEvent
from api.ingestion import trace_goal
from debugger import plugin


@pytest.fixture(scope="module")
def planted_goal():
    events = plugin.team_events("p-1012")
    goals = [e for e in events if e["type"] == "goal"]
    return events, goals[-1]


def test_team_events_validate_against_the_team_contract(planted_goal):
    events, _ = planted_goal
    for e in events[::25] + [x for x in events if x["type"] in ("goal", "cross")]:
        MatchEvent.model_validate(e)
    assert {e["type"] for e in events} <= {"pass", "duel", "cross", "goal"}
    assert len({e["id"] for e in events}) == len(events)


async def test_backend_ingestion_accepts_real_debugger_evidence(planted_goal):
    _, goal = planted_goal
    evidence = await trace_goal(MatchEvent.model_validate(goal), "debugger.plugin")
    assert isinstance(evidence, Evidence)
    assert evidence.source == "debugger"
    assert evidence.goal.id == goal["id"]
    assert evidence.root_cause_evidence_id == evidence.links[0].evidence_id
    assert all(link.trials == 200 for link in evidence.links)


def test_free_match_ids_rebuild_deterministically():
    a = plugin.team_events("m-0003")
    b = plugin.team_events("m-0003")
    assert a == b


def test_unknown_match_id_is_rejected():
    with pytest.raises(ValueError):
        plugin.load_match("not-a-match")
