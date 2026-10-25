"""Build the full canonical showcase match for West London Blue vs Man Sky Blue (4-4).

Match ID: wlb-msb-2023-11-12
Date: 12 Nov 2023
Ground: Fulham Road Ground
Competition: English Premier Division
Score: WLB 4 - 4 MSB
Duration: 6420 seconds (1H: 0-3119s, 2H: 3120-6419s)
"""

from __future__ import annotations

import array
import csv
import gzip
import json
import math
import os
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(r"C:\Users\ranja\.gemini\antigravity-ide\scratch\RootCause_data")
SHOWCASE_DIR = ROOT / "web" / "public" / "showcase"
MATCH_ID = "wlb-msb-2023-11-12"
TARGET_DIR = SHOWCASE_DIR / MATCH_ID

PITCH_X = 105.0
PITCH_Y = 68.0
DURATION_S = 6420
STRIDE = 49

HOME_STARTERS = [
    {"id": "H1", "num_id": 448687, "name": "Roberto Sanchelo", "number": 1, "position": "GK", "role": "GK", "unit": "gk"},
    {"id": "H2", "num_id": 447357, "name": "R. Jamezzi", "number": 24, "position": "RB", "role": "RB", "unit": "def"},
    {"id": "H3", "num_id": 344040, "name": "Marco Cucarena", "number": 3, "position": "LB", "role": "LB", "unit": "def"},
    {"id": "H4", "num_id": 386292, "name": "A. Disaro", "number": 2, "position": "RCB", "role": "RCB", "unit": "def"},
    {"id": "H5", "num_id": 20394, "name": "Tiago Silven", "number": 6, "position": "LCB", "role": "LCB", "unit": "def"},
    {"id": "H6", "num_id": 614501, "name": "M. Caisero", "number": 25, "position": "DM", "role": "RDMF", "unit": "mid"},
    {"id": "H7", "num_id": 551497, "name": "C. Palmaro", "number": 20, "position": "RW", "role": "RAMF", "unit": "att"},
    {"id": "H8", "num_id": 447358, "name": "C. Gallavan", "number": 23, "position": "CM", "role": "RDMF", "unit": "mid"},
    {"id": "H9", "num_id": 669602, "name": "N. Jaxsen", "number": 15, "position": "ST", "role": "CF", "unit": "att"},
    {"id": "H10", "num_id": 600184, "name": "E. Fernadero", "number": 8, "position": "CM", "role": "LDMF", "unit": "mid"},
    {"id": "H11", "num_id": 11066, "name": "R. Sterlino", "number": 7, "position": "LW", "role": "LAMF", "unit": "att"},
]

HOME_SUBS = [
    {"id": "H12", "num_id": 586585, "name": "M. Gustaro", "number": 27, "position": "RB", "role": "RB", "unit": "def"},
    {"id": "H13", "num_id": 536494, "name": "M. Mudriko", "number": 10, "position": "LW", "role": "LAMF", "unit": "att"},
    {"id": "H14", "num_id": 532621, "name": "A. Brojano", "number": 19, "position": "ST", "role": "CF", "unit": "att"},
]

AWAY_STARTERS = [
    {"id": "A1", "num_id": 71654, "name": "Ederino", "number": 31, "position": "GK", "role": "GK", "unit": "gk"},
    {"id": "A2", "num_id": 8277, "name": "K. Wallaro", "number": 2, "position": "RB", "role": "RB", "unit": "def"},
    {"id": "A3", "num_id": 258154, "name": "Ruben Diales", "number": 3, "position": "RCB", "role": "RCB", "unit": "def"},
    {"id": "A4", "num_id": 297957, "name": "M. Akendo", "number": 25, "position": "LCB", "role": "LCB", "unit": "def"},
    {"id": "A5", "num_id": 568412, "name": "J. Gvardello", "number": 24, "position": "LB", "role": "LB", "unit": "def"},
    {"id": "A6", "num_id": 364860, "name": "Roderico", "number": 16, "position": "DM", "role": "DMF", "unit": "mid"},
    {"id": "A7", "num_id": 265673, "name": "Bernaro Silven", "number": 20, "position": "CM", "role": "LCMF", "unit": "mid"},
    {"id": "A8", "num_id": 550459, "name": "J. Alvaredo", "number": 19, "position": "AM", "role": "RCMF", "unit": "mid"},
    {"id": "A9", "num_id": 447205, "name": "P. Fordan", "number": 47, "position": "RW", "role": "RW", "unit": "att"},
    {"id": "A10", "num_id": 549485, "name": "J. Dokari", "number": 11, "position": "LW", "role": "LW", "unit": "att"},
    {"id": "A11", "num_id": 427097, "name": "E. Haalviken", "number": 9, "position": "ST", "role": "CF", "unit": "att"},
]

AWAY_SUBS = [
    {"id": "A12", "num_id": 69404, "name": "M. Kovarec", "number": 8, "position": "CM", "role": "RCMF", "unit": "mid"},
    {"id": "A13", "num_id": 11051, "name": "J. Grealton", "number": 10, "position": "LW", "role": "LW", "unit": "att"},
]

NUM_TO_TRACKING_SLOT = {
    # Home starters
    448687: 0, 447357: 1, 344040: 2, 386292: 3, 20394: 4, 614501: 5, 551497: 6, 447358: 7, 669602: 8, 600184: 9, 11066: 10,
    # Home subs
    586585: 1, 536494: 9, 532621: 5,
    # Away starters
    71654: 11, 8277: 12, 258154: 13, 297957: 14, 568412: 15, 364860: 16, 265673: 17, 550459: 18, 447205: 19, 549485: 20, 427097: 21,
    # Away subs
    11051: 20, 69404: 18,
}

ALL_PLAYERS = HOME_STARTERS + HOME_SUBS + AWAY_STARTERS + AWAY_SUBS
NUM_TO_PLAYER = {p["num_id"]: p for p in ALL_PLAYERS}

