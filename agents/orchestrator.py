import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Never

from agent_framework import Executor, WorkflowBuilder, WorkflowContext, handler
from opentelemetry import trace

from agents.judge import decisions, judge
from agents.persona import persona, render
from agents.players import fallback_testimony, player_factory
from agents.providers import Provider
from agents.recap import recap
from agents.tools import PlayerTools, check_claim
from api.contracts import Evidence, OrchestrationPlan, Testimony, Verdict

Player = Callable[[str, PlayerTools], Awaitable[Testimony]]
Emit = Callable[[str, dict], Awaitable[None]]
logger = logging.getLogger(__name__)
tracer = trace.get_tracer("rootcause.workflow")


@dataclass
class Frame:
    evidence: Evidence
    testimonies: list[Testimony] = field(default_factory=list)
    player_ids: list[str] = field(default_factory=list)
    judge_ok: bool = False
    story_ids: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    details: dict[str, str] = field(default_factory=dict)
    started: float = field(default_factory=time.monotonic)


class Orchestrator(Executor):
    def __init__(self, provider, emit, timeout):
        super().__init__(id="orchestrator")
        self.provider, self.emit, self.timeout = provider, emit, timeout

    @handler
    async def process(self, frame: Frame, ctx: WorkflowContext[Frame]):
        links = sorted(frame.evidence.links, key=lambda x: (-x.blame_percent, x.evidence_id))
        frame.player_ids = list(dict.fromkeys(x.player_id for x in links))[:3]
        if self.provider:

            def get_evidence() -> dict:
                """Read this goal's immutable evidence package for workflow routing."""
                return frame.evidence.model_dump()

            try:
                plan = await asyncio.wait_for(
                    self.provider.generate(
                        "orchestrator", {}, OrchestrationPlan, tools=[get_evidence]
                    ),
                    self.timeout,
                )
                if len(plan.player_ids) != len(frame.player_ids) or set(plan.player_ids) != set(
                    frame.player_ids
                ):
                    raise ValueError("Orchestrator selected the wrong implicated players")
            except Exception as error:  # noqa: BLE001 - deterministic routing fallback
                logger.warning("Orchestrator fallback: %s", type(error).__name__)
                frame.warnings.append("Orchestrator unavailable; using evidence-based routing")
        await self.emit("agent.step", {"agent": "orchestrator", "status": "started"})
        await ctx.send_message(frame)


class Players(Executor):
    def __init__(self, player, emit, timeout):
        super().__init__(id="players")
        self.player, self.emit, self.timeout = player, emit, timeout

    async def testify(self, evidence, pid):
        tools = PlayerTools(evidence, pid)
        if self.player:
            for _ in range(2):
                try:
                    result = await asyncio.wait_for(self.player(pid, tools), self.timeout)
                    if not result.claims:
                        raise ValueError("Player returned no evidence claim")
                    if result.player_id != pid or any(c.player_id != pid for c in result.claims):
                        raise ValueError("Player identity mismatch")
                    # A provider's unverified narrative is never displayed.
                    result.statement = ""
                    await self.emit("agent.step", {"agent": pid, "status": "completed"})
                    return result
                except Exception as error:  # noqa: BLE001 - provider isolation
                    logger.warning("Player %s failed: %s", pid, type(error).__name__)
        await self.emit("agent.step", {"agent": pid, "status": "evidence-only"})
        return fallback_testimony(pid, tools)

    @handler
    async def process(self, frame: Frame, ctx: WorkflowContext[Frame]):
        # Top three implicated players; all attribution links remain in the judge evidence.
        ids = frame.player_ids
        frame.testimonies = await asyncio.gather(
            *(self.testify(frame.evidence, pid) for pid in ids)
        )
        if self.player and any(t.source == "evidence-only" for t in frame.testimonies):
            frame.warnings.append("Player provider unavailable; factual testimony substituted")
        await ctx.send_message(frame)


class Judge(Executor):
    def __init__(self, provider, emit, timeout):
        super().__init__(id="judge")
        self.provider, self.emit, self.timeout = provider, emit, timeout

    @handler
    async def process(self, frame: Frame, ctx: WorkflowContext[Frame]):
        if self.provider:
            try:
                await asyncio.wait_for(
                    judge(self.provider, frame.evidence, frame.testimonies), self.timeout
                )
                _, rejected = decisions(frame.evidence, frame.testimonies)
                if rejected:
                    # Exactly one rebuttal for each implicated player with a rejected claim.
                    player = player_factory(self.provider, frame.evidence)

                    async def rebut(t):
                        bad = [
                            c.evidence_id for c in t.claims if not check_claim(c, frame.evidence)
                        ]
                        if not bad:
                            return t
                        try:
                            result = await asyncio.wait_for(
                                player(t.player_id, PlayerTools(frame.evidence, t.player_id), bad),
                                self.timeout,
                            )
                            if result.player_id != t.player_id or any(
                                c.player_id != t.player_id for c in result.claims
                            ):
                                raise ValueError("Rebuttal ownership mismatch")
                            await self.emit(
                                "agent.step", {"agent": t.player_id, "status": "rebuttal"}
                            )
                            return result
                        except Exception as error:  # noqa: BLE001 - bounded rebuttal fallback
                            logger.warning("Rebuttal failed: %s", type(error).__name__)
                            return t

                    frame.testimonies = await asyncio.gather(*(rebut(t) for t in frame.testimonies))
                    await asyncio.wait_for(
                        judge(self.provider, frame.evidence, frame.testimonies), self.timeout
                    )
                frame.judge_ok = True
            except Exception as error:  # noqa: BLE001 - preserve engine attribution
                logger.warning("Judge failed: %s", type(error).__name__)
                frame.warnings.append("Judge unavailable; using evidence-only ruling")
        await self.emit(
            "agent.step",
            {"agent": "judge", "status": "completed" if frame.judge_ok else "evidence-only"},
        )
        await ctx.send_message(frame)


