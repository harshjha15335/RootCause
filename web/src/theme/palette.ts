/**
 * The Timestack palette as numbers, for three.js and canvas. Same values as tokens.css.
 * Volt Lime (var) means one thing only: the mistake, the culprit and the fix.
 */
export const palette = {
  cobalt: 0x1530d6, // page ground
  deep: 0x0b1a8a, // stage
  ink: 0x06104f, // stage floor, shadows
  plate: 0x2f4dff, // Timestack layer fill
  chalk: 0xf4f6ff, // ribbons, lines, text; also "fixed"
  sky: 0x8fa6ff, // the other side
  var: 0xc6ff4d, // the mistake, the culprit, the fix
} as const;

export const css = {
  cobalt: "#1530d6",
  deep: "#0b1a8a",
  ink: "#06104f",
  plate: "#2f4dff",
  chalk: "#f4f6ff",
  sky: "#8fa6ff",
  var: "#c6ff4d",
} as const;

/** Camera and UI timing: few, slow, deliberate moves. */
export const motion = {
  camera: 2.0, // seconds for a camera move (1.6–2.4)
  beat: 0.6, // a label or layer fading in
  ease: "power2.inOut", // GSAP name
  easeOut: "expo.out",
} as const;
