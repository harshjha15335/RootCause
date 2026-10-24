import { create } from "zustand";
import type { Lang, Mode } from "../api/types";

export type Tab = "live" | "trace" | "whatif" | "cause" | "script";
export type Screen = "home" | "story" | "matches" | "match" | "autopsy" | "explore";
/** How much a page shows: visuals and one line, or every number, formula and link. */
export type Depth = "simple" | "expert";
const SCREENS: Screen[] = ["home", "story", "matches", "match", "autopsy", "explore"];
/** Old links keep working: the Tactics Lab became the Goal Autopsy, Analysis and Report the Match page. */
export const ALIASES: Record<string, Screen> = { lab: "autopsy", analysis: "match", report: "match" };
/** #/story, #/matches, #/match, #/autopsy, #/explore; anything else is the home page. */
export const screenFromHash = (): Screen => {
  const s = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  return ALIASES[s] ?? (SCREENS.includes(s as Screen) ? (s as Screen) : "home");
};

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: preferences just don't persist */
  }
};

const params = new URLSearchParams(location.search);
const initialDepth = (params.get("depth") ?? read("rc.depth") ?? "simple") as Depth;
const initialLang = (params.get("lang") ?? read("rc.lang") ?? "en") as Lang;

type UiState = {
  depth: Depth;
  /** the API's explanation mode, derived from depth; "studio" is asked for explicitly by the broadcast script export */
  mode: Mode;
  lang: Lang;
  tab: Tab;
  screen: Screen;
  reducedMotion: boolean;
  /** user override of the 3D stage (2D pitch is always available) */
  view: "3d" | "2d";
  shortcutsOpen: boolean;
  /** share of the stage's width covered by overlaid copy (home hero); the camera frames the rest */
  stageInset: number;
  setStageInset(k: number): void;
  setDepth(d: Depth): void;
  /** @deprecated the fan/analyst/studio switch became Simple ↔ Expert; kept so old screens compile */
  setMode(m: Mode): void;
  setLang(l: Lang): void;
  setTab(t: Tab): void;
  setScreen(s: Screen): void;
  setView(v: "3d" | "2d"): void;
  setShortcuts(o: boolean): void;
};

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const modeFor = (d: Depth): Mode => (d === "expert" ? "analyst" : "fan");
const depth0: Depth = initialDepth === "expert" ? "expert" : "simple";

export const useUi = create<UiState>((set) => ({
  depth: depth0,
  mode: modeFor(depth0),
  lang: ["en", "hi", "es"].includes(initialLang) ? initialLang : "en",
  tab: "live",
  screen: screenFromHash(),
  reducedMotion: motionQuery.matches,
  view: motionQuery.matches || params.get("view") === "2d" ? "2d" : "3d",
  shortcutsOpen: false,
  stageInset: 0,
  setStageInset: (stageInset) => set({ stageInset }),
  setDepth(depth) {
    write("rc.depth", depth);
    set({ depth, mode: modeFor(depth) });
  },
  setMode(m) {
    useUi.getState().setDepth(m === "fan" ? "simple" : "expert");
  },
  setLang(lang) {
    write("rc.lang", lang);
    document.documentElement.lang = lang;
    set({ lang });
  },
  setTab: (tab) => set({ tab }),
  setScreen(screen) {
    const hash = screen === "home" ? "#/" : `#/${screen}`;
    if (location.hash !== hash) history.pushState(null, "", location.search + hash);
    set({ screen });
    window.scrollTo(0, 0);
  },
  setView: (view) => set({ view }),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
}));

motionQuery.addEventListener("change", (e) => useUi.setState({ reducedMotion: e.matches, view: e.matches ? "2d" : "3d" }));
window.addEventListener("popstate", () => useUi.setState({ screen: screenFromHash() }));
// an old #/lab or #/analysis link is shown under its new name
{
  const s = screenFromHash();
  const raw = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  if (raw && raw !== s && s !== "home") history.replaceState(null, "", `${location.search}#/${s}`);
}
