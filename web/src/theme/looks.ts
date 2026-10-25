/**
 * Site-wide looks: every colour and font the site uses, as one table per look. The active look is
 * picked once at boot (?look=, then the last one picked) and written to CSS variables; palette.ts
 * hands the same values to three.js and canvas. "cobalt" is the original Timestack look.
 */
export type LookId = "cobalt" | "midnight" | "green" | "gallery" | "volt";

type Tones = {
  ground: string; panel: string; raised: string; edge: string; // page, panels, wells, hairlines
  chalk: string; dim: string; faint: string; // text and lines, three strengths
  flare: string; flareInk: string; // the mistake, and text on it
  stage: string; floor: string; plate: string; glow: string; // 3D stage, its floor, Timestack layers, stage light
  sky: string; kitAway: string; // the other side
  paper: string; ink: string; paperFlare: string; // printed cards
};
type Type = { display: string; body: string; weight: number; caps: boolean; width: number; tracking: string; adjust?: number };
export type Look = { id: LookId; name: string; tones: Tones; type: Type };

// display type is drawn about a fifth smaller than the old wide caps: the same layout, quieter headings
const T = (weight: number, tracking: string, display: string, body = display): Type => ({ display, body, weight, caps: false, width: 100, tracking, adjust: 0.43 });

export const LOOKS: Record<LookId, Look> = {
  cobalt: {
    id: "cobalt", name: "Cobalt (current)",
    tones: { ground: "#1530d6", panel: "#0e22a6", raised: "#213de0", edge: "#566eec", chalk: "#f3f5ff", dim: "#d6dcff", faint: "#aebbff", flare: "#ffd60a", flareInk: "#14123a", stage: "#0b1a8a", floor: "#06104f", plate: "#2f4dff", glow: "#1d3cf0", sky: "#8fa6ff", kitAway: "#5a78ff", paper: "#f3f5ff", ink: "#0a1048", paperFlare: "#1530d6" },
    type: { display: "'Anybody Variable'", body: "'Hanken Grotesk Variable'", weight: 820, caps: true, width: 112, tracking: "-0.005em" },
  },
  midnight: {
    id: "midnight", name: "Midnight and champagne",
    tones: { ground: "#0b1220", panel: "#111a2c", raised: "#18233a", edge: "#2c3853", chalk: "#f3eee4", dim: "#d4cec2", faint: "#9aa2b4", flare: "#d4b06a", flareInk: "#15110a", stage: "#0d1628", floor: "#070b14", plate: "#1d2a45", glow: "#1e2d4d", sky: "#8f9cb8", kitAway: "#71819f", paper: "#f3eee4", ink: "#0b1220", paperFlare: "#8a6a2c" },
    type: T(600, "-0.03em", "'Manrope'"),
  },
  green: {
    id: "green", name: "Racing green",
    tones: { ground: "#0c1f19", panel: "#10271f", raised: "#163229", edge: "#2b4a3f", chalk: "#f1ede3", dim: "#d4d1c5", faint: "#a0aea7", flare: "#d9b061", flareInk: "#14100a", stage: "#0e241c", floor: "#07140f", plate: "#1c3b30", glow: "#1f4034", sky: "#a3b6ab", kitAway: "#6f8b7e", paper: "#f1ede3", ink: "#0c1f19", paperFlare: "#7a5a24" },
    type: T(600, "-0.03em", "'Hanken Grotesk Variable'"),
  },
  gallery: {
    id: "gallery", name: "Gallery",
    tones: { ground: "#000000", panel: "#111113", raised: "#1c1c1e", edge: "#2f2f32", chalk: "#f5f5f7", dim: "#c7c7cc", faint: "#8e8e93", flare: "#ff453a", flareInk: "#ffffff", stage: "#0b0b0c", floor: "#050505", plate: "#1f1f22", glow: "#1c1c1e", sky: "#9a9aa0", kitAway: "#6e6e73", paper: "#f5f5f7", ink: "#1d1d1f", paperFlare: "#d70015" },
    type: T(600, "-0.03em", "'Inter'"),
  },
  volt: {
    id: "volt", name: "Volt night",
    tones: { ground: "#0a0a0a", panel: "#121212", raised: "#1a1a1a", edge: "#2d2d2d", chalk: "#f5f5f5", dim: "#cacaca", faint: "#8c8c8c", flare: "#d4ff3f", flareInk: "#0a0a0a", stage: "#0f0f0f", floor: "#050505", plate: "#1e1e1e", glow: "#1d2508", sky: "#808080", kitAway: "#6b6b6b", paper: "#f5f5f5", ink: "#0a0a0a", paperFlare: "#4f6b00" },
    type: T(700, "-0.035em", "'Bricolage Grotesque'", "'Inter'"),
  },
};

