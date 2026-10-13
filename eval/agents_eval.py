"""Evaluate real engine datasets; fixtures are reported separately from engine accuracy."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agents.orchestrator import run
from agents.tools import check_claim
from api.contracts import Evidence


async def evaluate_cases(cases, provider=None):
    rows = []

    async def emit(kind, payload):
        pass

    for case in cases:
        evidence = Evidence.model_validate(case["evidence"])
        expected = case.get("ground_truth_evidence_id")
        if expected is not None and expected not in {x.evidence_id for x in evidence.links}:
            raise ValueError("Ground truth must reference an evidence link")
        verdict = await run(evidence, emit, provider=provider)
        grounded = sum(check_claim(claim, evidence) for claim in verdict.accepted_claims)
        rows.append(
            {
                "goal_id": evidence.goal_id,
                "source": evidence.source,
                "root_correct": verdict.root_cause_evidence_id == expected if expected else None,
                "accepted_claims": len(verdict.accepted_claims),
                "grounded_claims": grounded,
                "latency_ms": verdict.latency_ms,
                "verdict_source": verdict.source,
            }
        )
    real = [x for x in rows if x["source"] == "debugger" and x["root_correct"] is not None]
    claim_count = sum(x["accepted_claims"] for x in rows)
    return {
        "cases": len(rows),
        "fixture_cases": sum(x["source"] == "synthetic-fixture" for x in rows),
        "engine_ground_truth_cases": len(real),
        "judge_accuracy": sum(x["root_correct"] for x in real) / len(real) if real else None,
        "structured_claim_groundedness": sum(x["grounded_claims"] for x in rows) / claim_count
        if claim_count
        else None,
        "rows": rows,
    }


def foundry_groundedness(data, endpoint, deployment):
    """Optional SDK evaluation uploads run results to the configured Foundry project."""
    from azure.ai.evaluation import GroundednessEvaluator, evaluate
    from azure.identity import DefaultAzureCredential

    evaluator = GroundednessEvaluator(
        model_config={
            "azure_endpoint": endpoint,
            "azure_deployment": deployment,
            "api_version": "2024-10-21",
        },
        credential=DefaultAzureCredential(),
    )
    return evaluate(
        data=str(data),
        evaluators={"groundedness": evaluator},
        azure_ai_project=__import__("os").environ["FOUNDRY_PROJECT_ENDPOINT"],
    )


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "dataset", type=Path, help="JSONL rows: evidence + optional ground_truth_evidence_id"
    )
    parser.add_argument("--output", type=Path, default=Path("agents.evaluation.json"))
    parser.add_argument("--foundry", action="store_true", help="Run actual Foundry agents")
    parser.add_argument(
        "--groundedness-data",
        type=Path,
        help="Optional Foundry evaluator JSONL with response/context",
    )
    args = parser.parse_args()
    cases = [json.loads(line) for line in args.dataset.read_text().splitlines() if line.strip()]
    if not cases:
        raise SystemExit("Dataset contains zero cases")
    provider = credential = None
    if args.foundry:
        from azure.identity.aio import DefaultAzureCredential

        from agents.providers import FoundryProvider
        from api.settings import Settings

        settings = Settings.from_env()
        if not settings.foundry_endpoint:
            raise SystemExit("FOUNDRY_PROJECT_ENDPOINT is required")
        credential = DefaultAzureCredential()
        provider = FoundryProvider(settings, credential)
    try:
        report = await evaluate_cases(cases, provider)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({k: v for k, v in report.items() if k != "rows"}, indent=2))
    finally:
        if provider:
            await provider.close()
        if credential:
            await credential.close()
    if args.groundedness_data:
        import os

        foundry_groundedness(
            args.groundedness_data,
            os.environ["EVALUATION_MODEL_ENDPOINT"],
            os.environ.get("FOUNDRY_MAIN_MODEL", "main"),
        )
    if any(x["root_correct"] is False for x in report["rows"]):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
