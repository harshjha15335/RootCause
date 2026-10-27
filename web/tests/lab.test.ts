import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Evidence } from "../src/api/types";
import { frameAt, loadLab } from "../src/lab/data";
import { buildCase, gapAt, isOffside, withFix } from "../src/lab/goal";

const root = "public/showcase"; // vitest runs from web/
const fsFetch = (async (url: string) => {
  const buf: Uint8Array = readFileSync(url);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString()),
  };
}) as unknown as typeof fetch;

describe("Tactics Lab goal cases", () => {
  for (const match of ["kby-ira", "p-1008", "p-1009", "p-1014", "p-1017"]) {
    it(`finds the mistake and the pass the fix stops in ${match}`, async () => {
      const lab = await loadLab(match, `${root}/${match}/`, fsFetch);
      const dir = `${root}/${match}/traces`;
      let caught = 0;
      for (const f of readdirSync(dir)) {
        const ev = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Evidence;
        const c = buildCase(lab, ev)!;
        expect(c).not.toBeNull();
        expect(c.decisions[c.decisions.length - 1].type).toBe("shot");
        // the culprit really does drop behind his line, and the fix puts him on it
        expect(c.maxGap).toBeGreaterThan(2);
        const worst = frameAt(lab, c.dropS);
        expect(gapAt(c, worst)).toBeGreaterThan(2);
        expect(gapAt(c, withFix(c, worst))).toBeCloseTo(0, 5);
        // when a pass is named, the fixed line really catches its receiver offside
        const pv = c.decisions[c.pivot];
        if (pv) {
          const fr = frameAt(lab, pv.s - 0.5);
          expect(isOffside(c, withFix(c, fr), fr.pos[c.receiver][0], pv.from[0])).toBe(true);
          expect(isOffside(c, fr, fr.pos[c.receiver][0], pv.from[0])).toBe(false);
        }
        caught += pv ? 1 : 0;
      }
      // p-1008 is the showcase: its pass must be caught
      if (match === "p-1008") expect(caught).toBe(1);
    });
  }
});
