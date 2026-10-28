import json
from dataclasses import replace

import pytest
from openai import AsyncOpenAI

from agents.providers import FoundryProvider
from api.contracts import PersonaPlan
from api.demo import fixture
from api.pipeline import Runtime
from api.settings import Settings
from api.storage import MemoryStore
from functions.goal_detector.function_app import process_event


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
    assert history[-1]["type"] == "explanation.ready"
    assert await restarted.get_match("m")
    assert queue.empty()


async def test_storage_leases_exclude_duplicate_workers():
    store = MemoryStore()
    assert await store.acquire("goal", "m")
    assert not await store.acquire("goal", "m")


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


async def test_github_models_adapter_uses_chat_completions_with_json_schema():
    import httpx2

    from agents.providers import GitHubModelsProvider

    requests = []

    def transport(request):
        requests.append((request.url.path, json.loads(request.content)))
        return httpx2.Response(
            200,
            json={
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 1,
                "model": "openai/gpt-4.1-nano",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": '{"style":"fan"}'},
                    }
                ],
                "usage": {"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5},
            },
        )

    client = AsyncOpenAI(
        api_key="test-placeholder",
        base_url=GitHubModelsProvider.ENDPOINT,
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(transport)),
        max_retries=0,
    )
    settings = replace(
        Settings(), main_model="openai/gpt-4.1-mini", light_model="openai/gpt-4.1-nano"
    )
    provider = GitHubModelsProvider(settings, "unused", client=client)
    try:
        result = await provider.generate(
            "persona", {"mode": "fan", "text": "safe"}, PersonaPlan, light=True
        )
        assert result.style == "fan"
        path, body = requests[0]
        assert path == "/inference/chat/completions"
        assert body["model"] == "openai/gpt-4.1-nano"
        assert body["response_format"]["type"] == "json_schema"
    finally:
        await provider.close()