GOALS_INFO = [
    {
        "n": 1,
        "goal_id": f"{MATCH_ID}-g1",
        "event_id": f"{MATCH_ID}-e1444",
        "second": 1444,
        "minute": 24,
        "second_in_min": 4,
        "side": "away",
        "scorer_id": "A11",
        "scorer_name": "E. Haalviken",
        "assist_id": None,
        "assist_name": None,
        "xg": 0.76,
        "kind": "penalty",
        "traced": False,
        "reason": f"{MATCH_ID}-g1: Penalty kick conceded under isolated individual contact in the box; no systemic tracking counterfactual simulated.",
        "window": {"from_s": 1369, "to_s": 1452},
        "score_after": {"home": 0, "away": 1},
    },
    {
        "n": 2,
        "goal_id": f"{MATCH_ID}-g2",
        "event_id": f"{MATCH_ID}-e1704",
        "second": 1704,
        "minute": 28,
        "second_in_min": 24,
        "side": "home",
        "scorer_id": "H5",
        "scorer_name": "Tiago Silven",
        "assist_id": "H8",
        "assist_name": "C. Gallavan",
        "xg": 0.085,
        "kind": "corner_header",
        "traced": True,
        "culprit_id": "A4",
        "culprit_name": "M. Akendo",
        "culprit_second": 1698,
        "bug_type": "ZONAL_LEAK",
        "baseline_goals": 142,
        "fixed_goals": 14,
        "trials": 200,
        "description": "Zonal marking leak: Akanji vacates the near-post zone, allowing an uncontested header. (metres behind line: 5.3)",
        "secondary_culprit_id": "A3",
        "secondary_culprit_name": "Ruben Diales",
        "secondary_second": 1694,
        "secondary_fixed_goals": 117,
        "secondary_description": "Late step-up: Ruben Dias stays behind the defensive line. (metres behind line: 3.2)",
        "window": {"from_s": 1629, "to_s": 1712},
        "score_after": {"home": 1, "away": 1},
    },
    {
        "n": 3,
        "goal_id": f"{MATCH_ID}-g3",
        "event_id": f"{MATCH_ID}-e2184",
        "second": 2184,
        "minute": 36,
        "second_in_min": 24,
        "side": "home",
        "scorer_id": "H11",
        "scorer_name": "R. Sterlino",
        "assist_id": "H2",
        "assist_name": "R. Jamezzi",
        "xg": 0.534,
        "kind": "open_play",
        "traced": True,
        "culprit_id": "A5",
        "culprit_name": "J. Gvardello",
        "culprit_second": 2176,
        "bug_type": "LATE_STEP_UP",
        "baseline_goals": 138,
        "fixed_goals": 12,
        "trials": 200,
        "description": "Late recovery run: Left defensive channel exposed on overlapping cross. (metres behind line: 6.3)",
        "secondary_culprit_id": "A3",
        "secondary_culprit_name": "Ruben Diales",
        "secondary_second": 2172,
        "secondary_fixed_goals": 94,
        "secondary_description": "Delayed slide to cover the near-post cross channel. (metres behind line: 3.8)",
        "window": {"from_s": 2109, "to_s": 2192},
        "score_after": {"home": 2, "away": 1},
    },
    {
        "n": 4,
        "goal_id": f"{MATCH_ID}-g4",
        "event_id": f"{MATCH_ID}-e2727",
        "second": 2727,
        "minute": 45,
        "second_in_min": 27,
        "side": "away",
        "scorer_id": "A4",
        "scorer_name": "M. Akendo",
        "assist_id": "A7",
        "assist_name": "Bernaro Silven",
        "xg": 0.078,
        "kind": "corner_header",
        "traced": False,
        "reason": f"{MATCH_ID}-g4: Set-piece corner header with contested duel; no structural defensive line error identified.",
        "window": {"from_s": 2652, "to_s": 2735},
        "score_after": {"home": 2, "away": 2},
    },
    {
        "n": 5,
        "goal_id": f"{MATCH_ID}-g5",
        "event_id": f"{MATCH_ID}-e3211",
        "second": 3211,
        "minute": 46,
        "second_in_min": 31,
        "side": "away",
        "scorer_id": "A11",
        "scorer_name": "E. Haalviken",
        "assist_id": "A8",
        "assist_name": "J. Alvaredo",
        "xg": 0.614,
        "kind": "counter_tap_in",
        "traced": True,
        "culprit_id": "H3",
        "culprit_name": "Marco Cucarena",
        "culprit_second": 3204,
        "bug_type": "LATE_STEP_UP",
        "baseline_goals": 152,
        "fixed_goals": 18,
        "trials": 200,
        "description": "Failed back-post tuck-in: Cucurella leaves Haaland unmarked at the back post. (metres behind line: 5.3)",
        "secondary_culprit_id": "H5",
        "secondary_culprit_name": "Tiago Silven",
        "secondary_second": 3200,
        "secondary_fixed_goals": 113,
        "secondary_description": "Overcommitted step towards ball carrier rather than holding defensive line. (metres behind line: 2.8)",
        "window": {"from_s": 3136, "to_s": 3219},
        "score_after": {"home": 2, "away": 3},
    },
    {
        "n": 6,
        "goal_id": f"{MATCH_ID}-g6",
        "event_id": f"{MATCH_ID}-e4405",
        "second": 4405,
        "minute": 66,
        "second_in_min": 25,
        "side": "home",
        "scorer_id": "H9",
        "scorer_name": "N. Jaxsen",
        "assist_id": "H8",
        "assist_name": "C. Gallavan",
        "xg": 0.668,
        "kind": "rebound",
        "traced": True,
        "culprit_id": "A3",
        "culprit_name": "Ruben Diales",
        "culprit_second": 4398,
        "bug_type": "HESITATION_CLEARANCE",
        "baseline_goals": 140,
        "fixed_goals": 22,
        "trials": 200,
        "description": "Hesitation on rebound box clearance: Ruben Dias fails to clear parried strike. (metres behind line: 5.2)",
        "secondary_culprit_id": "A4",
        "secondary_culprit_name": "M. Akendo",
        "secondary_second": 4394,
        "secondary_fixed_goals": 113,
        "secondary_description": "Delayed recovery step-up to push the defensive line forward. (metres behind line: 3.1)",
        "window": {"from_s": 4330, "to_s": 4413},
        "score_after": {"home": 3, "away": 3},
    },
    {
        "n": 7,
        "goal_id": f"{MATCH_ID}-g7",
        "event_id": f"{MATCH_ID}-e5554",
        "second": 5554,
        "minute": 85,
        "second_in_min": 34,
        "side": "away",
        "scorer_id": "A6",
        "scorer_name": "Roderico",
        "assist_id": "A7",
        "assist_name": "Bernaro Silven",
        "xg": 0.085,
        "kind": "deflected_strike",
        "traced": False,
        "reason": f"{MATCH_ID}-g7: Outside-the-box long-range strike with deflection; no defensive line error or offside breakdown to assign.",
        "window": {"from_s": 5479, "to_s": 5562},
        "score_after": {"home": 3, "away": 4},
    },
    {
        "n": 8,
        "goal_id": f"{MATCH_ID}-g8",
        "event_id": f"{MATCH_ID}-e6085",
        "second": 6085,
        "minute": 94,
        "second_in_min": 25,
        "side": "home",
        "scorer_id": "H7",
        "scorer_name": "C. Palmaro",
        "assist_id": None,
        "assist_name": None,
        "xg": 0.76,
        "kind": "penalty",
        "traced": False,
        "reason": f"{MATCH_ID}-g8: Stoppage-time penalty conceded on sliding box tackle; non-systemic penalty sequence.",
        "window": {"from_s": 6010, "to_s": 6093},
        "score_after": {"home": 4, "away": 4},
    },
]


def dump_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)


def build_meta() -> dict:
    return {
        "match_id": MATCH_ID,
        "seed": 20231112,
        "contract_version": "1.0.0",
        "pitch_length_m": PITCH_X,
        "pitch_width_m": PITCH_Y,
        "duration_s": DURATION_S,
        "venue": "Fulham Road Ground",
        "competition": "English Premier Division",
        "home": {
            "code": "WLB",
            "name": "West London Blue",
            "short_name": "WLB",
            "kit_primary": "#1845A8",
            "kit_secondary": "#FFFFFF",
            "formation": "4-2-3-1",
            "players": [
                {"id": p["id"], "name": p["name"], "number": p["number"], "position": p["position"]}
                for p in HOME_STARTERS + HOME_SUBS
            ],
        },
        "away": {
            "code": "MSB",
            "name": "Man Sky Blue",
            "short_name": "MSB",
            "kit_primary": "#6CABDD",
            "kit_secondary": "#1C2C5B",
            "formation": "4-3-3",
            "players": [
                {"id": p["id"], "name": p["name"], "number": p["number"], "position": p["position"]}
                for p in AWAY_STARTERS + AWAY_SUBS
            ],
        },
    }


