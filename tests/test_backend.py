import asyncio

import pytest
from fastapi.testclient import TestClient

from agents.fallbacks import template_explanation
from agents.grounding import iter_sentences, validate_explanation
from agents.orchestrator import run
from agents.tools import EvidenceTools
from api.contracts import (
    ClipPlan,
    Evidence,
    HighlightsPlan,
    PersonaPlan,
    ReportPlan,
    StoryPlan,
)
from api.demo import fixture
from api.main import create_app
from eval.agents_eval import evaluate_cases


async def noop(kind, payload):
    pass


class FakeProvider:
    def __init__(self, evidence, fail=None, bad=False, barrier=False):
        self.evidence, self.fail, self.bad = evidence, fail, bad
        self.calls = []
        self.started = set()
        self.barrier = barrier
        self.both_started = asyncio.Event()

    async def generate(self, role, payload, schema, tools=None, light=False):
        self.calls.append(role)
        if role in {"explainer", "highlights"}:
            self.started.add(role)
            if len(self.started) == 2:
                self.both_started.set()
            if self.barrier:
                await asyncio.wait_for(self.both_started.wait(), 0.2)
        if role == self.fail:
            raise RuntimeError("service down")
        ids = [link.evidence_id for link in self.evidence.links]
        if role == "explainer":
            assert tools and tools[0](self.evidence.goal_id)["goal_id"] == self.evidence.goal_id
            assert tools[1](1)["evidence_id"] == ids[0]
            output = template_explanation(self.evidence)
            if self.bad:
                output.paragraphs[0].sentences[0].text = "The goalkeeper caused 99% of this goal."
            return schema.model_validate(
                {
                    "paragraphs": [p.model_dump() for p in output.paragraphs],
                    "root_summary": [s.model_dump() for s in output.root_summary],
                }
            )
        if role == "highlights":
            assert tools and tools[1](0, self.evidence.goal.second) == [
                e.model_dump() for e in self.evidence.events
            ]
            return schema.model_validate(
                HighlightsPlan(
                    clips=[
                        ClipPlan(
                            evidence_id=link.evidence_id,
                            start_second=link.second,
                            end_second=link.second,
                        )
                        for link in self.evidence.links
                    ]
                ).model_dump()
            )
        if role == "recap":
            assert self.started == {"explainer", "highlights"}
            assert tools is not None
            handoff = tools[0](self.evidence.match_id)[0]
            assert handoff["paragraphs"] and handoff["highlights"]
            return schema.model_validate(StoryPlan(evidence_ids=ids).model_dump())
        if role == "persona":
            assert not tools and light and payload["sentences"]
            return schema.model_validate(PersonaPlan(style=payload["mode"]).model_dump())
        if role == "report":
            return schema.model_validate(
                ReportPlan(
                    goal_ids=[self.evidence.goal_id], top_causes=["duel_lost", "late_step"]
                ).model_dump()
            )
        raise AssertionError(role)


async def test_new_graph_parallel_handoff_and_citations():
    _, evidence = fixture("m", 42)
    provider = FakeProvider(evidence, barrier=True)
    result = await run(evidence, noop, provider=provider)
    assert result.status == "ready" and result.source == "model"
    assert provider.calls[:2] == ["explainer", "highlights"]
    assert provider.calls[2] == "recap" and provider.calls.count("persona") == 3
    assert len(result.paragraphs) == len(evidence.links)
    assert result.root_cause_evidence_id == evidence.links[0].evidence_id
    assert all(s.evidence_ids for s in iter_sentences(result))
    for mode in ("fan", "analyst", "studio"):
        assert all("[" in s.tagged() for s in result.recaps[mode])
    validate_explanation(result, evidence)


@pytest.mark.parametrize("role", ["explainer", "highlights", "recap", "persona"])
async def test_each_required_agent_has_a_working_fallback(role):
    _, evidence = fixture("m", 42)
    provider = FakeProvider(evidence, fail=role)
    result = await run(evidence, noop, provider=provider)
    validate_explanation(result, evidence)
    assert result.blame_order == evidence.links
    assert result.paragraphs and result.highlights and result.warnings
    if role == "explainer":
        assert provider.calls.count("explainer") == 2
        assert result.status == "pending" and result.source == "evidence-only"
    else:
        assert result.status == "ready"
    if role == "highlights":
        assert [clip.start_second for clip in result.highlights] == [
            link.second for link in evidence.links
        ]


