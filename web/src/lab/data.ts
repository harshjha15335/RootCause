import { useQuery } from "@tanstack/react-query";
import { SHOWCASE_MATCH } from "../api/rest";
import type { MatchMeta } from "../api/types";

/**
 * Full-match tracking for the Tactics Lab, exported offline by web/tools/export_tracking.py.
 * tracking.bin holds 49 Int16 values per match second: ball x/y, 22 players' x/y (decimetres,
 * raw engine frame), possession team, carrier index, period. Everything here is turned into one
 * frame where HOME always attacks toward x = 105, so the picture never flips at half-time.
 */
export const PX = 105;
export const PY = 68;
export const SECONDS = 5400;
const STRIDE = 49;

export type ActionType = "pass" | "carry" | "duel" | "shot" | "offside";
export type Action = {
  s: number;
  type: ActionType;
  team: 0 | 1;
  player: number;
  receiver: number | null;
  from: [number, number];
  to: [number, number];
  outcome: string | null;
  xg: number | null;
  pressure: number | null;
};

/** The four moments of the game, seen from the side with the ball. */
export type Phase = "build" | "progress" | "final" | "counter";
export const PHASES: Phase[] = ["build", "progress", "final", "counter"];

export type Lab = {
  id: string;
  raw: Int16Array;
  actions: Action[];
  /** possession team per second, and the phase that team is in */
  poss: Uint8Array;
  phase: Uint8Array;
  /** second the current possession started */
  possStart: Uint32Array;
  names: string[];
  numbers: number[];
  short: [string, string];
};

const flipX = (x: number, period: number) => (period === 1 ? x : PX - x);
const flipY = (y: number, period: number) => (period === 1 ? y : PY - y);

export function periodAt(lab: Lab, s: number) {
  return lab.raw[Math.min(Math.max(Math.floor(s), 0), SECONDS - 1) * STRIDE + 48] || 1;
}

/** Ball and 22 players at a fractional second, in the home-attacks-right frame. */
export type Frame = {
  ball: [number, number];
  pos: [number, number][];
  vel: [number, number][];
  team: 0 | 1;
  carrier: number;
};

export function frameAt(lab: Lab, t: number): Frame {
  const s0 = Math.min(Math.max(Math.floor(t), 0), SECONDS - 1);
  const s1 = Math.min(s0 + 1, SECONDS - 1);
  const f = Math.min(Math.max(t - s0, 0), 1);
  const r = lab.raw;
  const p0 = r[s0 * STRIDE + 48] || 1;
  const p1 = r[s1 * STRIDE + 48] || 1;
  // at half-time the frame flips; never interpolate across it
  const b = p0 === p1 ? s1 : s0;
  const pt = (k: number): [number, number] => {
    const x0 = flipX(r[s0 * STRIDE + k] / 10, p0), y0 = flipY(r[s0 * STRIDE + k + 1] / 10, p0);
    const x1 = flipX(r[b * STRIDE + k] / 10, p0), y1 = flipY(r[b * STRIDE + k + 1] / 10, p0);
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  };
  const vel = (k: number): [number, number] => {
    if (b === s0) return [0, 0];
    return [flipX(r[b * STRIDE + k] / 10, p0) - flipX(r[s0 * STRIDE + k] / 10, p0), flipY(r[b * STRIDE + k + 1] / 10, p0) - flipY(r[s0 * STRIDE + k + 1] / 10, p0)];
  };
  const pos: [number, number][] = [];
  const v: [number, number][] = [];
  for (let i = 0; i < 22; i++) {
    pos.push(pt(2 + i * 2));
    v.push(vel(2 + i * 2));
  }
  return { ball: pt(0), pos, vel: v, team: r[s0 * STRIDE + 46] as 0 | 1, carrier: r[s0 * STRIDE + 47] };
}

/** A player's position at whole second s (home-attacks-right frame). */
export function posAt(lab: Lab, s: number, i: number): [number, number] {
  const k = Math.min(Math.max(s, 0), SECONDS - 1) * STRIDE;
  const p = lab.raw[k + 48] || 1;
  return [flipX(lab.raw[k + 2 + i * 2] / 10, p), flipY(lab.raw[k + 3 + i * 2] / 10, p)];
}

/** x measured toward the goal a team attacks (0 = own goal line). */
export const fwdX = (x: number, team: number) => (team === 0 ? x : PX - x);

function classify(lab: Omit<Lab, "poss" | "phase" | "possStart">) {
  const poss = new Uint8Array(SECONDS);
  const phase = new Uint8Array(SECONDS);
  const possStart = new Uint32Array(SECONDS);
  let start = 0;
  for (let s = 0; s < SECONDS; s++) {
    const k = s * STRIDE;
    const team = lab.raw[k + 46];
    poss[s] = team;
    if (s > 0 && team !== poss[s - 1]) start = s;
    possStart[s] = start;
    const p = lab.raw[k + 48] || 1;
    const bx = fwdX(flipX(lab.raw[k] / 10, p), team);
    // a regain that is still under 8 s old and moving forward is a counter (attacking transition)
    if (s - start < 8 && start > 0) phase[s] = 3;
    else phase[s] = bx < 35 ? 0 : bx < 70 ? 1 : 2;
  }
  return { poss, phase, possStart };
}

export function useLab(matchId = SHOWCASE_MATCH) {
  return useQuery<Lab, Error>({
    queryKey: ["lab", matchId],
    staleTime: Infinity,
    queryFn: async () => {
      const base = `${import.meta.env.BASE_URL}showcase/${matchId}/`;
      const get = async (f: string) => {
        const r = await fetch(base + f);
        if (!r.ok) throw new Error(`${base + f} returned ${r.status}`);
        return r;
      };
      const [bin, ev, meta] = await Promise.all([
        get("tracking.bin").then((r) => r.arrayBuffer()),
        get("events.json").then((r) => r.json() as Promise<(string | number | null)[][]>),
        get("meta.json").then((r) => r.json() as Promise<MatchMeta>),
      ]);
      const raw = new Int16Array(bin);
      // tracking index i is H1..H11 then A1..A11
      const ids = Array.from({ length: 22 }, (_, i) => (i < 11 ? `H${i + 1}` : `A${i - 10}`));
      const byId = new Map([...meta.home.players, ...meta.away.players].map((p) => [p.id, p]));
      const rawLab = {
        id: matchId,
        raw,
        actions: [] as Action[],
        names: ids.map((id) => byId.get(id)?.name ?? id),
        numbers: ids.map((id) => byId.get(id)?.number ?? 0),
        short: [meta.home.short_name, meta.away.short_name] as [string, string],
      };
      rawLab.actions = ev.map((e) => {
        const s = e[0] as number;
        const p = (raw[Math.min(s, SECONDS - 1) * STRIDE + 48] || 1) as number;
        return {
          s,
          type: e[1] as ActionType,
          team: e[2] as 0 | 1,
          player: e[3] as number,
          receiver: e[4] as number | null,
          from: [flipX(e[5] as number, p), flipY(e[6] as number, p)],
          to: [flipX(e[7] as number, p), flipY(e[8] as number, p)],
          outcome: e[9] as string | null,
          xg: e[10] as number | null,
          pressure: e[11] as number | null,
        };
      });
      return { ...rawLab, ...classify(rawLab) };
    },
  });
}
