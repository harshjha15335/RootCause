import type { TFunction } from "i18next";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Lab } from "../data";
import type { GoalCase } from "../goal";

/** Shared pieces for the three Lab views: colours, the view contract, and three.js helpers. */
export const COL = {
  home: new THREE.Color("#6ea8ff"),
  away: new THREE.Color("#ff6b5e"),
  ball: new THREE.Color("#ffffff"),
  bug: new THREE.Color("#ffd60a"),
};
export const BG = 0x060918;
export const teamCol = (i: number) => (i < 11 ? COL.home : COL.away);

export type Tool = { id: string; label: string; pressed?: boolean; fix?: boolean; on: () => void };
export type Callout = { kind: "" | "bug" | "goal"; k: string; html: string };
export type Ctx = {
  lab: Lab;
  c: GoalCase;
  canvas: HTMLCanvasElement;
  mini: HTMLCanvasElement;
  t: TFunction;
  state: { t: number; fix: boolean; playing: boolean };
  tag: (x: number, y: number, html: string) => void;
  untag: () => void;
  seek: (t: number) => void;
  refresh: () => void;
};
export interface LabView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls | null;
  bloom: [number, number, number];
  start: number;
  tools(): Tool[];
  frame(t: number, dt: number): Callout;
  on(): void;
  off(): void;
  dispose(): void;
}

export const clock = (t: number) => {
  const s = Math.round(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const surname = (lab: Lab, i: number) => lab.names[i].split(" ").slice(-1)[0];
export const who = (lab: Lab, i: number) => `#${lab.numbers[i]} ${lab.names[i]}`;
export const W = (x: number, y: number, h = 0) => new THREE.Vector3(x - 52.5, h, y - 34);

export function pitchCanvas({ fill = "", stripes = "", line = "rgba(255,255,255,.6)", lw = 0.14, pad = 0, k = 20 } = {}) {
  const c = document.createElement("canvas");
  c.width = (105 + 2 * pad) * k;
  c.height = (68 + 2 * pad) * k;
  const g = c.getContext("2d")!;
  if (fill) { g.fillStyle = fill; g.fillRect(0, 0, c.width, c.height); }
  g.translate(pad * k, pad * k);
  g.scale(k, k);
  if (stripes) { g.fillStyle = stripes; for (let i = 0; i < 14; i += 2) g.fillRect(i * 7.5, 0, 7.5, 68); }
  g.strokeStyle = line;
  g.lineWidth = lw;
  g.strokeRect(0, 0, 105, 68);
  g.beginPath(); g.moveTo(52.5, 0); g.lineTo(52.5, 68); g.stroke();
  g.beginPath(); g.arc(52.5, 34, 9.15, 0, 7); g.stroke();
  for (const side of [0, 1]) {
    const X = (x: number) => (side ? 105 - x : x);
    g.strokeRect(Math.min(X(0), X(16.5)), 13.84, 16.5, 40.32);
    g.strokeRect(Math.min(X(0), X(5.5)), 24.84, 5.5, 18.32);
    const a = Math.acos(5.5 / 9.15);
    g.beginPath();
    if (side) g.arc(X(11), 34, 9.15, Math.PI - a, Math.PI + a);
    else g.arc(X(11), 34, 9.15, -a, a);
    g.stroke();
    g.fillStyle = line; g.beginPath(); g.arc(X(11), 34, 0.25, 0, 7); g.fill();
    if (pad) g.strokeRect(side ? 105 : -2, 30.34, 2, 7.32);
  }
  return c;
}
export function texOf(canvas: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

type LabelOpts = { color?: string; bg?: string | null; size?: number; h?: number; bold?: boolean };
function labelTexture(text: string, { color = "#e9ecff", bg = "rgba(6,9,24,.85)", size = 40, bold = true }: LabelOpts) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = `${bold ? 700 : 500} ${size}px "Hanken Grotesk Variable", "Noto Sans Devanagari", system-ui, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + size;
  c.width = w;
  c.height = Math.round(size * 1.6);
  g.font = font;
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, c.height, c.height / 2); g.fill(); }
  g.fillStyle = color;
  g.textBaseline = "middle";
  g.fillText(text, size / 2, c.height / 2 + 1);
  return c;
}
export function label(text: string, opts: LabelOpts = {}) {
  const c = labelTexture(text, opts);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf(c), depthTest: false, transparent: true }));
  const h = opts.h ?? 2.6;
  s.scale.set((h * c.width) / c.height, h, 1);
  s.renderOrder = 20;
  s.userData = { text, opts };
  return s;
}
export function relabel(s: THREE.Sprite, text: string) {
  if (s.userData.text === text) return;
  const opts = s.userData.opts as LabelOpts;
  const c = labelTexture(text, opts);
  s.material.map?.dispose();
  s.material.map = texOf(c);
  const h = opts.h ?? 2.6;
  s.scale.set((h * c.width) / c.height, h, 1);
  s.userData.text = text;
}

export function fatLine(width: number, o: { additive?: boolean; dashed?: boolean; dash?: number; gap?: number; order?: number } = {}) {
  const m = new LineMaterial({
    linewidth: width, vertexColors: true, transparent: true, depthWrite: false,
    blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    dashed: !!o.dashed, dashSize: o.dash ?? 1.2, gapSize: o.gap ?? 0.9,
  });
  const l = new Line2(new LineGeometry(), m);
  l.frustumCulled = false;
  l.renderOrder = o.order ?? 1;
  return l;
}
export function setLine(l: Line2, pts: number[], cols: number[]) {
  const g = new LineGeometry();
  g.setPositions(pts);
  g.setColors(cols);
  l.geometry.dispose();
  l.geometry = g;
  if (l.material.dashed) l.computeLineDistances();
}
export function arc(a: THREE.Vector3, b: THREE.Vector3, lift: number, n = 28) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = a.clone().lerp(b, u);
    p.y += Math.sin(Math.PI * u) * lift;
    out.push(p);
  }
  return out;
}
export function project(v: THREE.Vector3, cam: THREE.Camera, canvas: HTMLCanvasElement) {
  const p = v.clone().project(cam);
  const r = canvas.getBoundingClientRect();
  return [(p.x * 0.5 + 0.5) * r.width, (-p.y * 0.5 + 0.5) * r.height] as const;
}

/** Click without drag: pointerdown and pointerup within 4 px. */
export function clicks(canvas: HTMLCanvasElement, onClick: (e: PointerEvent) => void) {
  let down: [number, number] | null = null;
  const d = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
  const u = (e: PointerEvent) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4) onClick(e);
    down = null;
  };
  return {
    on() { canvas.addEventListener("pointerdown", d); canvas.addEventListener("pointerup", u); },
    off() { canvas.removeEventListener("pointerdown", d); canvas.removeEventListener("pointerup", u); },
  };
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const x of mats) { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); }
  });
}
