"""Run the Agent Framework explanation workflow on one goal and show which agents used a model.

    python scripts/live_agents.py                       # live Foundry models (needs az login)
    python scripts/live_agents.py --github              # GitHub Models (needs GITHUB_TOKEN)
    python scripts/live_agents.py --foundry-local URL   # Foundry Local on this PC (no account)
    python scripts/live_agents.py --local               # evidence-only agents, no Azure
    python scripts/live_agents.py --evidence path.json  # another evidence package

Live mode reads FOUNDRY_PROJECT_ENDPOINT, FOUNDRY_MAIN_MODEL and FOUNDRY_LIGHT_MODEL. It prints
every agent step as it happens, then the explanation's source and status: "model" / "ready"
means the Explainer's paragraphs came from the Foundry deployment, "evidence-only" / "pending"
means the cited template was kept. --github runs the same agents on GitHub Models with a GitHub
token instead of a Foundry project (models from GITHUB_MODELS_MAIN / GITHUB_MODELS_LIGHT).
--foundry-local takes the endpoint `foundry service status` prints and uses the loaded model
(or --model) for every agent.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from agents.orchestrator import run
from api.contracts import Evidence

DEFAULT_CASES = ROOT / "samples" / "evaluation.jsonl"


def load_evidence(path: Path | None) -> Evidence:
    if path is None:
        first = next(line for line in DEFAULT_CASES.read_text().splitlines() if line.strip())
        return Evidence.model_validate(json.loads(first)["evidence"])
    data = json.loads(path.read_text())
    return Evidence.model_validate(data.get("evidence", data))


async def main() -> None:
    ap = argparse.ArgumentParser(description="Run the explanation agents on one goal.")
    ap.add_argument("--evidence", type=Path, help="evidence package JSON (default: sample goal)")
    ap.add_argument("--local", action="store_true", help="evidence-only agents, no Azure")
    ap.add_argument("--github", action="store_true", help="GitHub Models instead of Foundry")
    ap.add_argument(
        "--foundry-local", metavar="URL", help="Foundry Local endpoint, e.g. http://127.0.0.1:5273"
    )
    ap.add_argument("--model", help="model ID for --foundry-local (default: first loaded model)")
    ap.add_argument("--timeout", type=float, default=15, help="per-agent timeout in seconds")
    ap.add_argument("--output", type=Path, default=Path("live_explanation.json"))
    args = ap.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    evidence = load_evidence(args.evidence)

    provider = credential = None
    if args.foundry_local:
        from dataclasses import replace

        import httpx

        from agents.providers import GitHubModelsProvider
        from api.settings import Settings

        base = args.foundry_local.rstrip("/")
        base = base if base.endswith("/v1") else base + "/v1"
        model = args.model
        if not model:
            async with httpx.AsyncClient(timeout=10) as http:
                listed = (await http.get(f"{base}/models")).json().get("data", [])
            if not listed:
                raise SystemExit("No model loaded: run `foundry model run phi-4-mini` first")
            model = listed[0]["id"]
        settings = replace(Settings.from_env(), main_model=model, light_model=model)
        print(f"Foundry Local: {base}")
        print(f"Model: {model}\n")
        provider = GitHubModelsProvider(settings, "foundry-local", endpoint=base)
    elif args.github:
        from dataclasses import replace

        from agents.providers import GitHubModelsProvider
        from api.settings import Settings

        token = os.getenv("GITHUB_TOKEN", "")
        if not token:
            raise SystemExit("Set GITHUB_TOKEN to a token with the models:read permission")
        settings = replace(
            Settings.from_env(),
            main_model=os.getenv("GITHUB_MODELS_MAIN", "openai/gpt-4.1-mini"),
            light_model=os.getenv("GITHUB_MODELS_LIGHT", "openai/gpt-4.1-nano"),
        )
        print(f"GitHub Models: {GitHubModelsProvider.ENDPOINT}")
        print(f"Models: main={settings.main_model} light={settings.light_model}\n")
        provider = GitHubModelsProvider(settings, token)
    elif not args.local:
        from azure.identity.aio import DefaultAzureCredential

        from agents.providers import FoundryProvider
        from api.settings import Settings

        settings = Settings.from_env()
        if not settings.foundry_endpoint:
            raise SystemExit("Set FOUNDRY_PROJECT_ENDPOINT (or pass --local)")
        print(f"Foundry project: {settings.foundry_endpoint}")
        print(f"Deployments: main={settings.main_model} light={settings.light_model}\n")
        credential = DefaultAzureCredential()
        provider = FoundryProvider(settings, credential)

    if provider:
        generate = provider.generate

        async def reporting_generate(role, *a, **kw):
            # The workflow logs only error types; show the provider's message here.
            try:
                return await generate(role, *a, **kw)
            except Exception as error:
                cause = getattr(error, "inner_exception", None) or error.__cause__ or error
                print(f"         {role} call failed: {type(cause).__name__}: {str(cause)[:300]}")
                raise

        provider.generate = reporting_generate  # type: ignore[method-assign]

    started = time.monotonic()

    async def emit(kind: str, payload: dict) -> None:
        if kind == "agent.step":
            mode = f" ({payload['mode']})" if "mode" in payload else ""
            print(
                f"{time.monotonic() - started:6.2f}s  {payload['agent']}{mode}: {payload['status']}"
            )

    try:
        explanation = await run(evidence, emit, timeout=args.timeout, provider=provider)
    finally:
        if provider:
            await provider.close()
        if credential:
            await credential.close()

    args.output.write_text(explanation.model_dump_json(indent=2) + "\n")
    print(f"\ngoal: {evidence.goal_id}")
    print(f"source: {explanation.source}   status: {explanation.status}")
    print(f"latency: {explanation.latency_ms:.0f} ms")
    print("root summary: " + " ".join(s.text for s in explanation.root_summary))
    for warning in explanation.warnings:
        print(f"warning: {warning}")
    print(f"full explanation written to {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
