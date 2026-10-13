import asyncio
import logging

from agents.orchestrator import run
from api.contracts import Evidence, MatchEvent
from api.storage import MemoryStore

logger = logging.getLogger(__name__)


class Runtime:
    def __init__(self, store=None, provider=None, services=None):
        self.store = store or MemoryStore()
        self.provider, self.services = provider, services
        self.matches = {}
        self.history = {}
        self.listeners = {}
        self.tasks = set()
        self.active = set()
        self.completed = set()
        self.sequences = {}
        self.lock = asyncio.Lock()
        self.event_lock = asyncio.Lock()

    def spawn(self, coroutine):
        task = asyncio.create_task(coroutine)
        self.tasks.add(task)

        def completed(done):
            self.tasks.discard(done)
            if not done.cancelled() and done.exception():
                logger.error("Background task failed: %s", type(done.exception()).__name__)

        task.add_done_callback(completed)
        return task

    async def get_match(self, match_id):
        return self.matches.get(match_id) or await self.store.get("goals", f"match-{match_id}")

    async def save_match(self, match):
        self.matches[match["id"]] = match
        await self.store.put("goals", f"match-{match['id']}", match["id"], match)

    async def emit(self, match_id, kind, payload):
        async with self.lock:
            if match_id not in self.history:
                prior = await self.store.list("agent_steps", match_id)
                self.history[match_id] = sorted(
                    [x for x in prior if "sequence" in x], key=lambda x: x["sequence"]
                )
            history = self.history[match_id]
            message = {
                "type": kind,
                "match_id": match_id,
                "sequence": history[-1]["sequence"] + 1 if history else 1,
                "payload": payload,
            }
            await self.store.put(
                "agent_steps", f"message-{match_id}-{message['sequence']}", match_id, message
            )
            history.append(message)
            for queue in tuple(self.listeners.get(match_id, set())):
                try:
                    queue.put_nowait(message)
                except asyncio.QueueFull:
                    # Close lagging clients; they can reconnect to the durable history.
                    while not queue.empty():
                        queue.get_nowait()
                    queue.put_nowait(None)

    async def register(self, match_id):
        async with self.lock:
            if match_id not in self.history:
                prior = await self.store.list("agent_steps", match_id)
                self.history[match_id] = sorted(
                    [x for x in prior if "sequence" in x], key=lambda x: x["sequence"]
                )
            queue = asyncio.Queue(maxsize=256)
            self.listeners.setdefault(match_id, set()).add(queue)
            return queue, list(self.history[match_id])

    async def on_event(self, event: MatchEvent):
        async with self.event_lock:
            await self._on_event(event)

    async def _on_event(self, event: MatchEvent):
        # Persist marker after processing. A failed write retries without losing the event.
        if await self.store.get("agent_steps", f"received-{event.id}"):
            return
        match = await self.get_match(event.match_id)
        if not match:
            match = {
                "id": event.match_id,
                "seed": None,
                "status": "streaming",
                "score": {"home": 0, "away": 0},
                "goal_ids": [],
            }
            await self.save_match(match)
        await self.emit(event.match_id, "match.event", event.model_dump())
        if event.type == "goal":
            # goal event IDs supply the durable score deduplication key.
            if event.id not in match.get("scored_events", []):
                match.setdefault("scored_events", []).append(event.id)
                match["score"][event.team] += 1
                await self.save_match(match)
            await self.emit(event.match_id, "goal.detected", {"event_id": event.id})
        await self.store.put(
            "agent_steps", f"received-{event.id}", event.match_id, {"event_id": event.id}
        )

    async def process(self, evidence: Evidence):
        if evidence.goal_id in self.completed:
            return
        existing = await self.store.get("verdicts", evidence.goal_id)
        if existing:
            prior = await self.store.list("agent_steps", evidence.match_id)
            if not any(
                x.get("type") == "verdict.ready"
                and x.get("payload", {}).get("goal_id") == evidence.goal_id
                for x in prior
            ):
                await self.emit(evidence.match_id, "verdict.ready", existing)
            self.completed.add(evidence.goal_id)
            return
        if not await self.store.acquire(evidence.goal_id, evidence.match_id):
            return
        await self.store.put("traces", evidence.goal_id, evidence.match_id, evidence.model_dump())
        match = await self.get_match(evidence.match_id)
        if match is None:
            await self.on_event(evidence.goal)
            match = await self.get_match(evidence.match_id)
        if match is None:
            raise RuntimeError("Goal processing failed to create match metadata")
        if evidence.goal_id not in match["goal_ids"]:
            match["goal_ids"].append(evidence.goal_id)
            await self.save_match(match)
        await self.emit(evidence.match_id, "trace.ready", evidence.model_dump())

        async def emit(kind, payload):
            await self.emit(evidence.match_id, kind, {"goal_id": evidence.goal_id, **payload})

        verdict = await run(evidence, emit, provider=self.provider)
        if self.services:
            # Service failures are bounded and fail closed inside filter_verdict.
            verdict = await asyncio.wait_for(self.services.filter_verdict(verdict), 10)
        await self.store.put("verdicts", evidence.goal_id, evidence.match_id, verdict.model_dump())
        await self.emit(evidence.match_id, "verdict.ready", verdict.model_dump())
        self.completed.add(evidence.goal_id)

    async def resume(self):
        """Recover durable traces after Function delivery, API restart, or expired lease."""
        while True:
            try:
                for raw in await self.store.list("traces"):
                    evidence = Evidence.model_validate(raw)
                    if not await self.store.get("agent_steps", f"received-{evidence.goal.id}"):
                        continue  # Wait for the API consumer to publish the goal event first.
                    if (
                        evidence.goal_id not in self.active
                        and evidence.goal_id not in self.completed
                    ):
                        self.active.add(evidence.goal_id)

                        async def process_one(item=evidence):
                            try:
                                await self.process(item)
                            finally:
                                self.active.discard(item.goal_id)

                        self.spawn(process_one())
            except Exception as error:  # noqa: BLE001 - retry durable work on transient errors
                logger.warning("Trace polling failed: %s", type(error).__name__)
            await asyncio.sleep(2)

    async def close(self):
        tasks = list(self.tasks)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await self.store.close()
