import { create } from "zustand";
import type { AgentStep, Evidence, Explanation, MatchEvent, MatchMeta, RecordedReplay, WsMessage } from "../api/types";
import { Track } from "../lib/frames";

export type GoalInfo = {
  eventId: string;
  second: number;
  team: "home" | "away";
  playerId: string;
  /** Set when trace.ready arrives; the Debugger names goals <match_id>-g<n>. */
  goalId: string | null;
  detectedAt: number;
};

type MatchState = {
  matchId: string | null;
  meta: MatchMeta | null;
  /** Positions over time; mutable for speed, `trackVersion` signals changes. */
  track: Track;
  trackVersion: number;
  /** Recorded counterfactual replays, per goal id then evidence id (showcase only). */
  replays: Record<string, Record<string, RecordedReplay>>;
  events: MatchEvent[];
  score: { home: number; away: number };
  goals: GoalInfo[];
  evidence: Record<string, Evidence>;
  explanations: Record<string, Explanation>;
  steps: Record<string, AgentStep[]>;
  /** Highest match second received so far. */
  head: number;
  status: "connecting" | "streaming" | "finished" | "failed";
  failure: string | null;
  untraced: Record<string, string>;

  reset(matchId: string, meta: MatchMeta | null): void;
  ingest(m: WsMessage): void;
  setStatus(s: MatchState["status"]): void;
};

export const useMatch = create<MatchState>((set, get) => ({
  matchId: null,
  meta: null,
  track: new Track(),
  trackVersion: 0,
  replays: {},
  events: [],
  score: { home: 0, away: 0 },
  goals: [],
  evidence: {},
  explanations: {},
  steps: {},
  head: 0,
  status: "connecting",
  failure: null,
  untraced: {},

  reset(matchId, meta) {
    const order = meta ? [...meta.home.players, ...meta.away.players].map((p) => p.id) : undefined;
    set({
      matchId,
      meta,
      track: new Track(order),
      trackVersion: 0,
      events: [],
      score: { home: 0, away: 0 },
      goals: [],
      evidence: {},
      explanations: {},
      steps: {},
      head: 0,
      status: "connecting",
      failure: null,
    });
  },

  setStatus(status) {
    set({ status });
  },

  ingest(m) {
    const s = get();
    switch (m.type) {
      case "match.event": {
        const e = m.payload;
        s.track.addTeam(e);
        set({
          events: [...s.events, e],
          head: Math.max(s.head, e.second),
          trackVersion: s.trackVersion + 1,
          status: s.status === "finished" ? s.status : "streaming",
        });
        break;
      }
      case "goal.detected": {
        const e = s.events.find((x) => x.id === m.payload.event_id);
        if (!e || s.goals.some((g) => g.eventId === e.id)) break;
        set({
          goals: [...s.goals, { eventId: e.id, second: e.second, team: e.team, playerId: e.player_id, goalId: null, detectedAt: performance.now() }],
          score: { ...s.score, [e.team]: s.score[e.team] + 1 },
        });
        break;
      }
      case "trace.ready": {
        const ev = m.payload;
        set({
          evidence: { ...s.evidence, [ev.goal_id]: ev },
          goals: s.goals.map((g) => (g.eventId === ev.goal.id ? { ...g, goalId: ev.goal_id } : g)),
        });
        break;
      }
      case "agent.step": {
        const st = m.payload;
        set({ steps: { ...s.steps, [st.goal_id]: [...(s.steps[st.goal_id] ?? []), st] } });
        break;
      }
      case "explanation.ready": {
        set({ explanations: { ...s.explanations, [m.payload.goal_id]: m.payload } });
        break;
      }
      case "match.failed": {
        set({ status: "failed", failure: m.payload.message });
        break;
      }
    }
  },
}));
