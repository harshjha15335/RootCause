import type { Analysis, Chance, Side, Unit } from "../../api/analysis";
import { DEMO_MATCHES } from "../../api/rest";
import type { Evidence, RecordedReplay } from "../../api/types";
import { PX, PY, periodAt, type Lab } from "../data";
import { buildCase } from "../goal";
import { buildJourney, goalFrame, type Journey, type Pt, type Snap, type Suspect } from "../journey/model";

/**
 * Everything the Goal Autopsy shows for one goal, in one frame where the scoring side attacks
 * toward x = 105. A traced goal carries the Debugger's suspects, their recorded fixed replays and
 * the 200-run counts (the traces are the only source of truth for mistakes). A goal the Debugger
 * found no defender at fault for gets an honest football answer from the chance data instead.
 */
export type Fact = { key: string; params: Record<string, string | number> };

export type Mistake = {
  x: Suspect;
  /** where he was at the mistake second, and where the fix (level with his line) puts him */
  real: Pt;
  ghost: Pt;
  /** centres of 1.5 m cells an attacker reaches first as played, that he would reach first if fixed */
  cells: Pt[];
  prevented: number;
  /** teammates he should have been level with (back four, without him) */
  mates: number[];
};

export type Plan = { shape: Pt[]; unit: Unit[]; formation: [string, string] };

export type Dossier = {
  meeting: number;
  /** previous meeting's score, home first, or null for the first meeting */
  prev: [number, number] | null;
  /** facts about this match against the same clubs' other meetings, per team (0 home, 1 away) */
  facts: [Fact[], Fact[]];
};

type Base = {
  id: string;
  lab: Lab;
  att: 0 | 1;
  def: 0 | 1;
  goalS: number;
  scorer: number;
  /** score straight after the goal, home first */
  score: [number, number];
  frame(s: number): Snap;
  moveFrom: number;
  /** slow motion runs between these seconds in the goal beat */
  slowFrom: number;
  plan: Plan;
  dossier: Dossier;
  chance: Chance | null;
};
export type Traced = Base & { kind: "traced"; j: Journey; mistakes: Mistake[]; total: number };
export type Honest = Base & { kind: "honest" };
export type Autopsy = Traced | Honest;

export type GoalRef = { id: string; s: number; team: 0 | 1; scorer: number; traced: boolean };

const SIDES: Side[] = ["home", "away"];
const indexOf = (id: string) => (id[0] === "H" ? 0 : 11) + Number(id.slice(1)) - 1;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const prevented = (x: { base: number; fixed: number }) => Math.max(0, x.base - x.fixed);
export const meetingOf = (id: string) => DEMO_MATCHES.indexOf(id) + 1;
/** a goal the Debugger did not trace has no goal_id: it is named by its second */
export const honestId = (match: string, s: number) => `${match}-s${s}`;

/** Every goal in the match, traced or not, in time order. */
export function goalsOf(lab: Lab, traces: Evidence[]): GoalRef[] {
  const traced = new Map(traces.map((e) => [e.goal.second, e]));
  return lab.actions
    .filter((a) => a.type === "shot" && a.outcome === "goal")
    .map((a) => {
      const ev = traced.get(a.s);
      return { id: ev ? ev.goal_id : honestId(lab.id, a.s), s: a.s, team: a.team, scorer: a.player, traced: !!ev };
    })
    .sort((a, b) => a.s - b.s);
}

function planOf(lab: Lab, here: Analysis, att: 0 | 1): Plan {
  const def = 1 - att, aS = SIDES[att], dS = SIDES[def];
  const shape: Pt[] = Array(22), unit: Unit[] = Array(22);
  for (const p of here.shapes[aS].in.players) { shape[indexOf(p.id)] = [p.x, p.y]; unit[indexOf(p.id)] = p.unit; }
  // analysis shapes are drawn attacking right for each team: the defending side is turned round
  for (const p of here.shapes[dS].out.players) { shape[indexOf(p.id)] = [PX - p.x, PY - p.y]; unit[indexOf(p.id)] = p.unit; }
  return { shape, unit, formation: [lab.clubs[0].formation, lab.clubs[1].formation] };
}

