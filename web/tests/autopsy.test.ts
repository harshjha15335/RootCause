import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Analysis } from "../src/api/analysis";
import type { Evidence } from "../src/api/types";
import { loadLab } from "../src/lab/data";
import { buildAutopsy, goalsOf } from "../src/lab/autopsy/model";

const root = "public/showcase"; // vitest runs from web/
const MATCHES = ["wlb-msb-2023-11-12", "p-1008", "p-1009", "p-1014", "p-1017"];
const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const fsFetch = (async (url: string) => {
  const buf: Uint8Array = readFileSync(url);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString()),
  };
}) as unknown as typeof fetch;
const analyses: Record<string, Analysis> = Object.fromEntries(MATCHES.map((m) => [m, read(`${root}/${m}/analysis.json`)]));

describe("Goal Autopsy", () => {
  for (const match of MATCHES) {
    it(`gives every goal in ${match} a verdict or an honest answer`, async () => {
      const lab = await loadLab(match, `${root}/${match}/`, fsFetch);
      const replays = read(`${root}/${match}/replays.json`);
      const traces: Evidence[] = readdirSync(`${root}/${match}/traces`).map((f: string) => read(`${root}/${match}/traces/${f}`) as Evidence);
      const goals = goalsOf(lab, traces);
      const score = read(`${root}/${match}/match.json`).score;
      expect(goals.filter((g) => g.team === 0)).toHaveLength(score.home);
      expect(goals.filter((g) => g.team === 1)).toHaveLength(score.away);
      expect(goals.filter((g) => g.traced)).toHaveLength(traces.length);
      for (const g of goals) {
        const ev = traces.find((e) => e.goal_id === g.id) ?? null;
        const a = buildAutopsy(lab, g, ev, replays[g.id] ?? {}, analyses)!;
        expect(a).not.toBeNull();
        expect(a.kind).toBe(g.traced ? "traced" : "honest");
        // the scorer attacks right: the ball ends in the net at x = 105
        expect(a.frame(a.goalS).ball[0]).toBeGreaterThan(100);
        expect(a.plan.shape.filter(Boolean)).toHaveLength(22);
        expect(a.dossier.facts[0].length).toBeGreaterThan(0);
        if (a.kind === "honest") {
          // the honest answer is built from the real chance
          expect(a.chance).not.toBeNull();
          continue;
        }
        // every suspect in the trace gets a mistake layer, walked from the goal down
        expect(a.mistakes).toHaveLength(ev!.links.length);
        for (let k = 1; k < a.mistakes.length; k++) expect(a.mistakes[k].x.second).toBeLessThanOrEqual(a.mistakes[k - 1].x.second);
        // blame is his prevented goals over all prevented
        const c = a.j.culprit;
        expect(Math.round((100 * Math.max(0, c.base - c.fixed)) / a.total)).toBe(Math.round(c.blame));
        // the culprit's ghost is up the pitch from where he stood (he was too deep), and he left space
        const m = a.mistakes.find((x) => x.x === c)!;
        expect(m.ghost[0]).toBeLessThan(m.real[0] - 1);
        expect(m.cells.length).toBeGreaterThan(0);
      }
    });
  }
});
