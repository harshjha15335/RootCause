import { create } from "zustand";

/**
 * The playhead lives outside React: the 3D/2D pitch reads it every frame. React components
 * subscribe to `second` (updated a few times a second) for clocks and timelines.
 */
export const playhead = {
  /** match time being shown (seconds, fractional) */
  t: 0,
  /** the live broadcast clock (seconds); in showcase mode it advances in real time */
  edge: 0,
  /** 0 = what happened, 1 = mistake fixed (counterfactual morph), damped toward `morphTarget` */
  morph: 0,
};

export type Phase =
  | "live" // following the broadcast
  | "goal" // freeze-frame + camera swoop
  | "tracing" // slow-motion rewind while the Debugger works
  | "traced" // the chain is drawn; the user explores
  | "review"; // the user scrubbed away from live

export type Focus = { evidenceId: string | null; playerId: string | null; source: "hover" | "pin" | null };

type TraceState = {
  phase: Phase;
  playing: boolean;
  speed: number;
  second: number;
  selectedGoalId: string | null;
  /** Window the replay bar shows (match seconds). */
  window: [number, number];
  focus: Focus;
  morphTarget: 0 | 1;
  morphEvidenceId: string | null;
  /** Requested animated seek (null when idle). */
  seekTo: { t: number; ms: number; at: number; from: number } | null;

  setPhase(p: Phase): void;
  setPlaying(p: boolean): void;
  setSpeed(s: number): void;
  setSecond(s: number): void;
  selectGoal(id: string | null): void;
  setWindow(w: [number, number]): void;
  hover(evidenceId: string | null, playerId: string | null): void;
  pin(evidenceId: string | null, playerId: string | null): void;
  seek(t: number, ms?: number): void;
  setMorph(target: 0 | 1, evidenceId?: string | null): void;
};

export const useTrace = create<TraceState>((set, get) => ({
  phase: "live",
  playing: true,
  speed: 1,
  second: 0,
  selectedGoalId: null,
  window: [0, 90],
  focus: { evidenceId: null, playerId: null, source: null },
  morphTarget: 0,
  morphEvidenceId: null,
  seekTo: null,

  setPhase: (phase) => set({ phase }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setSecond: (second) => {
    if (second !== get().second) set({ second });
  },
  selectGoal: (selectedGoalId) => set({ selectedGoalId }),
  setWindow: (window) => set({ window }),
  hover(evidenceId, playerId) {
    const f = get().focus;
    if (f.source === "pin" && !evidenceId && !playerId) return;
    if (!evidenceId && !playerId) set({ focus: { evidenceId: null, playerId: null, source: null } });
    else if (f.source !== "pin") set({ focus: { evidenceId, playerId, source: "hover" } });
  },
  pin(evidenceId, playerId) {
    const f = get().focus;
    if (f.source === "pin" && f.evidenceId === evidenceId && f.playerId === playerId) {
      set({ focus: { evidenceId: null, playerId: null, source: null } });
    } else set({ focus: { evidenceId, playerId, source: "pin" } });
  },
  seek(t, ms = 0) {
    if (ms <= 0) {
      playhead.t = t;
      set({ seekTo: null, second: Math.floor(t) });
    } else set({ seekTo: { t, ms, at: performance.now(), from: playhead.t } });
  },
  setMorph: (morphTarget, evidenceId) =>
    set({ morphTarget, morphEvidenceId: evidenceId === undefined ? get().morphEvidenceId : evidenceId }),
}));
