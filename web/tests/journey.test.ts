// @ts-expect-error node built-ins are not in this browser project's types; vitest runs on node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Analysis } from "../src/api/analysis";
import type { Evidence } from "../src/api/types";
import { loadLab } from "../src/lab/data";
import { buildCase } from "../src/lab/goal";
import { buildJourney } from "../src/lab/journey/model";

const root = "public/showcase"; // vitest runs from web/
const MATCHES = ["p-1008", "p-1009", "p-1014", "p-1017"];
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

describe("Tactics Lab journey", () => {
  for (const match of MATCHES) {
    it(`tells every traced goal in ${match} from the engine's own numbers`, async () => {
      const lab = await loadLab(match, `${root}/${match}/`, fsFetch);
      const replays = read(`${root}/${match}/replays.json`);
      const score = read(`${root}/${match}/match.json`).score;
      for (const file of readdirSync(`${root}/${match}/traces`)) {
        const ev = read(`${root}/${match}/traces/${file}`) as Evidence;
        const j = buildJourney(lab, buildCase(lab, ev)!, ev, replays[ev.goal_id], analyses)!;
        expect(j).not.toBeNull();
        // the culprit is the trace's root cause, has the most blame, and the blame is goals prevented
        const cause = ev.links.find((l) => l.evidence_id === ev.root_cause_evidence_id)!;
        expect(j.culprit.blame).toBeCloseTo(cause.blame_percent, 6);
        expect(j.suspects[0]).toBe(j.culprit);
        const prevented = (x: { base: number; fixed: number }) => Math.max(0, x.base - x.fixed);
        const total = j.suspects.reduce((n, x) => n + prevented(x), 0);
        expect(Math.round((100 * prevented(j.culprit)) / total)).toBe(Math.round(j.culprit.blame));
        // the culprit's recorded replay ends with the move dead, and the fixed line explains it
        expect(j.culprit.scored).toBe(false);
        expect(j.culprit.frames.length).toBeGreaterThan(1);
        // the scorer attacks right in the journey's frame: the ball ends near x = 105
        expect(j.frame(j.c.goalS).ball[0]).toBeGreaterThan(90);
        // during the mistake the culprit really is behind the line drawn for him
        const f = j.frame(j.culprit.second);
        expect(f.pos[j.culprit.player][0] - j.lineOf(f)).toBeGreaterThan(2);
        // the score after the goal never runs past the final score
        expect(j.score[0]).toBeLessThanOrEqual(score.home);
        expect(j.score[1]).toBeLessThanOrEqual(score.away);
        expect(j.score[j.att]).toBeGreaterThan(0);
        expect(j.plan.shape.filter(Boolean)).toHaveLength(22);
      }
    });
  }
});
