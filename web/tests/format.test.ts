import { describe, expect, it } from "vitest";
import { clock, pct, playerInfo, tidyNumbers, PLAYER_TOKEN } from "../src/lib/format";
import meta from "../public/showcase/p-1008/meta.json";
import type { MatchMeta } from "../src/api/types";

describe("format", () => {
  it("shows the match clock as minutes:seconds", () => {
    expect(clock(3756)).toBe("62:36");
    expect(clock(5)).toBe("0:05");
  });

  it("rounds blame without hiding tiny shares", () => {
    expect(pct(88.888)).toBe("89%");
    expect(pct(0.5)).toBe("0.5%");
  });

  it("tidies evidence-only template numbers to one decimal", () => {
    expect(tidyNumbers("attributes 88.8889% of the blame")).toBe("attributes 88.9% of the blame");
  });

  it("finds engine and fixture player ids in sentences", () => {
    expect("A5: late. home-9 scores. H10 too".match(PLAYER_TOKEN)).toEqual(["A5", "home-9", "H10"]);
  });

  it("names players from MatchMeta and falls back to the id", () => {
    expect(playerInfo(meta as MatchMeta, "A5").name).toBe("Lucan Weyre");
    expect(playerInfo(null, "away-6")).toMatchObject({ name: "away-6", number: 6, side: "away" });
  });
});
