# Root Cause: Engine & Debugger formats (Role 2)

The **team contracts are in `docs/SPEC.md`** (`api/contracts.py`); the backend, agents and UI use
those. This file documents the engine's own, richer internal formats and how they map onto the
team contracts. `debugger/plugin.py` does the conversion, so nothing outside `engine/` and
`debugger/` needs these formats.

| Engine format | Model | Sample | Team contract it maps to |
|---------------|-------|--------|--------------------------|
| Match event (+ match meta) | `engine/models.py: MatchEvent, MatchMeta` | `samples/engine/match_events.json`, `samples/engine/match_meta.json` | `MatchEvent` (pass/duel/cross/goal only) |
| Evidence package | `engine/models.py: EvidencePackage` | `samples/engine/evidence.json` (real Debugger output), `samples/engine/evidence_3_links_example.json` (illustrative) | `Evidence`: `samples/engine/evidence_team_contract.json` |
| Ground truth (planted mistakes) | `engine/models.py: GroundTruth` | `samples/engine/ground_truth.json` | none (accuracy test only) |

## Plugging the Debugger into the backend

Set `DEBUGGER_MODULE=debugger.plugin`. `api/ingestion.py` then calls `debugger.plugin.trace(event_dict)`
with a team-contract goal event and gets back a team-contract `Evidence` with `source="debugger"`.

The engine is deterministic, so the match ID says how to rebuild the match:

| match_id | Match |
|----------|-------|
| `m-0007` | free match, seed 7 |
| `p-1012` | match with one planted mistake, `engine.mistakes.random_plant(1012)` |

To publish a match to the backend, `debugger.plugin.team_events(match_id)` returns its events in
the team contract, ready for `api.ingestion.publish(...)`. Event IDs are `<match_id>-e<seq>`.

Mapping notes:
- Team `MatchEvent.type` only has pass/duel/cross/goal, so engine `tick`, `carry`, `shot`,
  `kickoff` and `half_time`/`full_time` events are not forwarded. A pass from the wide crossing
  area is sent as `cross`. **Open question for Roles 1 and 3:** the UI may want positions every
  second (engine `tick` events) for smooth animation.
- `blame_percent` = blame share × 100 (sums to 100). `baseline_goals` / `fixed_goals` = goal chance
  × 200 trials, rounded. `description` and `views` are generated from the bug catalogue and the
  link's `facts`, with no language model involved.
- If no fix lowers the goal chance, `trace` raises an error instead of inventing blame.

## Conventions

- **Pitch:** 105 × 68 metres, origin at a corner flag. `x` along the length, `y` across.
- **Direction:** HOME attacks towards `x = 105` in period 1 and towards `x = 0` in period 2.
- **Player ids:** `H1`–`H11`, `A1`–`A11`; the number is the shirt number (1 = GK, 9 = striker).
  Names, positions and kit colours are in `MatchMeta`. All clubs and players are invented.
- **Clock:** `clock_s` is seconds since kick-off, continuous across halves (0–5400). No stoppage time.
- **One event per second minimum.** If nothing happened, the engine emits `type: "tick"` so the
  stream always carries all 22 positions every second. Realism stats exclude ticks.
- **Goals:** a `shot` with `outcome: "goal"` is immediately followed by a `goal` event, then a
  `kickoff`. In-process callers can use `debugger.trace(match, goal_seq)` directly; the backend
  uses `debugger.plugin.trace(event_dict)` (see above).
- **Possession:** `possession_id` increments each time possession changes team.
- **Offside:** a pass to a receiver beyond the offside line has `outcome: "offside"` and possession
  goes to the defending team.
- **Engine match files:** `matches/<match_id>.events.jsonl` (one `MatchEvent` per line) and
  `matches/<match_id>.meta.json`. Generate with `python -m engine.simulate --seed 7`.
- **Streaming:** `python -m engine.stream matches/m-0007.events.jsonl --ws --speed 10` serves
  `ws://localhost:8765`; each message is one `MatchEvent` JSON object.

