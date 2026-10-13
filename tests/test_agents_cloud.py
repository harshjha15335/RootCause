import json
from dataclasses import replace
from typing import Any

import httpx
import pytest
from openai import AsyncOpenAI

from agents.orchestrator import run
from agents.providers import FoundryProvider
from agents.tools import check_claim
from api.contracts import Claim, JudgeDecision, OrchestrationPlan, PersonaPlan, StoryPlan
from api.contracts import Testimony as PlayerTestimony
from api.demo import fixture
from api.pipeline import Runtime
from api.services import AzureServices
from api.settings import Settings
from api.storage import MemoryStore
from eval.agents_eval import evaluate_cases
from functions.goal_detector.function_app import process_event


class FakeProvider:
    def __init__(self, evidence, fail=None, bad_first=False):
        self.evidence, self.fail, self.bad_first = evidence, fail, bad_first
        self.calls = []

    async def generate(self, role, payload, schema, tools=None, light=False) -> Any:
        self.calls.append((role, payload))
        if role == self.fail:
            raise RuntimeError("provider down")
        if role == "orchestrator":
            return OrchestrationPlan(player_ids=["away-6", "away-3"])
        if role == "player":
            # The player receives only its bound tool results, never the evidence package.
            assert "evidence" not in payload
            assert tools is not None
            links = tools[0]()
            assert all(x["player_id"] == payload["player_id"] for x in links)
            claims = [
                {k: x[k] for k in ("evidence_id", "player_id", "description", "blame_percent")}
                for x in links
            ]
            if self.bad_first and not payload["rebuttal"]:
                claims[0]["blame_percent"] = 99
            return PlayerTestimony(
                player_id=payload["player_id"],
                source="model",
                claims=[Claim.model_validate(c) for c in claims],
            )
        if role == "judge":
            claims = [c for t in payload["testimonies"] for c in t["claims"]]

            accepted = [c["evidence_id"] for c in claims if check_claim(Claim(**c), self.evidence)]
            rejected = [
                c["evidence_id"] for c in claims if not check_claim(Claim(**c), self.evidence)
            ]
            return JudgeDecision(
                accepted_evidence_ids=accepted,
                rejected_evidence_ids=rejected,
                root_cause_evidence_id=self.evidence.links[0].evidence_id,
            )
        if role == "recap":
            return StoryPlan(evidence_ids=[x.evidence_id for x in self.evidence.links])
        if role == "persona":
            assert not tools and light
            return PersonaPlan(style=payload["mode"])
        raise AssertionError(role)


async def noop(kind, payload):
    pass


async def test_framework_graph_model_roles_and_single_rebuttal():
    _, evidence = fixture("m", 42)
    provider = FakeProvider(evidence, bad_first=True)
    verdict = await run(evidence, noop, provider=provider)
    assert verdict.source == "model"
    assert len(verdict.accepted_claims) == 2
    assert all(t.rebuttal for t in verdict.testimonies)
    roles = [x[0] for x in provider.calls]
    assert roles.count("player") == 4
    assert roles.count("judge") == 2
    assert roles.count("persona") == 3
    assert verdict.root_cause_evidence_id == evidence.links[0].evidence_id


@pytest.mark.parametrize("role", ["orchestrator", "player", "judge", "recap", "persona"])
async def test_every_model_stage_failure_keeps_verdict(role):
    _, evidence = fixture("m", 42)
    verdict = await run(evidence, noop, provider=FakeProvider(evidence, fail=role))
    assert len(verdict.blame_order) == 2
    assert verdict.blame_order[0].blame_percent == 60
    assert verdict.recaps["fan"]
    if role == "judge":
        assert verdict.source == "evidence-only"


async def test_global_deadline_returns_fallback():
    import asyncio

    _, evidence = fixture("m", 42)

    async def never(pid, tools):
        await asyncio.sleep(60)
        from agents.players import fallback_testimony

        return fallback_testimony(pid, tools)

    verdict = await run(evidence, noop, player=never, budget=0.01)
    assert verdict.source == "evidence-only"
    assert "deadline" in verdict.warnings[-1]


async def test_foundry_adapter_exercises_real_framework_and_openai_http_protocol():
    import httpx2

    requests = []

    def transport(request):
        body = json.loads(request.content)
        requests.append(body)
        return httpx2.Response(
            200,
            json={
                "id": "resp_test",
                "object": "response",
                "created_at": 1,
                "status": "completed",
                "model": "main",
                "output": [
                    {
                        "id": "msg_test",
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [
                            {"type": "output_text", "text": '{"style":"fan"}', "annotations": []}
                        ],
                    }
                ],
                "usage": {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5},
            },
        )

    client = AsyncOpenAI(
        api_key="test-placeholder",
        base_url="https://foundry.test/openai/v1",
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(transport)),
        max_retries=0,
    )

    class Project:
        def get_openai_client(self, **kwargs):
            return client

        async def close(self):
            pass

    provider = FoundryProvider(Settings(), None, project=Project())
    try:
        result = await provider.generate(
            "persona", {"mode": "fan", "text": "safe"}, PersonaPlan, light=True
        )
        assert result.style == "fan"
        assert requests[0]["model"] == "light"
        assert requests[0]["text"]["format"]["type"] == "json_schema"
    finally:
        await provider.close()


