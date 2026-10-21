import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Never

from agent_framework import Executor, WorkflowBuilder, WorkflowContext, handler
from opentelemetry import trace

from agents.explainer import explain
from agents.fallbacks import fallback_highlights, template_explanation
from agents.grounding import validate_explanation
from agents.highlights import highlights
from agents.persona import persona, render_mode
from agents.providers import Provider
from agents.recap import recap
from agents.tools import EvidenceTools
from api.contracts import Evidence, Explanation

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("rootcause.workflow")


@dataclass
class Frame:
    evidence: Evidence
    result: Explanation


class Orchestrator(Executor):
    def __init__(self, emit):
        super().__init__(id="orchestrator")
        self.emit = emit

    @handler
    async def process(self, frame: Frame, ctx: WorkflowContext[Frame]):
        # Procedural routing needs no model decision and cannot change the evidence.
        EvidenceTools(frame.evidence).get_evidence(frame.evidence.goal_id)
        await self.emit("agent.step", {"agent": "orchestrator", "status": "started"})
        await ctx.send_message(frame)


class ExplainAndHighlight(Executor):
    def __init__(self, provider, emit, timeout):
        super().__init__(id="explain-and-highlight")
        self.provider, self.emit, self.timeout = provider, emit, timeout

    @handler
    async def process(self, frame: Frame, ctx: WorkflowContext[Frame]):
        async def explanation():
            if self.provider:
                for _ in range(2):
                    try:
                        generated = await asyncio.wait_for(
                            explain(self.provider, frame.evidence), self.timeout
                        )
                        frame.result.paragraphs = generated.paragraphs
                        frame.result.root_summary = generated.root_summary
                        frame.result.source = "model"
                        frame.result.status = "ready"
                        await self.emit("agent.step", {"agent": "explainer", "status": "completed"})
                        return
                    except Exception as error:  # noqa: BLE001 - one bounded retry then template
                        logger.warning("Explainer failed: %s", type(error).__name__)
                frame.result.warnings.append(
                    "Explainer unavailable; template shown while explanation is pending"
                )
            await self.emit("agent.step", {"agent": "explainer", "status": "pending"})

        async def clips():
            status = "evidence-only"
            if self.provider:
                try:
                    frame.result.highlights = await asyncio.wait_for(
                        highlights(self.provider, frame.evidence), self.timeout
                    )
                    status = "completed"
                except Exception as error:  # noqa: BLE001 - chain links remain a valid clip order
                    logger.warning("Highlights fallback: %s", type(error).__name__)
                    frame.result.highlights = fallback_highlights(frame.evidence)
                    frame.result.warnings.append(
                        "Highlights unavailable; using chain-link clip order"
                    )
            await self.emit("agent.step", {"agent": "highlights", "status": status})

        await asyncio.gather(explanation(), clips())
        await ctx.send_message(frame)


class Recap(Executor):
    def __init__(self, provider, emit, timeout):
        super().__init__(id="recap")
        self.provider, self.emit, self.timeout = provider, emit, timeout

    @handler
    async def process(self, frame: Frame, ctx: WorkflowContext[Frame]):
        status = "evidence-only"
        if self.provider:
            try:
                ids = await asyncio.wait_for(
                    recap(
                        self.provider,
                        frame.evidence,
                        frame.result.paragraphs,
                        frame.result.highlights,
                    ),
                    self.timeout,
                )
                body = {p.evidence_id: p for p in frame.result.paragraphs}
                frame.result.paragraphs = [body[eid] for eid in ids]
                status = "completed"
            except Exception as error:  # noqa: BLE001 - preserve factual goal story
                logger.warning("Recap fallback: %s", type(error).__name__)
                frame.result.warnings.append("Recap unavailable; using causal-link story order")
        await self.emit("agent.step", {"agent": "recap", "status": status})
        await ctx.send_message(frame)


class Personas(Executor):
    def __init__(self, provider, emit, timeout):
        super().__init__(id="persona")
        self.provider, self.emit, self.timeout = provider, emit, timeout

    @handler
    async def process(self, frame: Frame, ctx: WorkflowContext[Never, Explanation]):
        story = frame.result.root_summary + [
            s for p in frame.result.paragraphs for s in p.sentences
        ]

        async def style(mode):
            status = "evidence-only"
            if self.provider:
                try:
                    result = await asyncio.wait_for(
                        persona(self.provider, mode, story), self.timeout
                    )
                    status = "completed"
                except Exception as error:  # noqa: BLE001 - requested mode has a template fallback
                    logger.warning("Persona fallback: %s", type(error).__name__)
                    frame.result.warnings.append(
                        f"Persona {mode} unavailable; using cited templates"
                    )
                    result = render_mode(story, mode)
            else:
                result = render_mode(story, mode)
            await self.emit("agent.step", {"agent": "persona", "mode": mode, "status": status})
            return mode, result

        frame.result.recaps = dict(
            await asyncio.gather(*(style(mode) for mode in ("fan", "analyst", "studio")))
        )
        validate_explanation(frame.result, frame.evidence)
        await ctx.yield_output(frame.result)


async def run(
    evidence: Evidence,
    emit,
    timeout: float = 15,
    provider: Provider | None = None,
    budget: float = 20,
) -> Explanation:
    started = time.monotonic()
    orchestrator = Orchestrator(emit)
    parallel = ExplainAndHighlight(provider, emit, timeout)
    recap_node = Recap(provider, emit, timeout)
    personas = Personas(provider, emit, timeout)
    workflow = (
        WorkflowBuilder(start_executor=orchestrator, name="rootcause-explanation")
        .add_edge(orchestrator, parallel)
        .add_edge(parallel, recap_node)
        .add_edge(recap_node, personas)
        .build()
    )
    with tracer.start_as_current_span("goal.workflow") as span:
        span.set_attribute("rootcause.goal_id", evidence.goal_id)
        span.set_attribute("rootcause.match_id", evidence.match_id)
        try:
            async with asyncio.timeout(budget):
                outputs = (
                    await workflow.run(Frame(evidence, template_explanation(evidence)))
                ).get_outputs()
                if len(outputs) != 1 or not isinstance(outputs[0], Explanation):
                    raise ValueError("Workflow produced no explanation")
                result = outputs[0]
        except Exception as error:  # noqa: BLE001 - traces and attribution must survive any agent failure
            logger.warning("Explanation workflow fallback: %s", type(error).__name__)
            result = template_explanation(
                evidence,
                ["Workflow deadline/failure; cited template shown while explanation is pending"],
            )
        result.latency_ms = (time.monotonic() - started) * 1000
        return result
