from agents.providers import Provider
from agents.tools import check_claim
from api.contracts import Evidence, JudgeDecision, Testimony


def decisions(evidence: Evidence, testimonies: list[Testimony]):
    claims = [c for t in testimonies for c in t.claims]
    return (
        [c for c in claims if check_claim(c, evidence)],
        [c for c in claims if not check_claim(c, evidence)],
    )


async def judge(provider: Provider, evidence: Evidence, testimonies: list[Testimony]):
    def get_evidence() -> dict:
        """Read the full engine evidence package; attribution is immutable."""
        return evidence.model_dump()

    def validate_claim(claim_json: str) -> bool:
        """Check the exact structured claim against the evidence package."""
        from api.contracts import Claim

        return check_claim(Claim.model_validate_json(claim_json), evidence)

    result = await provider.generate(
        "judge",
        {
            "testimonies": [t.model_dump() for t in testimonies],
        },
        JudgeDecision,
        tools=[get_evidence, validate_claim],
    )
    accepted, rejected = decisions(evidence, testimonies)
    root = (
        evidence.root_cause_evidence_id
        or min(evidence.links, key=lambda x: (-x.blame_percent, x.evidence_id)).evidence_id
    )
    if (
        set(result.accepted_evidence_ids) != {c.evidence_id for c in accepted}
        or set(result.rejected_evidence_ids) != {c.evidence_id for c in rejected}
        or result.root_cause_evidence_id != root
    ):
        raise ValueError("Judge decision contradicts verified evidence")
    return result
