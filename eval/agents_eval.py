"""Evaluate actual explanation sentences, citations and root wording; never score only claims."""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agents.grounding import iter_sentences, root_sentence, sentence_supported
from agents.orchestrator import run
from api.contracts import Evidence


def sentence_rows(explanation, evidence):
    links = {link.evidence_id: link for link in evidence.links}
    rows = []
    for sentence in iter_sentences(explanation):
        known = bool(sentence.evidence_ids) and all(eid in links for eid in sentence.evidence_ids)
        context = json.dumps(
            {
                "root_cause_evidence_id": evidence.root_cause_evidence_id,
                "link_ranks": {
                    link.evidence_id: rank for rank, link in enumerate(evidence.links, 1)
                },
                "links": [links[eid].model_dump() for eid in sentence.evidence_ids if eid in links],
            }
        )
        rows.append(
            {
                "goal_id": evidence.goal_id,
                "evidence_ids": sentence.evidence_ids,
                "query": "Explain only the cited Debugger facts. The first ranked link is the root cause.",
                "response": sentence.text,
                "context": context,
                "supported": known and sentence_supported(sentence, evidence),
                "withheld": sentence.kind == "neutral",
            }
        )
    return rows


async def evaluate_cases(cases, provider=None):
    rows = []
    generated = []

    async def emit(kind, payload):
        pass

    for case in cases:
        evidence = Evidence.model_validate(case["evidence"])
        explanation = await run(evidence, emit, provider=provider)
        sentences = sentence_rows(explanation, evidence)
        generated.extend(sentences)
        root_named = root_sentence(evidence) in explanation.root_summary
        rows.append(
            {
                "goal_id": evidence.goal_id,
                "source": evidence.source,
                "status": explanation.status,
                "explanation_source": explanation.source,
                "root_wording_correct": root_named
                and explanation.root_cause_evidence_id == evidence.links[0].evidence_id,
                "sentences": len(sentences),
                "supported_sentences": sum(x["supported"] for x in sentences),
                "withheld_sentences": sum(x["withheld"] for x in sentences),
                "latency_ms": explanation.latency_ms,
            }
        )
    real = [row for row in rows if row["source"] == "debugger"]
    count = sum(row["sentences"] for row in rows)
    return {
        "cases": len(rows),
        "fixture_cases": sum(row["source"] == "synthetic-fixture" for row in rows),
        "engine_cases": len(real),
        "root_wording_accuracy": sum(row["root_wording_correct"] for row in real) / len(real)
        if real
        else None,
        "sentence_groundedness": sum(row["supported_sentences"] for row in rows) / count
        if count
        else None,
        "pending_cases": sum(row["status"] == "pending" for row in rows),
        "rows": rows,
        "sentence_evaluations": generated,
    }


def foundry_groundedness(data, endpoint, deployment):
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
        azure_ai_project=os.environ["FOUNDRY_PROJECT_ENDPOINT"],
        fail_on_evaluator_errors=True,
    )


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path, help="JSONL containing evidence packages")
    parser.add_argument("--output", type=Path, default=Path("agents.evaluation.json"))
    parser.add_argument(
        "--foundry",
        action="store_true",
        help="Run live agents and Foundry groundedness on every emitted sentence",
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
        if not settings.foundry_endpoint or not os.getenv("EVALUATION_MODEL_ENDPOINT"):
            raise SystemExit("FOUNDRY_PROJECT_ENDPOINT and EVALUATION_MODEL_ENDPOINT are required")
        credential = DefaultAzureCredential()
        provider = FoundryProvider(settings, credential)
    try:
        report = await evaluate_cases(cases, provider)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        # Data for Foundry is generated from the actual displayed paragraphs, captions and recaps.
        sentences = args.output.with_suffix(".sentences.jsonl")
        sentences.write_text(
            "".join(
                json.dumps({k: row[k] for k in ("query", "response", "context")}) + "\n"
                for row in report["sentence_evaluations"]
            )
        )
        if args.foundry:
            result = await asyncio.to_thread(
                foundry_groundedness,
                sentences,
                os.environ["EVALUATION_MODEL_ENDPOINT"],
                os.getenv("FOUNDRY_MAIN_MODEL", "main"),
            )
            report["foundry_metrics"] = result.get("metrics", {})
            args.output.write_text(json.dumps(report, indent=2, default=str) + "\n")
        print(
            json.dumps(
                {k: v for k, v in report.items() if k not in {"rows", "sentence_evaluations"}},
                indent=2,
            )
        )
        if report["sentence_groundedness"] != 1 or any(
            not row["root_wording_correct"] for row in report["rows"]
        ):
            raise SystemExit(1)
    finally:
        if provider:
            await provider.close()
        if credential:
            await credential.close()


if __name__ == "__main__":
    asyncio.run(main())