async def test_storage_duplicate_goal_and_restart_recovery():
    _, evidence = fixture("m", 42)
    store = MemoryStore()
    runtime = Runtime(store=store)
    await runtime.process(evidence)
    first = await store.list("agent_steps", "m")
    await runtime.process(evidence)
    assert await store.list("agent_steps", "m") == first
    restarted = Runtime(store=store)
    queue, history = await restarted.register("m")
    assert history[-1]["type"] == "verdict.ready"
    assert await restarted.get_match("m")
    assert queue.empty()


async def test_storage_leases_exclude_duplicate_workers():
    store = MemoryStore()
    assert await store.acquire("goal", "m")
    assert not await store.acquire("goal", "m")


@pytest.mark.parametrize("failure", ["flagged", "unavailable"])
async def test_safety_fails_closed(failure):
    _, evidence = fixture("m", 42)
    verdict = await run(evidence, noop)

    class Safety:
        async def analyze_text(self, options):
            if failure == "unavailable":
                raise RuntimeError("down")
            from types import SimpleNamespace

            return SimpleNamespace(categories_analysis=[SimpleNamespace(severity=4)])

        async def close(self):
            pass

    svc = AzureServices(Settings(), None, safety=Safety(), http=httpx.AsyncClient())
    try:
        safe = await svc.filter_verdict(verdict)
        assert not safe.accepted_claims
        assert all(not t.claims for t in safe.testimonies)
        assert all("withheld" in x.description for x in safe.blame_order)
        assert safe.blame_order[0].blame_percent == 60
    finally:
        await svc.close()


async def test_function_trace_is_durable_before_completion_marker(monkeypatch):
    import functions.goal_detector.function_app as detector

    events, evidence = fixture("m", 42)
    calls = []

    async def fake_trace(event, module):
        calls.append(event.id)
        return evidence.model_copy(update={"source": "debugger"})

    monkeypatch.setattr(detector, "trace_goal", fake_trace)
    store = MemoryStore()
    await process_event(events[0], store, "engine")
    await process_event(events[-1], store, "engine")
    await process_event(events[-1], store, "engine")
    assert len(calls) == 1
    assert await store.get("traces", evidence.goal_id)
    assert await store.get("goals", f"event-{events[-1].id}")


async def test_fixture_evaluation_is_not_reported_as_engine_accuracy():
    _, evidence = fixture("m", 42)
    report = await evaluate_cases(
        [
            {
                "evidence": evidence.model_dump(),
                "ground_truth_evidence_id": evidence.links[0].evidence_id,
            }
        ]
    )
    assert report["cases"] == 1 and report["fixture_cases"] == 1
    assert report["judge_accuracy"] is None
    assert report["structured_claim_groundedness"] == 1


def test_azure_mode_requires_authentication_and_service_endpoints():
    with pytest.raises(ValueError):
        replace(Settings(), mode="azure").validate()


async def test_foundry_429_backoff_switches_to_light_deployment():
    import httpx2

    models = []

    def transport(request):
        models.append(json.loads(request.content)["model"])
        if len(models) < 3:
            return httpx2.Response(
                429,
                json={
                    "error": {
                        "message": "rate limited",
                        "type": "rate_limit_error",
                        "code": "rate_limit_exceeded",
                    }
                },
            )
        return httpx2.Response(
            200,
            json={
                "id": "resp_test",
                "object": "response",
                "created_at": 1,
                "status": "completed",
                "model": "light",
                "output": [
                    {
                        "id": "msg_test",
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [
                            {"type": "output_text", "text": '{"style":"fan"}', "annotations": []}
                        ],
                    }
                ],
            },
        )

    client = AsyncOpenAI(
        api_key="test-placeholder",
        base_url="https://foundry.test/openai/v1",
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(transport)),
        max_retries=0,
    )

    class Project:
        def get_openai_client(self, **kwargs):
            return client

        async def close(self):
            pass

    provider = FoundryProvider(Settings(), None, project=Project())
    try:
        assert (await provider.generate("persona", {"mode": "fan"}, PersonaPlan)).style == "fan"
        assert models == ["main", "main", "light"]
    finally:
        await provider.close()


async def test_content_flag_invokes_constrained_light_rewrite():
    from api.contracts import NeutralPlan

    _, evidence = fixture("m", 42)
    verdict = await run(evidence, noop)
    calls = []

    class Provider:
        async def generate(self, role, payload, schema, light=False):
            calls.append((role, light))
            return NeutralPlan(style="neutral")

    class Safety:
        async def analyze_text(self, options):
            from types import SimpleNamespace

            return SimpleNamespace(categories_analysis=[SimpleNamespace(severity=4)])

        async def close(self):
            pass

    svc = AzureServices(
        Settings(), None, safety=Safety(), http=httpx.AsyncClient(), provider=Provider()
    )
    try:
        result = await svc.filter_verdict(verdict)
        assert calls == [("neutral", True)]
        assert result.source == "evidence-only" and not result.accepted_claims
    finally:
        await svc.close()
