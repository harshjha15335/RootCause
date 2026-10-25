import type { Analysis, Side, Unit } from "../../api/analysis";
import type { Evidence, RecordedReplay } from "../../api/types";
import { PX, PY, frameAt, periodAt, type Lab } from "../data";
import type { GoalCase } from "../goal";

/**
 * Everything the Lab journey shows for one traced goal, in one picture frame where the scoring
 * side always attacks toward x = 105. The real move comes from the full-match tracking, each
 * suspect's "fixed" run from the engine's recorded replay (replays.json), the 200-run counts and
 * blame from the trace, and the two teams' plans from analysis.json for this match and the others.
 */
export type Pt = [number, number];
export type Snap = { ball: Pt; pos: Pt[]; ballHeight?: number };

export type Suspect = {
  player: number;
  second: number;
  blame: number;
  base: number;
  fixed: number;
  trials: number;
  /** metres behind the line the trace reports */
  behind: number;
  start: number;
  end: number;
  /** how the recorded replay ends: "offside", "goal", or null */
  note: string | null;
  scored: boolean;
  frames: { s: number; ball: Pt; pos: Pt[] }[];
  /** the attacker the fixed line catches offside at the end of the replay, and by how much */
  offside: { player: number; by: number } | null;
};

export type Stat = { now: number; usual: number | null };

export type Journey = {
  c: GoalCase;
  lab: Lab;
  att: 0 | 1;
  def: 0 | 1;
  frame(s: number): Snap;
  replay(x: Suspect, s: number): Snap;
  /** the culprit's line: median depth of the rest of the defending back four */
  lineOf(p: Snap, without?: number): number;
  offsideLine(p: Snap): number;
  backFour: number[];
  /** sorted by blame, most first; `shown` are the two the journey replays side by side */
  suspects: Suspect[];
  shown: Suspect[];
  culprit: Suspect;
  plan: { shape: Pt[]; unit: Unit[]; defLine: number; formation: [string, string] };
  cmp: { line: Stat; width: Stat; poss: Stat; ppda: Stat };
  samePlan: boolean;
  /** score after the goal, home first */
  score: [number, number];
  moveFrom: number;
  slowFrom: number;
  slowTo: number;
};

const indexOf = (id: string) => (id[0] === "H" ? 0 : 11) + Number(id.slice(1)) - 1;
const SIDES: Side[] = ["home", "away"];
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/**
 * The move behind a goal, in a frame where the scoring side `att` attacks toward x = 105. The
 * tracking puts the ball back on the spot at the goal second, so the shot is finished into the net.
 */
export function goalFrame(lab: Lab, goalS: number, att: 0 | 1, aerial = false) {
  const M = (p: Pt): Pt => (att === 1 ? [PX - p[0], PY - p[1]] : p);
  // the shot as the event records it: where it was struck and where it crossed the line
  const shot = lab.actions.find((x) => x.s === goalS && x.type === "shot");
  const shotFrom = shot ? M(shot.from) : M(frameAt(lab, goalS - 1).ball);
  const net: Pt = [PX + 0.8, Math.min(Math.max(shot ? M(shot.to)[1] : shotFrom[1], 31), 37)];
  const delivery = M(frameAt(lab, goalS - 1).ball);
  const frame = (s: number): Snap => {
    const f = frameAt(lab, Math.min(s, goalS));
    const pos = f.pos.map(M);
    if (s < goalS - 1) return { ball: M(f.ball), pos };
    // Resolve the final delivery and finish continuously. Starting the shot at the previous
    // whole second teleports the ball away from the passer and creates a long stray trail.
    const t = Math.min(Math.max(s - (goalS - 1), 0), 1);
    const from = t < 0.6 ? delivery : shotFrom, to = t < 0.6 ? shotFrom : net;
    const u = t < 0.6 ? t / 0.6 : (t - 0.6) / 0.4;
    // Heights are illustrative: tracking contains x/y only. A recorded header gets an arc,
    // not a dribble into goal. Keep height continuous at delivery, contact and the finish.
    const ballHeight = aerial ? (t < 0.6 ? 0.75 + 1.05 * u + 3 * Math.sin(Math.PI * u) : 1.8 - 1.05 * u) : 0.75;
    return { ball: [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u], pos, ballHeight };
  };
  return { M, frame };
}

