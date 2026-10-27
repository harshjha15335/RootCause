import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Analysis } from "../src/api/analysis";
import type { Evidence } from "../src/api/types";
import { ballDistance, evidenceContext } from "../src/lab/autopsy/context";
import { buildAutopsy, goalsOf, type Autopsy } from "../src/lab/autopsy/model";
import { teamMotion } from "../src/lab/autopsy/motion";
import { goalClock, moveClock, stepsOf } from "../src/lab/autopsy/stadium";
import { loadLab } from "../src/lab/data";

const id = "kby-ira";
const base = `public/showcase/${id}/`;
const fetchFile = (async (url: string) => {
  const bytes = readFileSync(url);
  return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), json: async () => JSON.parse(bytes.toString()) };
}) as unknown as typeof fetch;
const lab = await loadLab(id, base, fetchFile);
const traces: Evidence[] = readdirSync(`${base}traces`).map((f) => JSON.parse(readFileSync(`${base}traces/${f}`, "utf8")));
const replays = JSON.parse(readFileSync(`${base}replays.json`, "utf8"));
const analyses = { [id]: JSON.parse(readFileSync(`${base}analysis.json`, "utf8")) as Analysis };
const all: Autopsy[] = goalsOf(lab, traces).map((g) => buildAutopsy(lab, g, traces.find((e) => e.goal_id === g.id) ?? null, replays[g.id] ?? {}, analyses)!);

/** fastest player and ball speed (m/s) between consecutive 50 Hz samples of a picture function */
function topSpeed(f: (s: number) => { pos: number[][]; ball: number[] }, from: number, to: number) {
  const dt = 0.02;
  let prev = f(from), player = 0, ball = 0;
  for (let s = from + dt; s <= to; s += dt) {
    const c = f(s);
    c.pos.forEach((p, i) => (player = Math.max(player, Math.hypot(p[0] - prev.pos[i][0], p[1] - prev.pos[i][1]) / dt)));
    ball = Math.max(ball, Math.hypot(c.ball[0] - prev.ball[0], c.ball[1] - prev.ball[1]) / dt);
    prev = c;
  }
  return { player, ball };
}

describe("Autopsy smoothness", () => {
  it("never teleports the ball or a player in the reconstructed move, for every goal", () => {
    expect(all).toHaveLength(8);
    for (const a of all) {
      const top = topSpeed(teamMotion(a), a.moveFrom - 3, a.goalS + 1.5);
      expect(top.player, a.id).toBeLessThan(11);
      // a struck shot is fast; a cut (tens of metres in a frame) is not football
      expect(top.ball, a.id).toBeLessThan(65);
    }
  });

  it("eases off-ball runs in as a pass leaves a player, instead of throwing him metres in a frame", () => {
    for (const a of all) {
      const live = teamMotion(a), near = ballDistance(live, a.moveFrom - 4, a.goalS + 3);
      const top = topSpeed((s) => evidenceContext(live(s), 6, a.def, [a.scorer], near(s)), a.moveFrom, a.goalS);
      expect(top.player, a.id).toBeLessThan(13);
    }
  });

  it("plays the goal and the move on clocks that only ever speed up or slow down gradually", () => {
    for (const a of all) {
      const steps = stepsOf(a);
      for (const [clock, dur] of [[goalClock, steps[0].dur], [moveClock, steps[2].dur]] as const) {
        let prevRate = 0;
        for (let t = 0.02; t < dur; t += 0.02) {
          const rate = (clock(a, t) - clock(a, t - 0.02)) / 0.02;
          expect(rate).toBeGreaterThanOrEqual(0);
          // the hold at the end of play is a stop, not a change of pace
          if (clock(a, t + 0.02) === clock(a, t)) break;
          if (prevRate > 0 && rate > 0) expect(Math.abs(rate - prevRate), `${a.id} at ${t.toFixed(2)}`).toBeLessThan(0.05);
          prevRate = rate;
        }
      }
    }
  });

  it("judges offside when the ball is played, and claims no distance when no pass was offside", () => {
    for (const a of all) {
      if (a.kind !== "traced") continue;
      for (const x of a.j.suspects) {
        if (!x.offside) continue;
        expect(x.offsideS, a.id).toBeDefined();
        const pass = lab.actions.find((e) => e.s === x.offsideS && e.type === "pass" && e.team === a.att);
        expect(pass?.receiver).toBe(x.offside.player);
        expect(x.offside.by).toBeLessThan(5);
      }
    }
    // the 28:24 goal is a corner: there is no pass to be offside from, so no "18.9 m offside"
    const corner = all.find((a) => a.goalS === 1704)!;
    expect(corner.kind === "traced" && corner.j.culprit.offside).toBeFalsy();
  });

  it("does not compare a team with 'their other meetings' when this is the only one", () => {
    for (const a of all) for (const k of [0, 1] as const) {
      expect(a.dossier.facts[k].map((f) => f.key)).toEqual(["formation"]);
      expect(String(a.dossier.facts[k][0].params.f)).toMatch(/^\d(-\d)+$/);
    }
  });
});
