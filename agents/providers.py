import asyncio
import logging
from pathlib import Path
from typing import Any, Protocol, TypeVar

from opentelemetry import trace
from pydantic import BaseModel

from api.settings import Settings

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger(__name__)
tracer = trace.get_tracer("rootcause.agents")
PROMPTS = Path(__file__).parent / "prompts"


class Provider(Protocol):
    async def generate(
        self,
        role: str,
        payload: dict,
        schema: type[T],
        tools: list[Any] | None = None,
        light: bool = False,
    ) -> T: ...


class FoundryProvider:
    """Agent Framework agents using Foundry's Entra-authenticated Responses endpoint."""

    def __init__(self, settings: Settings, credential, project=None):
        from azure.ai.projects.aio import AIProjectClient

        self.settings = settings
        self.project = project or AIProjectClient(settings.foundry_endpoint, credential)
        self.client = self.project.get_openai_client(max_retries=0, timeout=12)

    async def generate(
        self,
        role: str,
        payload: dict,
        schema: type[T],
        tools: list[Any] | None = None,
        light: bool = False,
    ) -> T:
        import json

        from agent_framework import Agent
        from agent_framework.exceptions import ChatClientException
        from agent_framework.openai import OpenAIChatOptions
        from openai import RateLimitError

        prompt = (PROMPTS / f"{role}.txt").read_text()
        model = self.settings.light_model if light else self.settings.main_model
        with tracer.start_as_current_span(role) as span:
            span.set_attribute("rootcause.role", role)
            # Bounded 429 retries, then a light deployment attempt; outer stage sets its deadline.
            for attempt in range(3):
                chat = self._chat(model)
                agent = Agent(chat, name=f"rootcause-{role}", instructions=prompt, tools=tools)
                try:
                    options: OpenAIChatOptions[Any] = {
                        "response_format": schema,
                        "max_tokens": 1400,
                    }
                    response = await agent.run(
                        json.dumps(payload),
                        options=options,
                    )
                    span.set_attribute("gen_ai.request.model", model)
                    usage = getattr(response, "usage_details", None)
                    if usage:
                        for name in ("input_token_count", "output_token_count"):
                            value = usage.get(name)
                            if value is not None:
                                span.set_attribute(f"gen_ai.usage.{name}", value)
                    return schema.model_validate_json(response.text)
                except (RateLimitError, ChatClientException) as error:
                    # Agent Framework wraps provider errors; inspect the preserved cause.
                    cause = getattr(error, "inner_exception", None) or error.__cause__
                    if not isinstance(error, RateLimitError) and not isinstance(
                        cause, RateLimitError
                    ):
                        raise
                    if attempt == 2:
                        raise
                    await asyncio.sleep(0.25 * (2**attempt))
                    if attempt == 1:
                        model = self.settings.light_model
            raise RuntimeError("Unreachable provider state")

    def _chat(self, model: str):
        from agent_framework.openai import OpenAIChatClient

        return OpenAIChatClient(model=model, async_client=self.client)

    async def close(self):
        await self.client.close()
        await self.project.close()


class GitHubModelsProvider(FoundryProvider):
    """The same agents on GitHub Models (Azure-hosted models, Chat Completions, GitHub token).

    With `endpoint`, any OpenAI-compatible Chat Completions server, such as Foundry Local.

    For running the live workflow without an Azure subscription. The Foundry deployment names
    map to GitHub Models IDs through settings.main_model / light_model.
    """

    ENDPOINT = "https://models.github.ai/inference"

    def __init__(self, settings: Settings, token: str, client=None, endpoint: str | None = None):
        from openai import AsyncOpenAI

        self.settings = settings
        self.project = None
        self.client = client or AsyncOpenAI(
            api_key=token, base_url=endpoint or self.ENDPOINT, max_retries=0, timeout=120
        )

    def _chat(self, model: str):
        from agent_framework.openai import OpenAIChatCompletionClient

        return OpenAIChatCompletionClient(model=model, async_client=self.client)

    async def close(self):
        await self.client.close()
