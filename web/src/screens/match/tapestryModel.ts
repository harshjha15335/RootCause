import type { Analysis, Side, Stacks } from "../../api/analysis";
import { frameAt, fwdX, PY, type Lab } from "../../lab/data";

/**
 * Everything the Match Tapestry weaves, per minute, in the home-attacks-right frame:
 * who controlled each strip of the pitch, where each team got into the final third, how often
 * each team won the ball in the other half, every shot, and every goal frozen a second before.
 * Lane 0 is the top wing (high y), 1 the middle, 2 the bottom wing.
 */
export type TapGoal = {
  s: number;
  side: Side;
  scorer: string;
  id: string;
  xg: number;
  /** 22 positions (H1..H11, A1..A11) and the ball, one second before the goal */
  pos: [number, number][];
  ball: [number, number];
  verdict: { culprit: string; blame: number; base: number; fixed: number; behind: number | null } | null;
};
export type TapShot = { s: number; team: 0 | 1; lane: number; xg: number; goal: boolean };
export type Tapestry = {
  minutes: number;
  /** -1 away .. +1 home, per minute per lane */
  ctrl: [number, number, number][];
  /** final-third entries per minute, [team][lane] */
  att: [[number, number, number], [number, number, number]][];
  /** balls won in the other half per minute, [home, away] */
  press: [number, number][];
  shots: TapShot[];
  goals: TapGoal[];
};

export const laneOfY = (y: number) => (y > (PY * 2) / 3 ? 0 : y > PY / 3 ? 1 : 2);

export function buildTapestry(lab: Lab, an: Analysis | null, s: Stacks): Tapestry {
  const minutes = 90;
  const ctrl: Tapestry["ctrl"] = Array.from({ length: minutes }, () => [0, 0, 0]);
  const terr = an?.territory;
  if (terr) {
    const { nx, ny } = terr;
    for (let m = 0; m < minutes; m++) {
      const c = terr.control[Math.min(m, terr.control.length - 1)];
      const sum = [0, 0, 0], n = [0, 0, 0];
      for (let j = 0; j < ny; j++) {
        const l = laneOfY(((j + 0.5) * PY) / ny);
        for (let i = 0; i < nx; i++) { sum[l] += c[j * nx + i] / 100; n[l]++; }
      }
      ctrl[m] = [0, 1, 2].map((l) => (n[l] ? sum[l] / n[l] : 0)) as [number, number, number];
    }
  }
  const att: Tapestry["att"] = Array.from({ length: minutes }, () => [[0, 0, 0], [0, 0, 0]]);
  const press: Tapestry["press"] = Array.from({ length: minutes }, () => [0, 0]);
  const shots: TapShot[] = [];
  for (const a of lab.actions) {
    const m = Math.min(minutes - 1, Math.floor(a.s / 60));
    if ((a.type === "pass" || a.type === "carry") && a.outcome === "complete" && fwdX(a.from[0], a.team) < 70 && fwdX(a.to[0], a.team) >= 70) att[m][a.team][laneOfY(a.to[1])]++;
    if (a.type === "duel" && a.outcome === "won" && fwdX(a.from[0], a.team) > 52.5) press[m][a.team]++;
    if (a.type === "shot") shots.push({ s: a.s, team: a.team, lane: laneOfY(a.from[1]), xg: a.xg ?? 0, goal: a.outcome === "goal" });
  }
  // without territory control, fall back to who got into each lane more
  if (!terr) for (let m = 0; m < minutes; m++) ctrl[m] = [0, 1, 2].map((l) => (att[m][0][l] - att[m][1][l]) / 3) as [number, number, number];
  const goals: TapGoal[] = s.goals.map((g) => {
    const f = frameAt(lab, Math.max(0, g.s - 1));
    const v = g.verdict;
    return {
      s: g.s,
      side: g.side,
      scorer: g.scorer,
      id: g.goal_id,
      xg: g.xg,
      pos: f.pos.map((p) => [p[0], p[1]] as [number, number]),
      ball: [f.ball[0], f.ball[1]],
      verdict: v ? { culprit: v.culprit, blame: Math.round(v.blame_pct), base: v.baseline_goals, fixed: v.fixed_goals, behind: v.behind_m } : null,
    };
  });
  return { minutes, ctrl, att, press, shots, goals };
}

/** H1..H11 then A1..A11, the tracking order */
export const slotOf = (id: string) => (id[0] === "H" ? 0 : 11) + Number(id.slice(1)) - 1;
