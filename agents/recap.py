from agents.providers import Provider
from api.contracts import Evidence, StoryPlan


async def recap(provider: Provider, evidence: Evidence):
    def get_verdicts(match_id: str) -> list[dict]:
        """Read this goal's checked evidence for the current match recap."""
        if match_id != evidence.match_id:
            return []
        return [{"goal_id": evidence.goal_id, "links": [x.model_dump() for x in evidence.links]}]

    def get_patterns(match_id: str) -> dict:
        """Read observed bug counts, never speculative causes."""
        from collections import Counter

        if match_id != evidence.match_id:
            return {}
        return dict(Counter(x.bug_type for x in evidence.links))

    plan = await provider.generate(
        "recap", {"match_id": evidence.match_id}, StoryPlan, tools=[get_verdicts, get_patterns]
    )
    if len(plan.evidence_ids) != len(evidence.links) or set(plan.evidence_ids) != {
        x.evidence_id for x in evidence.links
    }:
        raise ValueError("Recap must reference every known link exactly once")
    return plan


async def match_report(provider: Provider, match_id: str, verdicts: list[dict], patterns: dict):
    from api.contracts import ReportPlan

    def get_verdicts(requested_match_id: str) -> list[dict]:
        """Read checked verdicts belonging to this match only."""
        return verdicts if requested_match_id == match_id else []

    def get_patterns(requested_match_id: str) -> dict:
        """Read the observed frequencies of bug types from checked verdicts."""
        return patterns if requested_match_id == match_id else {}

    result = await provider.generate(
        "report", {"match_id": match_id}, ReportPlan, tools=[get_verdicts, get_patterns]
    )
    if (
        len(result.goal_ids) != len(verdicts)
        or set(result.goal_ids) != {x["goal_id"] for x in verdicts}
        or len(result.top_causes) != len(patterns)
        or set(result.top_causes) != set(patterns)
    ):
        raise ValueError("Report plan introduced or omitted match facts")
    return result
