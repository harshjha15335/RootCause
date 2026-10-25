import type { Lab } from "../data";
import type { Pt, Snap } from "../journey/model";
import { cornerMotion } from "./corner";
import { possessionBall } from "./possession";

export type GoalType = "penalty" | "corner" | "freeKick" | "openPlay" | "setPiece" | "unknown";

/** Classify only explicit source labels; location and xG cannot establish a set piece. */
export function goalType(kind?: string): GoalType {
  const k = kind?.toLowerCase().replace(/[ -]+/g, "_");
  if (!k) return "unknown";
  if (k.includes("penalty")) return "penalty";
  if (k.includes("corner")) return "corner";
  if (k.includes("free_kick") || k.includes("freekick")) return "freeKick";
  if (k.includes("set_piece")) return "setPiece";
  if (["open_play", "open_play_tap_in", "counter_tap_in", "sliding_finish", "rebound_tap_in", "deflected_long_shot", "header", "long_shot"].includes(k)) return "openPlay";
  return "unknown";
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const smooth = (x: number) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };

export type Play = { lab: Lab; goalS: number; moveFrom: number; att: 0 | 1; scorer: number; frame(s: number): Snap; chance: { honest?: { kind: string }; assist?: { id: string } | null } | null };

/**
 * Display-only reconstruction for fixture players with no off-ball tracking motion.
 * Source event order and actors drive the ball's reconstructed touches. Player paths are retained where consistent;
 * static players react with bounded support/cover runs, obvious speed outliers are
 * smoothed, and unambiguous scoring-slot mismatches are reconciled. Never used for stats,
 * blame, fixed replays or frozen evidence diagrams. Precomputation makes scrubbing and
 * playback rates deterministic, with no random jitter or frame-rate-dependent movement.
 */
