import { Delaunay } from "d3-delaunay";
import * as THREE from "three";

/**
 * The Timestack: one goal as a stack of seconds. Each layer is the pitch at one second, the
 * earliest at the bottom and the goal on top; each player is a ribbon rising through time.
 * Plain three.js (no React) because a scroll timeline drives it every frame through `state`.
 */
export type StackData = {
  seconds: number[]; // one per layer, ascending
  ids: string[];
  pos: [number, number][][]; // pos[layer][player]
  ball: [number, number][];
  culprit: string;
  faultSecond: number;
  fix: { second: number; culprit: [number, number]; ball: [number, number] }[];
  /** The culprit's back-line teammates; their deepest man sets the line the culprit should hold. */
  lineIds: string[];
  /** The player the space matters for (the scorer), outlined in the nearest-player cells. */
  scorer: string;
  /** Which goal the defending side protects: true when it is the one at x = 0. */
  defendsLeft: boolean;
};

export type StackState = {
  height: number; // 0 flat pitch .. 1 full stack
  draw: number; // ribbons drawn 0..1
  scan: number; // layer index the scan sheet sits on (fractional)
  focus: number; // dim everything but the culprit and the ball
  fault: number; // offside line and layer flash
  patch: number; // the fix ribbon drawn, the goal above it fading
  line: number; // the back line through time, and nearest-player space on the fault layer
  cx: number; cy: number; cz: number; tx: number; ty: number; tz: number;
};

export type StackLabel = { text: string; bug?: boolean; at: (s: StackState) => [number, number, number] | null; show: (s: StackState) => boolean };

const COBALT = 0x1530d6;
const DEEP = 0x0c1d97;
const PAPER = 0xf3f5ff;
const AWAY = 0x9fb0ff;
const VAR = 0xffd60a;
export const LAYER = 2.7;
const X = (x: number) => x - 52.5;
const Z = (y: number) => y - 34;

