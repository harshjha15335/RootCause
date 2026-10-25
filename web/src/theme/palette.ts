import { LOOK, mix } from "./looks";

/**
 * The active look's palette for three.js and canvas. The same values are in the CSS variables
 * (looks.ts writes them at boot). The flare colour means one thing only: the mistake.
 */
const t = LOOK.tones;
const num = (hex: string) => parseInt(hex.slice(1), 16);

export const css = {
  cobalt: t.ground, // page ground
  deep: t.stage, // stage
  ink: t.floor, // stage floor, shadows
  plate: t.plate, // Timestack layer fill
  chalk: t.chalk, // ribbons, lines, text; also "fixed"
  sky: t.sky, // the other side
  var: t.flare, // the mistake, the culprit, the fix
  flareInk: t.flareInk,
  panel: t.panel,
  edge: t.edge,
  dim: t.dim,
  faint: t.faint,
  glow: t.glow,
  kitAway: t.kitAway,
  deep2: mix(t.stage, t.ground, 0.35), // between stage and ground
  skySoft: mix(t.sky, t.chalk, 0.35),
};

export const palette = {
  cobalt: num(css.cobalt),
  deep: num(css.deep),
  ink: num(css.ink),
  plate: num(css.plate),
  chalk: num(css.chalk),
  sky: num(css.sky),
  var: num(css.var),
  deep2: num(css.deep2),
  skySoft: num(css.skySoft),
} as const;

/** Camera and UI timing: few, slow, deliberate moves. */
export const motion = {
  camera: 2.0, // seconds for a camera move (1.6–2.4)
  beat: 0.6, // a label or layer fading in
  ease: "power2.inOut", // GSAP name
  easeOut: "expo.out",
} as const;

/** A palette colour at some opacity, for SVG attributes and canvas, where CSS variables don't reach. */
export const alpha = (hex: string, a: number) => hex + Math.round(a * 255).toString(16).padStart(2, "0");
