from agents.providers import Provider
from api.contracts import CitedSentence, PersonaPlan


def render_mode(
    story: list[CitedSentence], mode: str, detail: str = "brief"
) -> list[CitedSentence]:
    kinds = {"root", "description", "attribution"} if mode == "fan" else {"root", "description"}
    if mode == "analyst" or detail == "detailed":
        kinds.add("counterfactual")
        kinds.add("attribution")
    return [sentence.model_copy(deep=True) for sentence in story if sentence.kind in kinds]


async def persona(provider: Provider, mode: str, story: list[CitedSentence]):
    plan = await provider.generate(
        "persona",
        {
            "mode": mode,
            "sentences": [sentence.model_dump() for sentence in story],
        },
        PersonaPlan,
        light=True,
    )
    if plan.style != mode:
        raise ValueError("Persona returned a different viewer mode")
    return render_mode(story, mode, plan.detail)
