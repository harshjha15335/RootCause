import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Analysis } from "../src/api/analysis";
import { buildAutopsy, formationGroups, goalsOf } from "../src/lab/autopsy/model";
import { frameAt, loadLab } from "../src/lab/data";
import { goalFrame } from "../src/lab/journey/model";
import { goalType, teamMotion } from "../src/lab/autopsy/motion";

const id = "wlb-msb-2023-11-12";
const base = `public/showcase/${id}/`;
const fetchFile = (async (url: string) => {
  const bytes = readFileSync(url);
  return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), json: async () => JSON.parse(bytes.toString()) };
}) as unknown as typeof fetch;

const lab = await loadLab(id, base, fetchFile);

describe("Autopsy goal motion", () => {
  it("aligns away event endpoints with tracking in both halves", () => {
    expect(lab.actions.find((a) => a.s === 2727 && a.type === "shot")?.from).toEqual([9.5, 38.8]);
    expect(lab.actions.find((a) => a.s === 3211 && a.type === "shot")?.from).toEqual([1, 36.7]);
  });

  it("preserves recorded player positions instead of snapping them to event locations", () => {
    const bytes = readFileSync(`${base}tracking.bin`);
    const original = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    for (const s of [2725, 2726, 2727]) {
      for (let i = 0; i < 22; i++) {
        const k = s * 49 + 2 + i * 2;
        expect(frameAt(lab, s).pos[i]).toEqual([original[k] / 10, original[k + 1] / 10]);
      }
    }
  });

  it("does not launch a player across the pitch during the 45:27 goal", () => {
    for (let s = 2723; s < 2727; s += 0.1) {
      const a = frameAt(lab, s), b = frameAt(lab, s + 0.1);
      for (let i = 0; i < 22; i++) {
        expect(Math.hypot(b.pos[i][0] - a.pos[i][0], b.pos[i][1] - a.pos[i][1])).toBeLessThan(1.2);
      }
    }
  });

  it("keeps the delivery and finish continuous, with only the ball crossing into the net", () => {
    const { frame } = goalFrame(lab, 2727, 1);
    for (const boundary of [2726, 2726.6, 2727]) {
      const before = frame(boundary - 0.0001), after = frame(boundary + 0.0001);
      expect(Math.hypot(after.ball[0] - before.ball[0], after.ball[1] - before.ball[1])).toBeLessThan(0.02);
    }
    expect(frame(2727).ball[0]).toBeGreaterThan(105);
    expect(frame(2727.6)).toEqual(frame(2727));
  });

  it("draws each formation unit separately, in pitch-width order", () => {
    const analyses = { [id]: JSON.parse(readFileSync(`${base}analysis.json`, "utf8")) as Analysis };
    const goal = goalsOf(lab, []).find((g) => g.s === 2727)!;
    const autopsy = buildAutopsy(lab, goal, null, {}, analyses)!;
    // Keepers stay at their own ends; imported placeholder shapes put them near midfield.
    expect(autopsy.plan.shape[11][0]).toBeLessThan(20);
    expect(autopsy.plan.shape[0][0]).toBeGreaterThan(85);
    for (const team of [0, 1] as const) {
      formationGroups(autopsy.plan, team).forEach((group, unit) => {
        for (let k = 0; k < group.length; k++) {
          const player = group[k];
          expect(Math.floor(player / 11)).toBe(team);
          expect(autopsy.plan.unit[player]).toBe(["def", "mid", "att"][unit]);
          if (k) expect(autopsy.plan.shape[player][1]).toBeGreaterThanOrEqual(autopsy.plan.shape[group[k - 1]][1]);
        }
      });
    }
  });

  it("shows the recorded A7 delivery and A4 header rather than an unrelated scorer or dribble", () => {
    const analyses = { [id]: JSON.parse(readFileSync(`${base}analysis.json`, "utf8")) as Analysis };
    const goal = goalsOf(lab, []).find((g) => g.s === 2727)!;
    const autopsy = buildAutopsy(lab, goal, null, {}, analyses)!;
    const pass = lab.actions.find((a) => a.s === 2726 && a.type === "pass")!;
    expect(pass.player).toBe(17); // A7: Bernaro Silven
    expect(pass.receiver).toBe(14); // A4: M. Akendo
    expect(autopsy.scorer).toBe(pass.receiver);
    expect(autopsy.chance?.honest?.kind).toBe("corner_header");
    const contact = autopsy.frame(2726.6);
    expect(Math.hypot(contact.ball[0] - contact.pos[14][0], contact.ball[1] - contact.pos[14][1])).toBeLessThan(1);
    expect(autopsy.frame(2726.3).ballHeight).toBeGreaterThan(contact.ballHeight!);
    expect(contact.ballHeight).toBeCloseTo(1.8);
    expect(autopsy.frame(2727).ballHeight).toBeCloseTo(0.75);
    for (const t of [2726, 2726.6, 2727]) {
      const before = autopsy.frame(t - 0.0001).ballHeight ?? 0.75;
      expect(Math.abs((autopsy.frame(t + 0.0001).ballHeight ?? 0.75) - before)).toBeLessThan(0.01);
    }
  });

  it("moves all 22 players during the replay, with controlled off-ball speed and deterministic scrubbing", () => {
    const analyses = { [id]: JSON.parse(readFileSync(`${base}analysis.json`, "utf8")) as Analysis };
    const goal = goalsOf(lab, []).find((g) => g.s === 2727)!;
    const autopsy = buildAutopsy(lab, goal, null, {}, analyses)!;
    const replay = teamMotion(autopsy);
    const first = replay(autopsy.moveFrom), finish = replay(autopsy.goalS);
    for (let i = 0; i < 22; i++) {
      expect(Math.hypot(finish.pos[i][0] - first.pos[i][0], finish.pos[i][1] - first.pos[i][1])).toBeGreaterThan(0.05);
    }
    for (let s = autopsy.moveFrom; s < autopsy.goalS; s += 0.1) {
      const frame = replay(s), next = replay(s + 0.1);
      for (let i = 0; i < 22; i++) {
        expect(Math.hypot(next.pos[i][0] - frame.pos[i][0], next.pos[i][1] - frame.pos[i][1])).toBeLessThan(1.2);
      }
      // Event actors, including the passer and scorer, follow the original recording.
      expect(frame.pos[14]).toEqual(autopsy.frame(s).pos[14]);
      expect(frame.pos[17]).toEqual(autopsy.frame(s).pos[17]);
      expect(frame.ball).toEqual(autopsy.frame(s).ball);
    }
    replay(autopsy.moveFrom);
    expect(replay(autopsy.goalS)).toEqual(finish);
  });

  it.each([
    ["penalty", "penalty"], ["corner_header", "corner"], ["direct_free_kick", "freeKick"],
    ["indirect-freekick", "freeKick"], ["set_piece", "setPiece"], ["open_play_tap_in", "openPlay"],
    ["sliding_finish", "openPlay"], ["rebound_tap_in", "openPlay"], ["deflected_long_shot", "openPlay"],
    [undefined, "unknown"], ["unclassified", "unknown"],
  ])("classifies recorded goal kind %s as %s without guessing", (kind, expected) => {
    expect(goalType(kind)).toBe(expected);
  });
});