function pitchTexture() {
  const c = document.createElement("canvas");
  c.width = 2100;
  c.height = 1360;
  const g = c.getContext("2d")!;
  const s = 20;
  g.strokeStyle = "rgba(243,245,255,.85)";
  g.lineWidth = 3;
  g.strokeRect(2, 2, 2096, 1356);
  g.beginPath(); g.moveTo(1050, 0); g.lineTo(1050, 1360); g.stroke();
  g.beginPath(); g.arc(1050, 680, 9.15 * s, 0, Math.PI * 2); g.stroke();
  for (const side of [0, 1]) {
    const x = side ? 2100 : 0;
    g.strokeRect(side ? x - 16.5 * s : 0, 680 - 20.16 * s, 16.5 * s, 40.32 * s);
    g.strokeRect(side ? x - 5.5 * s : 0, 680 - 9.16 * s, 5.5 * s, 18.32 * s);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Timestack {
  state: StackState;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
  private stack = new THREE.Group();
  private scanGroup = new THREE.Group();
  private ribbons = new Map<string, THREE.Mesh>();
  private ball!: THREE.Mesh;
  private fixRibbon!: THREE.Mesh;
  private fixBall!: THREE.Mesh;
  private offside!: THREE.Mesh;
  private faultPlane!: THREE.Mesh;
  private lineWall!: THREE.Mesh;
  private lineEdges!: THREE.LineSegments;
  private layerMats: THREE.LineBasicMaterial[] = [];
  private dots = new Map<string, THREE.Mesh>();
  private ballDot!: THREE.Mesh;
  private tags: { el: HTMLDivElement; l: StackLabel }[] = [];
  private raf = 0;
  private yaw = 0;
  yawTarget = 0;
  private iFault: number;
  private iFixEnd: number;
  private v = new THREE.Vector3();
  private disposables: { dispose(): void }[] = [];
  onSecond: (s: number) => void = () => {};

  constructor(private canvas: HTMLCanvasElement, labels: HTMLElement, private d: StackData, state: StackState, labelDefs: StackLabel[]) {
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(COBALT, 1);
    this.scene.fog = new THREE.Fog(COBALT, 130, 280);
    this.scene.add(this.stack);
    const N = d.seconds.length;
    this.iFault = d.seconds.indexOf(d.faultSecond);
    this.iFixEnd = d.fix.length ? d.fix[d.fix.length - 1].second - d.seconds[0] : N - 1;

    const tex = pitchTexture();
    const plane = new THREE.PlaneGeometry(105, 68);
    const floor = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    const fill = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: DEEP, transparent: true, opacity: 0.55, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = -0.05;
    this.scene.add(floor, fill);
    this.disposables.push(tex, plane);

    const edges = new THREE.EdgesGeometry(plane);
    this.disposables.push(edges);
    for (let i = 0; i < N; i++) {
      const m = new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: 0.12 });
      const l = new THREE.LineSegments(edges, m);
      l.rotation.x = -Math.PI / 2;
      l.position.y = i * LAYER;
      this.stack.add(l);
      this.layerMats.push(m);
    }

    d.ids.forEach((id, j) => {
      const pts = d.pos.map((row, i) => new THREE.Vector3(X(row[j][0]), i * LAYER, Z(row[j][1])));
      const home = id.startsWith("H");
      this.ribbons.set(id, this.ribbon(pts, home ? 0.32 : 0.3, home ? PAPER : AWAY, home ? 0.8 : 0.7));
    });
    this.ball = this.ribbon(d.ball.map((b, i) => new THREE.Vector3(X(b[0]), i * LAYER, Z(b[1]))), 0.62, 0xffffff, 1);
    const t0 = d.seconds[0];
    this.fixRibbon = this.ribbon(d.fix.map((f) => new THREE.Vector3(X(f.culprit[0]), (f.second - t0) * LAYER, Z(f.culprit[1]))), 0.55, VAR, 1);
    this.fixBall = this.ribbon(d.fix.map((f) => new THREE.Vector3(X(f.ball[0]), (f.second - t0) * LAYER, Z(f.ball[1]))), 0.5, VAR, 0.9);

    const cj = d.ids.indexOf(d.culprit);
    const at = d.pos[Math.max(0, this.iFault)][cj];
    this.offside = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 68), new THREE.MeshBasicMaterial({ color: VAR, transparent: true, opacity: 0 }));
    this.offside.position.set(X(at[0]), this.iFault * LAYER, 0);
    const cells = spaceTexture(d, this.iFault);
    this.disposables.push(cells);
    this.faultPlane = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: cells, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.faultPlane.rotation.x = -Math.PI / 2;
    this.faultPlane.position.y = this.iFault * LAYER;
    this.stack.add(this.offside, this.faultPlane);

    // the back line: on each layer, the deepest of the culprit's back-line teammates, joined
    // into a thin wall through time; the culprit's ribbon dropping behind it is the bug
    const lj = d.lineIds.map((id) => d.ids.indexOf(id)).filter((j) => j >= 0);
    const lineX = d.pos.map((row) => (lj.length ? (d.defendsLeft ? Math.min : Math.max)(...lj.map((j) => row[j][0])) : 52.5));
    const wall = new THREE.BufferGeometry();
    const verts: number[] = [];
    const seg: number[] = [];
    for (let i = 0; i < N; i++) {
      const x = X(lineX[i]), y = i * LAYER;
      seg.push(x, y, -34, x, y, 34);
      if (i < N - 1) {
        const x2 = X(lineX[i + 1]), y2 = (i + 1) * LAYER;
        verts.push(x, y, -34, x, y, 34, x2, y2, 34, x, y, -34, x2, y2, 34, x2, y2, -34);
      }
    }
    wall.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const segs = new THREE.BufferGeometry();
    segs.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    this.disposables.push(wall, segs);
    this.lineWall = new THREE.Mesh(wall, new THREE.MeshBasicMaterial({ color: PAPER, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.lineEdges = new THREE.LineSegments(segs, new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: 0 }));
    this.stack.add(this.lineWall, this.lineEdges);

    const sheet = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: PAPER, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    sheet.rotation.x = -Math.PI / 2;
    const edge = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: 0.9 }));
    edge.rotation.x = -Math.PI / 2;
    this.scanGroup.add(sheet, edge);
    this.stack.add(this.scanGroup);
    const dotGeo = new THREE.SphereGeometry(0.95, 16, 12);
    this.disposables.push(dotGeo);
    for (const id of d.ids) {
      const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: id === d.culprit ? VAR : id.startsWith("H") ? PAPER : AWAY }));
      this.dots.set(id, m);
      this.scanGroup.add(m);
    }
    this.ballDot = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.scanGroup.add(this.ballDot);

    this.tags = labelDefs.map((l) => {
      const el = document.createElement("div");
      el.className = "rc-tag" + (l.bug ? " rc-tag-bug" : "");
      el.textContent = l.text;
      labels.appendChild(el);
      return { el, l };
    });

    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private ribbon(points: THREE.Vector3[], radius: number, color: number, opacity: number) {
    const curve = new THREE.CatmullRomCurve3(points.length > 1 ? points : [points[0] ?? new THREE.Vector3(), (points[0] ?? new THREE.Vector3()).clone()], false, "centripetal");
    const geo = new THREE.TubeGeometry(curve, Math.max(2, points.length * 10), radius, 8, false);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.total = geo.index!.count;
    this.stack.add(mesh);
    this.disposables.push(geo, mat);
    return mesh;
  }

  private drawn(m: THREE.Mesh, k: number) {
    m.geometry.setDrawRange(0, Math.floor((m.userData.total * Math.max(0, Math.min(1, k))) / 6) * 6);
  }

  private lerp(s: number, j: number): [number, number] {
    const N = this.d.seconds.length;
    const i = Math.max(0, Math.min(N - 1, Math.floor(s)));
    const n = Math.min(N - 1, i + 1);
    const k = s - i;
    const a = j < 0 ? this.d.ball[i] : this.d.pos[i][j];
    const b = j < 0 ? this.d.ball[n] : this.d.pos[n][j];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }

  private apply() {
    const S = this.state;
    const N = this.d.seconds.length;
    this.stack.scale.y = Math.max(0.001, S.height);
    const goalFade = 1 - S.patch * 0.85;
    for (const [id, r] of this.ribbons) {
      const culprit = id === this.d.culprit;
      this.drawn(r, S.draw);
      const base = id.startsWith("H") ? 0.8 : 0.7;
      const m = r.material as THREE.MeshBasicMaterial;
      m.opacity = culprit ? (S.patch > 0 ? 0.35 + 0.65 * (1 - S.patch) : base) : base * (1 - S.focus * 0.8) * goalFade;
      m.color.setHex(culprit && S.fault > 0.3 ? VAR : culprit ? AWAY : m.color.getHex());
    }
    this.drawn(this.ball, S.draw);
    (this.ball.material as THREE.MeshBasicMaterial).opacity = goalFade;
    this.drawn(this.fixRibbon, S.patch);
    this.drawn(this.fixBall, S.patch);
    this.fixRibbon.visible = this.fixBall.visible = S.patch > 0.001;
    (this.offside.material as THREE.MeshBasicMaterial).opacity = S.fault;
    (this.faultPlane.material as THREE.MeshBasicMaterial).opacity = Math.min(S.fault, S.line) * 0.95;
    (this.lineWall.material as THREE.MeshBasicMaterial).opacity = S.line * 0.1 * goalFade;
    (this.lineEdges.material as THREE.LineBasicMaterial).opacity = S.line * 0.55 * goalFade;
    this.layerMats.forEach((m, i) => {
      m.opacity = (0.1 + (i === this.iFault ? S.fault * 0.6 : 0)) * (i > this.iFixEnd ? goalFade : 1);
    });
    const s = Math.max(0, Math.min(N - 1, S.scan));
    this.scanGroup.position.y = s * LAYER;
    const squash = 1 / Math.max(0.001, S.height);
    this.d.ids.forEach((id, j) => {
      const p = this.lerp(s, j);
      const dot = this.dots.get(id)!;
      dot.position.set(X(p[0]), 0, Z(p[1]));
      dot.scale.set(1, squash, 1);
    });
    const b = this.lerp(s, -1);
    this.ballDot.position.set(X(b[0]), 0, Z(b[1]));
    this.ballDot.scale.set(1, squash, 1);
    this.onSecond(this.d.seconds[0] + Math.round(s));
  }

  private frame = () => {
    const S = this.state;
    this.yaw += (this.yawTarget - this.yaw) * 0.08;
    const dx = S.cx - S.tx, dz = S.cz - S.tz, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.camera.position.set(S.tx + dx * c - dz * s, S.cy, S.tz + dx * s + dz * c);
    this.camera.lookAt(S.tx, S.ty, S.tz);
    this.apply();
    this.renderer.render(this.scene, this.camera);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    for (const { el, l } of this.tags) {
      const p = l.at(S);
      const on = !!p && l.show(S);
      if (p) {
        this.v.set(p[0], p[1], p[2]).project(this.camera);
        el.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * w}px, ${(-this.v.y * 0.5 + 0.5) * h}px) translate(-50%, -140%)`;
      }
      el.style.opacity = on && this.v.z < 1 ? "1" : "0";
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const narrow = w < 720;
    this.camera.setViewOffset(w, h, narrow ? 0 : -w * 0.17, narrow ? h * 0.16 : 0, w, h);
    this.camera.fov = narrow ? 52 : 38;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const t of this.tags) t.el.remove();
    for (const d of this.disposables) d.dispose();
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      m?.dispose?.();
    });
    this.renderer.dispose();
  }
}

/** World position (before the stack's height scale) of a pitch point at a layer. */
export const stackPoint = (x: number, y: number, layer: number, height: number): [number, number, number] => [X(x), layer * LAYER * height, Z(y)];

/** Nearest-player cells (a Voronoi diagram) for one layer: who is closest to each patch of grass.
 * Deliberately labelled as nearest player, not pitch control: it ignores speed and direction. */
function spaceTexture(d: StackData, layer: number) {
  const c = document.createElement("canvas");
  c.width = 1050;
  c.height = 680;
  const g = c.getContext("2d")!;
  const row = d.pos[Math.max(0, layer)];
  const pts = row.map(([x, y]) => [x * 10, y * 10] as [number, number]);
  const v = Delaunay.from(pts).voronoi([0, 0, 1050, 680]);
  d.ids.forEach((id, j) => {
    const home = id.startsWith("H") === d.scorer.startsWith("H");
    g.beginPath();
    v.renderCell(j, g);
    g.fillStyle = id === d.scorer ? "rgba(243,245,255,.6)" : home ? "rgba(243,245,255,.16)" : "rgba(8,20,110,.75)";
    g.fill();
  });
  g.beginPath();
  v.render(g);
  g.strokeStyle = "rgba(243,245,255,.55)";
  g.lineWidth = 2;
  g.stroke();
  const j = d.ids.indexOf(d.scorer);
  if (j >= 0) {
    g.beginPath();
    v.renderCell(j, g);
    g.strokeStyle = "rgba(243,245,255,1)";
    g.lineWidth = 5;
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
