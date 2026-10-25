// @ts-expect-error node built-ins are not in this browser project's types; vitest runs on node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadLab } from "../src/lab/data";
import { matchStats, passProb, playerMoments } from "../src/lab/stats";

const root = "public/showcase";
const fsFetch = (async (url: string) => {
  const buf: Uint8Array = readFileSync(url);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString()),
  };
}) as unknown as typeof fetch;

describe("speed and pass tags", () => {
  it("matches the engine's pass model at its reference points", () => {
    expect(passProb(0, 0, 9, 9)).toBeCloseTo(1 / (1 + Math.exp(-3.85)), 6);
    expect(passProb(30, 1, 1, 1)).toBeLessThan(passProb(10, 0, 5, 5));
  });
  for (const match of ["p-1008", "p-1009", "p-1014", "p-1017"]) {
    it(`gives believable numbers in ${match}`, async () => {
      const lab = await loadLab(match, `${root}/${match}/`, fsFetch);
      const st = matchStats(lab);
      for (const p of st.players) {
        if (lab.roles[p.i] === "GK") continue;
        expect(p.km).toBeGreaterThan(5);
        expect(p.km).toBeLessThan(13);
        expect(p.topKmh).toBeLessThan(36);
      }
      expect(st.passes.length).toBeGreaterThan(300);
      for (const x of st.passes) {
        expect(x.difficulty).toBeGreaterThanOrEqual(0);
        expect(x.difficulty).toBeLessThanOrEqual(100);
        expect(x.ballKmh).toBeLessThan(140);
      }
      // easier passes arrive more often than hard ones
      const rate = (g: string) => {
        const ps = st.passes.filter((x) => x.grade === g);
        return ps.filter((x) => x.ok).length / Math.max(1, ps.length);
      };
      expect(rate("easy")).toBeGreaterThan(rate("hard"));
      for (const x of st.shots) expect(x.kmh).toBeGreaterThanOrEqual(45);
      for (const tag of ["engine", "speedster", "metronome", "riskTaker"]) expect(st.players.some((p) => p.tags.includes(tag as never))).toBe(true);
      const nine = playerMoments(lab, 8);
      expect(nine.length).toBeGreaterThan(10);
      if (match === "p-1008") {
        const top = [...st.players].sort((a, b) => b.topKmh - a.topKmh)[0];
        console.log(match, "top", lab.names[top.i], top.topKmh.toFixed(1), "hsr", st.runs.length, "sprints", st.runs.filter((r) => r.kind === "sprint").length,
          "grades", ["easy", "medium", "hard", "elite"].map((g) => `${g}:${st.passes.filter((x) => x.grade === g).length}/${(rate(g) * 100).toFixed(0)}%`).join(" "),
          "ball p50", [...st.passes].sort((a, b) => a.ballKmh - b.ballKmh)[st.passes.length >> 1].ballKmh,
          "shots", st.shots.map((x) => x.kmh).join(","), "lb", st.passes.filter((x) => x.tags.includes("lineBreaking")).length);
      }
    });
  }
});
