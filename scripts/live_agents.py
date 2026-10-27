"""Run the Agent Framework explanation workflow on one goal and show which agents used a model.

    python scripts/live_agents.py                       # live Foundry models (needs az login)
    python scripts/live_agents.py --local               # evidence-only agents, no Azure
    python scripts/live_agents.py --evidence path.json  # another evidence package

Live mode reads FOUNDRY_PROJECT_ENDPOINT, FOUNDRY_MAIN_MODEL and FOUNDRY_LIGHT_MODEL. It prints
every agent step as it happens, then the explanation's source and status: "model" / "ready"
means the Explainer's paragraphs came from the Foundry deployment, "evidence-only" / "pending"
means the cited template was kept.
"""

import argparse
import asyncio
import json
import logging
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
    ap.add_argument("--timeout", type=float, default=15, help="per-agent timeout in seconds")
    ap.add_argument("--output", type=Path, default=Path("live_explanation.json"))
    args = ap.parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    evidence = load_evidence(args.evidence)

    provider = credential = None
    if not args.local:
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
