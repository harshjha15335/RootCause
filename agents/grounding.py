"""Audited evidence-to-sentence rendering and validation of every displayed sentence."""

import re

from api.contracts import CitedSentence, Evidence, Explanation, Link, LinkExplanation

NEUTRAL = "Explanation text is withheld; review the structured trace."


def fact_sentences(link: Link) -> list[CitedSentence]:
    # Split source descriptions so each individual sentence receives its own citation.
    descriptions = re.split(r"(?<=[.!?])\s+", link.description.strip())
    rows = [
        CitedSentence(
            text=f"{link.player_id}: {text}", evidence_ids=[link.evidence_id], kind="description"
        )
        for text in descriptions
    ]
    rows += [
        CitedSentence(
            text=f"The engine attributes {link.blame_percent:g}% of the blame to {link.player_id}.",
            evidence_ids=[link.evidence_id],
            kind="attribution",
        ),
        CitedSentence(
            text=f"Fixing this mistake changed goals from {link.baseline_goals}/{link.trials} "
            f"to {link.fixed_goals}/{link.trials} in the supplied replays.",
            evidence_ids=[link.evidence_id],
            kind="counterfactual",
        ),
    ]
    return rows


def root_sentence(evidence: Evidence) -> CitedSentence:
    root = evidence.links[0]
    return CitedSentence(
        text=f"The root cause is the mistake by {root.player_id}, "
        "ranked first by the Debugger's measured goal-rate reduction.",
        evidence_ids=[root.evidence_id],
        kind="root",
    )


def paragraphs(evidence: Evidence, ids: list[str]) -> list[LinkExplanation]:
    links = {link.evidence_id: link for link in evidence.links}
    if len(ids) != len(links) or set(ids) != set(links):
        raise ValueError("Explanation must cover every causal link exactly once")
    return [LinkExplanation(evidence_id=eid, sentences=fact_sentences(links[eid])) for eid in ids]


def iter_sentences(explanation: Explanation):
    yield from explanation.root_summary
    for paragraph in explanation.paragraphs:
        yield from paragraph.sentences
    for highlight in explanation.highlights:
        yield highlight.caption
    for recap in explanation.recaps.values():
        yield from recap


def sentence_supported(sentence: CitedSentence, evidence: Evidence) -> bool:
    # Checking prose as well as citations prevents a correct ID from laundering invented facts.
    allowed = [root_sentence(evidence)]
    for link in evidence.links:
        allowed.extend(fact_sentences(link))
    return any(sentence == fact for fact in allowed)


def validate_explanation(explanation: Explanation, evidence: Evidence):
    if explanation.goal_id != evidence.goal_id or explanation.match_id != evidence.match_id:
        raise ValueError("Explanation belongs to another goal")
    if explanation.root_cause_evidence_id != evidence.root_cause_evidence_id:
        raise ValueError("Explanation changed the Debugger's root cause")
    if explanation.blame_order != evidence.links:
        raise ValueError("Explanation changed engine attribution")
    if len(explanation.paragraphs) != len(evidence.links) or {
        p.evidence_id for p in explanation.paragraphs
    } != {x.evidence_id for x in evidence.links}:
        raise ValueError("Missing causal link paragraph")
    if any(
        sentence.evidence_ids != [paragraph.evidence_id]
        for paragraph in explanation.paragraphs
        for sentence in paragraph.sentences
    ):
        raise ValueError("Paragraph cites a different causal link")
    links = {link.evidence_id: link for link in evidence.links}
    for clip in explanation.highlights:
        link = links.get(clip.evidence_id)
        if (
            link is None
            or not clip.start_second <= link.second <= clip.end_second <= evidence.goal.second
            or clip.caption.evidence_ids != [clip.evidence_id]
        ):
            raise ValueError("Highlight is not bound to its actual evidence moment")
    if not all(sentence_supported(s, evidence) for s in iter_sentences(explanation)):
        raise ValueError("Unsupported explanation sentence or citation")
    if root_sentence(evidence) not in explanation.root_summary:
        raise ValueError("Root cause wording does not identify the Debugger's first link")
    if set(explanation.recaps) != {"fan", "analyst", "studio"}:
        raise ValueError("All three viewer modes are required")
