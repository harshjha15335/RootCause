from api.contracts import Claim, Evidence, Link, View


class PlayerTools:
    """Each instance exposes only the bound player's evidence and observations."""

    def __init__(self, evidence: Evidence, player_id: str):
        self.__links = [x.model_copy(deep=True) for x in evidence.links if x.player_id == player_id]
        self.__views = [x.model_copy(deep=True) for x in evidence.views if x.player_id == player_id]

    def my_link(self) -> list[Link]:
        return [x.model_copy(deep=True) for x in self.__links]

    def my_view(self, second: int) -> list[View]:
        return [x.model_copy(deep=True) for x in self.__views if x.second == second]


def check_claim(claim: Claim, evidence: Evidence) -> bool:
    """Strict structured fact check; free-form semantic judgments are not implemented."""
    return any(
        claim.evidence_id == link.evidence_id
        and claim.player_id == link.player_id
        and claim.description == link.description
        and claim.blame_percent == link.blame_percent
        for link in evidence.links
    )
