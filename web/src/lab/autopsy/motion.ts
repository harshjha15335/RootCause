import type { Lab } from "../data";
import type { Pt, Snap } from "../journey/model";

export type GoalType = "penalty" | "corner" | "freeKick" | "openPlay" | "setPiece" | "unknown";

/** Classify only explicit source labels; location and xG cannot establish a set piece. */
export function goalType(kind?: string): GoalType {
  const k = kind?.toLowerCase().replace(/[ -]+/g, "_");
  if (!k) return "unknown";
  if (k.includes("penalty")) return "penalty";
  if (k.includes("corner")) return "corner";
  if (k.includes("free_kick") || k.includes("freekick")) return "freeKick";
  if (k.includes("set_piece")) return "setPiece";
  if (["open_play", "open_play_tap_in", "sliding_finish", "rebound_tap_in", "deflected_long_shot", "header", "long_shot"].includes(k)) return "openPlay";
  return "unknown";
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const smooth = (x: number) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };

type Play = { lab: Lab; goalS: number; moveFrom: number; att: 0 | 1; scorer: number; frame(s: number): Snap; chance: { honest?: { kind: string } } | null };

/**
 * Display-only reconstruction for fixture players with no off-ball tracking motion.
 * Moving recorded players and the event's ball path remain authoritative. Static players
 * react to the ball with bounded, role-aware support/cover runs. Never used for stats,
 * blame, fixed replays or frozen evidence diagrams. Precomputation makes scrubbing and
 * playback rates deterministic, with no random jitter or frame-rate-dependent movement.
 */
export function teamMotion(a: Play): (s: number) => Snap {
  const start = Math.max(a.moveFrom, a.goalS - 24), end = a.goalS + 1.5, dt = 0.1;
  const initial = a.frame(start);
  const min = initial.pos.map((p) => [...p] as Pt), max = initial.pos.map((p) => [...p] as Pt);
  for (let s = start; s <= a.goalS; s += 1) {
    a.frame(s).pos.forEach((p, i) => {
      min[i][0] = Math.min(min[i][0], p[0]); min[i][1] = Math.min(min[i][1], p[1]);
      max[i][0] = Math.max(max[i][0], p[0]); max[i][1] = Math.max(max[i][1], p[1]);
    });
  }
  const actors = new Set([a.scorer]);
  for (const e of a.lab.actions) {
    if (e.s < start || e.s > a.goalS) continue;
    actors.add(e.player);
    if (e.receiver != null) actors.add(e.receiver);
  }
  const stationary = min.map((p, i) => !actors.has(i) && Math.hypot(max[i][0] - p[0], max[i][1] - p[1]) < 0.75);
  const offsets: Pt[] = initial.pos.map(() => [0, 0]);
  const samples: Pt[][] = [];
  const penalty = goalType(a.chance?.honest?.kind) === "penalty";
  for (let n = 0; n <= Math.ceil((end - start) / dt); n++) {
    const s = Math.min(start + n * dt, end), f = a.frame(s);
    const progress = smooth((s - start) / Math.max(a.goalS - start, 1));
    const frames = f.pos.map((p, i): Pt => {
      if (!stationary[i]) return [...p];
      const role = a.lab.roles[i] ?? "", keeper = i % 11 === 0 || role === "GK";
      const attacking = Math.floor(i / 11) === a.att;
      const activity = penalty && s < a.goalS - 0.4 ? 0.12 : 1;
      const run = smooth((s - start - (i % 5) * 0.18) / Math.max(a.goalS - start, 1));
      const ballShift: Pt = [clamp(f.ball[0] - initial.ball[0], -24, 24), clamp(f.ball[1] - initial.ball[1], -20, 20)];
      const target: Pt = keeper
        ? [clamp(f.ball[0] - p[0], -6, 6) * 0.12 * progress, clamp((f.ball[1] - 34) * 0.08, -1.5, 1.5) * progress]
        : [(attacking ? 4 : 2.4) * run + ballShift[0] * 0.12 * progress,
          ballShift[1] * 0.14 * progress + clamp(34 - p[1], -10, 10) * 0.12 * run];
      const limit = keeper ? 1.8 : 6;
      const length = Math.hypot(...target);
      const scale = Math.min(1, limit / Math.max(length, 0.001)) * activity;
      const dx = target[0] * scale - offsets[i][0], dy = target[1] * scale - offsets[i][1];
      // Ease toward a target, never more than 2.2 m/s (0.8 for keepers).
      const step = Math.min(1 - Math.exp(-dt / 0.65), (keeper ? 0.8 : 2.2) * dt / Math.max(Math.hypot(dx, dy), 0.001));
      offsets[i][0] += dx * step; offsets[i][1] += dy * step;
      return [clamp(p[0] + offsets[i][0], 0.5, 104.5), clamp(p[1] + offsets[i][1], 0.5, 67.5)];
    });
    samples.push(frames);
  }
  return (s) => {
    const f = a.frame(s);
    if (s < start) return f;
    const t = clamp((s - start) / dt, 0, samples.length - 1), i = Math.floor(t), j = Math.min(i + 1, samples.length - 1), u = t - i;
    return { ...f, pos: samples[i].map((p, k): Pt => stationary[k]
      ? [p[0] + (samples[j][k][0] - p[0]) * u, p[1] + (samples[j][k][1] - p[1]) * u]
      : f.pos[k]) };
  };
}
