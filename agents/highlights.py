from agents.grounding import fact_sentences
from agents.providers import Provider
from agents.tools import EvidenceTools
from api.contracts import Evidence, Highlight, HighlightsPlan


def render_highlights(plan: HighlightsPlan, evidence: Evidence) -> list[Highlight]:
    links = {x.evidence_id: x for x in evidence.links}
    ids = [clip.evidence_id for clip in plan.clips]
    if len(set(ids)) != len(ids) or evidence.root_cause_evidence_id not in ids:
        raise ValueError("Highlights must include the root cause and cannot duplicate clips")
    result = []
    for clip in plan.clips:
        link = links.get(clip.evidence_id)
        if (
            link is None
            or not 0 <= clip.start_second <= link.second <= clip.end_second <= evidence.goal.second
        ):
            raise ValueError("Clip must cover its actual evidence moment within this possession")
        result.append(Highlight(**clip.model_dump(), caption=fact_sentences(link)[0]))
    return result


async def highlights(provider: Provider, evidence: Evidence):
    tools = EvidenceTools(evidence)
    plan = await provider.generate(
        "highlights",
        {"goal_id": evidence.goal_id},
        HighlightsPlan,
        tools=[tools.get_evidence, tools.get_events],
    )
    return render_highlights(plan, evidence)
