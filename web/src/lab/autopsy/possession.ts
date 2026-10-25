import type { Pt, Snap } from "../journey/model";
import type { Play } from "./motion";

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const mix = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Reconstruct touches against the displayed players, not detached raw ball samples.
 * A pass travels to its receiver, stays with that receiver until the next touch, and
 * the finish leaves the displayed scorer. Display-only: source events/stats stay intact.
 */
export function possessionBall(a: Play, players: (s: number) => Snap): (s: number) => Snap {
  const contact = a.goalS - 0.4;
  const foot = (i: number, s: number): Pt => {
    const p = players(s).pos[i];
    return [Math.min(p[0] + 0.45, 104.5), p[1]];
  };
  // A visible replay can begin midway through a completed pass. Retain the preceding
  // touch instead of falling back to an unattached raw sample until the next pass.
  const actions = a.lab.actions.filter((e) => e.team === a.att && e.s >= Math.max(0, a.moveFrom - 6) && e.s <= a.goalS)
    .sort((x, y) => x.s - y.s);
  const passes = actions.filter((e) => e.type === "pass" && e.outcome === "complete" && e.receiver != null).map((e) => {
    const next = actions.find((n) => n.s > e.s && n.player === e.receiver);
    const until = Math.min(next?.s ?? contact, contact);
    const from = foot(e.player, e.s);
    let duration = Math.max(0.05, until - e.s);
    // Reconcile flight duration with the moving receiver, bounded by its next touch.
    for (let n = 0; n < 4; n++) {
      const to = foot(e.receiver!, e.s + duration);
      duration = clamp(Math.hypot(to[0] - from[0], to[1] - from[1]) / 18, 0.05, Math.max(0.05, until - e.s));
    }
    return { release: e.s, arrival: e.s + duration, until, receiver: e.receiver!, from, to: foot(e.receiver!, e.s + duration) };
  }).filter((p) => p.release < contact);
  const strike = foot(a.scorer, contact);
  const line: Pt = [105.05, clamp(strike[1], 31, 37)];
  const rebound = actions.filter((e) => e.type === "shot" && ["saved", "blocked"].includes(e.outcome ?? "") && e.s < contact && e.s >= a.goalS - 5).slice(-1)[0];
  const reboundFrom = rebound ? foot(rebound.player, rebound.s) : null;
  const saveTime = rebound ? Math.min(rebound.s + 0.65, contact - 0.2) : 0;
  let save: Pt | null = null;
  if (rebound) {
    const f = players(saveTime), keeper = (1 - a.att) * 11;
    const blocker = rebound.outcome === "saved" ? keeper : f.pos.map((_, i) => i)
      .filter((i) => Math.floor(i / 11) !== a.att && i !== keeper)
      .sort((i, j) => Math.hypot(f.pos[i][0] - reboundFrom![0], f.pos[i][1] - reboundFrom![1]) - Math.hypot(f.pos[j][0] - reboundFrom![0], f.pos[j][1] - reboundFrom![1]))[0];
    save = [Math.min(f.pos[blocker][0] - 0.6, 103.5), f.pos[blocker][1]];
  }
  return (s) => {
    const f = players(s);
    if (s >= contact) {
      if (s < a.goalS) {
        const t = clamp((s - contact) / (a.goalS - contact), 0, 1);
        return { ...f, ball: mix(strike, line, t), ballHeight: 0.75 };
      }
      // Let the ball settle into the net, rather than instantly parking at a fixed point.
      return { ...f, ball: [line[0] + 0.65 * (1 - Math.exp(-(s - a.goalS) / 0.22)), line[1]], ballHeight: 0.75 };
    }
    if (rebound && reboundFrom && save && s >= rebound.s) {
      if (s < saveTime) return { ...f, ball: mix(reboundFrom, save, clamp((s - rebound.s) / (saveTime - rebound.s), 0, 1)), ballHeight: 0.75 };
      // A saved/blocked effort stays outside the goal, then returns to the scorer's
      // displayed foot for the rebound finish. It never scores before the final shot.
      const t = clamp((s - saveTime) / (contact - saveTime), 0, 1);
      return { ...f, ball: mix(save, strike, t), ballHeight: 0.75 + 0.35 * Math.sin(Math.PI * t) };
    }
    const pass = passes.filter((p) => p.release <= s && s <= p.until).slice(-1)[0];
    if (!pass) return f;
    if (s >= pass.arrival) return { ...f, ball: foot(pass.receiver, s), ballHeight: 0.75 };
    const t = clamp((s - pass.release) / (pass.arrival - pass.release), 0, 1);
    // Monotone cushioning at the receiving foot: never overshoot an empty spot and stop.
    const eased = t + t * t - t * t * t;
    return { ...f, ball: mix(pass.from, pass.to, eased), ballHeight: 0.75 };
  };
}