export function teamMotion(a: Play): (s: number) => Snap {
  if (goalType(a.chance?.honest?.kind) === "corner") return cornerMotion(a);
  const start = Math.max(a.moveFrom, a.goalS - 24), end = a.goalS + 1.5, dt = 0.1;
  // Some imported goals put the scorer's event on another same-team tracking slot.
  // Reconcile only an unambiguous finish (exact endpoint, scorer far away), without
  // changing the source data or attributing that slot's movement to an unrelated player.
  const slots = Array.from({ length: 22 }, (_, i) => i);
  const shot = a.lab.actions.find((e) => e.s === a.goalS && e.type === "shot");
  if (shot) {
    const contact: Pt = a.att ? [105 - shot.from[0], 68 - shot.from[1]] : shot.from;
    const finish = a.frame(a.goalS);
    const gap = (i: number) => Math.hypot(finish.pos[i][0] - contact[0], finish.pos[i][1] - contact[1]);
    const candidates = slots.filter((i) => Math.floor(i / 11) === a.att && i % 11 !== 0 && gap(i) < 0.5);
    if (gap(a.scorer) > 8 && candidates.length === 1) {
      slots[a.scorer] = candidates[0]; slots[candidates[0]] = a.scorer;
    }
  }
  const recorded = (s: number): Snap => { const f = a.frame(s); return { ...f, pos: slots.map((i) => f.pos[i]) }; };
  const initial = recorded(start);
  const min = initial.pos.map((p) => [...p] as Pt), max = initial.pos.map((p) => [...p] as Pt);
  // Judge activity over the visible goal replay, not an unrelated touch 20 seconds earlier.
  const visibleStart = Math.max(start, a.goalS - 7);
  recorded(visibleStart).pos.forEach((p, i) => { min[i] = [...p]; max[i] = [...p]; });
  for (let s = visibleStart; s <= a.goalS; s += 0.5) {
    recorded(s).pos.forEach((p, i) => {
      min[i][0] = Math.min(min[i][0], p[0]); min[i][1] = Math.min(min[i][1], p[1]);
      max[i][0] = Math.max(max[i][0], p[0]); max[i][1] = Math.max(max[i][1], p[1]);
    });
  }
  const stationary = min.map((p, i) => {
    const involved = a.lab.actions.some((e) => e.s >= visibleStart && e.s <= a.goalS && (e.player === i || e.receiver === i));
    return Math.hypot(max[i][0] - p[0], max[i][1] - p[1]) < (involved ? 0.75 : 3);
  });
  const touches = slots.map((_, i) => a.lab.actions.filter((e) => e.player === i && e.s >= start && e.s <= a.goalS).map((e) => e.s));
  const offsets: Pt[] = initial.pos.map(() => [0, 0]);
  const samples: Pt[][] = [];
  const speedLimited = slots.map(() => false);
  const penalty = goalType(a.chance?.honest?.kind) === "penalty";
  for (let n = 0; n <= Math.ceil((end - start) / dt); n++) {
    const s = Math.min(start + n * dt, end), f = recorded(s);
    const progress = smooth((s - start) / Math.max(a.goalS - start, 1));
    const defensiveOrder = slots.filter((i) => Math.floor(i / 11) !== a.att && i % 11 !== 0)
      .sort((i, j) => Math.hypot(f.pos[i][0] - f.ball[0], f.pos[i][1] - f.ball[1]) - Math.hypot(f.pos[j][0] - f.ball[0], f.pos[j][1] - f.ball[1]));
    const frames = f.pos.map((p, i): Pt => {
      if (!stationary[i]) {
        const before = samples[n - 1]?.[i];
        if (!before) return [...p];
        const distance = Math.hypot(p[0] - before[0], p[1] - before[1]);
        const weight = Math.min(1, 8.5 * dt / Math.max(distance, 0.001));
        if (weight < 1) speedLimited[i] = true;
        return [before[0] + (p[0] - before[0]) * weight, before[1] + (p[1] - before[1]) * weight];
      }
      const role = a.lab.roles[i] ?? "", keeper = i % 11 === 0 || role === "GK";
      const attacking = Math.floor(i / 11) === a.att;
      const activity = penalty && s < a.goalS - 0.4 ? 0.12 : 1;
      const run = smooth((s - start - (i % 5) * 0.18) / Math.max(a.goalS - start, 1));
      const envelope = smooth((s - start) / 1.4);
      const phase = i * 2.39996, clock = (s - start) * 2 * Math.PI / (8.5 + i % 4);
      // Visible, staggered support/cover runs rather than a sub-metre drift that looks
      // stationary during slow motion. The run curves are illustrative, not tracking.
      const supportX = (Math.sin(clock + phase) - Math.sin(phase)) * envelope;
      const supportY = (Math.cos(clock + phase) - Math.cos(phase)) * envelope;
      const ballShift: Pt = [clamp(f.ball[0] - initial.ball[0], -24, 24), clamp(f.ball[1] - initial.ball[1], -20, 20)];
      const target: Pt = keeper
        ? [clamp(f.ball[0] - p[0], -6, 6) * 0.12 * progress + supportX * 0.55,
          clamp((f.ball[1] - 34) * 0.08, -1.5, 1.5) * progress + supportY * 0.85]
        : [(attacking ? 4 : 2.4) * run + ballShift[0] * 0.12 * progress + supportX * 2.8,
          ballShift[1] * 0.14 * progress + clamp(34 - p[1], -10, 10) * 0.12 * run + supportY * 2.2];
      if (!keeper && !attacking && !penalty) {
        const rank = defensiveOrder.indexOf(i);
        const threat = rank < 2 ? f.ball : f.pos[a.scorer];
        const react = smooth((s - visibleStart) / 3.5);
        const length = Math.max(Math.hypot(threat[0] - p[0], threat[1] - p[1]), 1);
        target[0] += (threat[0] - p[0]) / length * (rank < 2 ? 7 : 4.5) * react;
        target[1] += (threat[1] - p[1]) / length * (rank < 2 ? 7 : 4.5) * react;
      }
      const limit = keeper ? 2.5 : 10;
      const length = Math.hypot(...target);
      const scale = Math.min(1, limit / Math.max(length, 0.001)) * activity;
      const dx = target[0] * scale - offsets[i][0], dy = target[1] * scale - offsets[i][1];
      // Defenders actively close/track at a controlled jogging pace.
      const step = Math.min(1 - Math.exp(-dt / 0.65), (keeper ? 1.2 : 3.8) * dt / Math.max(Math.hypot(dx, dy), 0.001));
      offsets[i][0] += dx * step; offsets[i][1] += dy * step;
      return [clamp(p[0] + offsets[i][0], 0.5, 104.5), clamp(p[1] + offsets[i][1], 0.5, 67.5)];
    });
    samples.push(frames);
  }
  const display = (s: number): Snap => {
    const f = recorded(s);
    if (s < start) return f;
    const t = clamp((s - start) / dt, 0, samples.length - 1), i = Math.floor(t), j = Math.min(i + 1, samples.length - 1), u = t - i;
    return { ...f, pos: samples[i].map((p, k): Pt => {
      if (!stationary[k]) return speedLimited[k]
        ? [p[0] + (samples[j][k][0] - p[0]) * u, p[1] + (samples[j][k][1] - p[1]) * u]
        : f.pos[k];
      // Ease a static actor back to its event position at the touch, not for the entire
      // lead-in. This preserves contact while leaving its off-ball runs visible.
      const weight = touches[k].reduce((w, touch) => Math.min(w, smooth(Math.abs(s - touch) / 2.5)), 1);
      return [
        f.pos[k][0] + (p[0] + (samples[j][k][0] - p[0]) * u - f.pos[k][0]) * weight,
        f.pos[k][1] + (p[1] + (samples[j][k][1] - p[1]) * u - f.pos[k][1]) * weight,
      ];
    }) };
  };
  // Touch continuity does not depend on a finish label. Imported datasets may call a
  // goal "rebound" or "counter_tap_in" rather than the exporter's older aliases.
  return penalty ? display : possessionBall(a, display);
}
