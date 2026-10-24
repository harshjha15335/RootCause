import { beforeAll, describe, expect, it } from "vitest";

// jsdom has no matchMedia; the store reads it at import
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
let codeKey: typeof import("../src/i18n/words").codeKey;
let mistakeWords: typeof import("../src/i18n/words").mistakeWords;
let screenFromHash: typeof import("../src/store/uiStore").screenFromHash;
let pageHref: typeof import("../src/lib/nav").pageHref;
beforeAll(async () => {
  ({ codeKey, mistakeWords } = await import("../src/i18n/words"));
  ({ screenFromHash } = await import("../src/store/uiStore"));
  ({ pageHref } = await import("../src/lib/nav"));
});

describe("raw codes become words", () => {
  it("normalises every form the data uses", () => {
    expect(codeKey("late_step_up #3")).toBe("LATE_STEP_UP");
    expect(codeKey("late_step")).toBe("LATE_STEP_UP");
    expect(mistakeWords("LATE_STEP_UP")).toBe("Stepped up late");
    expect(mistakeWords("late_step_up #3", { lower: true })).toBe("stepped up late");
  });
  it("never shows an unknown code raw", () => {
    expect(mistakeWords("SOME_NEW_THING")).toBe("Some new thing");
  });
});

describe("routes", () => {
  it("sends old links to the new pages", () => {
    for (const [hash, screen] of [["#/lab", "autopsy"], ["#/analysis", "match"], ["#/report", "match"], ["#/matches", "matches"], ["#/nope", "home"], ["", "home"]]) {
      history.replaceState(null, "", `/${hash}`);
      expect(screenFromHash()).toBe(screen);
    }
  });
  it("builds links that carry the match and goal", () => {
    history.replaceState(null, "", "/?demo=p-1008#/match");
    expect(pageHref("autopsy", { goal: "p-1008-g4" })).toBe("?demo=p-1008&goal=p-1008-g4#/autopsy");
    expect(pageHref("match", { demo: "p-1017" })).toBe("?demo=p-1017#/match");
    expect(pageHref("lab")).toBe("?demo=p-1008#/autopsy");
  });
});