/** Headline fonts to try on any look (?font=). Body text stays the look's own font. */
export const FONTS: Record<string, { name: string; display: string; weight: number; tracking: string; adjust: number; width?: number }> = {
  syne: { name: "Syne", display: "'Syne'", weight: 700, tracking: "-0.03em", adjust: 0.46 },
  archivo: { name: "Archivo Expanded", display: "'Archivo'", weight: 700, tracking: "-0.035em", adjust: 0.44, width: 125 },
  jakarta: { name: "Plus Jakarta", display: "'Plus Jakarta Sans'", weight: 800, tracking: "-0.04em", adjust: 0.44 },
  sora: { name: "Sora", display: "'Sora'", weight: 700, tracking: "-0.04em", adjust: 0.44 },
  redhat: { name: "Red Hat Display", display: "'Red Hat Display'", weight: 800, tracking: "-0.035em", adjust: 0.44 },
  serif: { name: "Instrument Serif", display: "'Instrument Serif'", weight: 400, tracking: "-0.01em", adjust: 0.5 },
  bodoni: { name: "Bodoni Moda", display: "'Bodoni Moda'", weight: 600, tracking: "-0.02em", adjust: 0.44 },
  unbounded: { name: "Unbounded", display: "'Unbounded'", weight: 600, tracking: "-0.04em", adjust: 0.4 },
  anton: { name: "Anton", display: "'Anton'", weight: 400, tracking: "0", adjust: 0.5 },
};
const fontParam = (): string | null => {
  try {
    const f = new URLSearchParams(location.search).get("font");
    if (f && f in FONTS) localStorage.setItem("rc.font", f);
    else if (f === "none") localStorage.removeItem("rc.font");
    return f && f in FONTS ? f : f === "none" ? null : localStorage.getItem("rc.font");
  } catch {
    return null;
  }
};
export const FONT: string | null = typeof location === "undefined" ? null : fontParam();

const pick = (): LookId => {
  let id: string | null = null;
  try {
    id = new URLSearchParams(location.search).get("look");
    if (id && id in LOOKS) localStorage.setItem("rc.look", id);
    else id = localStorage.getItem("rc.look");
  } catch {
    /* storage blocked: the default look */
  }
  return id && id in LOOKS ? (id as LookId) : (import.meta.env.VITE_LOOK as LookId) in LOOKS ? (import.meta.env.VITE_LOOK as LookId) : "cobalt";
};

const base = LOOKS[typeof location === "undefined" ? "cobalt" : pick()];
const f = FONT ? FONTS[FONT] : null;
export const LOOK: Look = f ? { ...base, type: { ...base.type, display: f.display, weight: f.weight, tracking: f.tracking, adjust: f.adjust, caps: false, width: f.width ?? 100 } } : base;

const parts = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgb = (hex: string) => parts(hex).join(" ");
/** a toward b by k, as a hex colour */
export const mix = (a: string, b: string, k: number) => "#" + parts(a).map((v, i) => Math.round(v + (parts(b)[i] - v) * k).toString(16).padStart(2, "0")).join("");

/** Writes the active look into CSS variables. Called once, before the first render. */
export function applyLook(look: Look = LOOK) {
  const t = look.tones, y = look.type, fall = "'Noto Sans Devanagari', system-ui, sans-serif";
  const root = `--turf-deep:${rgb(t.ground)};--turf:${rgb(t.panel)};--turf-raised:${rgb(t.raised)};--turf-edge:${rgb(t.edge)};--chalk:${rgb(t.chalk)};--chalk-dim:${rgb(t.dim)};--chalk-faint:${rgb(t.faint)};--flare:${rgb(t.flare)};--flare-ink:${rgb(t.flareInk)};--paper:${rgb(t.paper)};--ink:${rgb(t.ink)};--stage:${rgb(t.stage)};--floor:${rgb(t.floor)};--plate:${rgb(t.plate)};--glow:${rgb(t.glow)};--sky:${rgb(t.sky)};--font-display:${y.display}, ${fall};--font-body:${y.body}, ${fall};--display-weight:${y.weight};--display-case:${y.caps ? "uppercase" : "none"};--display-width:${y.width};--display-tracking:${y.tracking};--display-adjust:${y.adjust ?? "none"};`;
  // printed cards: the same components with the inks swapped
  const paper = `--turf-deep:${rgb(mix(t.paper, t.ink, 0.06))};--turf:${rgb(t.paper)};--turf-raised:${rgb(mix(t.paper, t.ink, 0.04))};--turf-edge:${rgb(mix(t.paper, t.ink, 0.16))};--chalk:${rgb(t.ink)};--chalk-dim:${rgb(mix(t.ink, t.paper, 0.22))};--chalk-faint:${rgb(mix(t.ink, t.paper, 0.4))};--flare:${rgb(t.paperFlare)};--flare-ink:${rgb(t.paper)};`;
  let el = document.getElementById("rc-look") as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = "rc-look"; document.head.appendChild(el); }
  el.textContent = look.id === "cobalt" ? `:root{${root}}` : `:root{${root}} .paper{${paper}}`;
  document.documentElement.dataset.look = look.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.ground);
}
