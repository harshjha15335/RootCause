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
export const SECONDS = 6420;
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
  /** formation role per player (GK, RB, LCB, ST, ...) */
  roles: string[];
  /** 1 at a goal's second: play stops there and restarts with the kick-off, so never blend across it */
  cut?: Uint8Array;
  short: [string, string];
  clubs: [MatchMeta["home"], MatchMeta["away"]];
};

const flipX = (x: number, period: number) => (period === 1 ? x : PX - x);
const flipY = (y: number, period: number) => (period === 1 ? y : PY - y);

export function periodAt(lab: Lab, s: number) {
  const maxS = Math.floor(lab.raw.length / STRIDE) || SECONDS;
  return lab.raw[Math.min(Math.max(Math.floor(s), 0), maxS - 1) * STRIDE + 48] || 1;
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
  const maxS = Math.floor(lab.raw.length / STRIDE) || SECONDS;
  const s0 = Math.min(Math.max(Math.floor(t), 0), maxS - 1);
  const f = Math.min(Math.max(t - s0, 0), 1);
  const r = lab.raw;
  const p0 = r[s0 * STRIDE + 48] || 1;
  // neighbouring seconds in the same half (the frame flips at half-time; never blend across it)
  const cut = lab.cut;
  const same = (s: number) => {
    let c = Math.min(Math.max(s, 0), maxS - 1);
    if (cut) {
      for (let k = s0; k < c; k++) if (cut[k]) { c = k; break; }
      for (let k = s0 - 1; k >= c; k--) if (cut[k]) { c = k + 1; break; }
    }
    return (r[c * STRIDE + 48] || 1) === p0 ? c : s0;
  };
  const sm = same(s0 - 1), s1 = same(s0 + 1), s2 = same(s0 + 2);
  const X = (s: number, k: number) => flipX(r[s * STRIDE + k] / 10, p0);
  const Y = (s: number, k: number) => flipY(r[s * STRIDE + k + 1] / 10, p0);
  // Catmull-Rom through the 1 Hz samples: smooth paths and continuous speed
  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  const dcr = (a: number, b: number, c: number, d: number) =>
    0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * f + 3 * (-a + 3 * b - 3 * c + d) * f * f);
  const pos: [number, number][] = [];
  const vel: [number, number][] = [];
  for (let i = 0; i < 22; i++) {
    const k = 2 + i * 2;
    pos.push([cr(X(sm, k), X(s0, k), X(s1, k), X(s2, k)), cr(Y(sm, k), Y(s0, k), Y(s1, k), Y(s2, k))]);
    vel.push([dcr(X(sm, k), X(s0, k), X(s1, k), X(s2, k)), dcr(Y(sm, k), Y(s0, k), Y(s1, k), Y(s2, k))]);
  }
  // the ball travels in straight lines between touches
  const ball: [number, number] = [X(s0, 0) + (X(s1, 0) - X(s0, 0)) * f, Y(s0, 0) + (Y(s1, 0) - Y(s0, 0)) * f];
  return { ball, pos, vel, team: r[s0 * STRIDE + 46] as 0 | 1, carrier: r[s0 * STRIDE + 47] };
}

/** A player's position at whole second s (home-attacks-right frame). */
export function posAt(lab: Lab, s: number, i: number): [number, number] {
  const maxS = Math.floor(lab.raw.length / STRIDE) || SECONDS;
  const k = Math.min(Math.max(s, 0), maxS - 1) * STRIDE;
  const p = lab.raw[k + 48] || 1;
  return [flipX(lab.raw[k + 2 + i * 2] / 10, p), flipY(lab.raw[k + 3 + i * 2] / 10, p)];
}

/** x measured toward the goal a team attacks (0 = own goal line). */
export const fwdX = (x: number, team: number) => (team === 0 ? x : PX - x);

