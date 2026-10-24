import gsap from "gsap";
import * as THREE from "three";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Autopsy, Mistake, Pt, Snap, Suspect, Traced } from "./model";

/**
 * The Goal Autopsy's 3D stage, in the product's one visual language: a cobalt night, a glass
 * pitch, players as readable figures, and the Timestack (time as layers, players as ribbons).
 * Yellow means one thing only: the mistake, the culprit and the fix. Bloom is kept for the ball
 * trail and the culprit (the only things drawn brighter than white).
 *
 * The picture is a pure function of (step, t): React owns the words and the clock's steps; this
 * owns the picture. The scoring side always attacks toward x = 105 (screen right).
 */
export type Beat = "pre" | "goal" | "mistake" | "trial" | "verdict";
export type Step = { beat: Beat; k: number; dur: number };
export type Inset = { left: number; top: number; bottom: number };
export type Tag = { text: string; at: () => THREE.Vector3 | null; tone?: "bug" | "dim" | "plain"; side?: "above" | "below" };
export type StageOpts = {
  reduced: boolean;
  phone: boolean;
  dpr: number;
  overlay: HTMLElement;
  say: (key: string, vars?: Record<string, string | number>) => string;
  onHover: (html: string | null, x: number, y: number) => void;
};
export type AutopsyStage = {
  show(step: number, t?: number): void;
  setPlaying(p: boolean): void;
  time(): number;
  resize(w: number, h: number, inset: Inset): void;
  dispose(): void;
};

// ---------- palette (linear-safe: everything ordinary stays under 1.0, bloom starts at 1.0) ----------
const DEEP = new THREE.Color("#0b1a8a");
const INK = new THREE.Color("#06104f");
const CHALK = new THREE.Color("#e6eaff");
const SKY = new THREE.Color("#8fa6ff");
const VAR = new THREE.Color("#ffd60a");
const HOT = VAR.clone().multiplyScalar(2.6);
const X = (x: number) => x - 52.5;
const Z = (y: number) => y - 34;
const clamp01 = (u: number) => Math.min(Math.max(u, 0), 1);
const ease = gsap.parseEase("power2.inOut") as (u: number) => number;
const easeOut = gsap.parseEase("power3.out") as (u: number) => number;
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const clock = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const FIG = 1.55; // figures are drawn a little larger than life so they read on a phone

// ---------- the timeline ----------
const GOAL = { lead: 14, slow: 4, fast: 1.3, slowRate: 0.4, hold: 2.6 };
const goalStart = (a: Autopsy) => Math.max(a.moveFrom, a.goalS - GOAL.lead);
/** match second shown at t seconds into the goal beat: brisk build-up, then slow motion into the net */
export function goalClock(a: Autopsy, t: number) {
  const s0 = goalStart(a), sl = a.goalS - GOAL.slow, ta = (sl - s0) / GOAL.fast;
  if (t < ta) return s0 + t * GOAL.fast;
  return Math.min(a.goalS + 0.6, sl + (t - ta) * GOAL.slowRate);
}
const goalDur = (a: Autopsy) => (a.goalS - GOAL.slow - goalStart(a)) / GOAL.fast + (GOAL.slow + 0.6) / GOAL.slowRate + GOAL.hold;
const FIX_AT = 7;
const fixRate = 0.9;
const fixDur = (x: Suspect) => (x.frames.length ? (x.end - x.start) / fixRate + 3 : 0);

export function stepsOf(a: Autopsy): Step[] {
  const s: Step[] = [{ beat: "pre", k: 0, dur: 10 }, { beat: "goal", k: 0, dur: goalDur(a) }];
  if (a.kind === "traced") {
    a.mistakes.forEach((_, k) => s.push({ beat: "mistake", k, dur: k === 0 ? 12.5 : 8.5 }));
    s.push({ beat: "trial", k: 0, dur: 6 + 2.4 * trialRows(a).length });
    s.push({ beat: "verdict", k: 0, dur: FIX_AT + Math.max(fixDur(a.j.culprit), 4) });
  } else s.push({ beat: "verdict", k: 0, dur: 9 });
  return s;
}
/** the suspects the trial replays: everyone with a recorded fixed run, culprit first */
export const trialRows = (a: Traced) => [a.j.culprit, ...a.j.suspects.filter((x) => x !== a.j.culprit)].filter((x) => x.frames.length);

