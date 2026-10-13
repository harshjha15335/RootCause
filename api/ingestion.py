import asyncio
import importlib
import inspect
import json
import logging

from api.contracts import Evidence, MatchEvent

logger = logging.getLogger(__name__)


async def trace_goal(event: MatchEvent, module_name: str) -> Evidence:
    """Role 2 plugin contract: trace(event_dict) returns the agreed evidence package."""
    if not module_name:
        raise RuntimeError("DEBUGGER_MODULE must name Role 2's installed debugger module")
    module = importlib.import_module(module_name)
    result = (
        await module.trace(event.model_dump())
        if inspect.iscoroutinefunction(module.trace)
        else await asyncio.to_thread(module.trace, event.model_dump())
    )
    evidence = Evidence.model_validate(result)
    if evidence.goal.id != event.id or evidence.match_id != event.match_id:
        raise ValueError("Debugger returned evidence for the wrong event")
    if evidence.source != "debugger":
        raise ValueError("Real ingestion requires source=debugger")
    return evidence


def parse_envelope(body):
    data = json.loads(body)
    if "event" not in data:
        return MatchEvent.model_validate(data), None
    event = MatchEvent.model_validate(data["event"])
    evidence = Evidence.model_validate(data["evidence"]) if data.get("evidence") else None
    if evidence and (evidence.goal != event or evidence.source != "synthetic-fixture"):
        raise ValueError("Recorded fixture envelope must match its goal and declare its source")
    return event, evidence


async def publish(settings, credential, events, evidence=None):
    from azure.eventhub import EventData, TransportType
    from azure.eventhub.aio import EventHubProducerClient

    async with EventHubProducerClient(
        settings.eventhub_namespace,
        settings.eventhub_name,
        credential=credential,
        transport_type=TransportType.AmqpOverWebsocket,
    ) as producer:
        for event in events:
            batch = await producer.create_batch(partition_key=event.match_id)
            batch.add(
                EventData(
                    json.dumps(
                        {
                            "event": event.model_dump(),
                            "evidence": evidence.model_dump() if evidence else None,
                        }
                    )
                )
            )
            await producer.send_batch(batch)


async def consume(settings, credential, on_event):
    from azure.eventhub import TransportType
    from azure.eventhub.aio import EventHubConsumerClient

    async with EventHubConsumerClient(
        settings.eventhub_namespace,
        settings.eventhub_name,
        "api",
        credential=credential,
        transport_type=TransportType.AmqpOverWebsocket,
    ) as consumer:

        async def received(partition, event):
            if event is not None:
                parsed, _ = parse_envelope(event.body_as_str())
                await on_event(parsed)
                await partition.update_checkpoint(event)

        # On restart replay retained events; pipeline deduplicates by immutable event/goal IDs.
        await consumer.receive(on_event=received, starting_position="-1")


async def supervised_consume(settings, credential, on_event):
    while True:
        try:
            await consume(settings, credential, on_event)
        except Exception as error:  # noqa: BLE001 - reconnect Event Hubs after network failure
            logger.warning("Event Hubs consumer reconnecting: %s", type(error).__name__)
            await asyncio.sleep(5)
