import type { Snap } from "../journey/model";

/** Display-only support/marking runs around an evidence frame. The ball and pinned
 * evidence actors stay recorded; defending x positions retain the measured line.
 * The clock is the stage clock, so holds can stay alive and Pause freezes exactly.
 * The same motion rules apply in real and fixed universes, never in analysis.
 */
export function evidenceContext(f: Snap, elapsed: number, def: number, pinned: readonly number[]): Snap {
  const t = Math.max(0, elapsed);
  const bound = (base: number, delta: number, max: number) => Math.min(Math.max(max, base), Math.max(Math.min(0.5, base), base + delta));
  const pinnedSet = new Set(pinned);
  return { ...f, pos: f.pos.map((p, i) => {
    if (pinnedSet.has(i) || Math.hypot(p[0] - f.ball[0], p[1] - f.ball[1]) < 2.5) return [...p];
    const keeper = i % 11 === 0, phase = i * 2.39996;
    const proximity = Math.min(1, Math.max(0, (Math.hypot(p[0] - f.ball[0], p[1] - f.ball[1]) - 2.5) / 3));
    const envelope = Math.min(t / 1.2, 1) * proximity * proximity * (3 - 2 * proximity);
    const amplitude = keeper ? 0.55 : 2.4;
    const dx = Math.floor(i / 11) === def ? 0 : amplitude * Math.sin(t * 0.85) * Math.cos(phase);
    const dy = amplitude * Math.sin(t * 0.95 + phase) * Math.sin(t * 0.45);
    return [bound(p[0], dx * envelope, 104.5), bound(p[1], dy * envelope, 67.5)];
  }) };
}
