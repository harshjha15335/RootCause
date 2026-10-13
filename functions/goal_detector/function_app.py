import logging
import sys
from pathlib import Path

import azure.functions as func

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from api.ingestion import parse_envelope, trace_goal
from api.settings import Settings
from api.storage import CosmosStore

app = func.FunctionApp()
logger = logging.getLogger(__name__)


async def process_event(event, store, debugger_module, recorded_evidence=None):
    if event.type != "goal":
        return
    # At-least-once Event Hubs delivery: don't recompute an already recorded goal.
    if await store.get("goals", f"event-{event.id}"):
        return
    evidence = recorded_evidence or await trace_goal(event, debugger_module)
    await store.put("traces", evidence.goal_id, evidence.match_id, evidence.model_dump())
    # Mark complete only AFTER the durable trace write. Failure is replayable.
    await store.put(
        "goals",
        f"event-{event.id}",
        evidence.match_id,
        {"event_id": event.id, "goal_id": evidence.goal_id},
    )
    logger.info("Goal trace saved goal_id=%s", evidence.goal_id)


@app.event_hub_message_trigger(
    arg_name="events",
    event_hub_name="match-events",
    connection="EventHubConnection",
    consumer_group="detector",
    cardinality="many",
)
async def goal_detector(events: list[func.EventHubEvent]):
    from azure.identity.aio import DefaultAzureCredential

    settings = Settings.from_env()
    async with DefaultAzureCredential() as credential:
        store = CosmosStore(settings.cosmos_endpoint, settings.cosmos_database, credential)
        try:
            for raw in events:
                event, recorded = parse_envelope(raw.get_body())
                await process_event(event, store, settings.debugger_module, recorded)
        finally:
            await store.close()
