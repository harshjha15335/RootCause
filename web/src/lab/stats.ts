import { PX, SECONDS, fwdX, posAt, type Action, type Lab } from "./data";

/**
 * Speed and pass numbers for every player, worked out in the browser from the files every match
 * already ships (tracking.bin at one sample a second, events.json). Nothing here is tied to one
 * match.
 *
 * - Running: distance and speed from second-to-second tracking. Bands are the usual ones in
 *   football data: high-speed running from 19.8 km/h, sprinting from 25.2 km/h. Jumps faster than
 *   9 m/s are restarts (the file re-places players for a kick-off), not running, and are skipped.
 * - Passes: chance of arriving from the engine's own model (engine/decisions.py
 *   pass_success_prob, weights from config/weights.yaml), fed with where everyone stood the
 *   second before and the passer's pressure from events.json. Difficulty is 100 minus that chance.
 * - Ball speed: the pass's length over the time to the next touch, never quicker than a struck ball.
 * - Shot speed: the tracking has one sample a second, too slow to time a shot, so it is an
 *   estimate from distance and the shot's quality, the same every time for the same shot.
 */

export const HSR_MS = 5.5; // 19.8 km/h
export const SPRINT_MS = 7.0; // 25.2 km/h
const RESET_MS = 9;
const kmh = (ms: number) => ms * 3.6;

export type Grade = "easy" | "medium" | "hard" | "elite";
export type PassStat = {
  s: number;
  player: number;
  receiver: number | null;
  team: 0 | 1;
  dist: number;
  ok: boolean;
  outcome: string | null;
  /** engine model's chance the pass arrives, 0..1 */
  prob: number;
  /** 0..100, 100 minus the chance in percent */
  difficulty: number;
  grade: Grade;
  ballKmh: number;
  /** opponents the pass took out of the game (between the passer and the target, toward goal) */
  bypassed: number;
  tags: PassTag[];
};
export type PassTag = "lineBreaking" | "long" | "pressured" | "switch" | "fizzed";
export type ShotStat = { s: number; player: number; team: 0 | 1; dist: number; kmh: number; xg: number; outcome: string | null; tag: "rocket" | "driven" | "placed" };
export type Run = { from: number; to: number; player: number; peakKmh: number; metres: number; kind: "hsr" | "sprint" };
export type PlayerTag = "engine" | "speedster" | "metronome" | "riskTaker" | "sharpshooter" | "runner";
export type PlayerStat = {
  i: number;
  km: number;
  topKmh: number;
  hsr: number;
  sprints: number;
  passes: number;
  completed: number;
  accuracy: number;
  avgDifficulty: number;
  hardest: PassStat | null;
  shots: number;
  fastestShot: ShotStat | null;
  tags: PlayerTag[];
};
export type MatchStats = {
  players: PlayerStat[];
  passes: PassStat[];
  shots: ShotStat[];
  runs: Run[];
  /** metres covered by player i up to second s: cum[i * SECONDS + s] */
  cum: Float32Array;
  /** speed of player i over second s..s+1 in m/s (0 where it was a restart) */
  speed: Float32Array;
};

/** Speed band of a running speed in m/s. */
export function band(ms: number): "walk" | "jog" | "run" | "hsr" | "sprint" {
  return ms >= SPRINT_MS ? "sprint" : ms >= HSR_MS ? "hsr" : ms >= 4 ? "run" : ms >= 2 ? "jog" : "walk";
}

export function gradeOf(difficulty: number): Grade {
  return difficulty >= 60 ? "elite" : difficulty >= 35 ? "hard" : difficulty >= 15 ? "medium" : "easy";
}

/** engine/decisions.py pass_success_prob with config/weights.yaml (crossing term left out). */
export function passProb(dist: number, inLane: number, receiverPress: number, passerPress: number) {
  const z = 3.85 - 0.055 * dist - 0.9 * inLane - 0.35 * Math.max(0, 3 - receiverPress) - 0.25 * Math.max(0, 3 - passerPress);
  return 1 / (1 + Math.exp(-z));
}