## Evidence rules (engine format; the plugin carries them into the team contract)

- `baseline_goal_rate` is "the chance this goal happens again" when the same attack is replayed 200
  times against a re-simulated defence. `fixed_goal_rate` is the same with only that link's mistake
  fixed. Plain words: "with H3 holding the line, this goal happens 0% of the time instead of 70%".
- `links` are sorted by `rank`; rank 1 is the root cause (biggest blame share).
- `blame` values sum to 1 across links (or are all 0 if no fix lowered the goal rate).
- `facts` on each link are the **only** details the explanation agent may use. Every sentence it
  writes must trace back to a number in this package.
- Bug codes and their plain-words names: `debugger/catalogue.py`.

## Planted mistakes (internal, Role 2)

`python -m engine.mistakes --bug LATE_STEP_UP --player H3 --minute 30 --seed 7` writes the match
files plus `matches/<match_id>.ground_truth.json` (`engine/models.py: GroundTruth`, sample in
`samples/engine/ground_truth.json`). The UI and agents never see ground truth; it is only for the accuracy
test and the demo.

## Schemas

<!-- schema:start -->
<!-- generated by scripts/export_schema.py, do not edit by hand -->

### `MatchEvent`

<details><summary>JSON Schema</summary>

```json
{
  "$defs": {
    "PlayerPos": {
      "additionalProperties": false,
      "properties": {
        "id": {
          "description": "\"H1\"..\"H11\" or \"A1\"..\"A11\"; the number is the shirt number",
          "title": "Id",
          "type": "string"
        },
        "x": {
          "title": "X",
          "type": "number"
        },
        "y": {
          "title": "Y",
          "type": "number"
        }
      },
      "required": [
        "id",
        "x",
        "y"
      ],
      "title": "PlayerPos",
      "type": "object"
    },
    "Point": {
      "additionalProperties": false,
      "description": "Pitch coordinates in metres. Pitch is 105 x 68; (0, 0) is a corner flag.\nHOME attacks towards x = 105 in period 1 and towards x = 0 in period 2.",
      "properties": {
        "x": {
          "maximum": 105,
          "minimum": 0,
          "title": "X",
          "type": "number"
        },
        "y": {
          "maximum": 68,
          "minimum": 0,
          "title": "Y",
          "type": "number"
        }
      },
      "required": [
        "x",
        "y"
      ],
      "title": "Point",
      "type": "object"
    },
    "Score": {
      "additionalProperties": false,
      "properties": {
        "HOME": {
          "default": 0,
          "title": "Home",
          "type": "integer"
        },
        "AWAY": {
          "default": 0,
          "title": "Away",
          "type": "integer"
        }
      },
      "title": "Score",
      "type": "object"
    }
  },
  "additionalProperties": false,
  "description": "One event. At least one event is emitted every match second (a \"tick\" if nothing\nelse happened), so the stream always carries all 22 positions each second.",
  "properties": {
    "match_id": {
      "title": "Match Id",
      "type": "string"
    },
    "seq": {
      "description": "strictly increasing within a match",
      "title": "Seq",
      "type": "integer"
    },
    "clock_s": {
      "description": "seconds since kick-off, continuous across halves (0..5400)",
      "minimum": 0,
      "title": "Clock S",
      "type": "integer"
    },
    "period": {
      "enum": [
        1,
        2
      ],
      "title": "Period",
      "type": "integer"
    },
    "type": {
      "enum": [
        "kickoff",
        "tick",
        "pass",
        "carry",
        "duel",
        "shot",
        "goal",
        "half_time",
        "full_time"
      ],
      "title": "Type",
      "type": "string"
    },
    "team": {
      "anyOf": [
        {
          "enum": [
            "HOME",
            "AWAY"
          ],
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "team in possession / acting team",
      "title": "Team"
    },
    "player_id": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "ball carrier / acting player",
      "title": "Player Id"
    },
    "outcome": {
      "anyOf": [
        {
          "enum": [
            "complete",
            "incomplete",
            "offside",
            "won",
            "lost",
            "goal",
            "saved",
            "blocked",
            "off_target"
          ],
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null,
      "title": "Outcome"
    },
    "ball": {
      "$ref": "#/$defs/Point"
    },
    "end": {
      "anyOf": [
        {
          "$ref": "#/$defs/Point"
        },
        {
          "type": "null"
        }
      ],
      "default": null,
      "description": "where the ball ended (pass, carry, shot)"
    },
    "receiver_id": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "default": null,
      "description": "intended receiver of a pass",
      "title": "Receiver Id"
    },
    "possession_id": {
      "description": "increments each time possession changes team",
      "title": "Possession Id",
      "type": "integer"
    },
    "players": {
      "items": {
        "$ref": "#/$defs/PlayerPos"
      },
      "maxItems": 22,
      "minItems": 22,
      "title": "Players",
      "type": "array"
    },
    "pressure_m": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "null"
        }
      ],
      "description": "distance from ball carrier to nearest opponent",
      "title": "Pressure M"
    },
    "xg": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "null"
        }
      ],
      "default": null,
      "description": "goal probability, shots only",
      "title": "Xg"
    },
    "score": {
      "$ref": "#/$defs/Score"
    }
  },
  "required": [
    "match_id",
    "seq",
    "clock_s",
    "period",
    "type",
    "team",
    "player_id",
    "ball",
    "possession_id",
    "players",
    "pressure_m",
    "score"
  ],
  "title": "MatchEvent",
  "type": "object"
}
```

