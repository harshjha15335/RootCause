/**
 * Data contracts, mirrored by hand from docs/SPEC.md and api/contracts.py (team contract)
 * and docs/ENGINE.md / engine/models.py (engine contract). Nothing here is a new API shape:
 * if a field changes upstream, change it here so the build breaks before the demo does.
 */

// ---- team contract (api/contracts.py) -----------------------------------------------------

export type TeamSide = "home" | "away";
export type Point = { x: number; y: number };

export type PlayerPosition = { player_id: string; team: TeamSide; position: Point };

export type MatchEvent = {
  id: string;
  match_id: string;
  second: number;
  type: "pass" | "duel" | "cross" | "goal";
  team: TeamSide;
  player_id: string;
  ball: Point;
  players: PlayerPosition[];
};

export type Link = {
  evidence_id: string;
  player_id: string;
  second: number;
  bug_type: string;
  description: string;
  blame_percent: number;
  baseline_goals: number;
  fixed_goals: number;
  trials: 200;
};

export type Evidence = {
  goal_id: string;
  match_id: string;
  source: "synthetic-fixture" | "debugger";
  goal: MatchEvent;
  links: Link[];
  events: MatchEvent[];
  root_cause_evidence_id: string;
};

export type SentenceKind =
  | "description"
  | "attribution"
  | "counterfactual"
  | "root"
  | "recap"
  | "persona"
  | string;

export type CitedSentence = { text: string; evidence_ids: string[]; kind: SentenceKind };

export type Mode = "fan" | "analyst" | "studio";
export type Lang = "en" | "hi" | "es";

export type Highlight = {
  evidence_id: string;
  start_second: number;
  end_second: number;
  caption: CitedSentence;
};

export type Explanation = {
  goal_id: string;
  match_id: string;
  status: "ready" | "pending";
  source: "model" | "evidence-only";
  root_cause_evidence_id: string;
  paragraphs: { evidence_id: string; sentences: CitedSentence[] }[];
  root_summary: CitedSentence[];
  highlights: Highlight[];
  recaps: Record<Mode, CitedSentence[]>;
  blame_order: Link[];
  latency_ms: number;
  warnings: string[];
};

/** GET /goals/{id}/explanation?mode=&lang= */
export type ExplanationResponse = Explanation & {
  mode: Mode;
  lang: Lang;
  requested_lang: string;
  text: string;
  translation_warning: string | null;
  audio_available: boolean;
  sentences: CitedSentence[];
};

/** GET /matches/{id}/report?mode=&lang= */
export type MatchReport = {
  match_id: string;
  mode: Mode;
  requested_lang: string;
  source: "model" | "evidence-only";
  goals: {
    goal_id: string;
    text: string;
    sentences: CitedSentence[];
    lang: string;
    translation_warning: string | null;
  }[];
  patterns: Record<string, number>;
  top_causes: string[];
  provisional: boolean;
  highlight_order: string[];
  report_warning: string | null;
};

/** GET /matches/{id} */
export type MatchRecord = {
  id: string;
  seed: number | null;
  status: "running" | "streaming" | "finished" | "failed";
  score: { home: number; away: number };
  goal_ids: string[];
  source?: string;
};

// ---- WebSocket /live/{match_id} ------------------------------------------------------------

export type AgentStep = { goal_id: string; agent: string; status: string; mode?: Mode };

export type WsMessage =
  | { type: "match.event"; match_id: string; sequence: number; payload: MatchEvent }
  | { type: "goal.detected"; match_id: string; sequence: number; payload: { event_id: string } }
  | { type: "trace.ready"; match_id: string; sequence: number; payload: Evidence }
  | { type: "agent.step"; match_id: string; sequence: number; payload: AgentStep }
  | { type: "explanation.ready"; match_id: string; sequence: number; payload: Explanation }
  | { type: "match.failed"; match_id: string; sequence: number; payload: { message: string } };

// ---- engine contract (docs/ENGINE.md) ------------------------------------------------------

export type EngineMatchEvent = {
  match_id: string;
  seq: number;
  clock_s: number;
  period: 1 | 2;
  type: string;
  team: "HOME" | "AWAY" | null;
  player_id: string | null;
  outcome: string | null;
  ball: Point;
  end: Point | null;
  receiver_id: string | null;
  possession_id: number;
  players: { id: string; x: number; y: number }[];
  pressure_m?: number | null;
  xg?: number | null;
  score?: { HOME: number; AWAY: number };
};

export type ClubMeta = {
  code: "HOME" | "AWAY";
  name: string;
  short_name: string;
  kit_primary: string;
  kit_secondary: string;
  formation: string;
  players: { id: string; name: string; number: number; position: string }[];
};

export type MatchMeta = {
  match_id: string;
  seed: number;
  pitch_length_m: number;
  pitch_width_m: number;
  duration_s: number;
  home: ClubMeta;
  away: ClubMeta;
};

// ---- showcase recording (web/tools/export_showcase.py) -------------------------------------

export type ReplayFrame = {
  clock_s: number;
  carrier: string;
  ball: [number, number];
  players: { id: string; x: number; y: number }[];
  note?: string;
};

export type RecordedReplay = {
  evidence_id: string;
  fix: string;
  run: number;
  scored: boolean;
  chain_start_s: number;
  frames: ReplayFrame[];
};

export type GroundTruth = {
  match_id: string;
  goal_id: string;
  goal_clock_s: number;
  root_cause_player_id: string;
  root_cause_clock_s: number;
  bug: string;
  params: Record<string, number>;
};

export type ShowcaseManifest = {
  match_id: string;
  commit: string;
  goals: string[];
  traced: string[];
  untraced: { event_id: string; reason: string }[];
  windows: { from_s: number; to_s: number }[];
};
