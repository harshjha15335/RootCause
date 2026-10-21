"""Invented clubs, squads, formations and tactical settings. All names are fictional."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from engine.models import PlayerMeta, Team, TeamMeta

# Formation slots in a team's own frame: (depth u, width v), u = 0 own goal, v = 0 right flank.
# Slot k is shirt number k + 1. Slots 1-4 are always the back four (see pitch.DEFENDERS).
FORMATIONS: dict[str, list[tuple[str, float, float]]] = {
    "4-3-3": [
        ("GK", 0.03, 0.50),
        ("RB", 0.22, 0.12),
        ("LB", 0.22, 0.88),
        ("RCB", 0.18, 0.37),
        ("LCB", 0.18, 0.63),
        ("DM", 0.35, 0.50),
        ("RW", 0.68, 0.15),
        ("RCM", 0.48, 0.32),
        ("ST", 0.75, 0.50),
        ("LCM", 0.48, 0.68),
        ("LW", 0.68, 0.85),
    ],
    "4-4-2": [
        ("GK", 0.03, 0.50),
        ("RB", 0.22, 0.12),
        ("LB", 0.22, 0.88),
        ("RCB", 0.18, 0.37),
        ("LCB", 0.18, 0.63),
        ("RCM", 0.42, 0.38),
        ("RM", 0.50, 0.12),
        ("LCM", 0.42, 0.62),
        ("ST", 0.72, 0.42),
        ("ST2", 0.72, 0.58),
        ("LM", 0.50, 0.88),
    ],
}


@dataclass(frozen=True)
class Tactics:
    pressers: int  # how many players close down the ball (1 or 2)
    press_radius_m: float  # pressers only go if the ball is this close
    line_height: float  # highest the defensive line sits (fraction of pitch from own goal)
    directness: float  # 0 = patient, 1 = direct (rewards forward passes)
    risk: float  # 0..1, more carries and shots from range


@dataclass(frozen=True)
class Club:
    name: str
    short_name: str
    kit_primary: str
    kit_secondary: str
    formation: str
    tactics: Tactics
    squad: tuple[str, ...]  # 11 starters, index k = shirt k + 1

    def slots(self) -> np.ndarray:
        return np.array([(u, v) for _, u, v in FORMATIONS[self.formation]])

    def meta(self, code: Team) -> TeamMeta:
        prefix = "H" if code == "HOME" else "A"
        return TeamMeta(
            code=code,
            name=self.name,
            short_name=self.short_name,
            kit_primary=self.kit_primary,
            kit_secondary=self.kit_secondary,
            formation=self.formation,
            players=[
                PlayerMeta(
                    id=f"{prefix}{k + 1}",
                    name=name,
                    number=k + 1,
                    position=FORMATIONS[self.formation][k][0],
                )
                for k, name in enumerate(self.squad)
            ],
        )


HARBOUR_TOWN = Club(
    name="Harbour Town FC",
    short_name="HTN",
    kit_primary="#1F4E8C",
    kit_secondary="#F2C14E",
    formation="4-3-3",
    tactics=Tactics(pressers=2, press_radius_m=18.0, line_height=0.42, directness=0.35, risk=0.4),
    squad=(
        "Ode Marrin",
        "Kasio Brell",
        "Tam Velloway",
        "Rui Ostrander",
        "Femi Calloway",
        "Jory Penhallow",
        "Nilo Ardenne",
        "Sami Quellan",
        "Bram Tovick",
        "Elio Fenwhistle",
        "Dario Kestrel",
    ),
)

NORTHGATE_ROVERS = Club(
    name="Northgate Rovers",
    short_name="NGR",
    kit_primary="#B23A3A",
    kit_secondary="#FFFFFF",
    formation="4-4-2",
    tactics=Tactics(pressers=1, press_radius_m=12.0, line_height=0.32, directness=0.7, risk=0.55),
    squad=(
        "Pell Hartigan",
        "Oran Tsvelko",
        "Mika Dunleavy",
        "Ivo Brannoch",
        "Lucan Weyre",
        "Teodor Ashgrove",
        "Remy Calderwick",
        "Hollis Vane",
        "Kofi Strand",
        "Aldo Merriweather",
        "Jesper Holloran",
    ),
)

DEFAULT_HOME = HARBOUR_TOWN
DEFAULT_AWAY = NORTHGATE_ROVERS
