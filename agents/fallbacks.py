from agents.grounding import paragraphs, root_sentence
from agents.highlights import render_highlights
from agents.persona import render_mode
from api.contracts import ClipPlan, Evidence, Explanation, HighlightsPlan


def fallback_highlights(evidence: Evidence):
    return render_highlights(
        HighlightsPlan(
            clips=[
                ClipPlan(
                    evidence_id=link.evidence_id,
                    start_second=link.second,
                    end_second=link.second,
                )
                for link in evidence.links
            ]
        ),
        evidence,
    )


def template_explanation(evidence: Evidence, warnings: list[str] | None = None) -> Explanation:
    body = paragraphs(evidence, [x.evidence_id for x in evidence.links])
    root = [root_sentence(evidence)]
    story = root + [s for paragraph in body for s in paragraph.sentences]
    return Explanation(
        goal_id=evidence.goal_id,
        match_id=evidence.match_id,
        source="evidence-only",
        status="pending",
        root_cause_evidence_id=evidence.links[0].evidence_id,
        paragraphs=body,
        root_summary=root,
        highlights=fallback_highlights(evidence),
        recaps={mode: render_mode(story, mode) for mode in ("fan", "analyst", "studio")},
        blame_order=evidence.links,
        warnings=warnings or [],
    )
