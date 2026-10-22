import { describe, expect, it } from "vitest";
import { recordedFeed } from "../src/api/socket";
import type { EngineMatchEvent, WsMessage } from "../src/api/types";
import { Track } from "../src/lib/frames";
import { useMatch } from "../src/store/matchStore";
import messages from "../public/showcase/p-1008/messages.json";
import ticks from "../public/showcase/p-1008/ticks.json";

const msgs = messages as WsMessage[];

describe("recorded feed", () => {
  it("replays history at once, then releases events with the broadcast clock", () => {
    const got: WsMessage[] = [];
    const feed = recordedFeed(msgs, 3716, (m) => got.push(m));
    feed.advance(3716, 0);
    const last = got.filter((m) => m.type === "match.event").pop();
    expect(last && last.type === "match.event" && last.payload.second).toBeLessThanOrEqual(3716);
    const before = got.length;
    feed.advance(3740, 0);
    expect(got.length).toBeGreaterThan(before);
    // sequences stay strictly increasing, as clients dedupe on them
    expect(got.every((m, i) => i === 0 || m.sequence > got[i - 1].sequence)).toBe(true);
  });

  it("paces pipeline messages after a goal instead of dropping them", () => {
    const got: WsMessage[] = [];
    const feed = recordedFeed(msgs, 3716, (m) => got.push(m));
    feed.advance(3716, 0);
    feed.advance(3757, 1);
    expect(got.some((m) => m.type === "goal.detected")).toBe(true);
    expect(got.some((m) => m.type === "trace.ready" && m.payload.goal_id === "p-1008-g4")).toBe(false);
    for (let t = 2; t < 20000; t += 100) feed.advance(3757, t);
    expect(got.some((m) => m.type === "explanation.ready")).toBe(true);
  });
});

describe("match store", () => {
  it("builds score, goals and evidence from the message stream", () => {
    const s = useMatch.getState();
    s.reset("p-1008", null);
    for (const m of msgs) useMatch.getState().ingest(m);
    const st = useMatch.getState();
    expect(st.score).toEqual({ home: 3, away: 1 });
    expect(st.goals).toHaveLength(4);
    expect(st.evidence["p-1008-g4"].root_cause_evidence_id).toBe("p-1008-g4-l1");
    expect(st.goals[3].goalId).toBe("p-1008-g4");
  });
});

describe("track", () => {
  it("interpolates positions between seconds", () => {
    const t = new Track();
    for (const e of ticks as EngineMatchEvent[]) t.addEngine(e);
    const out = new Float32Array(44);
    const ball = new Float32Array(2);
    expect(t.sample(3742.5, out, ball)).toBe(true);
    const a = t.positionOf("A5", 3742)!;
    const b = t.positionOf("A5", 3743)!;
    const i = t.slot("A5");
    expect(out[i * 2]).toBeGreaterThanOrEqual(Math.min(a[0], b[0]) - 1e-3);
    expect(out[i * 2]).toBeLessThanOrEqual(Math.max(a[0], b[0]) + 1e-3);
  });
});