async def test_invalid_explainer_output_retries_then_pending():
    _, evidence = fixture("m", 42)
    provider = FakeProvider(evidence, bad=True)
    result = await run(evidence, noop, provider=provider)
    assert provider.calls.count("explainer") == 2 and result.status == "pending"
    assert len(result.paragraphs) == len(evidence.links)


async def test_explainer_timeout_retries_once_then_uses_template():
    _, evidence = fixture("m", 42)

    class Slow(FakeProvider):
        async def generate(self, role, *args, **kwargs):
            if role == "explainer":
                self.calls.append(role)
                await asyncio.sleep(60)
            return await super().generate(role, *args, **kwargs)

    provider = Slow(evidence)
    result = await run(evidence, noop, provider=provider, timeout=0.001)
    assert provider.calls.count("explainer") == 2
    assert result.status == "pending" and result.blame_order == evidence.links


async def test_global_deadline_preserves_trace_numbers_and_template():
    _, evidence = fixture("m", 42)

    class Slow(FakeProvider):
        async def generate(self, *args, **kwargs):
            await asyncio.sleep(60)
            return await super().generate(*args, **kwargs)

    result = await run(evidence, noop, provider=Slow(evidence), budget=0.01)
    assert result.status == "pending" and "deadline" in result.warnings[0]
    validate_explanation(result, evidence)


def test_evidence_only_tools_are_scoped_and_return_copies():
    events, evidence = fixture("m", 42)
    tools = EvidenceTools(evidence)
    data = tools.get_evidence(evidence.goal_id)
    data["links"][0]["blame_percent"] = 99
    assert tools.get_link(1)["blame_percent"] == 60
    assert tools.get_events(1, 1) == [events[1].model_dump()]
    with pytest.raises(ValueError):
        tools.get_evidence("another-goal")
    with pytest.raises(ValueError):
        tools.get_link(0)
    with pytest.raises(ValueError):
        tools.get_events(0, 999)


def test_evidence_needs_no_player_views_and_rejects_wrong_root():
    _, evidence = fixture("m", 42)
    data = evidence.model_dump()
    assert "views" not in data
    assert Evidence.model_validate(data)
    data["root_cause_evidence_id"] = data["links"][1]["evidence_id"]
    with pytest.raises(ValueError, match="largest counterfactual"):
        Evidence.model_validate(data)


@pytest.mark.parametrize("mutation", ["text", "id", "root"])
async def test_evaluation_catches_unsupported_displayed_sentences(monkeypatch, mutation):
    import eval.agents_eval as evaluator

    _, evidence = fixture("m", 42)

    async def altered(*args, **kwargs):
        result = template_explanation(evidence)
        if mutation == "text":
            result.recaps["fan"][0].text = "The goalkeeper invented a new mistake."
        if mutation == "id":
            result.recaps["studio"][0].evidence_ids = ["unknown"]
        if mutation == "root":
            result.root_summary[0].text = "The root cause is a different player."
        return result

    monkeypatch.setattr(evaluator, "run", altered)
    report = await evaluate_cases([{"evidence": evidence.model_dump()}])
    assert report["sentence_groundedness"] < 1
    assert any(not row["supported"] for row in report["sentence_evaluations"])
    if mutation == "root":
        assert not report["rows"][0]["root_wording_correct"]


async def test_fixture_eval_does_not_claim_engine_accuracy():
    _, evidence = fixture("m", 42)
    report = await evaluate_cases([{"evidence": evidence.model_dump()}])
    assert report["root_wording_accuracy"] is None and report["fixture_cases"] == 1
    assert report["sentence_groundedness"] == 1
    assert report["sentence_evaluations"]


