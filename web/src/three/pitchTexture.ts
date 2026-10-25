import { CanvasTexture, SRGBColorSpace } from "three";
import { PITCH_L, PITCH_W } from "../lib/geometry";
import { css as tone } from "../theme/palette";

/**
 * The pitch as one canvas texture: mown stripes and chalk lines at true FIFA dimensions.
 * Drawn once; 2048 px across keeps lines crisp at broadcast distance.
 */
export function makePitchTexture(margin = 6): CanvasTexture {
  const L = PITCH_L + margin * 2;
  const W = PITCH_W + margin * 2;
  const px = 2048 / L;
  const c = document.createElement("canvas");
  c.width = Math.round(L * px);
  c.height = Math.round(W * px);
  const g = c.getContext("2d")!;
  const X = (m: number) => (m + margin) * px;
  const Y = (m: number) => (m + margin) * px;

  g.fillStyle = tone.deep;
  g.fillRect(0, 0, c.width, c.height);
  // mown stripes, 12 across the length
  const band = PITCH_L / 12;
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? tone.deep2 : tone.deep2;
    g.fillRect(X(i * band), Y(0), band * px + 1, PITCH_W * px);
  }
  // floodlight pools: four soft lifts at the corners of the stand roofs
  for (const [fx, fy] of [[0.2, 0.15], [0.8, 0.15], [0.2, 0.85], [0.8, 0.85]]) {
    const r = g.createRadialGradient(c.width * fx, c.height * fy, 0, c.width * fx, c.height * fy, c.width * 0.35);
    r.addColorStop(0, "rgba(243,245,255,0.03)");
    r.addColorStop(1, "rgba(238,240,230,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, c.width, c.height);
  }

  g.strokeStyle = "rgba(243,245,255,0.5)";
  g.fillStyle = "rgba(243,245,255,0.5)";
  g.lineWidth = 0.09 * px;
  const rect = (x: number, y: number, w: number, h: number) => g.strokeRect(X(x), Y(y), w * px, h * px);
  const circle = (x: number, y: number, r: number, a0 = 0, a1 = Math.PI * 2) => {
    g.beginPath();
    g.arc(X(x), Y(y), r * px, a0, a1);
    g.stroke();
  };
  const spot = (x: number, y: number) => {
    g.beginPath();
    g.arc(X(x), Y(y), 0.25 * px, 0, Math.PI * 2);
    g.fill();
  };

  rect(0, 0, PITCH_L, PITCH_W);
  g.beginPath();
  g.moveTo(X(PITCH_L / 2), Y(0));
  g.lineTo(X(PITCH_L / 2), Y(PITCH_W));
  g.stroke();
  circle(PITCH_L / 2, PITCH_W / 2, 9.15);
  spot(PITCH_L / 2, PITCH_W / 2);
  const box = 40.32;
  const six = 18.32;
  for (const end of [0, 1]) {
    const x0 = end ? PITCH_L - 16.5 : 0;
    rect(x0, (PITCH_W - box) / 2, 16.5, box);
    rect(end ? PITCH_L - 5.5 : 0, (PITCH_W - six) / 2, 5.5, six);
    const sx = end ? PITCH_L - 11 : 11;
    spot(sx, PITCH_W / 2);
    // the D: the part of the 9.15 m circle outside the box
    const a = Math.acos(5.5 / 9.15);
    if (end) circle(sx, PITCH_W / 2, 9.15, Math.PI - a, Math.PI + a);
    else circle(sx, PITCH_W / 2, 9.15, -a, a);
  }
  for (const [x, y, a0] of [[0, 0, 0], [PITCH_L, 0, Math.PI / 2], [PITCH_L, PITCH_W, Math.PI], [0, PITCH_W, -Math.PI / 2]]) {
    circle(x, y, 1, a0, a0 + Math.PI / 2);
  }

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