</details>

### `MatchMeta`

<details><summary>JSON Schema</summary>

```json
{
  "$defs": {
    "PlayerMeta": {
      "additionalProperties": false,
      "properties": {
        "id": {
          "title": "Id",
          "type": "string"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "number": {
          "title": "Number",
          "type": "integer"
        },
        "position": {
          "title": "Position",
          "type": "string"
        }
      },
      "required": [
        "id",
        "name",
        "number",
        "position"
      ],
      "title": "PlayerMeta",
      "type": "object"
    },
    "TeamMeta": {
      "additionalProperties": false,
      "properties": {
        "code": {
          "enum": [
            "HOME",
            "AWAY"
          ],
          "title": "Code",
          "type": "string"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "short_name": {
          "title": "Short Name",
          "type": "string"
        },
        "kit_primary": {
          "title": "Kit Primary",
          "type": "string"
        },
        "kit_secondary": {
          "title": "Kit Secondary",
          "type": "string"
        },
        "formation": {
          "title": "Formation",
          "type": "string"
        },
        "players": {
          "items": {
            "$ref": "#/$defs/PlayerMeta"
          },
          "title": "Players",
          "type": "array"
        }
      },
      "required": [
        "code",
        "name",
        "short_name",
        "kit_primary",
        "kit_secondary",
        "formation",
        "players"
      ],
      "title": "TeamMeta",
      "type": "object"
    }
  },
  "additionalProperties": false,
  "properties": {
    "match_id": {
      "title": "Match Id",
      "type": "string"
    },
    "seed": {
      "title": "Seed",
      "type": "integer"
    },
    "contract_version": {
      "default": "1.0.0",
      "title": "Contract Version",
      "type": "string"
    },
    "pitch_length_m": {
      "default": 105.0,
      "title": "Pitch Length M",
      "type": "number"
    },
    "pitch_width_m": {
      "default": 68.0,
      "title": "Pitch Width M",
      "type": "number"
    },
    "duration_s": {
      "default": 5400,
      "title": "Duration S",
      "type": "integer"
    },
    "home": {
      "$ref": "#/$defs/TeamMeta"
    },
    "away": {
      "$ref": "#/$defs/TeamMeta"
    }
  },
  "required": [
    "match_id",
    "seed",
    "home",
    "away"
  ],
  "title": "MatchMeta",
  "type": "object"
}
```