/** Same shot, same number: a small hash of the shot's second and player. */
function jitter(s: number, p: number) {
  const x = Math.sin(s * 12.9898 + p * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function shotKmh(dist: number, xg: number, s: number, player: number) {
  // longer shots are struck harder; close tap-ins are placed. 45..125 km/h
  const v = 52 + 1.25 * Math.min(dist, 35) + 26 * jitter(s, player) - 18 * Math.min(xg, 0.6);
  return Math.round(Math.min(125, Math.max(45, v)));
}

const memo = new WeakMap<Lab, MatchStats>();

export function matchStats(lab: Lab): MatchStats {
  const hit = memo.get(lab);
  if (hit) return hit;
  const r = lab.raw;
  const STRIDE = 49;
  const period = (s: number) => r[s * STRIDE + 48] || 1;
  // seconds where play restarts after a goal: positions jump back to kick-off
  const restart = new Uint8Array(SECONDS);
  if (lab.cut) for (let s = 0; s < SECONDS; s++) if (lab.cut[s]) for (let k = s; k < Math.min(SECONDS, s + 4); k++) restart[k] = 1;

  const speed = new Float32Array(22 * SECONDS);
  const cum = new Float32Array(22 * SECONDS);
  for (let i = 0; i < 22; i++) {
    let total = 0;
    for (let s = 0; s < SECONDS - 1; s++) {
      cum[i * SECONDS + s] = total;
      if (period(s) !== period(s + 1) || restart[s]) continue;
      const k = 2 + i * 2;
      const d = Math.hypot(r[(s + 1) * STRIDE + k] - r[s * STRIDE + k], r[(s + 1) * STRIDE + k + 1] - r[s * STRIDE + k + 1]) / 10;
      if (d >= RESET_MS) continue;
      speed[i * SECONDS + s] = d;
      total += d;
    }
    cum[i * SECONDS + SECONDS - 1] = total;
  }

  // high-speed runs: back-to-back seconds at 19.8 km/h or more; a sprint if it touched 25.2
  const runs: Run[] = [];
  for (let i = 0; i < 22; i++) {
    let s = 0;
    while (s < SECONDS) {
      if (speed[i * SECONDS + s] < HSR_MS) {
        s++;
        continue;
      }
      const from = s;
      let peak = 0, metres = 0;
      while (s < SECONDS && speed[i * SECONDS + s] >= HSR_MS) {
        peak = Math.max(peak, speed[i * SECONDS + s]);
        metres += speed[i * SECONDS + s];
        s++;
      }
      runs.push({ from, to: s, player: i, peakKmh: kmh(peak), metres, kind: peak >= SPRINT_MS ? "sprint" : "hsr" });
    }
  }

  const passes: PassStat[] = [];
  const shots: ShotStat[] = [];
  const acts = lab.actions;
  for (let n = 0; n < acts.length; n++) {
    const a = acts[n];
    if (a.type === "shot") {
      const goalX = a.team === 0 ? PX : 0;
      const dist = Math.hypot(goalX - a.from[0], 34 - a.from[1]);
      const v = shotKmh(dist, a.xg ?? 0, a.s, a.player);
      shots.push({ s: a.s, player: a.player, team: a.team, dist, kmh: v, xg: a.xg ?? 0, outcome: a.outcome, tag: v >= 100 ? "rocket" : v >= 80 ? "driven" : "placed" });
      continue;
    }
    if (a.type !== "pass") continue;
    passes.push(passStat(lab, a, acts[n + 1]));
  }

  const players: PlayerStat[] = [];
  for (let i = 0; i < 22; i++) {
    const mine = passes.filter((p) => p.player === i);
    const done = mine.filter((p) => p.ok);
    const myShots = shots.filter((x) => x.player === i);
    const myRuns = runs.filter((x) => x.player === i);
    let top = 0;
    for (let s = 0; s < SECONDS; s++) top = Math.max(top, speed[i * SECONDS + s]);
    players.push({
      i,
      km: cum[i * SECONDS + SECONDS - 1] / 1000,
      topKmh: kmh(top),
      hsr: myRuns.length,
      sprints: myRuns.filter((x) => x.kind === "sprint").length,
      passes: mine.length,
      completed: done.length,
      accuracy: mine.length ? done.length / mine.length : 0,
      avgDifficulty: mine.length ? mine.reduce((t, p) => t + p.difficulty, 0) / mine.length : 0,
      hardest: done.reduce<PassStat | null>((b, p) => (!b || p.difficulty > b.difficulty ? p : b), null),
      shots: myShots.length,
      fastestShot: myShots.reduce<ShotStat | null>((b, x) => (!b || x.kmh > b.kmh ? x : b), null),
      tags: [],
    });
  }
  // match-relative tags: the top three outfield players in each, so every match has its own names
  const outfield = players.filter((p) => lab.roles[p.i] !== "GK");
  const top3 = (key: (p: PlayerStat) => number, ok: (p: PlayerStat) => boolean = () => true) =>
    outfield.filter(ok).sort((a, b) => key(b) - key(a)).slice(0, 3);
  for (const p of top3((p) => p.km)) p.tags.push("engine");
  for (const p of top3((p) => p.topKmh)) p.tags.push("speedster");
  for (const p of top3((p) => p.hsr)) p.tags.push("runner");
  for (const p of top3((p) => p.accuracy, (p) => p.passes >= 20)) p.tags.push("metronome");
  for (const p of top3((p) => p.avgDifficulty, (p) => p.passes >= 15)) p.tags.push("riskTaker");
  for (const p of top3((p) => p.fastestShot?.kmh ?? 0, (p) => p.shots > 0)) p.tags.push("sharpshooter");

  const out = { players, passes, shots, runs, cum, speed };
  memo.set(lab, out);
  return out;
}

function passStat(lab: Lab, a: Action, next: Action | undefined): PassStat {
  // the picture just before the ball was played: the tracking sample at a.s already shows the
  // pass on its way. The engine scored the same pass against its own positions at that instant.
  const s = Math.min(Math.max(a.s - 1, 0), SECONDS - 1);
  const opp = a.team === 0 ? [11, 22] : [0, 11];
  const [px, py] = posAt(lab, s, a.player);
  const [tx, ty] = a.receiver != null ? posAt(lab, s, a.receiver) : a.to;
  const sx = tx - px, sy = ty - py;
  const dist = Math.hypot(sx, sy);
  const len2 = Math.max(sx * sx + sy * sy, 1e-9);
  let inLane = 0, recv = 99, press = 99, bypassed = 0;
  const f0 = fwdX(px, a.team), f1 = fwdX(tx, a.team);
  for (let j = opp[0]; j < opp[1]; j++) {
    const [ox, oy] = posAt(lab, s, j);
    const u = Math.min(1, Math.max(0, ((ox - px) * sx + (oy - py) * sy) / len2));
    const perp = Math.hypot(ox - (px + u * sx), oy - (py + u * sy));
    if (perp < 2 && u > 0.05 && u < 0.95) inLane++;
    recv = Math.min(recv, Math.hypot(ox - tx, oy - ty));
    press = Math.min(press, Math.hypot(ox - px, oy - py));
    const fo = fwdX(ox, a.team);
    // taken out of the game: goal-side of the passer, beaten by the ball, and near its path
    if (lab.roles[j] !== "GK" && fo > f0 && fo < f1 && Math.abs(oy - (py + u * sy)) < 12) bypassed++;
  }
  const prob = passProb(dist, inLane, recv, a.pressure ?? press);
  const difficulty = Math.round((1 - prob) * 100);
  // ball speed: the pass covered its distance by the next touch, and no pass flies faster than a
  // hard-struck ball (about 0.4 s to leave the foot, then up to 28 m/s)
  const flight = Math.max((next?.s ?? a.s + 2) - a.s, 0.4 + dist / 28);
  const moved = dist / flight;
  const ballKmh = Math.round(kmh(moved));
  const ok = a.outcome === "complete";
  const tags: PassTag[] = [];
  if (ok && bypassed >= 4 && f1 - f0 >= 15) tags.push("lineBreaking");
  if (dist >= 35) tags.push("long");
  if (Math.abs(ty - py) >= 30) tags.push("switch");
  if (press < 1.5) tags.push("pressured");
  if (ballKmh >= 72) tags.push("fizzed");
  return { s: a.s, player: a.player, receiver: a.receiver, team: a.team, dist, ok, outcome: a.outcome, prob, difficulty, grade: gradeOf(difficulty), ballKmh, bypassed, tags };
}

export type Moment = {
  s: number;
  kind: "pass" | "received" | "shot" | "goal" | "run" | "duel" | "carry";
  pass?: PassStat;
  shot?: ShotStat;
  run?: Run;
  other?: number | null;
  outcome?: string | null;
};

/** Everything one player did, in order: the timeline player focus follows. */
export function playerMoments(lab: Lab, i: number): Moment[] {
  const st = matchStats(lab);
  const out: Moment[] = [];
  for (const p of st.passes) {
    if (p.player === i) out.push({ s: p.s, kind: "pass", pass: p, other: p.receiver, outcome: p.outcome });
    else if (p.receiver === i && p.ok) out.push({ s: p.s, kind: "received", pass: p, other: p.player });
  }
  for (const x of st.shots) if (x.player === i) out.push({ s: x.s, kind: x.outcome === "goal" ? "goal" : "shot", shot: x, outcome: x.outcome });
  for (const r of st.runs) if (r.player === i) out.push({ s: r.from, kind: "run", run: r });
  for (const a of lab.actions) if (a.player === i && a.type === "duel") out.push({ s: a.s, kind: "duel", other: a.receiver, outcome: a.outcome });
  return out.sort((a, b) => a.s - b.s);
}

export type Rhythm = {
  kind: "control" | "chaos" | "open";
  /** seconds the team with the ball has kept it */
  held: number;
  /** times the ball changed sides in the 30 s before */
  swaps: number;
  /** share of the ball the player's team had in the five minutes before, 0..1 */
  share: number;
  trend: "up" | "down" | "flat";
};

/**
 * Control vs chaos and the game's rhythm at second s, for team: how long the current spell on the
 * ball has lasted, how often the ball changed sides in the last 30 s, and whether the team's share
 * of the ball is rising or falling (last five minutes against the five before). From the tracking's
 * possession column, so it works for any match.
 */
export function rhythmAt(lab: Lab, s: number, team: 0 | 1): Rhythm {
  const at = Math.min(Math.max(Math.floor(s), 0), SECONDS - 1);
  let swaps = 0;
  for (let k = Math.max(1, at - 30); k <= at; k++) if (lab.poss[k] !== lab.poss[k - 1]) swaps++;
  const held = at - lab.possStart[at];
  const shareIn = (a: number, b: number) => {
    let n = 0, mine = 0;
    for (let k = Math.max(0, a); k < Math.min(SECONDS, b); k++, n++) if (lab.poss[k] === team) mine++;
    return n ? mine / n : 0.5;
  };
  const share = shareIn(at - 300, at);
  const before = shareIn(at - 600, at - 300);
  const kind = swaps >= 5 ? "chaos" : swaps <= 2 && held >= 8 ? "control" : "open";
  return { kind, held, swaps, share, trend: share - before > 0.07 ? "up" : before - share > 0.07 ? "down" : "flat" };
}
