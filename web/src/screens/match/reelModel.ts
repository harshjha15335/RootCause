import { PX, SECONDS, posAt, type Lab } from "../../lab/data";
import { matchStats, rhythmAt } from "../../lab/stats";

/**
 * The data behind the player reel: one player's whole match as a path sampled every few seconds
 * (where, how fast, settled or broken play), their passes and shots, and the captions that tell it.
 * Everything comes from tracking.bin and events.json, so any match and any player works.
 */
export const STEP = 4;

export type ReelSample = { s: number; x: number; y: number; ms: number; chaos: number };
export type ReelPass = { s: number; from: [number, number]; to: [number, number]; difficulty: number; ok: boolean; lineBreaking: boolean; kmh: number };
export type ReelShot = { s: number; from: [number, number]; to: [number, number]; kmh: number; goal: boolean };
export type Caption = { s: number; key: string; p: Record<string, string | number>; hot?: boolean };
export type Reel = { samples: ReelSample[]; passes: ReelPass[]; shots: ReelShot[]; captions: Caption[]; team: 0 | 1 };

const minute = (s: number) => Math.floor(s / 60);

export function reelModel(lab: Lab, i: number): Reel {
  const st = matchStats(lab);
  const team = (i < 11 ? 0 : 1) as 0 | 1;
  const sur = (k: number | null) => (k == null ? "" : lab.names[k].split(" ").slice(-1)[0]);
  const me = sur(i);

  const samples: ReelSample[] = [];
  for (let s = 0; s < SECONDS; s += STEP) {
    const [x, y] = posAt(lab, s, i);
    let run = 0;
    for (let k = s; k < Math.min(SECONDS, s + STEP); k++) run = Math.max(run, st.speed[i * SECONDS + k]);
    const r = rhythmAt(lab, s, team);
    samples.push({ s, x, y, ms: run, chaos: r.kind === "chaos" ? 1 : r.kind === "control" ? 0 : 0.45 });
  }

  const passes: ReelPass[] = st.passes
    .filter((p) => p.player === i)
    .map((p) => {
      const a = lab.actions.find((x) => x.s === p.s && x.player === i && x.type === "pass")!;
      return { s: p.s, from: a.from, to: a.to, difficulty: p.difficulty, ok: p.ok, lineBreaking: p.tags.includes("lineBreaking"), kmh: p.ballKmh };
    });
  const shots: ReelShot[] = st.shots
    .filter((x) => x.player === i)
    .map((x) => {
      const a = lab.actions.find((y) => y.s === x.s && y.player === i && y.type === "shot")!;
      return { s: x.s, from: a.from, to: [x.team === 0 ? PX : 0, a.to[1]] as [number, number], kmh: x.kmh, goal: x.outcome === "goal" };
    });

  // the captions: a little cheeky, always true to the numbers
  const caps: Caption[] = [{ s: 0, key: "kickoff", p: { name: me, role: lab.roles[i] } }];
  const p = st.players[i];
  for (let km = 2; km <= Math.floor(p.km); km += 2) {
    const s = st.cum.subarray(i * SECONDS, (i + 1) * SECONDS).findIndex((m) => m >= km * 1000);
    if (s > 0) caps.push({ s, key: "km", p: { name: me, km, pitches: Math.round((km * 1000) / 105) } });
  }
  let topS = 0;
  for (let s = 0; s < SECONDS; s++) if (st.speed[i * SECONDS + s] > st.speed[i * SECONDS + topS]) topS = s;
  caps.push({ s: topS, key: "top", p: { name: me, v: p.topKmh.toFixed(1), m: minute(topS) }, hot: true });
  if (p.hardest) caps.push({ s: p.hardest.s, key: "hardest", p: { d: Math.round(p.hardest.dist), v: p.hardest.difficulty, to: sur(p.hardest.receiver) }, hot: true });
  const lb = passes.find((x) => x.lineBreaking);
  if (lb) caps.push({ s: lb.s, key: "lineBreak", p: { name: me } });
  const miss = passes.filter((x) => !x.ok).sort((a, b) => a.difficulty - b.difficulty)[0];
  if (miss && miss.difficulty < 20) caps.push({ s: miss.s, key: "oops", p: { v: miss.difficulty } });
  for (const x of shots) caps.push({ s: x.s, key: x.goal ? "goal" : x.kmh >= 100 ? "rocket" : "shot", p: { name: me, v: x.kmh }, hot: true });
  // the wildest 30 seconds of their match
  let wild = { s: -1, swaps: 0 };
  for (let s = 60; s < SECONDS; s += 15) {
    const r = rhythmAt(lab, s, team);
    if (r.swaps > wild.swaps) wild = { s, swaps: r.swaps };
  }
  if (wild.swaps >= 5) caps.push({ s: wild.s, key: "chaos", p: { n: wild.swaps } });
  caps.sort((a, b) => a.s - b.s);
  // keep captions at least 3 match minutes apart so each one gets read; hot ones win
  const captions: Caption[] = [];
  for (const c of caps) {
    const prev = captions[captions.length - 1];
    if (prev && c.s - prev.s < 180) {
      if (c.hot && !prev.hot) captions[captions.length - 1] = c;
      continue;
    }
    captions.push(c);
  }
  captions.push({ s: SECONDS - 1, key: "end", p: { name: me, km: p.km.toFixed(1), done: p.completed, n: p.passes } });
  return { samples, passes, shots, captions, team };
}
