import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from agents.orchestrator import run
from api.auth import EntraAuth
from api.contracts import Evidence
from api.demo import fixture
from api.ingestion import parse_envelope, trace_goal
from api.main import create_app
from api.pipeline import Runtime
from api.services import AzureServices
from api.settings import Settings
from api.storage import CosmosStore, MemoryStore


async def noop(kind, payload):
    pass


async def test_translate_uses_entra_auth_and_checks_the_translated_text():
    seen = []

    class Cred:
        async def get_token(self, scope):
            assert scope == "https://cognitiveservices.azure.com/.default"
            return SimpleNamespace(token="test-placeholder")

    class Safety:
        async def analyze_text(self, options):
            seen.append(options.text)
            return SimpleNamespace(categories_analysis=[SimpleNamespace(severity=0)])

        async def close(self):
            pass

    def transport(request):
        assert request.headers["authorization"] == "Bearer test-placeholder"
        assert request.url.params["to"] == "hi"
        assert json.loads(request.content) == [{"Text": "Goal review"}]
        return httpx.Response(200, json=[{"translations": [{"text": "गोल की समीक्षा", "to": "hi"}]}])

    service = AzureServices(
        Settings(translator_endpoint="https://translator.test"),
        Cred(),
        safety=Safety(),
        http=httpx.AsyncClient(transport=httpx.MockTransport(transport)),
    )
    try:
        assert await service.translate("Goal review", "hi") == "गोल की समीक्षा"
        assert seen == ["गोल की समीक्षा"]
    finally:
        await service.close()


def test_translation_and_speech_outages_disclose_fallback_in_the_api():
    class Services:
        translate_many = AsyncMock(side_effect=RuntimeError("down"))
        speech = AsyncMock(side_effect=RuntimeError("down"))
        close = AsyncMock()

    async def prepare():
        _, evidence = fixture("m", 42)
        explanation = await run(evidence, noop)
        store = MemoryStore()
        await store.put("explanations", evidence.goal_id, "m", explanation.model_dump())
        return Runtime(store=store, services=Services()), evidence

    runtime, evidence = asyncio.run(prepare())
    with TestClient(create_app(runtime=runtime)) as client:
        result = client.get(f"/goals/{evidence.goal_id}/explanation?lang=hi").json()
        assert result["requested_lang"] == "hi" and result["lang"] == "en"
        assert result["translation_warning"]
        assert client.get(f"/goals/{evidence.goal_id}/audio").status_code == 503


async def test_cosmos_document_shape_partition_queries_and_conflicting_lease():
    from azure.cosmos.exceptions import CosmosResourceExistsError

    class Container:
        def __init__(self):
            self.docs = {}

        async def upsert_item(self, item):
            self.docs[item["id"]] = item

        def query_items(self, query, parameters):
            async def rows():
                values = {x["name"]: x["value"] for x in parameters}
                for item in self.docs.values():
                    if "@id" in values and item["id"] != values["@id"]:
                        continue
                    if "@match" in values and item["match_id"] != values["@match"]:
                        continue
                    if "IS_DEFINED" in query and "payload" not in item:
                        continue
                    yield item

            return rows()

        async def create_item(self, item):
            if item["id"] in self.docs:
                raise CosmosResourceExistsError(status_code=409)
            self.docs[item["id"]] = item

        async def read_item(self, key, partition_key):
            assert self.docs[key]["match_id"] == partition_key
            return self.docs[key]

    class Client:
        def __init__(self):
            self.containers = {}

        def get_database_client(self, name):
            return self

        def get_container_client(self, name):
            return self.containers.setdefault(name, Container())

        async def close(self):
            pass

    store = CosmosStore("https://cosmos.test", "rootcause", None, client=Client())
    await store.put("goals", "g", "m", {"goal": "g"})
    assert await store.get("goals", "g") == {"goal": "g"}
    assert await store.get("goals", "missing") is None
    assert await store.list("goals", "m") == [{"goal": "g"}]
    assert await store.list("goals", "other") == []
    assert await store.acquire("g", "m")
    assert not await store.acquire("g", "m")


async def test_entra_validates_signature_issuer_audience_expiry_and_scope(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    auth = EntraAuth("tenant", "api")
    monkeypatch.setattr(
        auth,
        "keys",
        SimpleNamespace(
            get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())
        ),
    )
    claims = {
        "iss": "https://login.microsoftonline.com/tenant/v2.0",
        "aud": "api",
        "tid": "tenant",
        "iat": int(time.time()),
        "exp": int(time.time()) + 60,
        "scp": "access_as_user",
    }
    token = jwt.encode(claims, key, algorithm="RS256")
    assert (await auth.validate("Bearer " + token))["tid"] == "tenant"
    for patch in [{"aud": "wrong"}, {"exp": 1}, {"scp": "other"}, {"tid": "wrong"}]:
        altered = jwt.encode({**claims, **patch}, key, algorithm="RS256")
        with pytest.raises((jwt.PyJWTError, ValueError)):
            await auth.validate("Bearer " + altered)
    with pytest.raises(ValueError):
        await auth.validate(None)


