from agents.grounding import fact_sentences, root_sentence
from api.contracts import Evidence


class EvidenceTools:
    """Bound, copied evidence only. No access to a raw match store or another goal."""

    def __init__(self, evidence: Evidence):
        self.__evidence = evidence.model_copy(deep=True)

    def get_evidence(self, goal_id: str) -> dict:
        """Read this goal's Debugger evidence package and immutable attribution."""
        if goal_id != self.__evidence.goal_id:
            raise ValueError("Goal is outside this tool's evidence scope")
        return {
            **self.__evidence.model_dump(),
            "root_summary": [root_sentence(self.__evidence).model_dump()],
        }

    def get_link(self, rank: int) -> dict:
        """Read one causal link by one-based Debugger rank (largest drop first)."""
        if not 1 <= rank <= len(self.__evidence.links):
            raise ValueError("Link rank is outside the evidence package")
        link = self.__evidence.links[rank - 1]
        return {**link.model_dump(), "sentences": [s.model_dump() for s in fact_sentences(link)]}

    def get_events(self, from_second: int, to_second: int) -> list[dict]:
        """Read only evidence-supplied events in the inclusive time window."""
        if from_second < 0 or to_second < from_second or to_second > self.__evidence.goal.second:
            raise ValueError("Event interval is outside this goal's evidence window")
        return [
            e.model_dump() for e in self.__evidence.events if from_second <= e.second <= to_second
        ]