def test_complete_explanation_rest_and_websocket_contract():
    with TestClient(create_app(tick_seconds=0.001)) as client:
        response = client.post("/matches", json={"seed": 42})
        assert response.status_code == 201
        mid = response.json()["id"]
        messages = []
        with client.websocket_connect("/live/" + mid) as ws:
            while True:
                message = ws.receive_json()
                messages.append(message)
                if message["type"] == "explanation.ready":
                    break
        assert {m["type"] for m in messages} == {
            "match.event",
            "goal.detected",
            "trace.ready",
            "agent.step",
            "explanation.ready",
        }
        assert [m["sequence"] for m in messages] == list(range(1, len(messages) + 1))
        gid = messages[-1]["payload"]["goal_id"]
        for mode in ("fan", "analyst", "studio"):
            response = client.get(f"/goals/{gid}/explanation", params={"mode": mode})
            assert response.status_code == 200
            result = response.json()
            assert result["status"] == "pending" and result["paragraphs"] and result["root_summary"]
            assert all(s["evidence_ids"] for s in result["sentences"])
            assert all("[" in line for line in result["text"].splitlines())
        assert client.get(f"/goals/{gid}/trace").json()["links"]
        assert client.get(f"/matches/{mid}/report").json()["goals"][0]["goal_id"] == gid
        assert client.get(f"/goals/{gid}/explanation?mode=bad").status_code == 422
        assert client.get(f"/goals/{gid}/explanation?lang=fr").status_code == 422
        assert client.get(f"/goals/{gid}/explanation?lang=hi").json()["lang"] == "en"
        assert client.get(f"/matches/{mid}").json()["score"] == {"home": 1, "away": 0}
        with client.websocket_connect("/live/" + mid) as ws:
            assert [ws.receive_json() for _ in messages] == messages
        assert client.get(f"/goals/{gid}/verdict").status_code == 404


def test_recorded_evidence_without_views_and_fulltime_boundary():
    _, evidence = fixture("m", 42)
    with TestClient(create_app(tick_seconds=0.001)) as client:
        response = client.post("/ingest/evidence", json=evidence.model_dump())
        assert response.status_code == 202
        # A streamed match has no full-time report until an explicit boundary.
        with client.websocket_connect("/live/m") as ws:
            while ws.receive_json()["type"] != "explanation.ready":
                pass
        assert client.get("/matches/m/report").status_code == 409
        assert client.post("/matches/m/finish").status_code == 200
        assert client.get("/matches/m/report").status_code == 200


@pytest.mark.parametrize("mutation", ["citation", "time", "duplicate"])
def test_explanation_cannot_mislabel_paragraph_or_clip(mutation):
    _, evidence = fixture("m", 42)
    result = template_explanation(evidence)
    if mutation == "citation":
        result.paragraphs[0].sentences[0].evidence_ids = [evidence.links[1].evidence_id]
    elif mutation == "time":
        result.highlights[0].start_second = evidence.goal.second
    else:
        result.paragraphs.append(result.paragraphs[0])
    with pytest.raises(ValueError):
        validate_explanation(result, evidence)


async def test_root_cause_uses_counterfactual_drop_not_a_model_or_blame_sort():
    _, evidence = fixture("m", 42)
    raw = evidence.model_dump()
    raw["links"][0]["blame_percent"] = 10
    raw["links"][1]["blame_percent"] = 90
    evidence = Evidence.model_validate(raw)
    result = await run(evidence, noop)
    assert result.root_cause_evidence_id == evidence.links[0].evidence_id
    assert result.blame_order[0].blame_percent == 10


@pytest.mark.parametrize("mutation", ["unknown", "future", "missing-root"])
async def test_invalid_highlight_plan_uses_chain_links(mutation):
    _, evidence = fixture("m", 42)

    class Invalid(FakeProvider):
        async def generate(self, role, payload, schema, tools=None, light=False):
            if role == "highlights":
                self.started.add(role)
                clip = ClipPlan(
                    evidence_id=evidence.links[0].evidence_id, start_second=1, end_second=1
                )
                if mutation == "unknown":
                    clip.evidence_id = "unknown"
                if mutation == "future":
                    clip.end_second = 999
                if mutation == "missing-root":
                    clip.evidence_id = evidence.links[1].evidence_id
                return schema.model_validate(HighlightsPlan(clips=[clip]).model_dump())
            return await super().generate(role, payload, schema, tools=tools, light=light)

    result = await run(evidence, noop, provider=Invalid(evidence))
    assert any("Highlights unavailable" in w for w in result.warnings)
    assert len(result.highlights) == len(evidence.links)
