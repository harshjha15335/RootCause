import type { Snap } from "../journey/model";

/** Display-only support/marking runs around an evidence frame. The ball and pinned
 * evidence actors stay recorded; defending x positions retain the measured line.
 * The clock is the stage clock, so holds can stay alive and Pause freezes exactly.
 * The same motion rules apply in real and fixed universes, never in analysis.
 */
export function evidenceContext(f: Snap, elapsed: number, def: number, pinned: readonly number[], near?: readonly number[]): Snap {
  const t = Math.max(0, elapsed);
  const bound = (base: number, delta: number, max: number) => Math.min(Math.max(max, base), Math.max(Math.min(0.5, base), base + delta));
  const pinnedSet = new Set(pinned);
  return { ...f, pos: f.pos.map((p, i) => {
    if (pinnedSet.has(i) || Math.hypot(p[0] - f.ball[0], p[1] - f.ball[1]) < 2.5) return [...p];
    const keeper = i % 11 === 0, phase = i * 2.39996;
    const proximity = Math.min(1, Math.max(0, (Math.hypot(p[0] - f.ball[0], p[1] - f.ball[1]) - 2.5) / 3));
    // `near` is the same weight smoothed over time by the caller (see ballDistance): a pass leaving a
    // player then eases his runs back in instead of throwing him 2 m in a tenth of a second
    const weight = near ? near[i] : proximity * proximity * (3 - 2 * proximity);
    const envelope = Math.min(t / 1.2, 1) * weight;
    const amplitude = keeper ? 0.55 : 2.4;
    const dx = Math.floor(i / 11) === def ? 0 : amplitude * Math.sin(t * 0.85) * Math.cos(phase);
    const dy = amplitude * Math.sin(t * 0.95 + phase) * Math.sin(t * 0.45);
    return [bound(p[0], dx * envelope, 104.5), bound(p[1], dy * envelope, 67.5)];
  }) };
}

/**
 * The off-ball weight per player over time for one source: 0 near the ball, 1 away from it,
 * widened around every touch (so a receiver is still before the ball arrives) and averaged, so the
 * weight never changes faster than about a second's ease. Sampled once, read by interpolation.
 */
export function ballDistance(at: (s: number) => Snap, from: number, to: number): (s: number) => number[] {
  const dt = 0.1, n = Math.max(1, Math.ceil((to - from) / dt));
  const raw: number[][] = [];
  for (let k = 0; k <= n; k++) {
    const f = at(from + k * dt);
    raw.push(f.pos.map((p) => {
      const u = Math.min(1, Math.max(0, (Math.hypot(p[0] - f.ball[0], p[1] - f.ball[1]) - 2.5) / 3));
      return u * u * (3 - 2 * u);
    }));
  }
  const window = (k: number, w: number) => [Math.max(0, k - w), Math.min(n, k + w)];
  const low = raw.map((_, k) => {
    const [a, b] = window(k, 6);
    return raw[k].map((_, i) => { let m = 1; for (let q = a; q <= b; q++) m = Math.min(m, raw[q][i]); return m; });
  });
  const smooth = low.map((_, k) => {
    const [a, b] = window(k, 5);
    return low[k].map((_, i) => { let sum = 0; for (let q = a; q <= b; q++) sum += low[q][i]; return sum / (b - a + 1); });
  });
  return (s) => {
    const t = Math.min(Math.max((s - from) / dt, 0), n), i = Math.floor(t), j = Math.min(i + 1, n), u = t - i;
    return smooth[i].map((v, k) => v + (smooth[j][k] - v) * u);
  };
}
