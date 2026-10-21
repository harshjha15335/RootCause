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
    raw = plugin.trace(goal)
    if "views" not in Evidence.model_fields:  # revised Role 3 contract
        assert "views" not in raw
    base = raw["links"][0]["baseline_goals"]
    assert all(x["baseline_goals"] == base for x in raw["links"])
    assert all(0 <= x["fixed_goals"] <= 200 for x in raw["links"])


@pytest.mark.parametrize("fail_models", [False, True])
async def test_real_trace_reaches_cited_explanation_with_failure_recovery(
    planted_goal, fail_models
):
    from agents.grounding import iter_sentences, validate_explanation
    from agents.orchestrator import run

    class UnavailableProvider:
        async def generate(self, *args, **kwargs):
            raise RuntimeError("Model deployment unavailable")

    _, goal = planted_goal
    evidence = await trace_goal(MatchEvent.model_validate(goal), "debugger.plugin")
    original = evidence.model_dump()
    steps = []

    async def emit(kind, payload):
        steps.append((kind, payload))

    result = await run(evidence, emit, provider=UnavailableProvider() if fail_models else None)
    validate_explanation(result, evidence)
    assert result.status == "pending"
    assert result.source == "evidence-only"
    assert result.blame_order == evidence.links
    assert result.root_cause_evidence_id == evidence.root_cause_evidence_id
    assert set(result.recaps) == {"fan", "analyst", "studio"}
    assert result.highlights
    assert all(sentence.evidence_ids for sentence in iter_sentences(result))
    assert "views" not in evidence.model_dump()
    assert evidence.model_dump() == original
    assert any(kind == "agent.step" for kind, _ in steps)
    if fail_models:
        assert result.warnings


def test_free_match_ids_rebuild_deterministically():
    a = plugin.team_events("m-0003")
    b = plugin.team_events("m-0003")
    assert a == b


def test_unknown_match_id_is_rejected():
    with pytest.raises(ValueError):
        plugin.load_match("not-a-match")


def _engine_evidence(baseline: float, fixed: list[float], runs: int = 200):
    from engine.models import ChainLink, EvidencePackage

    return EvidencePackage(
        match_id="p-0001",
        goal_id="p-0001-g1",
        scorer="A9",
        team="AWAY",
        clock_s=100,
        possession_id=3,
        chain_start_s=90,
        baseline_goal_rate=baseline,
        runs_per_link=runs,
        links=[
            ChainLink(
                rank=i + 1,
                clock_s=95,
                player_id=f"H{i + 2}",
                team="HOME",
                bug="LATE_STEP_UP",
                fixed_goal_rate=f,
                drop=max(0.0, baseline - f),
                blame=0.0,
                facts={"metres_behind_line": 5.0},
            )
            for i, f in enumerate(fixed)
        ],
        weights_version="test",
    )


def test_revised_contract_has_no_views_and_counts_match_blame():
    out = plugin.to_team_evidence(_engine_evidence(0.7, [0.1, 0.4, 0.75]), {}, include_views=False)
    assert "views" not in out
    links = out["links"]
    assert all(isinstance(x["baseline_goals"], int) and x["baseline_goals"] == 140 for x in links)
    assert [x["fixed_goals"] for x in links] == [20, 80, 150]
    drops = [max(0, x["baseline_goals"] - x["fixed_goals"]) for x in links]  # 120, 60, 0
    assert [x["blame_percent"] for x in links] == pytest.approx([100 * d / 180 for d in drops])
    assert sum(x["blame_percent"] for x in links) == pytest.approx(100, abs=1e-9)
    assert min(x["blame_percent"] for x in links) >= 0


def test_rates_that_are_not_whole_goal_counts_are_rejected():
    # MERGE_ROLE2.md 6.2: 0.5 vs 0.4998 must not silently round to 100 vs 100 goals
    with pytest.raises(ValueError, match="whole number"):
        plugin.to_team_evidence(_engine_evidence(0.5, [0.4998]), {})


def test_wrong_replay_count_is_rejected():
    with pytest.raises(ValueError, match="200 replays"):
        plugin.to_team_evidence(_engine_evidence(0.5, [0.25], runs=100), {})


def test_fresh_engine_run_gives_identical_evidence(planted_goal):
    _, goal = planted_goal
    first = plugin.trace(goal)
    plugin.load_match.cache_clear()
    assert plugin.trace(goal) == first
