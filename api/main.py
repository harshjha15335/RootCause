import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api.auth import EntraAuth
from api.contracts import Evidence, Explanation, StartMatch
from api.demo import fixture
from api.pipeline import Runtime
from api.settings import Settings

logger = logging.getLogger(__name__)


def create_app(tick_seconds: float = 1, settings=None, runtime=None) -> FastAPI:
    settings = settings or Settings.from_env()
    settings.validate()
    state = runtime or Runtime()
    auth = (
        EntraAuth(settings.tenant_id, settings.api_client_id) if settings.mode == "azure" else None
    )
    credential = None

    @asynccontextmanager
    async def lifespan(app):
        nonlocal credential
        if settings.mode == "azure" and runtime is None:
            from azure.identity.aio import DefaultAzureCredential

            from agents.providers import FoundryProvider
            from api.ingestion import supervised_consume
            from api.services import AzureServices
            from api.storage import CosmosStore

            credential = DefaultAzureCredential()
            state.store = CosmosStore(
                settings.cosmos_endpoint, settings.cosmos_database, credential
            )
            state.provider = FoundryProvider(settings, credential)
            state.services = AzureServices(settings, credential, provider=state.provider)
            state.spawn(state.resume())
            state.spawn(supervised_consume(settings, credential, state.on_event))
        yield
        await state.close()
        if state.provider and hasattr(state.provider, "close"):
            await state.provider.close()
        if state.services:
            await state.services.close()
        if credential:
            await credential.close()

    app = FastAPI(title="Root Cause", version="0.3.0", lifespan=lifespan)
    app.state.store = state
    import os

    frontend = os.getenv("FRONTEND_ORIGIN", "")
    if frontend:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[frontend],
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        if auth and request.url.path not in {"/health", "/ready"} and request.method != "OPTIONS":
            try:
                await auth.validate(request.headers.get("authorization"))
            except Exception:  # noqa: BLE001 - do not leak authentication failure details
                return Response(status_code=401, headers={"WWW-Authenticate": "Bearer"})
        return await call_next(request)

    async def match_or_404(match_id):
        match = await state.get_match(match_id)
        if match is None:
            raise HTTPException(404, "Match not found")
        return match

    async def localize(explanation: Explanation, lang: str):
        from agents.grounding import iter_sentences

        if lang == "en":
            return explanation, "en", None
        if lang not in {"hi", "es"}:
            raise HTTPException(422, "Supported languages: en, hi, es")
        if not state.services:
            return explanation, "en", "Translation unavailable; showing English"
        try:
            texts = list(dict.fromkeys(s.text for s in iter_sentences(explanation)))
            translated = await asyncio.wait_for(state.services.translate_many(texts, lang), 10)
            if len(translated) != len(texts):
                raise ValueError("Translator returned incomplete output")
            mapping = dict(zip(texts, translated, strict=True))
            result = explanation.model_copy(deep=True)
            for sentence in iter_sentences(result):
                sentence.text = mapping[sentence.text]
            return result, lang, None
        except Exception as error:  # noqa: BLE001 - atomically fall back to explicitly labeled English
            logger.warning("Translation fallback: %s", type(error).__name__)
            return explanation, "en", "Translation unavailable; showing English"

    def display(sentences):
        return "\n".join(sentence.tagged() for sentence in sentences)

    async def replay(match_id, seed):
        try:
            events, evidence = fixture(match_id, seed)
            if settings.mode == "azure":
                from api.ingestion import publish

                for event in events:
                    await asyncio.sleep(tick_seconds)
                    await publish(
                        settings,
                        credential,
                        [event],
                        evidence=evidence if event.type == "goal" else None,
                    )
                async with asyncio.timeout(45):
                    while not await state.store.get("explanations", evidence.goal_id):
                        await asyncio.sleep(0.5)
                match = await match_or_404(match_id)
                match["status"] = "finished"
                await state.save_match(match)
                return
            for event in events:
                await asyncio.sleep(tick_seconds)
                await state.on_event(event)
            await state.process(evidence)
            match = await match_or_404(match_id)
            match["status"] = "finished"
            await state.save_match(match)
        except Exception:
            match = await match_or_404(match_id)
            match["status"] = "failed"
            await state.save_match(match)
            await state.emit(match_id, "match.failed", {"message": "Pipeline failed"})
            raise

    @app.get("/health")
    async def health():
        return {
            "status": "ok",
            "mode": settings.mode,
            "storage": "cosmos" if settings.mode == "azure" else "memory",
            "agents": "foundry-with-fallback" if state.provider else "evidence-only",
            "azure_configured": settings.mode == "azure",
        }

    @app.get("/ready")
    async def ready():
        try:
            await asyncio.wait_for(state.store.get("goals", "readiness-check"), 5)
            return {"status": "ok", "storage_connected": True}
        except Exception:  # noqa: BLE001 - readiness must fail when storage is inaccessible
            raise HTTPException(503, "Storage unavailable") from None

    @app.post("/matches", status_code=201)
    async def start(body: StartMatch):
        # Creation is serialized to enforce the demo's quota even under concurrent requests.
        async with state.lock:
            matches = await state.store.list("goals")
            known = [x for x in matches if "status" in x and "id" in x]
            if (
                len(known) >= settings.max_matches
                or sum(x["status"] in {"running", "streaming"} for x in known)
                >= settings.max_active_matches
            ):
                raise HTTPException(429, "Demo match quota reached")
            match_id = uuid4().hex
            match = {
                "id": match_id,
                "seed": body.seed,
                "status": "running",
                "score": {"home": 0, "away": 0},
                "goal_ids": [],
                "source": "synthetic-fixture",
            }
            await state.save_match(match)
        state.spawn(replay(match_id, body.seed))
        return match

    @app.post("/ingest/evidence", status_code=202)
    async def ingest(evidence: Evidence):
        # Direct recorded-evidence fallback and integration seam for Role 2.
        prior = await state.store.get("traces", evidence.goal_id)
        if prior and prior != evidence.model_dump():
            raise HTTPException(409, "Goal ID already refers to different evidence")
        await state.store.put("traces", evidence.goal_id, evidence.match_id, evidence.model_dump())
        state.spawn(state.process(evidence))
        return {"goal_id": evidence.goal_id, "status": "accepted"}

    @app.get("/matches/{match_id}")
    async def get_match(match_id: str):
        return await match_or_404(match_id)

    @app.post("/matches/{match_id}/finish")
    async def finish(match_id: str):
        match = await match_or_404(match_id)
        match["status"] = "finished"
        await state.save_match(match)
        return match

    @app.get("/goals/{goal_id}/trace")
    async def trace(goal_id: str):
        item = await state.store.get("traces", goal_id)
        if item is None:
            raise HTTPException(404, "Trace not found")
        return Evidence.model_validate(item)

    @app.get("/goals/{goal_id}/explanation")
    async def explanation(
        goal_id: str, mode: Literal["fan", "analyst", "studio"] = "fan", lang: str = "en"
    ):
        item = await state.store.get("explanations", goal_id)
        if item is None:
            raise HTTPException(404, "Explanation not found")
        parsed = Explanation.model_validate(item)
        parsed, actual_lang, warning = await localize(parsed, lang)
        text = display(parsed.recaps[mode])
        return {
            **parsed.model_dump(),
            "mode": mode,
            "lang": actual_lang,
            "requested_lang": lang,
            "text": text,
            "translation_warning": warning,
            "audio_available": bool(state.services) and warning is None,
            "sentences": [sentence.model_dump() for sentence in parsed.recaps[mode]],
        }

    @app.get("/goals/{goal_id}/audio")
    async def audio(
        goal_id: str,
        mode: Literal["fan", "analyst", "studio"] = "fan",
        lang: Literal["en", "hi", "es"] = "en",
    ):
        if not state.services:
            raise HTTPException(503, "Speech is not configured")
        item = await state.store.get("explanations", goal_id)
        if item is None:
            raise HTTPException(404, "Explanation not found")
        parsed, actual_lang, warning = await localize(Explanation.model_validate(item), lang)
        if warning:
            raise HTTPException(503, "Translation unavailable; use English text")
        # Speak prose without reading machine evidence IDs aloud.
        text = " ".join(sentence.text for sentence in parsed.recaps[mode])
        try:
            data = await asyncio.wait_for(state.services.speech(text, actual_lang), 15)
            return Response(
                data, media_type="audio/mpeg", headers={"Content-Language": actual_lang}
            )
        except Exception:  # noqa: BLE001 - hide audio when speech is unavailable
            raise HTTPException(503, "Speech unavailable; use text explanation") from None

    @app.get("/matches/{match_id}/report")
    async def report(
        match_id: str, mode: Literal["fan", "analyst", "studio"] = "fan", lang: str = "en"
    ):
        match = await match_or_404(match_id)
        if match["status"] != "finished":
            raise HTTPException(409, "Match has not finished")
        explanations = await state.store.list("explanations", match_id)
        if len(explanations) < len(match["goal_ids"]):
            raise HTTPException(409, "Explanations are still processing")
        counts = {}
        goals = []
        for item in explanations:
            for link in item["blame_order"]:
                counts[link["bug_type"]] = counts.get(link["bug_type"], 0) + 1
            localized, actual_lang, warning = await localize(Explanation.model_validate(item), lang)
            text = display(localized.recaps[mode])
            goals.append(
                {
                    "goal_id": item["goal_id"],
                    "text": text,
                    "sentences": [sentence.model_dump() for sentence in localized.recaps[mode]],
                    "lang": actual_lang,
                    "translation_warning": warning,
                }
            )
        highlight_order = [x["goal_id"] for x in explanations]
        report_warning = None
        if state.provider and explanations:
            from agents.recap import match_report

            try:
                plan = await asyncio.wait_for(
                    match_report(state.provider, match_id, explanations, counts), 10
                )
                highlight_order = plan.goal_ids
            except Exception as error:  # noqa: BLE001 - full-time recap fallback
                logger.warning("Match recap fallback: %s", type(error).__name__)
                report_warning = "Match recap unavailable; using verified chronological summaries"
        return {
            "match_id": match_id,
            "mode": mode,
            "requested_lang": lang,
            "source": "evidence-only"
            if any(x["source"] == "evidence-only" for x in explanations)
            else "model",
            "goals": goals,
            "patterns": counts,
            "top_causes": sorted(counts, key=lambda x: (-counts[x], x)),
            "provisional": match["status"] != "finished",
            "highlight_order": highlight_order,
            "report_warning": report_warning,
        }

    @app.websocket("/live/{match_id}")
    async def live(ws: WebSocket, match_id: str):
        protocols = ws.headers.get("sec-websocket-protocol", "").split(",")
        protocols = [x.strip() for x in protocols]
        if auth:
            header = ws.headers.get("authorization")
            if not header and len(protocols) == 2 and protocols[0] == "rootcause":
                header = "Bearer " + protocols[1]
            try:
                await auth.validate(header)
            except Exception:  # noqa: BLE001 - close unauthenticated sockets
                await ws.close(code=1008)
                return
        if await state.get_match(match_id) is None:
            await ws.close(code=1008)
            return
        await ws.accept(
            subprotocol="rootcause" if protocols and protocols[0] == "rootcause" else None
        )
        queue, history = await state.register(match_id)
        try:
            for message in history:
                await ws.send_json(message)

            async def send():
                while True:
                    message = await queue.get()
                    if message is None:
                        await ws.close(code=1013)
                        return
                    await ws.send_json(message)

            async def receive():
                while True:
                    await ws.receive_text()

            tasks = {asyncio.create_task(send()), asyncio.create_task(receive())}
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
        except WebSocketDisconnect:
            pass
        finally:
            state.listeners[match_id].discard(queue)

    return app


app = create_app()
