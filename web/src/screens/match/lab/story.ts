import type { Analysis } from "../../../api/analysis";
import { PX, PY, SECONDS, fwdX, type Lab } from "../../../lab/data";

/**
 * The match told as chapters for the Tactics Lab. A chapter ends at each goal and at half-time
 * (spells shorter than six minutes join the next one), and carries every number that says what
 * happened in it, per team: the ball, the territory, the threat, the chances, the press, the back
 * line, the way in, and who was on the ball most. All read from the tracking, the events and
 * analysis.json; nothing is invented here.
 */
export type Lane = "left" | "centre" | "right";
export type TeamSpell = {
  possession: number; // % of the time on the ball
  tilt: number; // % of the play in the other side's final third
  xt: number; // expected threat built
  shots: number;
  xg: number;
  won: number; // balls won in the other half
  line: number; // average back-line height, m from own goal
  entries: Record<Lane, number>;
  passes: number;
  passPct: number;
  star: number | null; // the player on the ball most
};
export type Chapter = {
  from: number;
  to: number;
  teams: [TeamSpell, TeamSpell];
  /** goals in the chapter: second, team, scorer index, xg */
  goals: { s: number; team: 0 | 1; player: number; xg: number }[];
  /** the side that had the better of it, or null when even */
  top: 0 | 1 | null;
  score: [number, number]; // at the end of the chapter
};

export const laneOf = (y: number, team: number): Lane => {
  // left and right as the attacking team sees them: home attacks +x, so its left is high y
  const hi = y > (PY * 2) / 3, lo = y < PY / 3;
  if (!hi && !lo) return "centre";
  return team === 0 ? (hi ? "left" : "right") : hi ? "right" : "left";
};

function spell(lab: Lab, an: Analysis, from: number, to: number, team: 0 | 1): TeamSpell {
  let on = 0, deep = 0, opp = 0;
  for (let s = from; s < to; s++) {
    if (lab.poss[s] === team) on++;
    const bx = lab.raw[s * 49] / 10;
    // the ball in the attacking third of either side, read from tracking (home attacks +x after the flip)
    const p = lab.raw[s * 49 + 48] || 1;
    const x = p === 1 ? bx : PX - bx;
    if (fwdX(x, team) > 70) deep++;
    if (fwdX(x, 1 - team) > 70) opp++;
  }
  const acts = lab.actions.filter((a) => a.s >= from && a.s < to && a.team === team);
  const shots = acts.filter((a) => a.type === "shot");
  const passes = acts.filter((a) => a.type === "pass");
  const entries: Record<Lane, number> = { left: 0, centre: 0, right: 0 };
  const touches = new Map<number, number>();
  for (const a of acts) {
    if ((a.type === "pass" || a.type === "carry") && a.outcome === "complete" && fwdX(a.from[0], team) < 70 && fwdX(a.to[0], team) >= 70) entries[laneOf(a.to[1], team)]++;
    if (a.type === "pass" || a.type === "carry" || a.type === "shot") touches.set(a.player, (touches.get(a.player) ?? 0) + 1);
  }
  const won = acts.filter((a) => a.type === "duel" && a.outcome === "won" && fwdX(a.from[0], team) > PX / 2).length;
  // threat and back line come in five-minute buckets: weight each by its overlap with the chapter
  const overlap = (a0: number, a1: number) => Math.max(0, Math.min(a1, to) - Math.max(a0, from)) / Math.max(1, a1 - a0);
  const side = team === 0 ? "home" : "away";
  let xt = 0, line = 0, lw = 0;
  for (const m of an.momentum) xt += (team === 0 ? m.home_xt : m.away_xt) * overlap(m.from_s, m.to_s);
  for (const l of an.lines ?? []) {
    const w = overlap(l.from_s, l.from_s + 300);
    line += ((side === "home" ? l.home_line : l.away_line) ?? 0) * w;
    lw += w;
  }
  const star = [...touches.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    possession: (100 * on) / Math.max(1, to - from),
    tilt: (100 * deep) / Math.max(1, deep + opp),
    xt,
    shots: shots.length,
    xg: shots.reduce((s, a) => s + (a.xg ?? 0), 0),
    won,
    line: lw ? line / lw : 0,
    entries,
    passes: passes.length,
    passPct: passes.length ? (100 * passes.filter((a) => a.outcome === "complete").length) / passes.length : 0,
    star,
  };
}

export function buildChapters(lab: Lab, an: Analysis): Chapter[] {
  const goals = lab.actions.filter((a) => a.type === "shot" && a.outcome === "goal").map((a) => ({ s: a.s, team: a.team, player: a.player, xg: a.xg ?? 0 }));
  const half = SECONDS / 2;
  const marks = [...new Set([...goals.map((g) => g.s + 1), half])].sort((a, b) => a - b);
  const cuts: number[] = [0];
  for (const m of marks) if (m - cuts[cuts.length - 1] >= 360 || m === half) cuts.push(m);
  if (SECONDS - cuts[cuts.length - 1] < 360) cuts.pop();
  cuts.push(SECONDS);
  const out: Chapter[] = [];
  const score: [number, number] = [0, 0];
  for (let k = 0; k < cuts.length - 1; k++) {
    const from = cuts[k], to = cuts[k + 1];
    const teams: [TeamSpell, TeamSpell] = [spell(lab, an, from, to, 0), spell(lab, an, from, to, 1)];
    const gs = goals.filter((g) => g.s >= from && g.s < to);
    gs.forEach((g) => score[g.team]++);
    const share = teams[0].xt / Math.max(1e-6, teams[0].xt + teams[1].xt);
    const top = share > 0.58 ? 0 : share < 0.42 ? 1 : null;
    out.push({ from, to, teams, goals: gs, top, score: [score[0], score[1]] });
  }
  return out;
}