function classify(lab: Omit<Lab, "poss" | "phase" | "possStart">) {
  const total = Math.floor(lab.raw.length / STRIDE) || SECONDS;
  const poss = new Uint8Array(total);
  const phase = new Uint8Array(total);
  const possStart = new Uint32Array(total);
  let start = 0;
  for (let s = 0; s < total; s++) {
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

type RawEvent = (string | number | null)[];

/**
 * The tracking file restarts play for the kick-off before the goal has gone in: in every goal of
 * every match, the two seconds before it (and the goal second) already blend toward the centre
 * circle, so the scorer runs away from goal at 12 to 16 m/s and the ball is at halfway when it
 * "goes in". This rebuilds those three seconds from what the events say happened: players carry on
 * from the last clean second, the passer, receiver and scorer are where the events put them, and the
 * ball travels the event lines. Raw frame and units (decimetres), before any flip.
 */
function repairGoals(raw: Int16Array, ev: RawEvent[]) {
  const at = (s: number, k: number) => raw[s * STRIDE + k] / 10;
  const set = (s: number, k: number, v: number) => (raw[s * STRIDE + k] = Math.round(v * 10));
  const evs = ev.map((e) => ({ s: e[0] as number, type: e[1] as string, team: e[2] as number, player: e[3] as number, receiver: e[4] as number | null, from: [e[5], e[6]] as number[], to: [e[7], e[8]] as number[], outcome: e[9] }));
  for (const shot of evs.filter((e) => e.type === "shot" && e.outcome === "goal")) {
    const g = shot.s, c = g - 3;
    if (c < 1 || g >= SECONDS || raw[c * STRIDE + 48] !== raw[g * STRIDE + 48]) continue;
    // Only repair the old engine's premature kickoff reset. Continuous tracking is already
    // authoritative: snapping its players to event endpoints invents cross-pitch runs.
    if (Math.hypot(at(g, 0) - PX / 2, at(g, 1) - PY / 2) > 12 ||
        Math.hypot(shot.from[0] - PX / 2, shot.from[1] - PY / 2) < 20) continue;
    const near = evs.filter((e) => e.s <= g && e.s > g - 30);
    const next = (e: (typeof evs)[number]) => evs.find((x) => x.s > e.s)?.s ?? e.s + 1;
    // where each player must be, and when, by the events after the last clean second
    const keys: [number, number, number][][] = Array.from({ length: 22 }, (_, i) => [[c, at(c, 2 + i * 2), at(c, 3 + i * 2)]]);
    const arrive = (e: (typeof evs)[number]) => Math.min(next(e), e.s + Math.max(0.6, Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]) / 18));
    for (const e of near) {
      if (e.s <= c) continue;
      keys[e.player].push([e.s, e.from[0], e.from[1]]);
      if (e.type === "pass" && e.receiver != null && e.outcome === "complete") keys[e.receiver].push([arrive(e), e.to[0], e.to[1]]);
      if (e.type === "carry") keys[e.player].push([next(e), e.to[0], e.to[1]]);
    }
    for (let t = c + 1; t <= g; t++) {
      for (let i = 0; i < 22; i++) {
        const k = [...keys[i]].sort((a, b) => a[0] - b[0]);
        const before = [...k].reverse().find((q) => q[0] <= t)!, after = k.find((q) => q[0] > t);
        let x: number, y: number;
        if (after) {
          const u = (t - before[0]) / (after[0] - before[0]);
          x = before[1] + (after[1] - before[1]) * u;
          y = before[2] + (after[2] - before[2]) * u;
        } else {
          // no event needs him anywhere: he carries on, slowing
          const vx = at(c, 2 + i * 2) - at(c - 1, 2 + i * 2), vy = at(c, 3 + i * 2) - at(c - 1, 3 + i * 2);
          const d = (1 - Math.pow(0.6, t - before[0])) / (1 - 0.6);
          x = before[1] + vx * 0.6 * d;
          y = before[2] + vy * 0.6 * d;
        }
        set(t, 2 + i * 2, x);
        set(t, 3 + i * 2, y);
      }
      // the ball follows the last event's line
      const e = [...near].reverse().find((q) => q.s <= t);
      if (!e) continue;
      let bx = e.from[0], by = e.from[1], who = e.player;
      if (e.type === "pass" || e.type === "carry") {
        const end = e.type === "pass" ? arrive(e) : next(e), u = Math.min(1, (t - e.s) / Math.max(0.01, end - e.s));
        bx = e.from[0] + (e.to[0] - e.from[0]) * u;
        by = e.from[1] + (e.to[1] - e.from[1]) * u;
        if (e.type === "pass" && u >= 1 && e.receiver != null) who = e.receiver;
      }
      set(t, 0, bx);
      set(t, 1, by);
      raw[t * STRIDE + 46] = shot.team;
      raw[t * STRIDE + 47] = who;
    }
  }
}

