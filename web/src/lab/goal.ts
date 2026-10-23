import type { Evidence } from "../api/types";
import { SECONDS, frameAt, periodAt, type Frame, type Lab } from "./data";

/**
 * One traced goal, ready for the Lab views: who made the mistake, the moves leading to the goal,
 * and the counterfactual "fix" (the culprit back on his line) applied to any frame. Every root
 * cause the Debugger reports in the demo matches is a late step-up (a back-four defender more
 * than 4 m deeper than the others), so the fix is the Debugger's own HOLD_LINE: level with them.
 */
export type Decision = {
  s: number;
  type: "pass" | "shot";
  player: number;
  receiver: number | null;
  from: [number, number];
  to: [number, number];
  xg: number | null;
};

export type GoalCase = {
  id: string;
  goalS: number;
  rootS: number;
  /** first second the culprit is clearly behind his line */
  dropS: number;
  culprit: number;
  scorer: number;
  /** team that scores (0 home, 1 away) and the direction it attacks along x */
  attack: 0 | 1;
  sgn: 1 | -1;
  backline: number[];
  t0: number;
  t1: number;
  decisions: Decision[];
  /** index in decisions of the pass the fix makes offside, or -1 when no single pass is caught */
  pivot: number;
  /** player the pivot pass finds */
  receiver: number;
  /** how far behind the line the culprit stood at the pivot pass, and how far offside the fix makes the receiver */
  gapAtPass: number;
  /** the most the culprit is behind his line in the window */
  maxGap: number;
  offsideBy: number;
  /** chance the pivot pass gets through, as played and with the fix */
  safeAsPlayed: number;
  safeWithFix: number;
  baseline: number;
  fixed: number;
  trials: number;
};

const indexOf = (id: string) => (id[0] === "H" ? 0 : 11) + Number(id.slice(1)) - 1;
export const teamOf = (i: number) => (i < 11 ? 0 : 1) as 0 | 1;

/** x of the line the culprit should hold: the median depth of the rest of his back four (the Debugger's HOLD_LINE fix) */
export const wallAt = (c: GoalCase, f: Frame) => {
  const d = c.backline.map((i) => c.sgn * f.pos[i][0]).sort((a, b) => a - b);
  const m = d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;
  return c.sgn * m;
};
/** metres the culprit stands behind that line (positive = too deep) */
export const gapAt = (c: GoalCase, f: Frame) => c.sgn * (f.pos[c.culprit][0] - wallAt(c, f));
/** the culprit where he should have been: level with his line, never deeper */
export const fixedX = (c: GoalCase, f: Frame) => (gapAt(c, f) > 0 ? wallAt(c, f) : f.pos[c.culprit][0]);
export const withFix = (c: GoalCase, f: Frame): Frame => {
  const pos = f.pos.slice();
  pos[c.culprit] = [fixedX(c, f), f.pos[c.culprit][1]];
  return { ...f, pos };
};

/** second-deepest defender: the offside line the attackers play against */
export function offsideLine(c: GoalCase, f: Frame) {
  const d = 1 - c.attack;
  const xs: number[] = [];
  for (let i = d * 11; i < d * 11 + 11; i++) xs.push(c.sgn * f.pos[i][0]);
  xs.sort((a, b) => b - a);
  return c.sgn * xs[1];
}
export const isOffside = (c: GoalCase, f: Frame, x: number, ballX: number) =>
  c.sgn * x > c.sgn * offsideLine(c, f) && c.sgn * x > c.sgn * ballX;

