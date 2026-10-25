import { PX, fwdX, type Frame, type Lab } from "../../../lab/data";
import type { LensId } from "./draw";
import { nextPass } from "./draw";
import { lanes, pressure, shape, spaceShare, teamOf, type Unit } from "./model";

/**
 * Coach mode: at any moment, pick the one thing worth seeing and say it in one line. Each line
 * comes with the lens that shows it on the pitch, the player it is about, and a priority, so a
 * goal or a mistake always wins over a quieter idea.
 */
export type Line = { key: string; lens: LensId; params: Record<string, string | number>; at: number | null; rank: number };

export function coachLine(lab: Lab, t: number, f: Frame, o: { unitOf: (i: number) => Unit; grid?: number[][]; faults: { s: number; player: number; bug: string }[] }): Line {
  const name = (i: number) => `${lab.names[i]}`;
  const num = (i: number) => lab.numbers[i];
  const s = Math.min(Math.floor(t), Math.max(0, lab.poss.length - 1));
  const team = lab.poss[s], opp = 1 - team;

  const shot = lab.actions.find((a) => a.type === "shot" && t >= a.s - 0.5 && t <= a.s + 3.5);
  if (shot) {
    const goal = shot.outcome === "goal";
    return { key: goal ? "goal" : "shot", lens: "chain", params: { name: name(shot.player), team: lab.short[shot.team], xg: Math.round((shot.xg ?? 0) * 100) }, at: shot.player, rank: 10 };
  }
  const fault = o.faults.find((m) => t >= m.s - 3 && t <= m.s + 4);
  if (fault) return { key: "fault", lens: "pressure", params: { name: name(fault.player), bug: fault.bug }, at: fault.player, rank: 9 };

  const c = f.carrier;
  if (c >= 0 && c < 22) {
    const ls = lanes(f, o.grid);
    const played = nextPass(lab, t, c);
    const chosen = played?.receiver != null ? ls.find((l) => l.j === played.receiver) : undefined;
    const best = ls[0];
    if (chosen && best && chosen.j !== best.j && best.open >= chosen.open && best.value > chosen.value * 1.3)
      return { key: "better", lens: "options", params: { name: name(c), n: num(best.j), other: name(best.j) }, at: c, rank: 7 };

    // a run in behind the last line
    let last = opp === 0 ? PX : 0;
    for (let i = opp * 11 + 1; i < opp * 11 + 11; i++) last = opp === 0 ? Math.min(last, f.pos[i][0]) : Math.max(last, f.pos[i][0]);
    for (let i = team * 11 + 1; i < team * 11 + 11; i++) {
      const sp = Math.hypot(f.vel[i][0], f.vel[i][1]);
      const beyond = team === 0 ? f.pos[i][0] > last : f.pos[i][0] < last;
      if (beyond && sp > 4 && i !== c) return { key: "behind", lens: "runs", params: { name: name(i), n: num(i), team: lab.short[opp] }, at: i, rank: 6 };
    }

    // free between the lines
    const d = shape(f, opp, o.unitOf);
    const a = opp === 0 ? d.line.def : PX - d.line.def, b = opp === 0 ? d.line.mid : PX - d.line.mid;
    const x0 = Math.min(a, b), x1 = Math.max(a, b);
    if (x1 - x0 > 6) {
      for (let i = team * 11 + 1; i < team * 11 + 11; i++) {
        const [x, y] = f.pos[i];
        if (x <= x0 || x >= x1 || i === c) continue;
        let near = 99;
        for (let j = opp * 11; j < opp * 11 + 11; j++) near = Math.min(near, Math.hypot(f.pos[j][0] - x, f.pos[j][1] - y));
        if (near > 5) return { key: "pocket", lens: "shape", params: { name: name(i), n: num(i), team: lab.short[opp], m: Math.round(near) }, at: i, rank: 5 };
      }
    }

    const p = pressure(f);
    if (p && p.pressers.length >= 2 && p.nearest < 3)
      return { key: "squeeze", lens: "pressure", params: { k: p.pressers.length, team: lab.short[opp], name: name(c) }, at: c, rank: 4 };

    if (lab.phase[s] === 3) return { key: "counter", lens: "chain", params: { team: lab.short[team] }, at: c, rank: 4 };

    const open = ls.filter((l) => l.open >= 0.5).length;
    if (open <= 1 && ls.length) return { key: "noOptions", lens: "options", params: { name: name(c), team: lab.short[opp] }, at: c, rank: 3 };

    const forward = fwdX(f.pos[c][0], team);
    if (forward < 35) return { key: "build", lens: "shape", params: { team: lab.short[team], opp: lab.short[opp], block: d.block }, at: null, rank: 2 };
  }
  const sp = spaceShare(f);
  const side = sp.home >= 0.5 ? 0 : 1;
  return { key: "space", lens: "space", params: { team: lab.short[side], p: Math.round((side === 0 ? sp.home : 1 - sp.home) * 100) }, at: null, rank: 1 };
}

export { teamOf };