export function buildJourney(
  lab: Lab,
  c: GoalCase,
  ev: Evidence,
  replays: Record<string, RecordedReplay>,
  analyses: Record<string, Analysis>,
): Journey | null {
  const att = c.attack, def = (1 - att) as 0 | 1;
  // home-attacks-right frame -> scoring side attacks right
  const chance = analyses[lab.id].chances.find((x) => x.second === c.goalS);
  const { M, frame } = goalFrame(lab, c.goalS, att, chance?.honest?.kind.includes("header"));
  const period = periodAt(lab, c.goalS);
  const fromRaw = (x: number, y: number): Pt => M(period === 1 ? [x, y] : [PX - x, PY - y]);
  const backFour = [1, 2, 3, 4].map((k) => def * 11 + k);
  const lineOf = (p: Snap, without = c.culprit) => median(backFour.filter((i) => i !== without).map((i) => p.pos[i][0]));
  const offsideLine = (p: Snap) => {
    const xs = p.pos.slice(def * 11, def * 11 + 11).map((q) => q[0]).sort((a, b) => b - a);
    return xs[1];
  };

  const suspects: Suspect[] = ev.links.map((l) => {
    const rec = replays[l.evidence_id];
    const frames = (rec?.frames ?? []).map((f) => {
      const pos: Pt[] = Array(22);
      for (const p of f.players) pos[indexOf(p.id)] = fromRaw(p.x, p.y);
      return { s: f.clock_s, ball: fromRaw(f.ball[0], f.ball[1]), pos };
    });
    const last = rec?.frames[rec.frames.length - 1];
    const note = last?.note ?? null;
    let offside: Suspect["offside"] = null;
    if (note === "offside" && frames.length) {
      const f = frames[frames.length - 1], line = offsideLine(f);
      for (let i = att * 11; i < att * 11 + 11; i++) {
        const by = f.pos[i][0] - line;
        if (by > 0.2 && (!offside || by > offside.by)) offside = { player: i, by };
      }
    }
    const behind = Number(/([\d.]+)\)?\s*$/.exec(l.description ?? "")?.[1] ?? 0);
    return {
      player: indexOf(l.player_id),
      second: l.second,
      blame: l.blame_percent,
      base: l.baseline_goals,
      fixed: l.fixed_goals,
      trials: l.trials,
      behind,
      start: frames[0]?.s ?? l.second,
      end: frames[frames.length - 1]?.s ?? c.goalS,
      note,
      scored: rec?.scored ?? true,
      frames,
      offside,
    };
  });
  suspects.sort((a, b) => b.blame - a.blame);
  const culprit = suspects.find((x) => x.player === c.culprit) ?? suspects[0];
  if (!culprit || !culprit.frames.length) return null;
  const shown = [culprit, ...suspects.filter((x) => x !== culprit && x.frames.length)].slice(0, 2);

  const replay = (x: Suspect, s: number): Snap => {
    const real = frame(s);
    if (s < x.start || !x.frames.length) return real;
    const F = x.frames, t = Math.min(s, F[F.length - 1].s) - F[0].s;
    const i = Math.min(Math.floor(t), F.length - 1), j = Math.min(i + 1, F.length - 1), u = t - i;
    const lerp = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    // the first second grows out of the real frame instead of jumping to the replay
    const w = Math.min(Math.max(s - x.start, 0), 1);
    const mix = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
    return {
      ball: mix(real.ball, lerp(F[i].ball, F[j].ball)),
      pos: F[i].pos.map((p, k) => mix(real.pos[k], lerp(p, F[j].pos[k]))),
    };
  };

  // the two plans: the scoring side with the ball, the other side without it
  const here = analyses[lab.id];
  const others = Object.entries(analyses).filter(([id]) => id !== lab.id).map(([, a]) => a);
  const aS = SIDES[att], dS = SIDES[def];
  const shape: Pt[] = Array(22), unit: Unit[] = Array(22);
  for (const p of here.shapes[aS].in.players) { shape[indexOf(p.id)] = [p.x, p.y]; unit[indexOf(p.id)] = p.unit; }
  // analysis shapes are drawn attacking right for each team: the defending side is turned round
  for (const p of here.shapes[dS].out.players) { shape[indexOf(p.id)] = [PX - p.x, PY - p.y]; unit[indexOf(p.id)] = p.unit; }
  const stat = (get: (a: Analysis) => number | null | undefined): Stat => ({
    now: get(here) ?? 0,
    usual: mean(others.map(get).filter((v): v is number => typeof v === "number")),
  });
  const cmp = {
    line: stat((a) => a.shapes[dS].out.lines.def),
    width: stat((a) => a.shapes[dS].out.width_m),
    poss: stat((a) => a.teams[aS].possession_pct),
    ppda: stat((a) => a.teams[aS].ppda),
  };
  const near = (s: Stat, tol: number) => s.usual == null || Math.abs(s.now - s.usual) < tol;

  // score straight after the goal, from the shots that went in
  const score: [number, number] = [0, 0];
  for (const a of lab.actions) if (a.type === "shot" && a.outcome === "goal" && a.s <= c.goalS) score[a.team]++;

  const first = Math.min(...suspects.map((x) => x.second));
  const lastS = Math.max(...suspects.map((x) => x.second));
  const moveFrom = Math.max(c.t0, first - 18);
  return {
    c, lab, att, def, frame, replay, lineOf, offsideLine, backFour, suspects, shown, culprit,
    plan: { shape, unit, defLine: PX - here.shapes[dS].out.lines.def, formation: [lab.clubs[0].formation, lab.clubs[1].formation] },
    cmp,
    samePlan: near(cmp.line, 1.5) && near(cmp.width, 1.5),
    score,
    moveFrom,
    slowFrom: Math.max(moveFrom, first - 5),
    slowTo: Math.min(c.goalS, lastS + 7),
  };
}
