import { describe, expect, it } from "vitest";
import { evidenceContext } from "../src/lab/autopsy/context";
import type { Snap } from "../src/lab/journey/model";

const source: Snap = { ball: [98, 34], pos: Array.from({ length: 22 }, (_, i) => [20 + i * 3, 5 + i * 2]) };

describe("Autopsy evidence context", () => {
  it("moves off-ball opponents and teammates throughout held evidence sections", () => {
    for (const def of [0, 1]) {
      const seen = new Set<number>();
      for (let t = 0; t <= 9; t += 0.2) {
        const f = evidenceContext(source, t, def, [3, 15]);
        f.pos.forEach((p, i) => { if (Math.hypot(p[0] - source.pos[i][0], p[1] - source.pos[i][1]) > 0.35) seen.add(i); });
      }
      expect(seen.size).toBe(20);
    }
  });

  it("preserves the ball, highlighted actors, defending line and original evidence", () => {
    const before = structuredClone(source);
    const f = evidenceContext(source, 4, 1, [3, 15]);
    expect(f.ball).toEqual(source.ball);
    for (const i of [3, 15]) expect(f.pos[i]).toEqual(source.pos[i]);
    for (let i = 11; i < 22; i++) expect(f.pos[i][0]).toBe(source.pos[i][0]);
    expect(source).toEqual(before);
    expect(evidenceContext(source, 0, 1, [3, 15])).toEqual(source);
  });

  it("keeps ball-contact actors attached and identical real/fixed context deterministic", () => {
    const f: Snap = { ...source, ball: source.pos[7] };
    expect(evidenceContext(f, 5, 1, []).pos[7]).toEqual(source.pos[7]);
    const real = evidenceContext(source, 4, 1, [15]);
    const fixed = structuredClone(source);
    fixed.pos[15][0] -= 5.3;
    const alternative = evidenceContext(fixed, 4, 1, [15]);
    real.pos.forEach((p, i) => { if (i !== 15) expect(alternative.pos[i]).toEqual(p); });
    expect(evidenceContext(source, 4, 1, [15])).toEqual(real);
  });

  it("bounds extra running speed and freezes on an unchanged stage clock", () => {
    for (let t = 0; t < 10; t += 0.05) {
      const a = evidenceContext(source, t, 1, []), b = evidenceContext(source, t + 0.05, 1, []);
      a.pos.forEach((p, i) => expect(Math.hypot(p[0] - b.pos[i][0], p[1] - b.pos[i][1]) / 0.05).toBeLessThan(4));
      expect(evidenceContext(source, t, 1, [])).toEqual(a);
    }
  });
});