/** What was different about this meeting, per team, from the same clubs' other meetings. Facts only. */
export function dossierOf(lab: Lab, analyses: Record<string, Analysis>): Dossier {
  const here = analyses[lab.id];
  const others = Object.entries(analyses).filter(([id]) => id !== lab.id).map(([, a]) => a);
  const meeting = meetingOf(lab.id);
  const prevId = DEMO_MATCHES[meeting - 2];
  const prev = prevId && analyses[prevId] ? analyses[prevId].score : null;
  const facts = SIDES.map((side) => {
    const out: Fact[] = [];
    const usual = (get: (a: Analysis) => number | null | undefined) => mean(others.map(get).filter((v): v is number => typeof v === "number"));
    const cmp = (get: (a: Analysis) => number | null | undefined) => {
      const now = get(here), u = usual(get);
      return now == null || u == null ? null : { now, u, d: now - u };
    };
    const line = cmp((a) => a.shapes[side].out.lines.def);
    if (line && Math.abs(line.d) >= 1.5) out.push({ key: line.d < 0 ? "deeper" : "higher", params: { m: Math.abs(line.d).toFixed(1), now: line.now.toFixed(1), usual: line.u.toFixed(1) } });
    const width = cmp((a) => a.shapes[side].out.width_m);
    if (width && Math.abs(width.d) >= 1.5) out.push({ key: width.d < 0 ? "narrower" : "wider", params: { m: Math.abs(width.d).toFixed(1), now: width.now.toFixed(1), usual: width.u.toFixed(1) } });
    const poss = cmp((a) => a.teams[side].possession_pct);
    if (poss && Math.abs(poss.d) >= 4) out.push({ key: poss.d > 0 ? "moreBall" : "lessBall", params: { pts: Math.abs(poss.d).toFixed(0), now: poss.now.toFixed(0), usual: poss.u.toFixed(0) } });
    // passes allowed per defensive action: fewer means a harder press
    const ppda = cmp((a) => a.teams[side].ppda);
    if (ppda && Math.abs(ppda.d) / ppda.u >= 0.15) out.push({ key: ppda.d < 0 ? "pressMore" : "pressLess", params: { now: ppda.now.toFixed(2), usual: ppda.u.toFixed(2) } });
    if (!out.length) out.push({ key: "same", params: { line: line ? line.now.toFixed(1) : "" } });
    return out;
  }) as [Fact[], Fact[]];
  return { meeting, prev, facts };
}

/** The Match page's export (stacks.json → dossier), when it is there: the same facts on both pages. */
export type StacksDossier = Record<Side, { line_m: number; notes: { key: string; params: Record<string, string | number> }[] }>;
const NOTE: Record<string, string> = {
  line_higher: "higher", line_deeper: "deeper", wider: "wider", narrower: "narrower",
  press_higher: "pressHigher", press_lower: "pressLower", more_ball: "moreBall", less_ball: "lessBall", as_usual: "same",
};
export function dossierFromStacks(d: StacksDossier, fallback: Dossier): Dossier {
  const facts = SIDES.map((side) => {
    const out: Fact[] = [];
    for (const n of d[side]?.notes ?? []) {
      const key = NOTE[n.key];
      if (!key) continue;
      const p = n.params;
      const num = (v: unknown) => (typeof v === "number" ? v.toFixed(1) : String(v ?? ""));
      out.push({ key, params: { m: num(p.by), now: num(p.now), usual: num(p.usual), pts: num(p.by), line: d[side].line_m.toFixed(1) } });
    }
    return out.length ? out : fallback.facts[side === "home" ? 0 : 1];
  }) as [Fact[], Fact[]];
  return { ...fallback, facts };
}