// ---------- small makers ----------
function canvasTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function linesTexture() {
  const k = 20, c = document.createElement("canvas");
  c.width = 105 * k;
  c.height = 68 * k;
  const g = c.getContext("2d")!;
  g.scale(k, k);
  g.strokeStyle = "rgba(230,234,255,.78)";
  g.lineWidth = 0.14;
  g.strokeRect(0.07, 0.07, 104.86, 67.86);
  g.beginPath(); g.moveTo(52.5, 0); g.lineTo(52.5, 68); g.stroke();
  g.beginPath(); g.arc(52.5, 34, 9.15, 0, 7); g.stroke();
  g.fillStyle = "rgba(230,234,255,.78)";
  g.beginPath(); g.arc(52.5, 34, 0.3, 0, 7); g.fill();
  for (const side of [0, 1]) {
    const x = (v: number) => (side ? 105 - v : v);
    g.strokeRect(Math.min(x(0), x(16.5)), 13.84, 16.5, 40.32);
    g.strokeRect(Math.min(x(0), x(5.5)), 24.84, 5.5, 18.32);
    const a = Math.acos(5.5 / 9.15);
    g.beginPath();
    if (side) g.arc(x(11), 34, 9.15, Math.PI - a, Math.PI + a); else g.arc(x(11), 34, 9.15, -a, a);
    g.stroke();
    g.beginPath(); g.arc(x(11), 34, 0.25, 0, 7); g.fill();
  }
  return canvasTex(c);
}
function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(2,6,40,.55)");
  r.addColorStop(1, "rgba(2,6,40,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return canvasTex(c);
}
const basic = (color: THREE.ColorRepresentation, opacity = 1, extra: THREE.MeshBasicMaterialParameters = {}) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, ...extra });
function rect(w: number, h: number) {
  const g = new THREE.BufferGeometry().setFromPoints([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  return g;
}

type Figure = { g: THREE.Group; body: THREE.Mesh<THREE.CapsuleGeometry, THREE.MeshStandardMaterial>; head: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>; ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; blob: THREE.Mesh; base: THREE.Color };

// ---------- the stage ----------
export function createStage(canvas: HTMLCanvasElement, a: Autopsy, opts: StageOpts): AutopsyStage {
  const { lab, att } = a;
  const traced = a.kind === "traced" ? a : null;
  const steps = stepsOf(a);
  const sur = (i: number) => lab.names[i].split(" ").slice(-1)[0];
  const teamCol = (i: number) => (i < 11 ? CHALK : SKY);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(opts.dpr);
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const g = c.getContext("2d")!, grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, "#1a37e0");
    grd.addColorStop(0.6, "#1229b4");
    grd.addColorStop(1, "#0b1a8a");
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 256);
    scene.background = canvasTex(c);
  }
  scene.fog = new THREE.Fog(DEEP, 160, 420);
  const camera = new THREE.PerspectiveCamera(opts.phone ? 50 : 34, 1, 0.5, 1200);

  // soft light: a cool sky, a warm-white key from the main stand, no hard shadows
  scene.add(new THREE.HemisphereLight(0xc8d2ff, 0x0b1a8a, 1.6));
  const key = new THREE.DirectionalLight(0xfff6e6, 1.5);
  key.position.set(-30, 80, 60);
  scene.add(key);
  const spot = new THREE.SpotLight(0xfff3c4, 0, 0, 0.16, 0.7, 0); // no decay: intensity is a plain multiplier
  spot.position.set(0, 60, 0);
  scene.add(spot, spot.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: INK }));
  ground.position.y = -0.6;
  scene.add(ground);

  // ---------- the pitch: a glass plate with chalk lines ----------
  const linesTex = linesTexture();
  const pitch = new THREE.Group();
  const plateGeo = new THREE.PlaneGeometry(105, 68).rotateX(-Math.PI / 2);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(117, 80).rotateX(-Math.PI / 2), basic(DEEP, 0.92));
  fill.position.y = -0.05;
  const lines = new THREE.Mesh(plateGeo, basic(0xffffff, 0.75, { map: linesTex }));
  lines.position.y = 0.02;
  pitch.add(fill, lines);
  scene.add(pitch);

  // ---------- 22 figures and the ball ----------
  const blobTex = blobTexture();
  const bodyGeo = new THREE.CapsuleGeometry(0.34, 0.9, 6, 14).translate(0, 0.79, 0);
  const headGeo = new THREE.SphereGeometry(0.24, 18, 12).translate(0, 1.66, 0);
  const ringGeo = new THREE.RingGeometry(0.62, 0.82, 40).rotateX(-Math.PI / 2);
  const blobGeo = new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2);
  const figure = (col: THREE.Color): Figure => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05, transparent: true }));
    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, transparent: true }));
    const ring = new THREE.Mesh(ringGeo, basic(VAR, 0));
    ring.position.y = 0.04;
    const blob = new THREE.Mesh(blobGeo, basic(0xffffff, 1, { map: blobTex }));
    blob.position.y = 0.03;
    g.add(blob, ring, body, head);
    g.scale.setScalar(FIG);
    return { g, body, head, ring, blob, base: col.clone() };
  };
  const figs = Array.from({ length: 22 }, (_, i) => figure(teamCol(i)));
  const players = new THREE.Group();
  figs.forEach((f) => players.add(f.g));
  scene.add(players);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.15, 1.15) }));
  scene.add(ball);
  // the ball trail: a tube rebuilt from the last seconds, brighter than white so it blooms
  const trailMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color(2.4, 2.2, 1.6) }, o: { value: 1 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: "uniform vec3 c; uniform float o; varying vec2 vUv; void main(){ float a = pow(vUv.x, 1.6); gl_FragColor = vec4(c * a * o, 1.); }",
  });
  const trail = new THREE.Mesh(new THREE.BufferGeometry(), trailMat);
  trail.frustumCulled = false;
  scene.add(trail);
  function setTrail(at: (s: number) => Snap, s: number, from: number, len = 3) {
    const pts: THREE.Vector3[] = [];
    const a0 = Math.max(from, s - len);
    for (let k = 0; k <= 36; k++) {
      const u = a0 + ((s - a0) * k) / 36, b = at(u).ball;
      pts.push(new THREE.Vector3(X(b[0]), 0.42, Z(b[1])));
    }
    trail.geometry.dispose();
    const far = pts[0].distanceTo(pts[pts.length - 1]) > 0.3;
    trail.geometry = far ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 72, 0.2, 6, false) : new THREE.BufferGeometry();
  }

  function pose(snap: Snap) {
    snap.pos.forEach(([x, y], i) => figs[i].g.position.set(X(x), 0, Z(y)));
    ball.position.set(X(snap.ball[0]), 0.42, Z(snap.ball[1]));
  }
  function look(o: number, only?: Set<number>, dim = 0.22) {
    figs.forEach((f, i) => {
      const v = only && !only.has(i) ? o * dim : o;
      f.body.material.opacity = f.head.material.opacity = v;
      (f.blob.material as THREE.MeshBasicMaterial).opacity = v;
      f.g.visible = v > 0.01;
      f.body.material.color.copy(f.base);
      f.head.material.color.copy(f.base);
      f.body.material.emissive.setRGB(0, 0, 0);
      f.ring.material.opacity = 0;
    });
    ball.visible = o > 0.01;
  }
  const glowFig = (i: number, k: number) => {
    const f = figs[i];
    f.body.material.color.copy(f.base).lerp(VAR, k);
    f.head.material.color.copy(f.base).lerp(VAR, k);
    f.body.material.emissive.copy(HOT).multiplyScalar(0.35 * k);
    f.ring.material.color.copy(VAR);
    f.ring.material.opacity = k;
  };

  // ---------- pre-match: each unit joined by a hairline ----------
  const unitLines = new THREE.Group();
  scene.add(unitLines);
  for (const team of [0, 1]) {
    for (const unit of ["def", "mid", "att"] as const) {
      const ids = Array.from({ length: 11 }, (_, k) => team * 11 + k).filter((i) => a.plan.unit[i] === unit).sort((p, q) => a.plan.shape[p][1] - a.plan.shape[q][1]);
      if (ids.length < 2) continue;
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ids.map((i) => new THREE.Vector3(X(a.plan.shape[i][0]), 0.12, Z(a.plan.shape[i][1])))), new THREE.LineBasicMaterial({ color: team ? SKY : CHALK, transparent: true, opacity: 0 }));
      unitLines.add(l);
    }
  }

  // ---------- the Timestack ----------
  const s0 = traced ? Math.max(a.moveFrom, Math.min(...traced.mistakes.map((m) => m.x.second)) - 6) : a.moveFrom;
  const s1 = a.goalS;
  const H = Math.min(3, Math.max(1.6, 54 / Math.max(1, s1 - s0)));
  const yOf = (s: number) => (s - s0) * H;
  const stack = new THREE.Group();
  scene.add(stack);
  const layerGeo = rect(105, 68);
  const layers: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  for (let s = s0; s <= s1; s++) {
    const l = new THREE.LineLoop(layerGeo, new THREE.LineBasicMaterial({ color: CHALK, transparent: true, opacity: 0.16 }));
    l.position.y = yOf(s);
    stack.add(l);
    layers.push(l);
  }
  const top = new THREE.Mesh(plateGeo, basic(0xffffff, 0, { map: linesTex }));
  top.position.y = yOf(s1) + 0.02;
  stack.add(top);
  type Ribbon = THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  const tube = (pts: THREE.Vector3[], r: number, col: THREE.Color, o: number): Ribbon => {
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.length > 1 ? pts : [pts[0], pts[0].clone().add(new THREE.Vector3(0, 0.01, 0))], false, "centripetal"), Math.max(8, pts.length * 3), r, 8, false);
    const m = new THREE.Mesh(geo, basic(col, o));
    m.userData.total = geo.index!.count;
    return m;
  };
  const drawn = (m: Ribbon, k: number) => m.geometry.setDrawRange(0, Math.floor((m.userData.total * clamp01(k)) / 6) * 6);
  const path = (at: (s: number) => Snap, i: number, from: number, to: number) => {
    const pts: THREE.Vector3[] = [];
    for (let s = from; s <= to + 1e-6; s += 0.5) {
      const p = i < 0 ? at(s).ball : at(s).pos[i];
      pts.push(new THREE.Vector3(X(p[0]), yOf(s), Z(p[1])));
    }
    if (!pts.length) {
      const p = i < 0 ? at(from).ball : at(from).pos[i];
      pts.push(new THREE.Vector3(X(p[0]), yOf(from), Z(p[1])));
    }
    return pts;
  };
  const ribbons = figs.map((_, i) => {
    const r = tube(path(a.frame, i, s0, s1), i < 11 ? 0.3 : 0.28, teamCol(i), 0.7);
    stack.add(r);
    return r;
  });
  const ballRibbon = tube(path(a.frame, -1, s0, s1), 0.42, new THREE.Color(0.95, 0.95, 0.95), 0.95);
  stack.add(ballRibbon);
  // the scan sheet that walks down from the goal
  const scan = new THREE.Group();
  scan.add(new THREE.Mesh(plateGeo, basic(CHALK, 0.06, { side: THREE.DoubleSide })), new THREE.LineLoop(layerGeo, new THREE.LineBasicMaterial({ color: CHALK, transparent: true, opacity: 0.9 })));
  stack.add(scan);

  // one lit layer per mistake: the layer, the line he should have held, his ghost, the space he left
  type Lit = { m: Mistake; g: THREE.Group; plate: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; edge: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>; line: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; cells: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; ghost: Figure; link: THREE.Line; dots: THREE.InstancedMesh; real: Figure };
  const cellGeo = new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2);
  const dotGeo = new THREE.CircleGeometry(0.75, 20).rotateX(-Math.PI / 2);
  const lit: Lit[] = (traced?.mistakes ?? []).map((m) => {
    const g = new THREE.Group();
    g.position.y = yOf(m.x.second);
    const plate = new THREE.Mesh(plateGeo, basic(VAR, 0, { side: THREE.DoubleSide }));
    const edge = new THREE.LineLoop(layerGeo, new THREE.LineBasicMaterial({ color: VAR, transparent: true, opacity: 0 }));
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 68), basic(VAR, 0));
    line.position.set(X(m.ghost[0]), 0.06, 0);
    const cells = new THREE.InstancedMesh(cellGeo, basic(VAR, 0, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), Math.max(1, m.cells.length));
    const mtx = new THREE.Matrix4();
    m.cells.forEach(([x, y], k) => cells.setMatrixAt(k, mtx.makeTranslation(X(x), 0.04, Z(y))));
    cells.count = m.cells.length;
    // everyone on that layer, as discs, so the layer reads as a frozen pitch
    const f = a.frame(m.x.second);
    const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 22);
    f.pos.forEach(([x, y], i) => {
      dots.setMatrixAt(i, mtx.makeTranslation(X(x), 0.08, Z(y)));
      dots.setColorAt(i, i === m.x.player ? VAR : teamCol(i));
    });
    const ghost = figure(VAR);
    ghost.g.position.set(X(m.ghost[0]), 0, Z(m.ghost[1]));
    const real = figure(VAR);
    real.g.position.set(X(m.real[0]), 0, Z(m.real[1]));
    const link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X(m.real[0]), 0.1, Z(m.real[1])), new THREE.Vector3(X(m.ghost[0]), 0.1, Z(m.ghost[1]))]), new THREE.LineDashedMaterial({ color: VAR, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0 }));
    link.computeLineDistances();
    g.add(plate, edge, cells, line, dots, link, ghost.g, real.g);
    stack.add(g);
    return { m, g, plate, edge, line, cells, ghost, link, dots, real };
  });

  // the trial: each suspect's fixed run drawn beside the real one, through the same layers
  const fixedRibbons = traced
    ? trialRows(traced).map((x) => {
        const at = (s: number) => traced.j.replay(x, s);
        const from = Math.max(s0, x.start), to = Math.min(s1, x.end);
        const r = tube(path(at, x.player, from, to), 0.42, x === traced.j.culprit ? VAR : VAR.clone().multiplyScalar(0.75), 1);
        const b = tube(path(at, -1, from, to), 0.3, VAR, 0.6);
        stack.add(r, b);
        return { x, r, b };
      })
    : [];

  // ---------- the verdict: a spotlight cone and the offside line of the fix ----------
  const cone = (() => {
    const geo = new THREE.CylinderGeometry(0.5, 4.2, 46, 48, 1, true).translate(0, 23, 0);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { o: { value: 0 } },
      vertexShader: "varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: "uniform float o; varying float vY; void main(){ float a = 1. - smoothstep(0., 46., vY); gl_FragColor = vec4(vec3(1., .93, .6) * a * a * .32 * o, 1.); }",
    }));
    scene.add(m);
    return m;
  })();
  const offLine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 68), basic(VAR, 0));
  offLine.position.y = 0.08;
  scene.add(offLine);
  const asPlayed = figure(SKY);
  scene.add(asPlayed.g);

  // ---------- tags (HTML, crisp, outside the bloom) ----------
  type Live = { el: HTMLDivElement; tag: Tag };
  let live: Live[] = [];
  const setTags = (tags: Tag[]) => {
    const want = tags.map((t) => `${t.text}|${t.tone ?? ""}|${t.side ?? ""}`);
    if (live.length === tags.length && live.every((l, k) => `${l.tag.text}|${l.tag.tone ?? ""}|${l.tag.side ?? ""}` === want[k])) {
      live.forEach((l, k) => (l.tag = tags[k]));
      return;
    }
    for (const l of live) l.el.remove();
    live = tags.map((tag) => {
      const el = document.createElement("div");
      el.className = `autopsy-tag${tag.tone === "bug" ? " is-bug" : tag.tone === "dim" ? " is-dim" : ""}${tag.side === "below" ? " is-below" : ""}`;
      el.textContent = tag.text;
      opts.overlay.appendChild(el);
      return { el, tag };
    });
  };
  const v3 = new THREE.Vector3();
  let W = 1, Hh = 1, inset: Inset = { left: 0, top: 0, bottom: 0 };
  const placeTags = () => {
    for (const l of live) {
      const p = l.tag.at();
      if (!p) { l.el.style.opacity = "0"; continue; }
      v3.copy(p).project(camera);
      const x = (v3.x * 0.5 + 0.5) * W, y = (-v3.y * 0.5 + 0.5) * Hh;
      const out = v3.z > 1 || x < 8 || x > W - 8 || y < 8 || y > Hh - 8;
      l.el.style.opacity = out ? "0" : "1";
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  };
  const headOf = (i: number, lift = 3.6) => () => figs[i].g.visible ? figs[i].g.position.clone().setY(lift) : null;

  // ---------- camera: every shot is fitted to what it must show, around the copy ----------
  type Shot = { pos: THREE.Vector3; at: THREE.Vector3 };
  const fitShot = (box: THREE.Box3, az: number, el: number, pad = 1.06): Shot => {
    const at = box.getCenter(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const fwd = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * (W / Hh);
    const fx = Math.max(0.3, (W - inset.left) / W), fy = Math.max(0.3, (Hh - inset.top - inset.bottom) / Hh);
    let d = 1;
    for (let k = 0; k < 8; k++) {
      const c = new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).sub(at);
      const x = c.dot(right), y = c.dot(up), z = c.dot(dir);
      d = Math.max(d, z + Math.abs(x) / (tanH * fx), z + Math.abs(y) / (tanV * fy));
    }
    return { pos: at.clone().add(dir.multiplyScalar(d * pad)), at };
  };
  const boxOf = (pts: Pt[], y0 = 0, y1 = 2.6, padX = 8, padZ = 6) => {
    const b = new THREE.Box3();
    for (const [x, y] of pts) b.expandByPoint(new THREE.Vector3(X(x), y0, Z(y)));
    b.expandByPoint(new THREE.Vector3(b.min.x, y1, b.min.z));
    b.min.x -= padX; b.max.x += padX; b.min.z -= padZ; b.max.z += padZ;
    b.min.x = Math.max(b.min.x, -60); b.max.x = Math.min(b.max.x, 60);
    b.min.z = Math.max(b.min.z, -38); b.max.z = Math.min(b.max.z, 38);
    return b;
  };
  const pitchBox = new THREE.Box3(new THREE.Vector3(-54, 0, -35), new THREE.Vector3(54, 3, 35));
  const stackBox = () => new THREE.Box3(new THREE.Vector3(-53, 0, -35), new THREE.Vector3(53, yOf(s1) + 1, 35));
  const overhead = (b: THREE.Box3) => fitShot(b, 0, 1.45, 1.04);

  let from: Shot | null = null;
  let fromAt = 0;
  const camNow = (): Shot => ({ pos: camera.position.clone(), at: (camera.userData.at as THREE.Vector3)?.clone() ?? new THREE.Vector3() });
  const aim = (s: Shot) => {
    camera.position.copy(s.pos);
    camera.userData.at = s.at.clone();
    camera.lookAt(s.at);
  };
  /** move to `to`, easing out of wherever the camera was when the step began */
  const cam = (to: Shot, t: number, dur = 2.4) => {
    if (!from || opts.reduced) return aim(to);
    const u = ease(seg(t - fromAt, 0, dur));
    aim({ pos: from.pos.clone().lerp(to.pos, u), at: from.at.clone().lerp(to.at, u) });
  };
  const follow = { at: new THREE.Vector3(), ok: false };

  // ---------- post: bloom only above white, depth of field on freeze-frames, vignette and grain ----------
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: opts.phone ? 0 : 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = opts.phone ? null : new BokehPass(scene, camera, { focus: 60, aperture: 0.00012, maxblur: 0.006 });
  if (bokeh) { bokeh.enabled = false; composer.addPass(bokeh); }
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, t: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float t; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + t) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - .5; float v = smoothstep(.9, .25, length(d * vec2(1.05, 1.))); c.rgb *= mix(.62, 1., v); c.rgb += (hash(vUv * 900.) - .5) * .02; gl_FragColor = c; }`,
  });
  composer.addPass(finish);
  const focusOn = (p: THREE.Vector3 | null, k: number) => {
    if (!bokeh) return;
    bokeh.enabled = !!p && k > 0.01;
    if (!p) return;
    const u = bokeh.uniforms as Record<string, THREE.IUniform>;
    u.focus.value = camera.position.distanceTo(p);
    u.aperture.value = 0.00012 * k;
  };

  // ---------- one frame of one step ----------
  let step = 0, t = 0, playing = true;
  const say = opts.say;
  const culpritOf = () => traced!.j.culprit;
  const fixAt = (s: number) => traced!.j.replay(culpritOf(), s);

  function frame() {
    const st = steps[step];
    const tags: Tag[] = [];
    // defaults: the flat pitch, everyone visible, the stack folded away
    pitch.visible = true;
    stack.visible = false;
    unitLines.children.forEach((l) => ((l as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>).material.opacity = 0));
    trail.visible = false;
    cone.visible = false;
    spot.intensity = 0;
    offLine.material.opacity = 0;
    asPlayed.g.visible = false;
    key.intensity = 1.5;
    focusOn(null, 0);
    look(1);

    if (st.beat === "pre") {
      // from the first second of the move, everyone glides to their average place
      const u = opts.reduced ? 1 : easeOut(seg(t, 0.2, 2.6));
      const f = a.frame(a.moveFrom);
      f.pos.forEach(([x, y], i) => {
        const [px, py] = a.plan.shape[i] ?? [x, y];
        figs[i].g.position.set(X(x + (px - x) * u), 0, Z(y + (py - y) * u));
      });
      ball.visible = false;
      unitLines.children.forEach((l) => ((l as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>).material.opacity = 0.75 * seg(t, 2, 3.2)));
      const team = (k: 0 | 1) => say("pre.shape", { team: lab.clubs[k].name, f: a.plan.formation[k] });
      // the scoring side attacks right: its tag sits on the left half
      if (seg(t, 2.4, 3) > 0) {
        tags.push({ text: team(att), at: () => new THREE.Vector3(X(30), 0, Z(-6)), tone: "plain" });
        tags.push({ text: team(a.def), at: () => new THREE.Vector3(X(78), 0, Z(-6)), tone: "plain" });
      }
      cam(opts.reduced ? overhead(pitchBox) : fitShot(pitchBox, 0.0, 0.92), t, 2.6);
    }

    if (st.beat === "goal") {
      const s = opts.reduced ? a.goalS + 0.6 : goalClock(a, t);
      pose(a.frame(s));
      trail.visible = true;
      setTrail(a.frame, s, goalStart(a), s > a.goalS - GOAL.slow ? 4 : 2.5);
      const b = a.frame(s).ball;
      // broadcast: the main-stand camera follows the ball, a little ahead of it, and pushes in for the finish
      const want = new THREE.Vector3(X(Math.min(b[0] + 6, 96)), 0, Z(34 + (b[1] - 34) * 0.45));
      if (!follow.ok || t < 0.05) { follow.at.copy(want); follow.ok = true; }
      follow.at.lerp(want, 0.06);
      const slow = seg(s, a.goalS - GOAL.slow, a.goalS);
      const half = 30 - 10 * ease(slow);
      const box = new THREE.Box3(new THREE.Vector3(follow.at.x - half, 0, follow.at.z - half * 0.62), new THREE.Vector3(follow.at.x + half, 3, follow.at.z + half * 0.62));
      cam(opts.reduced ? overhead(boxOf(a.frame(a.goalS - 1).pos.slice(0, 22), 0, 2, 4, 4)) : fitShot(box, -0.18 - 0.22 * ease(slow), 0.38 - 0.08 * ease(slow)), t, 2.2);
      tags.push({ text: sur(a.scorer), at: headOf(a.scorer), tone: "plain" });
      if (slow > 0 && s < a.goalS + 0.5 && !opts.reduced) tags.push({ text: say("goal.slow"), at: () => new THREE.Vector3(X(b[0]), 0, Z(b[1]) + 6), tone: "dim", side: "below" });
    }

    if (st.beat === "mistake" && traced) {
      const L = lit[st.k], m = L.m, y = yOf(m.x.second);
      const lift = st.k === 0 ? (opts.reduced ? 1 : ease(seg(t, 0, 2.8))) : 1;
      const t0 = st.k === 0 ? 3 : 0; // the walk down starts once the stack has risen
      const flat = opts.reduced; // reduced motion: the layer is shown flat, as a 2D pitch
      stack.visible = true;
      stack.scale.y = flat ? 0.0001 : Math.max(0.0001, lift);
      // the real figures sink into the stack as it rises
      if (st.k === 0 && !flat) {
        pose(a.frame(a.goalS));
        look(1 - lift);
      } else look(0);
      const draw = flat ? 1 : st.k === 0 ? seg(t, 0.3, 3) : 1;
      ribbons.forEach((r) => drawn(r, draw));
      drawn(ballRibbon, draw);
      fixedRibbons.forEach((f) => (f.r.visible = f.b.visible = false));
      top.material.opacity = 0.5 * lift;
      // the scan sheet walks down from the layer above (the goal, or the last mistake)
      const startY = st.k === 0 ? yOf(s1) : yOf(lit[st.k - 1].m.x.second);
      const walk = flat ? 1 : ease(seg(t, t0, t0 + 2));
      scan.visible = !flat && walk < 1;
      scan.position.y = startY + (y - startY) * walk;
      const on = flat ? 1 : seg(t, t0 + 2, t0 + 2.7);
      const focus = flat ? 1 : ease(seg(t, t0 + 2, t0 + 4.4));
      layers.forEach((l) => (l.material.opacity = 0.16 * (1 - 0.75 * focus) * (flat ? 0 : 1)));
      ribbons.forEach((r, i) => (r.material.opacity = (i === m.x.player ? 0.95 : 0.7 * (1 - 0.7 * focus)) * (flat ? 0 : 1)));
      ribbons[m.x.player].material.color.copy(focus > 0.3 ? VAR : teamCol(m.x.player));
      ballRibbon.material.opacity = (0.95 - 0.6 * focus) * (flat ? 0 : 1);
      lit.forEach((o, k) => {
        const mine = k === st.k, was = k < st.k;
        o.g.visible = mine || (was && !flat);
        const v = mine ? on : was ? 0.35 : 0;
        o.plate.material.opacity = 0.1 * v;
        o.edge.material.opacity = 0.95 * v;
        o.line.material.opacity = 0.9 * (mine ? seg(t, t0 + 2.6, t0 + 3.4) : was ? 0.3 : 0);
        o.cells.material.opacity = 0.42 * (mine ? seg(t, t0 + 3.6, t0 + 4.6) : 0);
        (o.dots.material as THREE.MeshBasicMaterial).opacity = mine ? on : 0;
        (o.link.material as THREE.LineDashedMaterial).opacity = mine ? seg(t, t0 + 3, t0 + 3.6) : 0;
        const gk = mine ? seg(t, t0 + 3, t0 + 4) : 0;
        o.ghost.g.visible = gk > 0.01;
        o.ghost.body.material.opacity = o.ghost.head.material.opacity = 0.42 * gk;
        o.ghost.ring.material.opacity = 0.9 * gk;
        o.ghost.g.position.y = 0.6 * (1 - gk);
        o.real.g.visible = mine && on > 0.5;
        o.real.body.material.color.copy(VAR);
        o.real.body.material.emissive.copy(VAR).multiplyScalar(0.3);
        o.real.ring.material.opacity = 0;
        o.real.blob.visible = false;
        o.ghost.blob.visible = false;
      });
      // in a flat (reduced) view, the layer sits on the pitch
      L.g.position.y = flat ? 0.05 : y;
      if (on > 0.3) {
        const wy = flat ? 0 : y;
        const at = (p: Pt, lift2: number) => () => new THREE.Vector3(X(p[0]), wy * stack.scale.y + lift2, Z(p[1]));
        tags.push({ text: say("mistake.real", { name: sur(m.x.player), m: m.x.behind.toFixed(1) }), at: at(m.real, 0), tone: "bug", side: "below" });
        if (seg(t, t0 + 3.2, t0 + 4) > 0) tags.push({ text: say("mistake.ghost"), at: at(m.ghost, 3.4), tone: "bug" });
        if (m.cells.length && seg(t, t0 + 4.2, t0 + 5) > 0) {
          const c = m.cells.reduce((p, q) => [p[0] + q[0] / m.cells.length, p[1] + q[1] / m.cells.length], [0, 0]) as Pt;
          tags.push({ text: say("mistake.space"), at: at([c[0], c[1] + 4], 0), tone: "dim", side: "below" });
        }
      }
      // camera: the stack side-on and upright, then close in over the lit layer
      const side = fitShot(stackBox(), -0.08, 0.14);
      const near = boxOf([m.real, m.ghost, ...m.cells], (flat ? 0 : y) - 1, (flat ? 0 : y) + 2.5, 12, 10);
      const close = flat ? overhead(near) : fitShot(near, 0.3, 0.72);
      if (flat) cam(close, t);
      else if (t < t0 + 2) cam(side, t, st.k === 0 ? 2.8 : 1.6);
      else {
        // ease from wherever the side shot left the camera into the close-up
        if (!camera.userData.closeFrom || camera.userData.closeStep !== step) { camera.userData.closeFrom = camNow(); camera.userData.closeStep = step; }
        const u = ease(seg(t, t0 + 2, t0 + 4.4));
        const f0 = camera.userData.closeFrom as Shot;
        aim({ pos: f0.pos.clone().lerp(close.pos, u), at: f0.at.clone().lerp(close.at, u) });
      }
      focusOn(close.at, seg(t, t0 + 4.4, t0 + 5.2));
    }

    if (st.beat === "trial" && traced) {
      const flat = opts.reduced;
      stack.visible = true;
      stack.scale.y = flat ? 0.0001 : 1;
      look(0);
      top.material.opacity = flat ? 0 : 0.35;
      scan.visible = false;
      layers.forEach((l) => (l.material.opacity = flat ? 0 : 0.1));
      lit.forEach((o) => (o.g.visible = false));
      const sus = new Set(trialRows(traced).map((x) => x.player));
      ribbons.forEach((r, i) => {
        drawn(r, 1);
        r.material.opacity = sus.has(i) ? 0.9 : flat ? 0.15 : 0.12;
        r.material.color.copy(teamCol(i));
      });
      ballRibbon.material.opacity = 0.35;
      fixedRibbons.forEach((f, k) => {
        f.r.visible = f.b.visible = true;
        const u = flat ? 1 : seg(t, 1.2 + 2.4 * k, 3.4 + 2.4 * k);
        drawn(f.r, u);
        drawn(f.b, u);
        if (u > 0.95) {
          const end = traced.j.replay(f.x, Math.min(f.x.end, s1)).pos[f.x.player];
          tags.push({ text: say("trial.fixed", { name: sur(f.x.player) }), at: () => new THREE.Vector3(X(end[0]), yOf(Math.min(f.x.end, s1)) * stack.scale.y + 2, Z(end[1])), tone: k === 0 ? "bug" : "dim" });
        }
      });
      cam(flat ? overhead(pitchBox) : fitShot(stackBox(), -0.62, 0.3), t, 2.4);
    }

    if (st.beat === "verdict" && traced) {
      const x = culpritOf(), c = x.player;
      const collapse = opts.reduced ? 1 : ease(seg(t, 0, 2));
      const fixT = t - FIX_AT;
      const s = fixT > 0 && x.frames.length ? Math.min(x.end, x.start + (opts.reduced ? x.end - x.start : fixT * fixRate)) : x.second;
      stack.visible = collapse < 1;
      stack.scale.y = Math.max(0.0001, 1 - collapse);
      fixedRibbons.forEach((f) => (f.r.visible = f.b.visible = false));
      lit.forEach((o) => (o.g.visible = false));
      ribbons.forEach((r) => (r.material.opacity = 0.5 * (1 - collapse)));
      layers.forEach((l) => (l.material.opacity = 0.1 * (1 - collapse)));
      top.material.opacity = 0;
      scan.visible = false;
      const snap = fixT > 0 ? fixAt(s) : a.frame(x.second);
      pose(snap);
      const spotOn = fixT > 0 ? 1 - seg(fixT, 0, 0.8) : seg(t, 1.2, 2.6);
      look(collapse, new Set([c, a.scorer]), 0.3 + 0.7 * (1 - spotOn));
      glowFig(c, Math.max(spotOn, fixT > 0 ? 0.6 : 0));
      const cp = figs[c].g.position;
      cone.visible = spotOn > 0.01;
      cone.position.set(cp.x, 0, cp.z);
      (cone.material as THREE.ShaderMaterial).uniforms.o.value = spotOn;
      spot.position.set(cp.x, 60, cp.z);
      spot.target.position.copy(cp);
      spot.intensity = 5 * spotOn;
      key.intensity = 1.5 * (1 - 0.6 * spotOn);
      if (fixT > 0) {
        trail.visible = true;
        setTrail(fixAt, s, x.start, 2.5);
        // the real culprit stays on as a faint ghost, deep where he really was
        const r = a.frame(Math.min(s, a.goalS)).pos[c];
        asPlayed.g.visible = true;
        asPlayed.g.position.set(X(r[0]), 0, Z(r[1]));
        asPlayed.body.material.opacity = asPlayed.head.material.opacity = 0.3;
        asPlayed.blob.visible = false;
        if (x.note === "offside" && s >= x.end - 0.4) {
          const line = traced.j.offsideLine(snap);
          offLine.position.x = X(line);
          offLine.material.opacity = 0.95;
          if (x.offside) tags.push({ text: say("verdict.fix", { receiver: sur(x.offside.player), m: x.offside.by.toFixed(1) }), at: headOf(x.offside.player), tone: "bug" });
        }
      } else tags.push({ text: say("verdict.tag", { name: sur(c), p: Math.round(x.blame) }), at: headOf(c, 4), tone: "bug" });
      const ends = x.frames.length ? [fixAt(x.start).pos[c], fixAt(x.end).pos[c], fixAt(x.end).ball, ...(x.offside ? [fixAt(x.end).pos[x.offside.player]] : [])] : [];
      const close = boxOf([a.frame(x.second).pos[c]], 0, 3, 14, 11);
      const play = boxOf([a.frame(x.second).pos[c], ...ends], 0, 3, 8, 7);
      if (opts.reduced) cam(overhead(fixT > 0 ? play : close), t);
      else if (fixT <= 0) {
        cam(fitShot(close, -0.32, 0.5), t, 2.2);
        focusOn(cp, seg(t, 2.2, 3));
      } else {
        if (camera.userData.playStep !== step) { camera.userData.playFrom = camNow(); camera.userData.playStep = step; }
        const u = ease(seg(fixT, 0, 2.2)), f0 = camera.userData.playFrom as Shot, to = fitShot(play, -0.2, 0.62);
        aim({ pos: f0.pos.clone().lerp(to.pos, u), at: f0.at.clone().lerp(to.at, u) });
      }
    }

    if (st.beat === "verdict" && !traced) {
      // the finish, frozen a beat before it goes in: the scorer and the nearest defenders
      const s = a.goalS - 0.6;
      const f = a.frame(s);
      pose(f);
      trail.visible = true;
      setTrail(a.frame, s, a.moveFrom, 3);
      look(1);
      figs[a.scorer].ring.material.color.copy(CHALK);
      figs[a.scorer].ring.material.opacity = 0.9;
      const b = boxOf([f.ball, [105, 34], f.pos[a.scorer]], 0, 3, 9, 8);
      cam(opts.reduced ? overhead(b) : fitShot(b, -0.25, 0.45), t, 2.4);
      focusOn(figs[a.scorer].g.position, seg(t, 2.4, 3.2));
      if (a.chance) tags.push({ text: `${a.chance.xg.toFixed(2)} xG · ${a.chance.distance_m.toFixed(1)} m`, at: headOf(a.scorer), tone: "plain" });
    }
    setTags(tags);
  }

  // ---------- hover: who is this? ----------
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    let best = -1, bd = 26, bx = 0, by = 0;
    figs.forEach((f, i) => {
      if (!f.g.visible || f.body.material.opacity < 0.2) return;
      f.g.getWorldPosition(v3).setY(1.4 * FIG).project(camera);
      const x = (v3.x * 0.5 + 0.5) * r.width, y = (-v3.y * 0.5 + 0.5) * r.height;
      const d = Math.hypot(x - (e.clientX - r.left), y - (e.clientY - r.top));
      if (d < bd) { bd = d; best = i; bx = x; by = y; }
    });
    if (best < 0) return opts.onHover(null, 0, 0);
    opts.onHover(`${say("hover", { num: lab.numbers[best], name: lab.names[best] })}<small>${lab.clubs[best < 11 ? 0 : 1].name}</small>`, bx, by);
  };
  const onLeave = () => opts.onHover(null, 0, 0);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  let raf = 0, last = performance.now();
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (playing) t = Math.min(t + dt, steps[step].dur);
    frame();
    finish.uniforms.t.value = (now / 1000) % 10;
    composer.render();
    placeTags();
  };

  return {
    show(i, at = 0) {
      const n = Math.max(0, Math.min(steps.length - 1, i));
      from = camera.userData.at ? camNow() : null;
      fromAt = at;
      step = n;
      t = at;
      follow.ok = false;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    setPlaying(p) { playing = p; },
    time: () => t,
    resize(w, h, ins) {
      W = Math.max(w, 1);
      Hh = Math.max(h, 1);
      inset = ins;
      renderer.setSize(W, Hh, false);
      composer.setSize(W, Hh);
      bloom.resolution.set(W / (opts.phone ? 2 : 1), Hh / (opts.phone ? 2 : 1));
      camera.aspect = W / Hh;
      // keep the subject centred in the space the copy leaves free
      camera.setViewOffset(W, Hh, -ins.left / 2, (ins.bottom - ins.top) / 2, W, Hh);
      camera.updateProjectionMatrix();
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      for (const l of live) l.el.remove();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) { (mat as THREE.MeshBasicMaterial).map?.dispose(); mat.dispose(); }
      });
      (scene.background as THREE.Texture | null)?.dispose();
      composer.dispose();
      target.dispose();
      renderer.dispose();
    },
  };
}

export { clock };