async def test_eventhub_recorded_envelope_keeps_fixture_label_and_checks_goal():
    events, evidence = fixture("m", 42)
    event, recorded = parse_envelope(
        json.dumps({"event": events[-1].model_dump(), "evidence": evidence.model_dump()})
    )
    assert recorded is not None
    assert recorded.source == "synthetic-fixture" and event == events[-1]
    with pytest.raises(ValueError):
        parse_envelope(
            json.dumps({"event": events[0].model_dump(), "evidence": evidence.model_dump()})
        )
    raw, recorded = parse_envelope(events[0].model_dump_json())
    assert raw == events[0] and recorded is None


async def test_goal_processing_recovers_explanation_notification_after_write_failure():
    _, evidence = fixture("m", 42)
    runtime = Runtime()
    await runtime.process(evidence)
    # Simulate a durable explanation write followed by a lost notification write.
    keys = [
        key
        for key, value in runtime.store.data.items()
        if value["payload"].get("type") == "explanation.ready"
    ]
    for key in keys:
        del runtime.store.data[key]
    restarted = Runtime(store=runtime.store)
    await restarted.process(evidence)
    messages = await runtime.store.list("agent_steps", "m")
    assert sum(x.get("type") == "explanation.ready" for x in messages) == 1


async def test_concurrent_duplicate_goal_events_do_not_duplicate_score():
    events, _ = fixture("m", 42)
    runtime = Runtime()
    await asyncio.gather(runtime.on_event(events[-1]), runtime.on_event(events[-1]))
    match = await runtime.get_match("m")
    assert match is not None
    assert match["score"] == {"home": 1, "away": 0}
    messages = await runtime.store.list("agent_steps", "m")
    assert sum(x.get("type") == "goal.detected" for x in messages) == 1


async def test_debugger_plugin_missing_is_a_real_blocker():
    events, _ = fixture("m", 42)
    with pytest.raises(RuntimeError, match="DEBUGGER_MODULE"):
        await trace_goal(events[-1], "")


def test_evidence_cannot_expose_future_observations_or_invent_a_player():
    _, evidence = fixture("m", 42)
    raw = evidence.model_dump()
    raw["events"][0]["second"] = 999
    with pytest.raises(ValueError):
        Evidence.model_validate(raw)
    raw = evidence.model_dump()
    raw["links"][0]["player_id"] = "invented-player"
    with pytest.raises(ValueError):
        Evidence.model_validate(raw)


async def test_fabric_workspace_lakehouse_setup_is_repeatable():
    from scripts.fabric_setup import prepare

    database = {"workspaces": [], "items": []}
    writes = []

    def transport(request):
        path = request.url.path
        if request.method == "GET":
            return httpx.Response(
                200, json={"value": database["items" if path.endswith("/items") else "workspaces"]}
            )
        body = json.loads(request.content)
        writes.append(body)
        if path.endswith("/workspaces"):
            item = {**body, "id": "workspace"}
            database["workspaces"].append(item)
        else:
            item = {**body, "id": "lakehouse"}
            database["items"].append(item)
        return httpx.Response(201, json=item)

    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
        first = await prepare(client, "12345678-1234-1234-1234-123456789012")
        again = await prepare(client, "12345678-1234-1234-1234-123456789012")
    assert first == again and len(writes) == 2


async def test_eventhub_consumer_uses_correct_hub_group_and_checkpoints_after_delivery(monkeypatch):
    import azure.eventhub.aio as sdk

    from api.ingestion import consume

    events, _ = fixture("m", 42)
    seen = []

    class Consumer:
        def __init__(self, namespace, hub, group, credential, **kwargs):
            assert hub == "match-events" and group == "api"

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def receive(self, on_event, starting_position):
            async def checkpoint(event):
                seen.append("checkpoint")

            await on_event(
                SimpleNamespace(update_checkpoint=checkpoint),
                SimpleNamespace(body_as_str=lambda: events[0].model_dump_json()),
            )

    monkeypatch.setattr(sdk, "EventHubConsumerClient", Consumer)

    async def delivered(event):
        seen.append(event.id)

    await consume(Settings(), None, delivered)
    assert seen == [events[0].id, "checkpoint"]