/** Fetches and decodes one match's Lab data (tracking.bin, events.json, meta.json). */
export async function loadLab(matchId: string, base = `${import.meta.env.BASE_URL}showcase/${matchId}/`, fetcher: typeof fetch = fetch): Promise<Lab> {
  const get = async (f: string) => {
    const r = await fetcher(base + f);
    if (!r.ok) throw new Error(`${base + f} returned ${r.status}`);
    return r;
  };
  const [bin, events, meta] = await Promise.all([
    get("tracking.bin").then((r) => r.arrayBuffer()),
    get("events.json").then((r) => r.json() as Promise<(string | number | null)[][]>),
    get("meta.json").then((r) => r.json() as Promise<MatchMeta>),
  ]);
  const raw = new Int16Array(bin);
  // Convert explicitly declared event coordinates to the same physical frame as tracking
  // before repairing goals or converting the whole Lab to home-attacks-right.
  const ev = events.map((e) => {
    if (meta.event_coordinate_frame !== "attacking-right") return e;
    const s = Math.min(Math.max(e[0] as number, 0), raw.length / STRIDE - 1);
    const period = raw[s * STRIDE + 48] || 1;
    const flip = (e[2] === 1) !== (period === 2);
    if (!flip) return e;
    const out = e.slice();
    for (const k of [5, 7]) {
      out[k] = PX - (e[k] as number);
      out[k + 1] = PY - (e[k + 1] as number);
    }
    return out;
  });
  repairGoals(raw, ev);
  const totalSeconds = Math.floor(raw.length / STRIDE) || SECONDS;
  const cut = new Uint8Array(totalSeconds);
  for (const e of ev) if (e[1] === "shot" && e[9] === "goal" && (e[0] as number) < totalSeconds) cut[e[0] as number] = 1;
  // tracking index i is H1..H11 then A1..A11
  const ids = Array.from({ length: 22 }, (_, i) => (i < 11 ? `H${i + 1}` : `A${i - 10}`));
  const byId = new Map([...meta.home.players, ...meta.away.players].map((p) => [p.id, p]));
  const rawLab = {
    id: matchId,
    raw,
    actions: [] as Action[],
    names: ids.map((id) => byId.get(id)?.name ?? id),
    numbers: ids.map((id) => byId.get(id)?.number ?? 0),
    roles: ids.map((id) => byId.get(id)?.position ?? ""),
    cut,
    short: [meta.home.short_name, meta.away.short_name] as [string, string],
    clubs: [meta.home, meta.away] as [MatchMeta["home"], MatchMeta["away"]],
  };
  rawLab.actions = ev.map((e) => {
    const s = e[0] as number;
    const p = (raw[Math.min(s, totalSeconds - 1) * STRIDE + 48] || 1) as number;
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
}

export function useLab(matchId = SHOWCASE_MATCH) {
  return useQuery<Lab, Error>({
    queryKey: ["lab", matchId],
    staleTime: Infinity,
    queryFn: () => loadLab(matchId),
  });
}
