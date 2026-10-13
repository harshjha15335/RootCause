from agents.providers import Provider
from agents.tools import PlayerTools
from api.contracts import Claim, Evidence, Testimony


def fallback_testimony(player_id: str, tools: PlayerTools) -> Testimony:
    claims = [
        Claim(
            **link.model_dump(include={"evidence_id", "player_id", "description", "blame_percent"})
        )
        for link in tools.my_link()
    ]
    return Testimony(player_id=player_id, source="evidence-only", claims=claims)


def player_factory(provider: Provider, evidence: Evidence):
    async def player(player_id: str, tools: PlayerTools, rejected=None):
        def my_link() -> list[dict]:
            """Read only this player's causal links. Copy exact facts into claims."""
            return [x.model_dump() for x in tools.my_link()]

        def my_view(second: int) -> list[dict]:
            """Read only this player's observations at the given second."""
            return [x.model_dump() for x in tools.my_view(second)]

        result = await provider.generate(
            "player",
            {
                "player_id": player_id,
                "rebuttal": bool(rejected),
                "rejected_evidence_ids": rejected or [],
                "instruction": "Read my_link and my_view. Return only exactly copied evidence claims.",
            },
            Testimony,
            tools=[my_link, my_view],
        )
        return result.model_copy(
            update={"source": "model", "rebuttal": bool(rejected), "statement": ""}
        )

    return player