async def test_speech_uses_managed_identity_voice_and_escaped_ssml(monkeypatch):
    import azure.cognitiveservices.speech as sdk

    seen = {}

    class Cred:
        async def get_token(self, scope):
            return SimpleNamespace(token="test-placeholder")

    class Safety:
        async def analyze_text(self, options):
            return SimpleNamespace(categories_analysis=[])

        async def close(self):
            pass

    class Config:
        def __init__(self, auth_token, region):
            seen["auth"] = auth_token
            seen["region"] = region

        def set_speech_synthesis_output_format(self, format):
            seen["format"] = format

    class Synth:
        def __init__(self, speech_config, audio_config):
            assert audio_config is None

        def speak_ssml_async(self, ssml):
            seen["ssml"] = ssml
            return SimpleNamespace(
                get=lambda: SimpleNamespace(
                    reason=sdk.ResultReason.SynthesizingAudioCompleted, audio_data=b"mp3"
                )
            )

    monkeypatch.setattr(sdk, "SpeechConfig", Config)
    monkeypatch.setattr(sdk, "SpeechSynthesizer", Synth)
    svc = AzureServices(
        Settings(speech_region="eastus", speech_resource_id="resource"),
        Cred(),
        safety=Safety(),
        http=httpx.AsyncClient(),
    )
    try:
        assert await svc.speech("<voice>review</voice>", "en") == b"mp3"
        assert seen["auth"] == "aad#resource#test-placeholder"
        assert "&lt;voice&gt;" in seen["ssml"] and "en-US-JennyNeural" in seen["ssml"]
    finally:
        await svc.close()


@pytest.mark.parametrize("failure", ["flagged", "unavailable"])
async def test_safety_preserves_blame_and_withholds_every_narrative_field(failure):
    from agents.grounding import NEUTRAL, iter_sentences

    _, evidence = fixture("m", 42)
    explanation = await run(evidence, noop)

    class Safety:
        async def analyze_text(self, options):
            if failure == "unavailable":
                raise RuntimeError("down")
            return SimpleNamespace(categories_analysis=[SimpleNamespace(severity=4)])

        async def close(self):
            pass

    svc = AzureServices(Settings(), None, safety=Safety(), http=httpx.AsyncClient())
    try:
        safe = await svc.filter_explanation(explanation)
        assert safe.status == "pending" and safe.source == "evidence-only"
        assert safe.blame_order == evidence.links
        assert all(s.text == NEUTRAL and s.evidence_ids for s in iter_sentences(safe))
    finally:
        await svc.close()


async def test_flagged_text_uses_the_light_neutral_rewrite():
    from api.contracts import NeutralPlan

    _, evidence = fixture("m", 42)
    calls = []

    class Provider:
        async def generate(self, role, payload, schema, light=False):
            calls.append((role, light))
            return NeutralPlan(style="neutral")

    class Safety:
        async def analyze_text(self, options):
            return SimpleNamespace(categories_analysis=[SimpleNamespace(severity=4)])

        async def close(self):
            pass

    svc = AzureServices(
        Settings(), None, safety=Safety(), http=httpx.AsyncClient(), provider=Provider()
    )
    try:
        await svc.filter_explanation(await run(evidence, noop))
        assert calls == [("neutral", True)]
    finally:
        await svc.close()


def test_translation_preserves_all_sentence_citations_and_speaks_without_ids():
    from agents.grounding import iter_sentences

    class Services:
        def __init__(self):
            self.seen = []

        async def translate_many(self, texts, lang):
            assert all("[" not in text for text in texts)
            self.seen.extend(texts)
            return ["Traducido: " + text for text in texts]

        speech = AsyncMock(return_value=b"mp3")
        close = AsyncMock()

    services = Services()

    async def prepare():
        _, evidence = fixture("m", 42)
        explanation = await run(evidence, noop)
        store = MemoryStore()
        await store.put("explanations", evidence.goal_id, "m", explanation.model_dump())
        return Runtime(store=store, services=services), evidence, explanation

    runtime, evidence, canonical = asyncio.run(prepare())
    with TestClient(create_app(runtime=runtime)) as client:
        response = client.get(f"/goals/{evidence.goal_id}/explanation?lang=es")
        assert response.status_code == 200
        data = response.json()
        assert data["lang"] == "es" and data["audio_available"]
        from api.contracts import Explanation

        localized = Explanation.model_validate({k: data[k] for k in Explanation.model_fields})
        assert [s.evidence_ids for s in iter_sentences(localized)] == [
            s.evidence_ids for s in iter_sentences(canonical)
        ]
        assert all(s.text.startswith("Traducido: ") for s in iter_sentences(localized))
        audio = client.get(f"/goals/{evidence.goal_id}/audio?lang=es")
        assert audio.status_code == 200
        assert "[" not in services.speech.call_args.args[0]
        assert services.speech.call_args.args[1] == "es"
