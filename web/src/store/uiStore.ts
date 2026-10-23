import { create } from "zustand";
import type { Lang, Mode } from "../api/types";

export type Tab = "live" | "trace" | "whatif" | "cause" | "script";
export type Screen = "home" | "story" | "explore" | "lab" | "analysis" | "report";
const SCREENS: Screen[] = ["home", "story", "explore", "lab", "analysis", "report"];
/** #/story, #/explore, #/analysis, #/report; anything else is the home page. */
export const screenFromHash = (): Screen => {
  const s = location.hash.replace(/^#\/?/, "") as Screen;
  return SCREENS.includes(s) ? s : "home";
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
const initialMode = (params.get("mode") ?? read("rc.mode") ?? "fan") as Mode;
const initialLang = (params.get("lang") ?? read("rc.lang") ?? "en") as Lang;

type UiState = {
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
  setMode(m: Mode): void;
  setLang(l: Lang): void;
  setTab(t: Tab): void;
  setScreen(s: Screen): void;
  setView(v: "3d" | "2d"): void;
  setShortcuts(o: boolean): void;
};

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export const useUi = create<UiState>((set) => ({
  mode: ["fan", "analyst", "studio"].includes(initialMode) ? initialMode : "fan",
  lang: ["en", "hi", "es"].includes(initialLang) ? initialLang : "en",
  tab: "live",
  screen: screenFromHash(),
  reducedMotion: motionQuery.matches,
  view: motionQuery.matches || params.get("view") === "2d" ? "2d" : "3d",
  shortcutsOpen: false,
  stageInset: 0,
  setStageInset: (stageInset) => set({ stageInset }),
  setMode(mode) {
    write("rc.mode", mode);
    set({ mode });
  },
  setLang(lang) {
    write("rc.lang", lang);
    document.documentElement.lang = lang;
    set({ lang });
  },
  setTab: (tab) => set({ tab }),
  setScreen(screen) {
    const hash = screen === "home" ? "#/" : `#/${screen}`;
    if (location.hash !== hash) history.pushState(null, "", hash);
    set({ screen });
    window.scrollTo(0, 0);
  },
  setView: (view) => set({ view }),
  setShortcuts: (shortcutsOpen) => set({ shortcutsOpen }),
}));

motionQuery.addEventListener("change", (e) => useUi.setState({ reducedMotion: e.matches, view: e.matches ? "2d" : "3d" }));
window.addEventListener("popstate", () => useUi.setState({ screen: screenFromHash() }));
