# Proposed contracts v0.1

Read this document and `.github/copilot-instructions.md` before changing the backend.
These contracts are proposals; the team has not frozen them.

All entities use string IDs. Pitch coordinates are metres, x=0..105, y=0..68.
Player IDs are unique within a match. Times are integer elapsed seconds.
Strict Pydantic definitions in `api/contracts.py` reject unknown fields.

## Match event

`id`, `match_id`, `second`, `type` (pass/duel/cross/goal), `team` (home/away),
`player_id`, `ball` {x,y}, `players` [{player_id,team,position:{x,y}}].
Exactly 22 unique players, 11 per team, including the event's player.

## Evidence package

`goal_id`, `match_id`, `source` (synthetic-fixture/debugger), `goal` (match event),
`links`, `views`. Each link has `evidence_id`, `player_id`, `second`, `bug_type`,
`description`, `blame_percent`, `baseline_goals`, `fixed_goals`, `trials` (200).
Blame percentages are supplied by the engine, must sum to 100, and are never computed
by a language model. The fixture uses two deliberately hand-written links.
Views contain `player_id`, `second`, and string `observations`.

## Verdict

`goal_id`, `match_id`, `source`, `testimonies`, `accepted_claims`, `rejected_claims`,
`blame_order`, `reasoning`, `recaps` (fan/analyst/studio text).
Each testimony includes `player_id`, `source`, and `claims`. Claims contain
`evidence_id`, `player_id`, `description`, and `blame_percent`. The local checker
accepts only exact evidence matches. It does not validate arbitrary natural-language
claims. Player tools expose only the bound player's data. Treat provider output as
untrusted. Local verdicts always disclose `source=evidence-only`.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /health | Local runtime status and limitations |
| POST | /matches | JSON {seed: nonnegative integer}; 201 with match ID |
| GET | /matches/{id} | Seed, status, score, goal IDs |
| GET | /goals/{id}/trace | Evidence package; 404 if unavailable |
| GET | /goals/{id}/verdict?mode=fan&lang=en | Verdict and selected recap |
| GET | /matches/{id}/report?mode=fan&lang=en | Finished-match recaps; 409 while running |
| WS | /live/{match_id} | Replay followed by live messages |

Unknown entities return 404; invalid inputs return 422. Modes: fan/analyst/studio.
Only English is implemented; other languages return 503. Unknown WebSocket matches
close with code 1008. The stream replays all messages on every connection; consumers
deduplicate by match_id and sequence.

Messages are `{type, match_id, sequence, payload}`:

| type | payload |
| --- | --- |
| match.event | Match event |
| goal.detected | {goal_id} |
| trace.ready | Evidence package |
| agent.step | {goal_id, agent, status} |
| verdict.ready | Verdict |
| match.failed | Generic failure message |

The demo exposes the full evidence to UI clients; player isolation is enforced through
the player tool interface. Transport authentication and authorization remain future work.

## Implemented extensions in v0.2

Evidence optionally includes an engine-declared `root_cause_evidence_id`; otherwise the
highest blame (ties by evidence ID) is the dominant-attribution root. It must reference
a link. IDs are 1–100 ASCII letters/digits/underscore/hyphen. Descriptions and collection
sizes are bounded. Views cannot include future observations or unknown players.

Testimonies add server-rendered `statement` and `rebuttal`; verdicts add
`root_cause_evidence_id`, `latency_ms`, and `warnings`. Models may return structured
claims and plans, but the server validates and renders the displayed prose. Safety
redaction preserves percentages while withholding flagged narrative. Source=model means
the model Judge passed independent checks; individual testimonies can still disclose
source=evidence-only. All local verdicts remain evidence-only.

POST /ingest/evidence accepts recorded packages (202); conflicting contents for an
existing goal ID return 409. POST /matches/{id}/finish marks externally streamed matches
complete. GET /ready checks storage. GET /goals/{id}/audio?mode=&lang= returns audio/mpeg
or 503. Azure /matches publishes events through Event Hubs with a demo-only envelope
`{event:MatchEvent,evidence:Evidence|null}`; the optional evidence must match the goal and
retain source=synthetic-fixture. External publishers can send raw MatchEvent JSON for
real debugger processing. Event delivery is at least once; event/goal IDs deduplicate
processing, and clients deduplicate stream messages by sequence.

Azure verdict requests support en/hi/es. If translation fails, `lang=en`,
`requested_lang` retains the request, and `translation_warning` explains the fallback.
Other languages return 422. `audio_available` indicates configured speech; the audio
endpoint can still fail and consumers must disable voice on 503. Reports include factual
patterns, top_causes, highlight_order and report_warning. Streaming reports are explicitly
provisional; /finish supplies the full-time boundary for external streams.

Azure mode requires Entra Bearer authentication for all API routes except /health and
/ready. CORS permits only FRONTEND_ORIGIN. A browser socket can pass protocols
["rootcause", access_token]; native clients use the Authorization header. Use a single
API replica/worker until a distributed broker is implemented.