class Recap(Executor):
    def __init__(self, provider, emit, timeout):
        super().__init__(id="recap")
        self.provider, self.emit, self.timeout = provider, emit, timeout

    @handler
    async def process(self, frame: Frame, ctx: WorkflowContext[Frame]):
        frame.story_ids = [
            x.evidence_id
            for x in sorted(frame.evidence.links, key=lambda x: (-x.blame_percent, x.evidence_id))
        ]

        async def story():
            if self.provider:
                try:
                    plan = await asyncio.wait_for(
                        recap(self.provider, frame.evidence), self.timeout
                    )
                    frame.story_ids = plan.evidence_ids
                except Exception as error:  # noqa: BLE001 - template fallback
                    logger.warning("Recap failed: %s", type(error).__name__)
                    frame.warnings.append("Recap unavailable; using factual templates")

        async def styles():
            if self.provider:
                try:
                    text = render(frame.evidence, frame.story_ids, "analyst")
                    modes = ("fan", "analyst", "studio")
                    details = await asyncio.gather(
                        *(
                            asyncio.wait_for(persona(self.provider, mode, text), self.timeout)
                            for mode in modes
                        )
                    )
                    frame.details = dict(zip(modes, details, strict=True))
                except Exception as error:  # noqa: BLE001 - template fallback
                    logger.warning("Persona failed: %s", type(error).__name__)
                    frame.warnings.append("Persona unavailable; using requested template styles")

        # Recap and three persona agents run concurrently from the same verified facts.
        await asyncio.gather(story(), styles())
        await self.emit("agent.step", {"agent": "recap", "status": "completed"})
        await ctx.send_message(frame)


class Finish(Executor):
    def __init__(self):
        super().__init__(id="verdict")

    @handler
    async def process(self, frame: Frame, ctx: WorkflowContext[Never, Verdict]):
        accepted, rejected = decisions(frame.evidence, frame.testimonies)
        order = sorted(frame.evidence.links, key=lambda x: (-x.blame_percent, x.evidence_id))
        for testimony in frame.testimonies:
            valid = [c for c in testimony.claims if check_claim(c, frame.evidence)]
            testimony.statement = (
                "I acknowledge the verified evidence: "
                + "; ".join(
                    f"{c.description} My attributed blame is {c.blame_percent:g}% ({c.evidence_id})."
                    for c in valid
                )
                if valid
                else "I have no supported claim to add."
            )
            # Unsupported provider text is withheld, with rejected details in the ruling.
            testimony.claims = valid
        result = Verdict(
            goal_id=frame.evidence.goal_id,
            match_id=frame.evidence.match_id,
            source="model" if frame.judge_ok else "evidence-only",
            testimonies=frame.testimonies,
            accepted_claims=accepted,
            rejected_claims=[
                c.model_copy(update={"description": "Unsupported claim withheld."})
                for c in rejected
            ],
            blame_order=order,
            root_cause_evidence_id=frame.evidence.root_cause_evidence_id or order[0].evidence_id,
            reasoning="The verified engine attribution determines the blame order. "
            "Every accepted claim matches its evidence; unsupported claims are rejected.",
            recaps={
                mode: render(
                    frame.evidence, frame.story_ids, mode, frame.details.get(mode, "brief")
                )
                for mode in ("fan", "analyst", "studio")
            },
            warnings=frame.warnings,
            latency_ms=(time.monotonic() - frame.started) * 1000,
        )
        await ctx.yield_output(result)


async def run(
    evidence: Evidence,
    emit: Emit,
    player: Player | None = None,
    timeout: float = 15,
    provider: Provider | None = None,
    budget: float = 20,
) -> Verdict:
    """Agent Framework graph with a global deadline and a credential-free fallback."""
    if provider and player is None:
        player = player_factory(provider, evidence)
    players, judge_node, recap_node, finish = (
        Players(player, emit, timeout),
        Judge(provider, emit, timeout),
        Recap(provider, emit, timeout),
        Finish(),
    )
    orchestrator = Orchestrator(provider, emit, timeout)
    workflow = (
        WorkflowBuilder(start_executor=orchestrator, name="rootcause-goal")
        .add_edge(orchestrator, players)
        .add_edge(players, judge_node)
        .add_edge(judge_node, recap_node)
        .add_edge(recap_node, finish)
        .build()
    )
    with tracer.start_as_current_span("goal.workflow") as span:
        span.set_attribute("rootcause.goal_id", evidence.goal_id)
        span.set_attribute("rootcause.match_id", evidence.match_id)
        started = time.monotonic()
        try:
            async with asyncio.timeout(budget):
                outputs = (await workflow.run(Frame(evidence))).get_outputs()
                if len(outputs) != 1 or not isinstance(outputs[0], Verdict):
                    raise ValueError("Workflow produced no verdict")
                return outputs[0]
        except Exception as error:
            logger.warning("Workflow fallback: %s", type(error).__name__)
            if provider is None and player is None:
                raise  # Local framework defects must not be hidden by another identical retry.
            fallback = await run(evidence, emit, timeout=timeout, budget=5)
            fallback.warnings.append("Agent workflow deadline/failure; evidence-only fallback")
            fallback.latency_ms = (time.monotonic() - started) * 1000
            return fallback
