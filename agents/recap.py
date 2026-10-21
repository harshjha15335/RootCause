from collections import Counter

from agents.providers import Provider
from api.contracts import Evidence, Highlight, LinkExplanation, ReportPlan, StoryPlan


async def recap(
    provider: Provider,
    evidence: Evidence,
    paragraphs: list[LinkExplanation],
    highlights: list[Highlight],
):
    def get_explanations(match_id: str) -> list[dict]:
        """Read this match's current checked explanation and highlight handoff."""
        if match_id != evidence.match_id:
            return []
        return [
            {
                "goal_id": evidence.goal_id,
                "root_cause_evidence_id": evidence.root_cause_evidence_id,
                "paragraphs": [p.model_dump() for p in paragraphs],
                "highlights": [h.model_dump() for h in highlights],
            }
        ]

    def get_patterns(match_id: str) -> dict:
        """Read observed bug counts for this evidence package."""
        return (
            dict(Counter(x.bug_type for x in evidence.links))
            if match_id == evidence.match_id
            else {}
        )

    plan = await provider.generate(
        "recap", {"match_id": evidence.match_id}, StoryPlan, tools=[get_explanations, get_patterns]
    )
    if len(plan.evidence_ids) != len(evidence.links) or set(plan.evidence_ids) != {
        x.evidence_id for x in evidence.links
    }:
        raise ValueError("Recap must cover every causal link exactly once")
    return plan.evidence_ids


async def match_report(provider: Provider, match_id: str, explanations: list[dict], patterns: dict):
    def get_explanations(requested_match_id: str) -> list[dict]:
        """Read stored explanations for this match only."""
        return explanations if requested_match_id == match_id else []

    def get_patterns(requested_match_id: str) -> dict:
        """Read observed bug frequencies from this match's checked traces."""
        return patterns if requested_match_id == match_id else {}

    result = await provider.generate(
        "report", {"match_id": match_id}, ReportPlan, tools=[get_explanations, get_patterns]
    )
    if (
        len(result.goal_ids) != len(explanations)
        or set(result.goal_ids) != {x["goal_id"] for x in explanations}
        or result.top_causes != sorted(patterns, key=lambda key: (-patterns[key], key))
    ):
        raise ValueError("Report introduced facts or contradicted observed cause frequencies")
    return result