/** chance a pass from a to b gets through: ball at 18 m/s, a defender reaches 0.9 m + 3 m/s after 0.4 s */
export function safety(c: GoalCase, a: [number, number], b: [number, number], f: Frame) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d = 1 - c.attack;
  let s = 1;
  for (let i = d * 11; i < d * 11 + 11; i++) {
    const p = f.pos[i];
    let m = 0;
    for (let u = 0.1; u <= 1.001; u += 0.1) {
      const px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u;
      const reach = 0.9 + 3 * Math.max(0, (L * u) / 18 - 0.4);
      const q = 1 / (1 + Math.exp(-(reach - Math.hypot(p[0] - px, p[1] - py)) / 0.5));
      if (q > m) m = q;
    }
    s *= 1 - 0.95 * m;
  }
  return s;
}
/** how dangerous a spot is for the attacking side (rough expected-threat shape) */
export const threat = (c: GoalCase, x: number, y: number) => {
  const gx = c.attack === 0 ? 105 : 0;
  return Math.min(0.45, 0.012 + 0.5 * Math.exp(-Math.hypot(gx - x, (34 - y) * 1.3) / 13));
};

export function buildCase(lab: Lab, ev: Evidence): GoalCase | null {
  const root = ev.links.find((l) => l.evidence_id === ev.root_cause_evidence_id);
  if (!root) return null;
  const goalS = ev.goal.second;
  const culprit = indexOf(root.player_id);
  const scorer = indexOf(ev.goal.player_id ?? "H9");
  const attack = (1 - teamOf(culprit)) as 0 | 1;
  const sgn = attack === 0 ? 1 : -1;
  const ct = teamOf(culprit);
  // the back four are shirts 2 to 5 in the engine (pitch.DEFENDERS); the line is the other three
  const backline = [1, 2, 3, 4].map((k) => ct * 11 + k).filter((i) => i !== culprit);
  // a window inside one half: 20 s before the root cause to 8 s after the goal
  const half = periodAt(lab, goalS);
  let t0 = Math.max(Math.min(root.second, goalS) - 22, 0);
  while (periodAt(lab, t0) !== half) t0++;
  let t1 = Math.min(goalS + 8, SECONDS - 2);
  while (periodAt(lab, t1) !== half) t1--;

  const base: GoalCase = {
    id: ev.goal_id, goalS, rootS: root.second, dropS: root.second, culprit, scorer, attack, sgn, backline, t0, t1,
    decisions: [], pivot: -1, receiver: scorer, gapAtPass: 0, maxGap: 0, offsideBy: 0, safeAsPlayed: 1, safeWithFix: 1,
    baseline: root.baseline_goals, fixed: root.fixed_goals, trials: root.trials,
  };
  for (let s = t0; s <= goalS; s += 0.25) if (gapAt(base, frameAt(lab, s)) > 2) { base.dropS = s; break; }

  const from = Math.max(t0 + 1, lab.possStart[Math.max(goalS - 1, 0)] - 1);
  base.decisions = lab.actions
    .filter((a) => a.team === attack && a.s >= from && a.s <= goalS && (a.type === "pass" || (a.type === "shot" && a.s === goalS)))
    .map((a) => ({ s: a.s, type: a.type as "pass" | "shot", player: a.player, receiver: a.receiver, from: a.from, to: a.to, xg: a.xg }))
    .slice(-11);

  // the pass the fix stops: the first one after the drop that the fixed line makes offside.
  // Some goals have none (the replays still say the fix matters); then there is no pivot.
  base.decisions.forEach((d, k) => {
    if (d.type !== "pass" || d.receiver == null || d.s < base.dropS - 1 || base.pivot >= 0) return;
    const f = frameAt(lab, d.s - 0.5), fx = withFix(base, f), x = f.pos[d.receiver][0];
    const by = base.sgn * (x - offsideLine(base, fx));
    if (by > 0.25 && isOffside(base, fx, x, d.from[0]) && !isOffside(base, f, x, d.from[0])) {
      base.pivot = k;
      base.offsideBy = by;
    }
  });
  for (let s = t0; s <= goalS; s += 0.5) base.maxGap = Math.max(base.maxGap, gapAt(base, frameAt(lab, s)));
  const pv = base.decisions[base.pivot];
  if (pv) {
    base.receiver = pv.receiver ?? scorer;
    const f = frameAt(lab, pv.s - 0.5);
    base.gapAtPass = Math.max(0, gapAt(base, f));
    base.safeAsPlayed = safety(base, pv.from, pv.to, f);
    base.safeWithFix = safety(base, pv.from, pv.to, withFix(base, f));
  }
  return base;
}