/** Cells (1.5 m) where an attacker is the nearest outfield player as played but the fixed defender would be. */
export function spaceLeft(pos: Pt[], who: number, ghost: Pt, att: 0 | 1): Pt[] {
  const fixed = pos.slice();
  fixed[who] = ghost;
  const keep = (i: number) => i !== 0 && i !== 11;
  const nearest = (arr: Pt[], x: number, y: number) => {
    let b = -1, bd = Infinity;
    for (let i = 0; i < 22; i++) {
      if (!keep(i)) continue;
      const d = (arr[i][0] - x) ** 2 + (arr[i][1] - y) ** 2;
      if (d < bd) { bd = d; b = i; }
    }
    return b;
  };
  const isAtt = (i: number) => (i < 11 ? 0 : 1) === att;
  const out: Pt[] = [];
  for (let x = 0.75; x < PX; x += 1.5) {
    for (let y = 0.75; y < PY; y += 1.5) {
      if (Math.hypot(x - ghost[0], y - ghost[1]) > 16) continue;
      if (nearest(fixed, x, y) === who && isAtt(nearest(pos, x, y))) out.push([x, y]);
    }
  }
  return out;
}

export function buildAutopsy(
  lab: Lab,
  goal: GoalRef,
  ev: Evidence | null,
  replays: Record<string, RecordedReplay>,
  analyses: Record<string, Analysis>,
  stacks?: StacksDossier | null,
): Autopsy | null {
  const here = analyses[lab.id];
  const att = goal.team, def = (1 - att) as 0 | 1;
  const chance = here.chances.find((c) => c.outcome === "goal" && Math.abs(c.second - goal.s) <= 1 && c.side === SIDES[att]) ?? null;
  const score: [number, number] = [0, 0];
  for (const a of lab.actions) if (a.type === "shot" && a.outcome === "goal" && a.s <= goal.s) score[a.team]++;
  const own = dossierOf(lab, analyses);
  const dossier = stacks ? dossierFromStacks(stacks, own) : own;
  const plan = planOf(lab, here, att);

  if (ev) {
    const c = buildCase(lab, ev);
    const j = c ? buildJourney(lab, c, ev, replays, analyses) : null;
    if (j) {
      const mistakes = j.suspects
        .map((x): Mistake => {
          // the trace says how far behind his line he was (the median depth of the back four in
          // the engine); the shown tracking is smoothed, so the ghost is placed by the trace's own
          // number: level with the line, that many metres up the pitch (the defenders defend x = 105)
          const f = j.frame(x.second);
          const real = f.pos[x.player];
          const ghost: Pt = [real[0] - x.behind, real[1]];
          return {
            x,
            real,
            ghost,
            cells: spaceLeft(f.pos, x.player, ghost, att),
            prevented: prevented(x),
            mates: j.backFour.filter((i) => i !== x.player),
          };
        })
        // walking down the stack from the goal: the latest mistake lights up first
        .sort((a, b) => b.x.second - a.x.second || a.x.blame - b.x.blame);
      return {
        kind: "traced", id: goal.id, lab, att, def, goalS: goal.s, scorer: goal.scorer, score,
        frame: j.frame, moveFrom: j.moveFrom, slowFrom: Math.max(j.moveFrom, goal.s - 6), plan, dossier, chance,
        j, mistakes, total: mistakes.reduce((n, m) => n + m.prevented, 0),
      };
    }
  }
  const { frame } = goalFrame(lab, goal.s, att);
  // the move: from the start of this possession, at most 16 s before the goal, inside one half
  const half = periodAt(lab, goal.s);
  let from = Math.max(lab.possStart[Math.max(goal.s - 1, 0)] - 2, goal.s - 16, 0);
  while (periodAt(lab, from) !== half) from++;
  return {
    kind: "honest", id: goal.id, lab, att, def, goalS: goal.s, scorer: goal.scorer, score,
    frame, moveFrom: from, slowFrom: Math.max(from, goal.s - 5), plan, dossier, chance,
  };
}

export type { Pt, Snap, Suspect };
