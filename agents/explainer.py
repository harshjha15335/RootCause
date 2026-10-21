from agents.grounding import root_sentence, sentence_supported
from agents.providers import Provider
from agents.tools import EvidenceTools
from api.contracts import Evidence, ExplainerOutput


async def explain(provider: Provider, evidence: Evidence) -> ExplainerOutput:
    tools = EvidenceTools(evidence)
    output = await provider.generate(
        "explainer",
        {"goal_id": evidence.goal_id},
        ExplainerOutput,
        tools=[tools.get_evidence, tools.get_link],
    )
    if len(output.paragraphs) != len(evidence.links) or {
        p.evidence_id for p in output.paragraphs
    } != {link.evidence_id for link in evidence.links}:
        raise ValueError("Explainer must explain every link exactly once")
    for paragraph in output.paragraphs:
        if any(
            s.evidence_ids != [paragraph.evidence_id] or not sentence_supported(s, evidence)
            for s in paragraph.sentences
        ):
            raise ValueError("Explainer returned unsupported prose or a wrong citation")
    if root_sentence(evidence) not in output.root_summary or any(
        s.evidence_ids != [evidence.root_cause_evidence_id] or not sentence_supported(s, evidence)
        for s in output.root_summary
    ):
        raise ValueError("Explainer summary does not name the Debugger's root cause")
    return output