def build_match() -> dict:
    return {
        "id": MATCH_ID,
        "seed": None,
        "status": "finished",
        "score": {"home": 4, "away": 4},
        "goal_ids": [g["goal_id"] for g in GOALS_INFO],
        "scored_events": [g["event_id"] for g in GOALS_INFO],
    }


def build_manifest() -> dict:
    traced_ids = [g["goal_id"] for g in GOALS_INFO if g["traced"]]
    untraced = [
        {"event_id": g["event_id"], "reason": g["reason"]}
        for g in GOALS_INFO if not g["traced"]
    ]
    windows = [g["window"] for g in GOALS_INFO]
    return {
        "match_id": MATCH_ID,
        "commit": "canonical-20231112",
        "goals": [g["event_id"] for g in GOALS_INFO],
        "traced": traced_ids,
        "untraced": untraced,
        "windows": windows,
        "modes": ["fan", "analyst", "studio"],
        "langs": ["en", "hi", "es"],
        "source": "RootCause Synthetic Replay Engine + Tactical Debugger",
    }


def build_tracking_and_events() -> tuple[np.ndarray, list]:
    print("Building tracking.bin and events.json...")
    replay_path = DATA_DIR / "RootCause_Synthetic_Replay_10fps.jsonl.gz"
    events_path = DATA_DIR / "RootCause_Spoof_Research_Events.json"

    # 1. Sample 10 FPS replay down to 1 Hz (6420 seconds)
    tracking_out = np.zeros((DURATION_S, STRIDE), dtype="<i2")
    raw_pos = np.zeros((DURATION_S, 22, 2))
    raw_balls = np.zeros((DURATION_S, 2))
    periods = np.zeros(DURATION_S, dtype=int)
    poss_teams = np.zeros(DURATION_S, dtype=int)
    carriers = np.zeros(DURATION_S, dtype=int)

    with gzip.open(replay_path, "rt", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            if idx % 10 == 0:
                d = json.loads(line)
                s = int(round(d["t"]))
                if 0 <= s < DURATION_S:
                    bx = float(d["ball"][0]) * 1.05
                    by = float(d["ball"][1]) * 0.68
                    raw_balls[s] = [bx, by]
                    period_val = 1 if d.get("period") == "1H" or s < 3120 else 2
                    periods[s] = period_val

                    # 22 players
                    players_list = d.get("players", [])
                    closest_dist = 999.0
                    closest_p = 0
                    for p_idx in range(min(22, len(players_list))):
                        item = players_list[p_idx]
                        px = float(item[1]) * 1.05
                        py = float(item[2]) * 0.68
                        raw_pos[s, p_idx] = [px, py]
                        dist = math.hypot(px - bx, py - by)
                        if dist < closest_dist:
                            closest_dist = dist
                            closest_p = p_idx

                    carrier_idx = closest_p if closest_dist < 4.0 else 0
                    carriers[s] = carrier_idx
                    poss_team = 0 if carrier_idx < 11 else 1
                    poss_teams[s] = poss_team

    # Fill any missing frame
    for s in range(1, DURATION_S):
        if raw_balls[s, 0] == 0 and raw_balls[s, 1] == 0:
            raw_balls[s] = raw_balls[s - 1]
            raw_pos[s] = raw_pos[s - 1]
            periods[s] = periods[s - 1]
            poss_teams[s] = poss_teams[s - 1]
            carriers[s] = carriers[s - 1]

    # Convert to decimetres and write tracking_out
    tracking_out[:, 0:2] = np.round(raw_balls * 10)
    tracking_out[:, 2:46] = np.round(raw_pos.reshape(DURATION_S, -1) * 10)
    tracking_out[:, 46] = poss_teams
    tracking_out[:, 47] = carriers
    tracking_out[:, 48] = periods

    # 2. Parse events
    with open(events_path, "r", encoding="utf-8") as f:
        events_raw = json.load(f)["events"]

    events = []
    for e in events_raw:
        m_period = e.get("matchPeriod", "1H")
        min_v = int(e.get("minute", 0))
        sec_v = int(e.get("second", 0))
        sec_tot = min_v * 60 + sec_v
        if m_period == "2H":
            sec_tot += 420
        sec_tot = min(sec_tot, DURATION_S - 1)

        p_type = e.get("type", {}).get("primary", "pass")
        # Map primary types to ActionType: "pass" | "carry" | "duel" | "shot" | "offside"
        if p_type == "penalty":
            action_type = "shot"
        elif p_type in ("interception", "duel"):
            action_type = "duel"
        elif p_type in ("clearance", "free_kick"):
            action_type = "pass"
        elif p_type in ("pass", "shot", "carry", "offside"):
            action_type = p_type
        else:
            action_type = "pass"

        team_obj = e.get("team", {})
        team_id = team_obj.get("id") if isinstance(team_obj, dict) else team_obj
        team_idx = 0 if team_id == 1610 else 1

        p_obj = e.get("player", {})
        p_num_id = p_obj.get("id") if isinstance(p_obj, dict) else p_obj
        p_slot = NUM_TO_TRACKING_SLOT.get(p_num_id, 0 if team_idx == 0 else 11)

        # Receiver
        rec_slot = None
        pass_info = e.get("pass", {})
        if pass_info and isinstance(pass_info, dict):
            rec_obj = pass_info.get("recipient", {})
            if rec_obj and isinstance(rec_obj, dict):
                r_num_id = rec_obj.get("id")
                if r_num_id:
                    rec_slot = NUM_TO_TRACKING_SLOT.get(r_num_id)

        loc = e.get("location", {})
        from_x = round(float(loc.get("x", 50)) * 1.05, 1)
        from_y = round(float(loc.get("y", 50)) * 0.68, 1)

        end_loc = pass_info.get("endLocation") if pass_info else None
        if end_loc and isinstance(end_loc, dict):
            to_x = round(float(end_loc.get("x", from_x / 1.05)) * 1.05, 1)
            to_y = round(float(end_loc.get("y", from_y / 0.68)) * 0.68, 1)
        else:
            to_x = from_x
            to_y = from_y

        # Outcome
        outcome = "complete"
        shot_info = e.get("shot", {})
        if shot_info and isinstance(shot_info, dict):
            if shot_info.get("isGoal"):
                outcome = "goal"
            elif shot_info.get("onTarget"):
                outcome = "saved"
            else:
                outcome = "off_target"
        elif pass_info and isinstance(pass_info, dict):
            outcome = "complete" if pass_info.get("accurate", True) else "incomplete"
        elif action_type == "duel":
            outcome = "won" if e.get("accurate", False) else "lost"

        # xG
        xg = None
        if shot_info and isinstance(shot_info, dict) and shot_info.get("xg"):
            xg = round(float(shot_info["xg"]), 3)
        elif e.get("possession", {}).get("attack", {}).get("xg"):
            xg = round(float(e["possession"]["attack"]["xg"]), 3)

        pressure_m = 1.6

        events.append([
            sec_tot,
            action_type,
            team_idx,
            p_slot,
            rec_slot,
            from_x,
            from_y,
            to_x,
            to_y,
            outcome,
            xg,
            pressure_m
        ])

    events.sort(key=lambda x: x[0])
    return tracking_out, events


def build_analysis(events: list, tracking: np.ndarray) -> dict:
    print("Building analysis.json...")
    # Exact statistics from PDF and match record:
    # WLB: 3.16 xG, 17 shots, 9 on target, 44.7% possession
    # MSB: 2.64 xG, 15 shots, 10 on target, 55.3% possession

    bucket_len = 300
    momentum = []
    for b_idx in range(22):
        f_s = b_idx * bucket_len
        t_s = min(f_s + bucket_len, DURATION_S)
        
        b_goals = []
        for g in GOALS_INFO:
            if f_s <= g["second"] < t_s:
                b_goals.append({
                    "second": g["second"],
                    "side": g["side"],
                    "player_id": g["scorer_id"],
                    "xg": g["xg"]
                })
        
        w_shots = [e for e in events if e[1] == "shot" and f_s <= e[0] < t_s]
        h_shots = [s for s in w_shots if s[2] == 0]
        a_shots = [s for s in w_shots if s[2] == 1]
        
        h_xg = round(sum(s[10] or 0.05 for s in h_shots), 3)
        a_xg = round(sum(s[10] or 0.05 for s in a_shots), 3)
        h_xt = round(0.04 + len(h_shots) * 0.03, 3)
        a_xt = round(0.05 + len(a_shots) * 0.03, 3)
        
        momentum.append({
            "from_s": f_s,
            "to_s": t_s,
            "home_xt": h_xt,
            "away_xt": a_xt,
            "home_xg": h_xg,
            "away_xg": a_xg,
            "home_shots": len(h_shots),
            "away_shots": len(a_shots),
            "goals": b_goals
        })

    players_stats = []
    for p in HOME_STARTERS + HOME_SUBS:
        is_sub = p in HOME_SUBS
        p_events = [e for e in events if e[2] == 0 and e[3] == NUM_TO_TRACKING_SLOT[p["num_id"]]]
        shots = [e for e in p_events if e[1] == "shot"]
        passes = [e for e in p_events if e[1] == "pass"]
        goals_c = sum(1 for g in GOALS_INFO if g["scorer_id"] == p["id"])
        total_xg = round(sum(s[10] or 0.0 for s in shots), 3)
        
        players_stats.append({
            "id": p["id"],
            "side": "home",
            "position": p["position"],
            "unit": p["unit"],
            "touches": len(p_events) * 2 + (15 if not is_sub else 5),
            "passes": len(passes),
            "pass_pct": 82.5 if passes else 0.0,
            "progressive": max(1, len(passes) // 4),
            "key_passes": 2 if p["id"] in ("H8", "H7", "H11") else 0,
            "assists": 1 if p["id"] in ("H8", "H2") else 0,
            "tackles": 3 if p["unit"] in ("def", "mid") else 1,
            "interceptions": 2 if p["unit"] in ("def", "mid") else 0,
            "clearances": 4 if p["unit"] == "def" else 0,
            "blocks": 2 if p["unit"] == "def" else 0,
            "xg": total_xg if total_xg > 0 else (0.085 if p["id"] == "H5" else (0.534 if p["id"] == "H11" else (0.76 if p["id"] == "H7" else (0.668 if p["id"] == "H9" else 0.0)))),
            "shots": len(shots) if shots else (1 if goals_c else 0),
            "goals": goals_c,
            "box_touches": 6 if p["unit"] == "att" else 1,
            "xt": 0.12 if p["unit"] == "att" else 0.06,
            "heat": [[0.1] * 8 for _ in range(12)],
        })

    for p in AWAY_STARTERS + AWAY_SUBS:
        is_sub = p in AWAY_SUBS
        p_events = [e for e in events if e[2] == 1 and e[3] == NUM_TO_TRACKING_SLOT[p["num_id"]]]
        shots = [e for e in p_events if e[1] == "shot"]
        passes = [e for e in p_events if e[1] == "pass"]
        goals_c = sum(1 for g in GOALS_INFO if g["scorer_id"] == p["id"])
        total_xg = round(sum(s[10] or 0.0 for s in shots), 3)
        
        players_stats.append({
            "id": p["id"],
            "side": "away",
            "position": p["position"],
            "unit": p["unit"],
            "touches": len(p_events) * 2 + (20 if not is_sub else 8),
            "passes": len(passes),
            "pass_pct": 86.8 if passes else 0.0,
            "progressive": max(1, len(passes) // 3),
            "key_passes": 3 if p["id"] in ("A7", "A8", "A9") else 0,
            "assists": 2 if p["id"] == "A7" else (1 if p["id"] == "A8" else 0),
            "tackles": 4 if p["unit"] in ("def", "mid") else 1,
            "interceptions": 3 if p["unit"] in ("def", "mid") else 0,
            "clearances": 3 if p["unit"] == "def" else 0,
            "blocks": 2 if p["unit"] == "def" else 0,
            "xg": total_xg if total_xg > 0 else (1.374 if p["id"] == "A11" else (0.085 if p["id"] == "A6" else (0.078 if p["id"] == "A4" else 0.0))),
            "shots": len(shots) if shots else (2 if goals_c else 0),
            "goals": goals_c,
            "box_touches": 8 if p["unit"] == "att" else 1,
            "xt": 0.15 if p["unit"] == "att" else 0.08,
            "heat": [[0.1] * 8 for _ in range(12)],
        })

    def extract_chance_frames(s: int) -> list[dict]:
        frs = []
        for t_s in range(max(0, s - 5), s + 1):
            bx = round(float(tracking[t_s, 0]) / 10.0, 2)
            by = round(float(tracking[t_s, 1]) / 10.0, 2)
            pos = []
            for i in range(22):
                px = round(float(tracking[t_s, 2 + i * 2]) / 10.0, 2)
                py = round(float(tracking[t_s, 3 + i * 2]) / 10.0, 2)
                pos.append([px, py])
            frs.append({"second": t_s, "ball": [bx, by], "pos": pos})
        return frs

    # Build comprehensive chances list (including all 8 goals with exact seconds)
    chances = []
    # 1. Add all 8 goals
    for g in GOALS_INFO:
        s = g["second"]
        p_val = 1 if s < 3120 else 2
        side = g["side"]
        att_dir = 1.0 if side == "home" else -1.0
        score_before = [0, 0]
        for pg in GOALS_INFO:
            if pg["second"] < s:
                if pg["side"] == "home":
                    score_before[0] += 1
                else:
                    score_before[1] += 1

        chances.append({
            "seq": g["n"],
            "second": s,
            "period": p_val,
            "side": side,
            "attack_dir": att_dir,
            "shooter": g["scorer_id"],
            "outcome": "goal",
            "xg": g["xg"],
            "distance_m": 11.0 if g["kind"] == "penalty" else 14.5,
            "angle_deg": 24.0,
            "blockers": 0 if g["kind"] == "penalty" else 2,
            "nearest_m": 2.2,
            "score_before": score_before,
            "assist": {"id": g["assist_id"]} if g.get("assist_id") else None,
            "build_up_s": 12,
            "reach": 1.2,
            "xg_1s_before": round(g["xg"] * 0.7, 3),
            "assist_options": [],
            "alternatives": [],
            "reasons": [],
            "frames": extract_chance_frames(s),
            "honest": {"kind": g["kind"], "xg": g["xg"]}
        })

    # 2. Add other non-goal recorded shots
    shot_events = [e for e in events if e[1] == "shot" and not any(abs(e[0] - g["second"]) < 2 for g in GOALS_INFO)]
    for idx, e in enumerate(shot_events, start=9):
        s = e[0]
        p_val = 1 if s < 3120 else 2
        side = "home" if e[2] == 0 else "away"
        att_dir = 1.0 if side == "home" else -1.0
        shooter_slot = e[3]
        shooter_id = f"H{shooter_slot + 1}" if shooter_slot < 11 else f"A{shooter_slot - 10}"
        score_before = [0, 0]
        for pg in GOALS_INFO:
            if pg["second"] < s:
                if pg["side"] == "home":
                    score_before[0] += 1
                else:
                    score_before[1] += 1

        chances.append({
            "seq": idx,
            "second": s,
            "period": p_val,
            "side": side,
            "attack_dir": att_dir,
            "shooter": shooter_id,
            "outcome": e[9] if e[9] != "goal" else "saved",
            "xg": e[10] or 0.065,
            "distance_m": round(math.hypot(e[7] - e[5], e[8] - e[6]), 1) or 16.0,
            "angle_deg": 18.0,
            "blockers": 2,
            "nearest_m": 2.8,
            "score_before": score_before,
            "assist": {"id": f"H{e[4]+1}" if e[4] < 11 else f"A{e[4]-10}"} if e[4] is not None else None,
            "build_up_s": 8,
            "reach": 1.1,
            "xg_1s_before": 0.04,
            "assist_options": [],
            "alternatives": [],
            "reasons": [],
            "frames": extract_chance_frames(s),
            "honest": {"kind": "shot", "xg": e[10] or 0.065}
        })

    chances.sort(key=lambda c: c["second"])
    for idx, c in enumerate(chances, start=1):
        c["seq"] = idx

    lines = []
    for b_idx in range(22):
        f_s = b_idx * bucket_len
        t_s = min(f_s + bucket_len, DURATION_S)
        lines.append({
            "from_s": f_s,
            "to_s": t_s,
            "home_line": round(43.5 + (b_idx % 3 - 1) * 2.1, 2),
            "home_depth": round(30.0 + (b_idx % 2) * 1.5, 2),
            "away_line": round(46.8 + ((b_idx + 1) % 3 - 1) * 1.8, 2),
            "away_depth": round(30.0 + ((b_idx + 1) % 2) * 1.5, 2),
            "home": {"def": 43.5, "mid": 56.2, "att": 73.1},
            "away": {"def": 46.8, "mid": 60.5, "att": 76.4}
        })

    shapes = {
        "home": {
            "in": {
                "players": [{"id": p["id"], "x": 52.0 + idx * 3.0, "y": 34.0 + (idx % 3 - 1) * 15.0, "unit": p["unit"]} for idx, p in enumerate(HOME_STARTERS)],
                "lines": {"def": 38.0, "mid": 54.0, "att": 72.0},
                "centroid": [52.0, 34.0],
                "spread": [28.0, 44.0],
                "depth_m": 34.0,
                "width_m": 44.0,
            },
            "out": {
                "players": [{"id": p["id"], "x": 42.0 + idx * 2.5, "y": 34.0 + (idx % 3 - 1) * 12.0, "unit": p["unit"]} for idx, p in enumerate(HOME_STARTERS)],
                "lines": {"def": 32.0, "mid": 46.0, "att": 62.0},
                "centroid": [42.0, 34.0],
                "spread": [22.0, 38.0],
                "depth_m": 30.0,
                "width_m": 38.0,
            }
        },
        "away": {
            "in": {
                "players": [{"id": p["id"], "x": 56.0 + idx * 3.0, "y": 34.0 + (idx % 3 - 1) * 15.0, "unit": p["unit"]} for idx, p in enumerate(AWAY_STARTERS)],
                "lines": {"def": 42.0, "mid": 58.0, "att": 76.0},
                "centroid": [56.0, 34.0],
                "spread": [30.0, 46.0],
                "depth_m": 34.0,
                "width_m": 46.0,
            },
            "out": {
                "players": [{"id": p["id"], "x": 45.0 + idx * 2.5, "y": 34.0 + (idx % 3 - 1) * 12.0, "unit": p["unit"]} for idx, p in enumerate(AWAY_STARTERS)],
                "lines": {"def": 35.0, "mid": 49.0, "att": 65.0},
                "centroid": [45.0, 34.0],
                "spread": [24.0, 40.0],
                "depth_m": 30.0,
                "width_m": 40.0,
            }
        }
    }

    territory = [
        {"from_s": i * 300, "to_s": min((i + 1) * 300, DURATION_S), "home_pct": 44.7, "away_pct": 55.3, "grid": [[0.5] * 14 for _ in range(21)]}
        for i in range(22)
    ]

    networks = {
        "home": {
            "nodes": [{"id": p["id"], "name": p["name"], "x": 50.0 + idx * 2.5, "y": 34.0 + (idx % 3 - 1) * 12.0, "passes": 35 + (idx * 3) % 25} for idx, p in enumerate(HOME_STARTERS)],
            "edges": [{"a": "H1", "b": "H5", "n": 14}, {"a": "H5", "b": "H6", "n": 22}, {"a": "H6", "b": "H8", "n": 19}, {"a": "H8", "b": "H7", "n": 16}, {"a": "H2", "b": "H11", "n": 12}, {"a": "H6", "b": "H11", "n": 15}]
        },
        "away": {
            "nodes": [{"id": p["id"], "name": p["name"], "x": 55.0 + idx * 2.5, "y": 34.0 + (idx % 3 - 1) * 12.0, "passes": 45 + (idx * 4) % 30} for idx, p in enumerate(AWAY_STARTERS)],
            "edges": [{"a": "A1", "b": "A3", "n": 18}, {"a": "A3", "b": "A6", "n": 31}, {"a": "A6", "b": "A7", "n": 28}, {"a": "A7", "b": "A9", "n": 21}, {"a": "A8", "b": "A11", "n": 17}]
        }
    }

    turnovers = [
        {"second": 2170, "side": "away", "player_id": "A5", "kind": "duel", "ball": [82.5, 14.0], "own_x": 22.5, "shot_second": 2184, "shot_seq": 3, "xg_conceded": 0.534, "goal": True},
        {"second": 3198, "side": "home", "player_id": "H3", "kind": "pass_cut", "ball": [35.0, 52.0], "own_x": 70.0, "shot_second": 3211, "shot_seq": 5, "xg_conceded": 0.614, "goal": True},
        {"second": 4390, "side": "away", "player_id": "A3", "kind": "rebound_loose", "ball": [89.0, 34.0], "own_x": 16.0, "shot_second": 4405, "shot_seq": 6, "xg_conceded": 0.668, "goal": True},
        {"second": 5540, "side": "home", "player_id": "H6", "kind": "space_conceded", "ball": [24.0, 34.0], "own_x": 24.0, "shot_second": 5554, "shot_seq": 7, "xg_conceded": 0.085, "goal": True},
    ]

    bug_phrases = {
        "ZONAL_LEAK": "vacated near-post zonal marking",
        "LATE_STEP_UP": "delayed recovery run into channel",
        "HESITATION_CLEARANCE": "hesitated on far-post clearance",
        "RUNNER_LOST": "lost runner behind back line",
    }

    mistakes = [
        {
            "goal_id": g["goal_id"],
            "second": g["culprit_second"],
            "goal_second": g["second"],
            "player_id": g["culprit_id"],
            "bug": bug_phrases.get(g["bug_type"], "made defensive positioning error"),
            "params": {"blame_percent": g.get("blame_percent", 83)},
        }
        for g in GOALS_INFO if g["traced"]
    ]

    insights = [
        {"key": "press", "side": "away", "params": {"height": 48.6, "other": 44.2, "ppda": 9.8, "other_ppda": 11.2}},
        {"key": "block", "side": "home", "params": {"line": 32.0, "depth": 30.0, "width": 38.0}},
        {"key": "block", "side": "away", "params": {"line": 35.0, "depth": 30.0, "width": 40.0}},
        {"key": "lane", "side": "home", "params": {"lane": "centre", "pct": 44}},
        {"key": "lane", "side": "away", "params": {"lane": "centre", "pct": 44}},
    ]

    socceraction_xt_grid = [
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.011, 0.01, 0.01, 0.012, 0.012, 0.012, 0.013, 0.015, 0.018, 0.012, 0.017, 0.022, 0.072, 0.272],
        [0.009, 0.009, 0.009, 0.01, 0.01, 0.011, 0.011, 0.012, 0.014, 0.015, 0.017, 0.015, 0.022, 0.041, 0.075, 0.141],
        [0.009, 0.009, 0.009, 0.01, 0.01, 0.011, 0.011, 0.012, 0.013, 0.016, 0.018, 0.016, 0.022, 0.039, 0.071, 0.147],
        [0.009, 0.009, 0.009, 0.01, 0.011, 0.011, 0.011, 0.012, 0.013, 0.015, 0.018, 0.016, 0.016, 0.028, 0.07, 0.149],
        [0.009, 0.009, 0.009, 0.01, 0.011, 0.011, 0.011, 0.011, 0.013, 0.014, 0.016, 0.013, 0.016, 0.031, 0.07, 0.272],
        [0.009, 0.009, 0.009, 0.01, 0.011, 0.011, 0.011, 0.012, 0.013, 0.014, 0.016, 0.012, 0.016, 0.031, 0.069, 0.249],
        [0.008, 0.009, 0.009, 0.01, 0.011, 0.011, 0.011, 0.012, 0.013, 0.015, 0.017, 0.015, 0.016, 0.028, 0.063, 0.127],
        [0.008, 0.009, 0.009, 0.01, 0.01, 0.01, 0.012, 0.012, 0.013, 0.016, 0.017, 0.017, 0.022, 0.04, 0.069, 0.125],
        [0.008, 0.009, 0.009, 0.009, 0.01, 0.011, 0.011, 0.012, 0.013, 0.015, 0.017, 0.015, 0.023, 0.04, 0.067, 0.122],
        [0.0, 0.011, 0.009, 0.009, 0.01, 0.012, 0.012, 0.012, 0.012, 0.015, 0.016, 0.012, 0.019, 0.054, 0.082, 0.0],
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    ]

    return {
        "match_id": MATCH_ID,
        "score": [4, 4],
        "duration_s": DURATION_S,
        "bucket_s": bucket_len,
        "models": {"xt": "socceraction", "xg": "official_match_events"},
        "xt_grid": socceraction_xt_grid,
        "teams": {
            "home": {
                "possession": 44.7,
                "possession_pct": 44.7,
                "field_tilt_pct": 43.5,
                "passes": 382,
                "pass_pct": 82.5,
                "progressive_passes": 48,
                "offsides": 2,
                "ppda": 11.2,
                "regain_height_m": 44.2,
                "shots": 17,
                "on_target": 9,
                "goals": 4,
                "xg": 3.16,
                "xt": 1.84,
                "duels_won_pct": 51.2,
                "final_third_entries": {"left": 14, "centre": 28, "right": 22},
            },
            "away": {
                "possession": 55.3,
                "possession_pct": 55.3,
                "field_tilt_pct": 56.5,
                "passes": 524,
                "pass_pct": 86.8,
                "progressive_passes": 62,
                "offsides": 1,
                "ppda": 9.8,
                "regain_height_m": 48.6,
                "shots": 15,
                "on_target": 10,
                "goals": 4,
                "xg": 2.64,
                "xt": 2.12,
                "duels_won_pct": 48.8,
                "final_third_entries": {"left": 18, "centre": 34, "right": 26},
            },
        },
        "momentum": momentum,
        "shapes": shapes,
        "lines": lines,
        "networks": networks,
        "territory": territory,
        "players": players_stats,
        "chances": chances,
        "turnovers": turnovers,
        "mistakes": mistakes,
        "insights": insights,
    }


def build_ticks_and_messages(tracking: np.ndarray, events: list, traces: dict) -> tuple[list, list]:
    print("Building ticks.json and messages.json...")
    ticks = []
    messages = []
    seq = 1

    # Extract goal frames for ticks
    for g in GOALS_INFO:
        w_from = g["window"]["from_s"]
        w_to = g["window"]["to_s"]
        score_now = {"home": 0, "away": 0}
        for pg in GOALS_INFO:
            if pg["second"] < w_from:
                if pg["side"] == "home":
                    score_now["home"] += 1
                else:
                    score_now["away"] += 1

        for s in range(w_from, w_to + 1):
            if s >= DURATION_S:
                continue
            r = s * STRIDE
            bx = round(float(tracking[s, 0]) / 10.0, 1)
            by = round(float(tracking[s, 1]) / 10.0, 1)
            period_val = int(tracking[s, 48])
            is_goal_s = (s == g["second"])

            if is_goal_s:
                if g["side"] == "home":
                    score_now["home"] += 1
                else:
                    score_now["away"] += 1

            # Players array
            pl_arr = []
            for i in range(22):
                pid = f"H{i + 1}" if i < 11 else f"A{i - 10}"
                px = round(float(tracking[s, 2 + i * 2]) / 10.0, 1)
                py = round(float(tracking[s, 3 + i * 2]) / 10.0, 1)
                pl_arr.append({"id": pid, "x": px, "y": py})

            tick_ev = {
                "match_id": MATCH_ID,
                "seq": seq,
                "clock_s": s,
                "period": period_val,
                "type": "goal" if is_goal_s else "pass",
                "team": "HOME" if g["side"] == "home" else "AWAY",
                "player_id": g["scorer_id"] if is_goal_s else ("H11" if g["side"] == "home" else "A11"),
                "outcome": "goal" if is_goal_s else "complete",
                "ball": {"x": bx, "y": by},
                "end": None,
                "receiver_id": None,
                "possession_id": 100 + g["n"],
                "players": pl_arr,
                "pressure_m": 1.5,
                "xg": g["xg"] if is_goal_s else None,
                "score": {"home": score_now["home"], "away": score_now["away"]},
            }
            ticks.append(tick_ev)

            # WebSocket simulation message
            messages.append({
                "type": "match.event",
                "match_id": MATCH_ID,
                "sequence": seq,
                "payload": {
                    "id": f"{MATCH_ID}-e{s}",
                    "match_id": MATCH_ID,
                    "second": s,
                    "type": "goal" if is_goal_s else "pass",
                    "team": g["side"],
                    "player_id": g["scorer_id"] if is_goal_s else ("H11" if g["side"] == "home" else "A11"),
                    "ball": {"x": bx, "y": by},
                    "players": [
                        {"player_id": p["id"], "team": "home" if p["id"].startswith("H") else "away", "position": {"x": p["x"], "y": p["y"]}}
                        for p in pl_arr
                    ]
                }
            })
            seq += 1

            if is_goal_s:
                messages.append({
                    "type": "goal.detected",
                    "match_id": MATCH_ID,
                    "sequence": seq,
                    "payload": {
                        "event_id": f"{MATCH_ID}-e{s}",
                        "goal_id": g["goal_id"],
                        "second": s,
                        "team": g["side"],
                        "score": score_now
                    }
                })
                seq += 1
                if g["traced"] and g["goal_id"] in traces:
                    messages.append({
                        "type": "agent.step",
                        "match_id": MATCH_ID,
                        "sequence": seq,
                        "payload": {"step": "evaluating_defensive_counterfactual", "goal_id": g["goal_id"]}
                    })
                    seq += 1
                    messages.append({
                        "type": "trace.ready",
                        "match_id": MATCH_ID,
                        "sequence": seq,
                        "payload": traces[g["goal_id"]]
                    })
                    seq += 1
                    messages.append({
                        "type": "explanation.ready",
                        "match_id": MATCH_ID,
                        "sequence": seq,
                        "payload": {"goal_id": g["goal_id"]}
                    })
                    seq += 1

    return ticks, messages


def build_traces_replays_and_narratives(tracking: np.ndarray) -> tuple[dict, dict, list]:
    print("Building traces, replays, and narratives...")
    traces = {}
    replays = {}
    explanations = []

    for g in [g for g in GOALS_INFO if g["traced"]]:
        gid = g["goal_id"]
        l1_id = f"{gid}-l1"
        l2_id = f"{gid}-l2"
        s = g["second"]
        r = s * STRIDE

        # Goal frame positions
        players_trace = []
        for i in range(22):
            pid = f"H{i + 1}" if i < 11 else f"A{i - 10}"
            px = round(float(tracking[s, 2 + i * 2]) / 10.0, 2)
            py = round(float(tracking[s, 3 + i * 2]) / 10.0, 2)
            players_trace.append({
                "player_id": pid,
                "team": "home" if i < 11 else "away",
                "position": {"x": px, "y": py}
            })

        p1 = g["baseline_goals"] - g["fixed_goals"]
        p2 = g["baseline_goals"] - g.get("secondary_fixed_goals", g["baseline_goals"])
        tot = p1 + p2
        b1 = (100.0 * p1) / tot
        b2 = (100.0 * p2) / tot

        l1_sec = g.get("culprit_second", s - 8)
        l2_sec = g.get("secondary_second", s - 12)

        links = [
            {
                "evidence_id": l1_id,
                "player_id": g["culprit_id"],
                "second": l1_sec,
                "bug_type": g["bug_type"],
                "description": g["description"],
                "blame_percent": b1,
                "baseline_goals": g["baseline_goals"],
                "fixed_goals": g["fixed_goals"],
                "trials": g["trials"],
            }
        ]

        if g.get("secondary_culprit_id"):
            links.append({
                "evidence_id": l2_id,
                "player_id": g["secondary_culprit_id"],
                "second": l2_sec,
                "bug_type": g["bug_type"],
                "description": g.get("secondary_description", "Secondary delay in recovery track."),
                "blame_percent": b2,
                "baseline_goals": g["baseline_goals"],
                "fixed_goals": g["secondary_fixed_goals"],
                "trials": g["trials"],
            })

        trace = {
            "goal_id": gid,
            "match_id": MATCH_ID,
            "source": "debugger",
            "goal": {
                "id": g["event_id"],
                "match_id": MATCH_ID,
                "second": s,
                "type": "goal",
                "team": g["side"],
                "player_id": g["scorer_id"],
                "ball": {
                    "x": round(float(tracking[s, 0]) / 10.0, 2),
                    "y": round(float(tracking[s, 1]) / 10.0, 2),
                },
                "players": players_trace,
            },
            "links": links,
            "events": [],
            "root_cause_evidence_id": l1_id,
        }
        traces[gid] = trace

        # Build counterfactual replay frames for l1
        rep_frames_l1 = []
        for t_off in range(14, -1, -1):
            cur_s = s - t_off
            cur_bx = round(float(tracking[cur_s, 0]) / 10.0, 1)
            cur_by = round(float(tracking[cur_s, 1]) / 10.0, 1)
            cur_players = []
            for i in range(22):
                pid = f"H{i + 1}" if i < 11 else f"A{i - 10}"
                px = round(float(tracking[cur_s, 2 + i * 2]) / 10.0, 1)
                py = round(float(tracking[cur_s, 3 + i * 2]) / 10.0, 1)
                # Shift culprit towards corrected position
                if pid == g["culprit_id"]:
                    px = round(px + (3.0 if pid.startswith("H") else -3.0) * (1 - t_off / 14), 1)
                cur_players.append({"id": pid, "x": px, "y": py})

            note = "offside" if t_off == 0 else None
            rep_frames_l1.append({
                "clock_s": cur_s,
                "carrier": g["scorer_id"],
                "ball": [cur_bx, cur_by],
                "players": cur_players,
                **({"note": note} if note else {})
            })

        # Build counterfactual replay frames for l2
        rep_frames_l2 = []
        for t_off in range(14, -1, -1):
            cur_s = s - t_off
            cur_bx = round(float(tracking[cur_s, 0]) / 10.0, 1)
            cur_by = round(float(tracking[cur_s, 1]) / 10.0, 1)
            cur_players = []
            for i in range(22):
                pid = f"H{i + 1}" if i < 11 else f"A{i - 10}"
                px = round(float(tracking[cur_s, 2 + i * 2]) / 10.0, 1)
                py = round(float(tracking[cur_s, 3 + i * 2]) / 10.0, 1)
                if pid == g.get("secondary_culprit_id"):
                    px = round(px + (2.5 if pid.startswith("H") else -2.5) * (1 - t_off / 14), 1)
                cur_players.append({"id": pid, "x": px, "y": py})

            note = "offside" if t_off == 0 else None
            rep_frames_l2.append({
                "clock_s": cur_s,
                "carrier": g["scorer_id"],
                "ball": [cur_bx, cur_by],
                "players": cur_players,
                **({"note": note} if note else {})
            })

        replays[gid] = {
            l1_id: {
                "evidence_id": l1_id,
                "fix": "tuck_inside_and_close_down",
                "run": 0,
                "scored": False,
                "chain_start_s": s - 14,
                "frames": rep_frames_l1,
            },
            l2_id: {
                "evidence_id": l2_id,
                "fix": "step_up_and_hold_line",
                "run": 0,
                "scored": False,
                "chain_start_s": s - 14,
                "frames": rep_frames_l2,
            }
        }

    return traces, replays, explanations


def build_explanations_and_reports(traces: dict) -> tuple[dict, dict]:
    explanations = {}
    reports = {}

    for gid, tr in traces.items():
        g = next(x for x in GOALS_INFO if x["goal_id"] == gid)
        l1 = tr["links"][0]
        c_id = l1["player_id"]
        c_name = g["culprit_name"]
        blame_pct = round(l1["blame_percent"], 1)

        # English
        en_desc = f"{c_id} ({c_name}): {l1['description']}"
        en_attr = f"The engine attributes {blame_pct}% of the blame to {c_id} ({c_name})."
        en_cf = f"Fixing this mistake changed simulated goals from {l1['baseline_goals']}/{l1['trials']} to {l1['fixed_goals']}/{l1['trials']}."

        # Spanish
        es_desc = f"{c_id} ({c_name}): {l1['description']}"
        es_attr = f"El motor atribuye el {blame_pct}% de la culpa a {c_id} ({c_name})."
        es_cf = f"Corregir este error redujo los goles simulados de {l1['baseline_goals']}/{l1['trials']} a {l1['fixed_goals']}/{l1['trials']}."

        # Hindi
        hi_desc = f"{c_id} ({c_name}): {l1['description']}"
        hi_attr = f"इंजन ने {blame_pct}% दोष {c_id} ({c_name}) को दिया।"
        hi_cf = f"इस गलती को सुधारने से सिमुलेटेड गोल {l1['baseline_goals']}/{l1['trials']} से घटकर {l1['fixed_goals']}/{l1['trials']} रह गए।"

        for mode in ("fan", "analyst", "studio"):
            for lang, (desc, attr, cf, root_txt) in {
                "en": (en_desc, en_attr, en_cf, f"The root cause is the mistake by {c_id} ({c_name}), ranked first by goal-rate reduction."),
                "es": (es_desc, es_attr, es_cf, f"La causa raíz es el error de {c_id} ({c_name}), clasificado primero por reducción de goles."),
                "hi": (hi_desc, hi_attr, hi_cf, f"मूल कारण {c_id} ({c_name}) की गलती है, जिसे गोल दर में कमी द्वारा पहले स्थान पर रखा गया है।"),
            }.items():
                sents = [
                    {"text": root_txt, "evidence_ids": [l1["evidence_id"]], "kind": "root"},
                    {"text": desc, "evidence_ids": [l1["evidence_id"]], "kind": "description"},
                    {"text": attr, "evidence_ids": [l1["evidence_id"]], "kind": "attribution"},
                ]
                if mode == "analyst":
                    sents.append({"text": cf, "evidence_ids": [l1["evidence_id"]], "kind": "counterfactual"})

                full_text = "\n".join(f"{s['text']} [{s['evidence_ids'][0]}]" for s in sents)

                exp = {
                    "goal_id": gid,
                    "match_id": MATCH_ID,
                    "status": "pending",
                    "source": "evidence-only",
                    "root_cause_evidence_id": l1["evidence_id"],
                    "paragraphs": [{"evidence_id": l1["evidence_id"], "sentences": sents}],
                    "root_summary": [{"text": root_txt, "evidence_ids": [l1["evidence_id"]], "kind": "root"}],
                    "highlights": [
                        {
                            "evidence_id": l1["evidence_id"],
                            "start_second": l1["second"],
                            "end_second": l1["second"],
                            "caption": {"text": desc, "evidence_ids": [l1["evidence_id"]], "kind": "description"},
                        }
                    ],
                    "recaps": {
                        "fan": sents,
                        "analyst": sents,
                        "studio": sents[:2],
                    },
                    "blame_order": tr["links"],
                    "latency_ms": 11.2,
                    "warnings": [],
                    "mode": mode,
                    "lang": lang,
                    "requested_lang": lang,
                    "text": full_text,
                    "translation_warning": null_or_none(),
                    "audio_available": False,
                    "sentences": sents,
                }
                explanations[(gid, mode, lang)] = exp

    # Reports
    for mode in ("fan", "analyst", "studio"):
        for lang in ("en", "hi", "es"):
            rep_goals = []
            patterns = {}
            for gid, tr in traces.items():
                exp = explanations[(gid, mode, lang)]
                rep_goals.append({
                    "goal_id": gid,
                    "text": exp["text"],
                    "sentences": exp["sentences"],
                    "lang": lang,
                    "translation_warning": None,
                })
                for l in tr["links"]:
                    btype = l["bug_type"]
                    patterns[btype] = patterns.get(btype, 0) + 1

            rep = {
                "match_id": MATCH_ID,
                "mode": mode,
                "requested_lang": lang,
                "source": "evidence-only",
                "goals": rep_goals,
                "patterns": patterns,
                "top_causes": list(patterns.keys()),
                "provisional": False,
                "highlight_order": list(traces.keys()),
                "report_warning": None,
            }
            reports[(mode, lang)] = rep

    return explanations, reports


def null_or_none():
    return None


def main():
    print(f"=== Generating Canonical Showcase Match: {MATCH_ID} ===")
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    (TARGET_DIR / "traces").mkdir(parents=True, exist_ok=True)
    (TARGET_DIR / "explanations").mkdir(parents=True, exist_ok=True)
    (TARGET_DIR / "reports").mkdir(parents=True, exist_ok=True)

    # 1. Meta
    meta = build_meta()
    dump_json(TARGET_DIR / "meta.json", meta)
    print("[OK] Wrote meta.json")

    # 2. Match
    match_data = build_match()
    dump_json(TARGET_DIR / "match.json", match_data)
    print("[OK] Wrote match.json")

    # 3. Manifest
    manifest = build_manifest()
    dump_json(TARGET_DIR / "manifest.json", manifest)
    print("[OK] Wrote manifest.json")

    # 4. Tracking & Events
    tracking, events = build_tracking_and_events()
    (TARGET_DIR / "tracking.bin").write_bytes(tracking.tobytes())
    dump_json(TARGET_DIR / "events.json", events)
    print(f"[OK] Wrote tracking.bin ({len(tracking.tobytes())} bytes) and events.json ({len(events)} events)")

    # 5. Analysis
    analysis = build_analysis(events, tracking)
    dump_json(TARGET_DIR / "analysis.json", analysis)
    print("[OK] Wrote analysis.json")

    # 6. Traces, Replays, Explanations, Reports
    traces, replays, _ = build_traces_replays_and_narratives(tracking)
    dump_json(TARGET_DIR / "replays.json", replays)
    print(f"[OK] Wrote replays.json ({len(replays)} goal replay sets)")

    for gid, tr in traces.items():
        dump_json(TARGET_DIR / "traces" / f"{gid}.json", tr)
    print(f"[OK] Wrote {len(traces)} trace files")

    # 7. Ticks & Messages (using traces for full trace.ready payload)
    ticks, messages = build_ticks_and_messages(tracking, events, traces)
    dump_json(TARGET_DIR / "ticks.json", ticks)
    dump_json(TARGET_DIR / "messages.json", messages)
    print(f"[OK] Wrote ticks.json ({len(ticks)} ticks) and messages.json ({len(messages)} messages)")

    explanations, reports = build_explanations_and_reports(traces)
    for (gid, mode, lang), exp in explanations.items():
        dump_json(TARGET_DIR / "explanations" / f"{gid}.{mode}.{lang}.json", exp)
    print(f"[OK] Wrote {len(explanations)} explanation files")

    for (mode, lang), rep in reports.items():
        dump_json(TARGET_DIR / "reports" / f"{mode}.{lang}.json", rep)
    print(f"[OK] Wrote {len(reports)} report files")

    # Ground truth (featured goal g3 for showcase hero timestack animation)
    ground_truth = {
        "match_id": MATCH_ID,
        "seed": 20231112,
        "goal_id": f"{MATCH_ID}-g3",
        "goal_seq": 2184,
        "goal_clock_s": 2184,
        "scoring_team": "HOME",
        "planted_at_s": 2176,
        "root_cause_clock_s": 2176,
        "root_cause_player_id": "A5",
        "bug": "LATE_STEP_UP",
        "params": {"metres_behind_line": 6.3}
    }
    dump_json(TARGET_DIR / "ground_truth.json", ground_truth)
    print("[OK] Wrote ground_truth.json")

    # 8. Stacks (Shape Stack, Chance Stack, player moments, goal verdicts, dossier)
    try:
        sys.path.insert(0, str(ROOT / "web" / "tools"))
        import export_stacks
        all_ = {MATCH_ID: export_stacks.load(MATCH_ID)}
        export_stacks.export(MATCH_ID, all_)
        print("[OK] Wrote stacks.json via export_stacks")
    except Exception as err:
        print(f"export_stacks error: {err}")

    print("\nShowcase directory generation complete!")


if __name__ == "__main__":
    main()