</details>

### `EvidencePackage`

<details><summary>JSON Schema</summary>

```json
{
  "$defs": {
    "ChainLink": {
      "additionalProperties": false,
      "properties": {
        "rank": {
          "description": "1 = most blame = root cause",
          "minimum": 1,
          "title": "Rank",
          "type": "integer"
        },
        "clock_s": {
          "title": "Clock S",
          "type": "integer"
        },
        "player_id": {
          "title": "Player Id",
          "type": "string"
        },
        "team": {
          "enum": [
            "HOME",
            "AWAY"
          ],
          "title": "Team",
          "type": "string"
        },
        "bug": {
          "enum": [
            "LATE_STEP_UP",
            "DUEL_LOST",
            "PRESS_MISSED",
            "MARKING_LOST",
            "CROSS_NOT_BLOCKED"
          ],
          "title": "Bug",
          "type": "string"
        },
        "fixed_goal_rate": {
          "description": "goal rate when only this mistake is fixed",
          "maximum": 1,
          "minimum": 0,
          "title": "Fixed Goal Rate",
          "type": "number"
        },
        "drop": {
          "description": "baseline_goal_rate - fixed_goal_rate, floored at 0",
          "minimum": 0,
          "title": "Drop",
          "type": "number"
        },
        "blame": {
          "description": "drop / sum of drops; sums to 1 across links",
          "maximum": 1,
          "minimum": 0,
          "title": "Blame",
          "type": "number"
        },
        "facts": {
          "additionalProperties": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "integer"
              },
              {
                "type": "string"
              }
            ]
          },
          "description": "the ONLY details the explanation agent may use for this link",
          "title": "Facts",
          "type": "object"
        }
      },
      "required": [
        "rank",
        "clock_s",
        "player_id",
        "team",
        "bug",
        "fixed_goal_rate",
        "drop",
        "blame",
        "facts"
      ],
      "title": "ChainLink",
      "type": "object"
    }
  },
  "additionalProperties": false,
  "properties": {
    "contract_version": {
      "default": "1.0.0",
      "title": "Contract Version",
      "type": "string"
    },
    "match_id": {
      "title": "Match Id",
      "type": "string"
    },
    "goal_id": {
      "description": "\"<match_id>-g<n>\"",
      "title": "Goal Id",
      "type": "string"
    },
    "scorer": {
      "title": "Scorer",
      "type": "string"
    },
    "team": {
      "description": "scoring team",
      "enum": [
        "HOME",
        "AWAY"
      ],
      "title": "Team",
      "type": "string"
    },
    "clock_s": {
      "title": "Clock S",
      "type": "integer"
    },
    "possession_id": {
      "title": "Possession Id",
      "type": "integer"
    },
    "chain_start_s": {
      "title": "Chain Start S",
      "type": "integer"
    },
    "baseline_goal_rate": {
      "description": "goal rate replaying the possession unchanged",
      "maximum": 1,
      "minimum": 0,
      "title": "Baseline Goal Rate",
      "type": "number"
    },
    "runs_per_link": {
      "title": "Runs Per Link",
      "type": "integer"
    },
    "root_cause_rank": {
      "default": 1,
      "title": "Root Cause Rank",
      "type": "integer"
    },
    "links": {
      "description": "sorted by rank (blame, descending)",
      "items": {
        "$ref": "#/$defs/ChainLink"
      },
      "title": "Links",
      "type": "array"
    },
    "weights_version": {
      "description": "hash of config/weights.yaml used",
      "title": "Weights Version",
      "type": "string"
    }
  },
  "required": [
    "match_id",
    "goal_id",
    "scorer",
    "team",
    "clock_s",
    "possession_id",
    "chain_start_s",
    "baseline_goal_rate",
    "runs_per_link",
    "links",
    "weights_version"
  ],
  "title": "EvidencePackage",
  "type": "object"
}
```

</details>
<!-- schema:end -->
