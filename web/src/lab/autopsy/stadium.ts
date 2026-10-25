import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { formationGroups, type Autopsy, type Pt, type Snap, type Suspect, type Traced } from "./model";
import { teamMotion } from "./motion";

/**
 * The Goal Autopsy's 3D stage: a floodlit night stadium where one goal is taken apart, the way
 * the old Tactics Lab did it. The goal, the two plans, the move against the yellow back line,
 * each mistake frozen with a ghost where he should have been and the space he left, the
 * suspects' recorded fixed runs side by side, 200 replays each falling into Goal and No goal,
 * the verdict pillars, the fix, and how the engine decides. A goal with no defender at fault
 * keeps the goal, the plans and the move, then an honest answer.
 *
 * The picture is a function of (step, t): React owns the words and the clock; this owns the
 * picture. The scoring side always attacks to the right (x = 105).
 */
export type Beat = "goal" | "plans" | "move" | "mistake" | "runs" | "trial" | "verdict" | "fix" | "engine" | "honest";
export type Step = { beat: Beat; k: number; dur: number };
export type Inset = { left: number; top: number; bottom: number };
export type StageOpts = {
  reduced: boolean;
  phone: boolean;
  dpr: number;
  say: (key: string, vars?: Record<string, string | number>) => string;
  onHover: (html: string | null, x: number, y: number) => void;
  /** screenshots: hold the picture at the given moment */
  still?: boolean;
};
export type AutopsyStage = {
  show(step: number, t?: number): void;
  setPlaying(p: boolean): void;
  time(): number;
  resize(w: number, h: number, inset: Inset): void;
  dispose(): void;
};

const GOLD = new THREE.Color("#e9c46a");
const BUG = new THREE.Color("#c6ff4d");
const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const clamp01 = (u: number) => Math.min(Math.max(u, 0), 1);
export const clock = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// ---------- the timeline ----------
const GOAL = { lead: 7, fast: 1.2, slow: 3, slowRate: 0.45, hold: 2 };
const goalStart = (a: Autopsy) => Math.max(a.moveFrom, a.goalS - GOAL.lead);
/** match second shown t seconds into the goal beat: brisk, then slow motion into the net */
export function goalClock(a: Autopsy, t: number) {
  const s0 = goalStart(a), sl = a.goalS - GOAL.slow, ta = (sl - s0) / GOAL.fast;
  if (t < ta) return s0 + t * GOAL.fast;
  return Math.min(a.goalS + 0.6, sl + (t - ta) * GOAL.slowRate);
}
/** seconds into the goal beat when slow motion starts */
export const slowAt = (a: Autopsy) => (a.goalS - GOAL.slow - goalStart(a)) / GOAL.fast;
const goalDur = (a: Autopsy) => slowAt(a) + (GOAL.slow + 0.6) / GOAL.slowRate + GOAL.hold;

/** the move: brisk build-up, slow motion through the mistakes, then real time to the goal */
function moveSpan(a: Autopsy) {
  const sec = a.kind === "traced" ? a.j.suspects.map((x) => x.second) : [a.goalS - 4];
  const slowFrom = Math.max(a.moveFrom, Math.min(...sec) - 5), slowTo = Math.min(a.goalS, Math.max(...sec) + 6);
  return { from: a.moveFrom, slowFrom, slowTo, fast: 1.6, slow: 0.5 };
}
export function moveClock(a: Autopsy, t: number) {
  const m = moveSpan(a), ta = (m.slowFrom - m.from) / m.fast;
  if (t < ta) return m.from + t * m.fast;
  const tb = ta + (m.slowTo - m.slowFrom) / m.slow;
  if (t < tb) return m.slowFrom + (t - ta) * m.slow;
  return Math.min(a.goalS + 1.5, m.slowTo + (t - tb));
}
const moveDur = (a: Autopsy) => {
  const m = moveSpan(a);
  return (m.slowFrom - m.from) / m.fast + (m.slowTo - m.slowFrom) / m.slow + (a.goalS + 1.5 - m.slowTo) + 1.5;
};
/** the suspects replayed side by side: the culprit first, then the next most to blame with a recorded run */
export const shownOf = (a: Traced) => [a.j.culprit, ...a.j.suspects.filter((x) => x !== a.j.culprit)].filter((x) => x.frames.length).slice(0, 2);
/** the suspects the trial counts: everyone with a recorded fixed run, culprit first */
export const trialRows = (a: Traced) => [a.j.culprit, ...a.j.suspects.filter((x) => x !== a.j.culprit)].filter((x) => x.frames.length);
const runsFrom = (a: Traced) => Math.min(...shownOf(a).map((x) => x.start)) - 4;
const runsDur = (a: Traced) => (a.goalS + 2 - runsFrom(a)) / 0.9 + 2.5;
const fixSpan = (x: Suspect) => ({ from: x.start - 3, to: x.end + 3 });
const fixDur = (x: Suspect) => { const f = fixSpan(x); return (f.to - f.from) / 0.8 + 1.5; };
export const MISTAKE = { lead: 2.5, dur: 9 };

export function stepsOf(a: Autopsy): Step[] {
  const s: Step[] = [
    { beat: "goal", k: 0, dur: goalDur(a) },
    { beat: "plans", k: 0, dur: 9 },
    { beat: "move", k: 0, dur: moveDur(a) },
  ];
  if (a.kind === "traced") {
    a.mistakes.forEach((_, k) => s.push({ beat: "mistake", k, dur: MISTAKE.dur }));
    if (shownOf(a).length) s.push({ beat: "runs", k: 0, dur: runsDur(a) });
    s.push({ beat: "trial", k: 0, dur: 7.5 });
    s.push({ beat: "verdict", k: 0, dur: 7 });
    if (a.j.culprit.frames.length) s.push({ beat: "fix", k: 0, dur: fixDur(a.j.culprit) });
    s.push({ beat: "engine", k: 0, dur: 8 });
  } else s.push({ beat: "honest", k: 0, dur: 8 });
  return s;
}

// ---------- textures and labels ----------
function texture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function pitchTexture() {
  const k = 16, pad = 6, c = document.createElement("canvas");
  c.width = (105 + 2 * pad) * k;
  c.height = (68 + 2 * pad) * k;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b2a1c";
  g.fillRect(0, 0, c.width, c.height);
  g.translate(pad * k, pad * k);
  g.scale(k, k);
  // mown stripes, then a fine grain so the grass never looks flat
  for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? "#14432c" : "#185034"; g.fillRect(i * 7.5, 0, 7.5, 68); }
  g.fillStyle = "#0f3624";
  g.fillRect(-pad, -pad, 105 + 2 * pad, pad); g.fillRect(-pad, 68, 105 + 2 * pad, pad);
  g.fillRect(-pad, 0, pad, 68); g.fillRect(105, 0, pad, 68);
  for (let n = 0; n < 26000; n++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.06)";
    g.fillRect(Math.random() * 117 - 6, Math.random() * 80 - 6, 0.12, 0.12);
  }
  g.strokeStyle = "rgba(244,247,255,.92)";
  g.lineWidth = 0.13;
  g.strokeRect(0, 0, 105, 68);
  g.beginPath(); g.moveTo(52.5, 0); g.lineTo(52.5, 68); g.stroke();
  g.beginPath(); g.arc(52.5, 34, 9.15, 0, 7); g.stroke();
  g.fillStyle = "rgba(244,247,255,.92)";
  g.beginPath(); g.arc(52.5, 34, 0.3, 0, 7); g.fill();
  for (const side of [0, 1]) {
    const X = (x: number) => (side ? 105 - x : x);
    g.strokeRect(Math.min(X(0), X(16.5)), 13.84, 16.5, 40.32);
    g.strokeRect(Math.min(X(0), X(5.5)), 24.84, 5.5, 18.32);
    const a = Math.acos(5.5 / 9.15);
    g.beginPath();
    if (side) g.arc(X(11), 34, 9.15, Math.PI - a, Math.PI + a); else g.arc(X(11), 34, 9.15, -a, a);
    g.stroke();
    g.beginPath(); g.arc(X(11), 34, 0.25, 0, 7); g.fill();
  }
  return texture(c);
}

type LabelOpts = { color?: string; bg?: string | null; size?: number; h?: number; weight?: number; font?: string };
function label(text: string, o: LabelOpts = {}) {
  const { color = "#f4f1e8", bg = "rgba(6,8,18,.86)", size = 40, h = 2.6, weight = 700, font = "Hanken Grotesk" } = o;
  const c = document.createElement("canvas"), g = c.getContext("2d")!;
  const f = `${weight} ${size}px "${font}", system-ui, sans-serif`;
  g.font = f;
  const w = Math.ceil(g.measureText(text).width) + size;
  c.width = w;
  c.height = Math.round(size * 1.6);
  g.font = f;
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, c.height, c.height / 2); g.fill(); }
  g.fillStyle = color;
  g.textBaseline = "middle";
  g.fillText(text, size / 2, c.height / 2 + 1);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(c), depthTest: false, transparent: true, toneMapped: false }));
  s.scale.set((h * w) / c.height, h, 1);
  s.renderOrder = 30;
  s.layers.set(1);
  s.userData.text = text;
  return s;
}
function relabel(s: THREE.Sprite, text: string, o: LabelOpts) {
  if (s.userData.text === text) return;
  const n = label(text, o);
  s.material.map?.dispose();
  s.material.map = n.material.map;
  n.material.dispose();
  s.scale.copy(n.scale);
  s.userData.text = text;
}
function title(text: string, sub: string, color = "#f4f1e8") {
  const c = document.createElement("canvas"), g = c.getContext("2d")!;
  c.width = 1600;
  c.height = 300;
  g.textAlign = "center";
  g.font = `900 112px "Anybody", "Arial Narrow", sans-serif`;
  g.fillStyle = color;
  g.fillText(text, 800, 132);
  g.font = `600 50px "Hanken Grotesk", system-ui, sans-serif`;
  g.fillStyle = "rgba(233,196,106,.9)";
  g.fillText(sub.toUpperCase(), 800, 232);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(c), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  s.scale.set(88, 16.5, 1);
  s.renderOrder = 25;
  s.layers.set(1);
  return s;
}
function fat(width: number, o: { dashed?: boolean; order?: number } = {}) {
  const m = new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, dashed: !!o.dashed, dashSize: 1.4, gapSize: 1 });
  const l = new Line2(new LineGeometry(), m);
  l.frustumCulled = false;
  l.renderOrder = o.order ?? 3;
  return l;
}
function setLine(l: Line2, pts: number[], cols: number[]) {
  const g = new LineGeometry();
  g.setPositions(pts);
  g.setColors(cols);
  l.geometry.dispose();
  l.geometry = g;
  if (l.material.dashed) l.computeLineDistances();
}
const yellowLine = (x: number, h = 0.3) => [[x, h, -34, x, h, 34], [0.776, 1, 0.302, 0.776, 1, 0.302]] as const;


// ---------- the stage ----------
export function createStage(canvas: HTMLCanvasElement, a: Autopsy, opts: StageOpts): AutopsyStage {
  const { lab } = a;
  const tr = a.kind === "traced" ? a : null;
  const say = (k: string, v?: Record<string, string | number>) => opts.say(`s.${k}`, v);
  const sur = (i: number) => lab.names[i].split(" ").slice(-1)[0];
  const backFour = [1, 2, 3, 4].map((k) => a.def * 11 + k);
  /** the defending back line: median depth of the back four, leaving one player out */
  const lineOf = (p: Snap, without = tr ? tr.j.culprit.player : -1) => median(backFour.filter((i) => i !== without).map((i) => p.pos[i][0]));
  const kit = (team: number) => new THREE.Color(lab.clubs[team].kit_primary);
  const trim = (team: number) => new THREE.Color(lab.clubs[team].kit_secondary);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(opts.dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const sky = document.createElement("canvas");
  sky.width = 4;
  sky.height = 256;
  {
    const g = sky.getContext("2d")!, grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, "#020309"); grd.addColorStop(0.55, "#070a1d"); grd.addColorStop(1, "#0f1430");
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 256);
  }
  scene.background = texture(sky);
  scene.fog = new THREE.FogExp2(0x070a1d, 0.0021);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2400);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotateSpeed = 0.5;
  controls.maxDistance = 650;
  controls.minDistance = 18;
  controls.maxPolarAngle = Math.PI * 0.48;

  // ---------- light: a warm key from the main stand, cool sky fill, four floodlights ----------
  scene.add(new THREE.HemisphereLight(0x9fb2ff, 0x0a0f1e, 0.5));
  const key = new THREE.DirectionalLight(0xfff1d6, 2.1);
  key.position.set(-30, 90, 55);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(opts.phone ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -70, right: 70, top: 50, bottom: -50, near: 10, far: 240 });
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x03050c, roughness: 1 }));
  ground.position.y = -0.4;
  ground.receiveShadow = true;
  scene.add(ground);

  // the bowl: a dark stepped stand with a crowd of tiny lights in it
  const bowl = new THREE.Group();
  scene.add(bowl);
  {
    const prof: THREE.Vector2[] = [];
    for (let k = 0; k <= 12; k++) { const r = 1 + k * 0.035, y = k * 2.6; prof.push(new THREE.Vector2(r, y), new THREE.Vector2(r + 0.035, y)); }
    const shell = new THREE.Mesh(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x * 92, p.y)), 96), new THREE.MeshStandardMaterial({ color: 0x080b18, roughness: 0.9, side: THREE.DoubleSide, transparent: true }));
    shell.scale.set(1.12, 1, 0.78);
    bowl.add(shell);
    const n = opts.phone ? 4000 : 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const tones = [new THREE.Color("#fff3d8"), new THREE.Color("#c9d4ff"), kit(0).lerp(new THREE.Color("#ffffff"), 0.4), kit(1).lerp(new THREE.Color("#ffffff"), 0.35)];
    for (let i = 0; i < n; i++) {
      const k = Math.floor(Math.random() * 12), a = Math.random() * Math.PI * 2, r = 92 * (1 + k * 0.035 + 0.02);
      pos.set([Math.cos(a) * r * 1.12, k * 2.6 + 1.1, Math.sin(a) * r * 0.78], i * 3);
      const tone = tones[Math.random() < 0.6 ? (Math.cos(a) < 0 ? 2 : 3) : Math.random() < 0.5 ? 0 : 1];
      const b = 0.25 + Math.random() * 0.55;
      col.set([tone.r * b, tone.g * b, tone.b * b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    bowl.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  }
  const towers = [[-98, -66], [98, -66], [-98, 66], [98, 66]].map(([x, z]) => {
    const head = new THREE.Mesh(new THREE.BoxGeometry(11, 4.5, 1.2), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }));
    head.position.set(x, 52, z);
    head.lookAt(0, 0, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 52, 8), new THREE.MeshStandardMaterial({ color: 0x0c1124, roughness: 0.6, metalness: 0.4 }));
    pole.position.set(x, 26, z);
    const beamGeo = new THREE.ConeGeometry(30, 92, 40, 1, true);
    beamGeo.translate(0, -46, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { o: { value: 0 } },
      vertexShader: "varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: "uniform float o; varying float vY; void main(){ float a = smoothstep(-92., 0., vY); gl_FragColor = vec4(vec3(1., .95, .84) * a * a * .05 * o, 1.); }",
    }));
    beam.position.set(x, 52, z);
    beam.lookAt(0, 0, 0);
    beam.rotateX(Math.PI / 2);
    const spot = new THREE.SpotLight(0xfff0d4, 0, 0, 0.42, 0.85, 0);
    spot.position.set(x, 52, z);
    scene.add(head, pole, beam, spot, spot.target);
    return { head, pole, beam, spot };
  });
  // verdict light: a real spotlight that finds the culprit
  const verdictLight = new THREE.SpotLight(0xfff0c0, 0, 0, 0.09, 0.6, 0);
  verdictLight.position.set(0, 80, 0);
  verdictLight.castShadow = true;
  verdictLight.shadow.mapSize.set(1024, 1024);
  scene.add(verdictLight, verdictLight.target);

  // ---------- a universe: one pitch, 22 pieces, a ball ----------
  const pitchTex = pitchTexture();
  const disc = new THREE.LatheGeometry([[0, 0], [0.95, 0], [1.05, 0.08], [1.05, 0.34], [0.92, 0.46], [0, 0.48]].map(([x, y]) => new THREE.Vector2(x, y)), 40);
  const band = new THREE.TorusGeometry(1.02, 0.07, 10, 48).rotateX(Math.PI / 2).translate(0, 0.36, 0);
  const halo = new THREE.RingGeometry(1.25, 1.7, 48).rotateX(-Math.PI / 2);
  const ballGeo = new THREE.SphereGeometry(0.62, 24, 16);
  type Piece = { t: THREE.Group; body: THREE.Mesh<THREE.LatheGeometry, THREE.MeshPhysicalMaterial>; ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>; halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; num: THREE.Sprite; col: THREE.Color };
  type Universe = { g: THREE.Group; pieces: Piece[]; ball: THREE.Mesh; trail: Line2; head: THREE.Sprite; line: Line2; pitch: THREE.Mesh; rim: THREE.LineLoop; verdict: THREE.Sprite };

  function universe(head: string, sub: string, tint: THREE.ColorRepresentation): Universe {
    const g = new THREE.Group();
    scene.add(g);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(117, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.82, metalness: 0, transparent: true }));
    pitch.receiveShadow = true;
    const rim = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([[-58.5, -40], [58.5, -40], [58.5, 40], [-58.5, 40]].map(([x, z]) => new THREE.Vector3(x, 0.05, z))),
      new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.9 }),
    );
    g.add(pitch, rim);
    const pieces = Array.from({ length: 22 }, (_, i) => {
      const team = i < 11 ? 0 : 1, col = kit(team);
      const t = new THREE.Group();
      const body = new THREE.Mesh(disc, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, emissive: col, emissiveIntensity: 0.18, transparent: true }));
      body.castShadow = true;
      const ring = new THREE.Mesh(band, new THREE.MeshStandardMaterial({ color: trim(team), metalness: 0.85, roughness: 0.25, transparent: true }));
      const h = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color("#ffffff"), 0.35), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
      h.position.y = 0.04;
      const num = label(String(lab.numbers[i]), { color: team ? "#2a0707" : "#06122a", bg: team ? "#f2b8b0" : "#cfe0ff", size: 30, h: 1.7 });
      num.position.y = 2.2;
      t.add(body, ring, h, num);
      g.add(t);
      return { t, body, ring, halo: h, num, col };
    });
    const ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0.35, transparent: true }));
    ball.castShadow = true;
    g.add(ball);
    const trail = fat(4, { order: 4 });
    const line = fat(3.2, { order: 5 });
    const hd = title(head, sub);
    hd.position.set(0, 3, 52);
    const verdict = label(" ", { size: 44, h: 6 });
    verdict.position.set(0, 13, 0);
    verdict.visible = false;
    g.add(trail, line, hd, verdict);
    return { g, pieces, ball, trail, head: hd, line, pitch, rim, verdict };
  }

  function pose(u: Universe, at: (s: number) => Snap, s: number, line = true) {
    const f = at(s);
    f.pos.forEach(([x, y], i) => u.pieces[i].t.position.set(x - 52.5, 0, y - 34));
    u.ball.position.set(f.ball[0] - 52.5, f.ballHeight ?? 0.75, f.ball[1] - 34);
    // the ball's last three seconds as a fading streak
    const pts: number[] = [], cols: number[] = [];
    for (let k = 30; k >= 0; k--) {
      const sample = at(Math.max(s - k * 0.1, a.moveFrom - 30));
      const b = sample.ball;
      pts.push(b[0] - 52.5, sample.ballHeight ?? 0.75, b[1] - 34);
      const o = 1 - k / 30;
      cols.push(o, o * 0.93, o * 0.8);
    }
    setLine(u.trail, pts, cols);
    u.line.visible = line;
    if (line) {
      const [p, cl] = yellowLine(lineOf(f) - 52.5);
      setLine(u.line, [...p], [...cl]);
    }
    return f;
  }
  function fade(u: Universe, o: number) {
    u.g.visible = o > 0.01;
    (u.pitch.material as THREE.MeshStandardMaterial).opacity = o;
    (u.rim.material as THREE.LineBasicMaterial).opacity = 0.9 * o;
    u.head.material.opacity = o;
    for (const p of u.pieces) { p.body.material.opacity = o; p.ring.material.opacity = o; p.num.material.opacity = o; p.halo.material.opacity = 0.32 * o; }
    (u.ball.material as THREE.MeshStandardMaterial).opacity = o;
    u.trail.material.opacity = o;
    u.line.material.opacity = o;
  }

  const shown = tr ? shownOf(tr) : [];
  const [S1, S2] = shown as (Suspect | undefined)[];
  const real = universe(say("real"), say("realSub"), 0x8ea2ff);
  const uA = S1 ? universe(say("ifHeld", { name: sur(S1.player) }), say("replaySub"), GOLD) : null;
  const uB = S2 ? universe(say("ifHeld", { name: sur(S2.player) }), say("replaySub"), 0xf2a093) : null;
  real.head.visible = false;
  const realAt = (s: number) => a.frame(s);
  const liveAt = teamMotion(a);
  const at1 = (s: number) => tr!.j.replay(S1!, s), at2 = (s: number) => tr!.j.replay(S2!, s);
  const suspects = tr ? tr.j.suspects : [];
  const culprit = tr ? tr.j.culprit : null;

  // ---------- props ----------
  const ring = (col: THREE.Color) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(2, 2.5, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.y = 0.06;
    return m;
  };
  const marks = suspects.map((x) => {
    const r = ring(BUG);
    real.pieces[x.player].t.add(r);
    const tag = label(say("behind", { num: lab.numbers[x.player], name: sur(x.player), m: x.behind.toFixed(1) }), { color: "#0b1028", bg: "#c6ff4d", size: 32, h: 2.4 });
    tag.position.y = 5;
    real.pieces[x.player].t.add(tag);
    return { x, r, tag };
  });
  const scorerRing = ring(new THREE.Color("#ffffff"));
  real.pieces[a.scorer].t.add(scorerRing);
  const pillars = suspects.map((x) => {
    const h = Math.max(0.5, (x.blame / 100) * 30), top = x === culprit;
    const geo = new THREE.CylinderGeometry(1.25, 1.25, h, 32, 1, true);
    geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { o: { value: 0 }, c: { value: top ? BUG : new THREE.Color("#f2a093") }, h: { value: h } },
      vertexShader: "uniform float o; uniform float h; varying float vY; void main(){ vY = position.y / h; vec3 p = position; p.y *= o; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }",
      fragmentShader: "uniform vec3 c; uniform float o; varying float vY; void main(){ gl_FragColor = vec4(c * (0.2 + 0.8 * vY) * o, 1.); }",
    }));
    const tag = label(say("blame", { p: Math.round(x.blame), name: sur(x.player) }), { color: "#0b1028", bg: top ? "#c6ff4d" : "#f2a093", size: 34, h: 2.8 });
    const g = new THREE.Group();
    g.add(m, tag);
    real.g.add(g);
    return { x, g, m, tag, h };
  });
  const cone = (() => {
    const geo = new THREE.CylinderGeometry(0.6, 5.5, 64, 48, 1, true);
    geo.translate(0, 32, 0);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { o: { value: 0 } },
      vertexShader: "varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      fragmentShader: "uniform float o; varying float vY; void main(){ float a = 1. - smoothstep(0., 64., vY); gl_FragColor = vec4(vec3(1., .92, .62) * a * .26 * o, 1.); }",
    }));
    real.g.add(m);
    return m;
  })();
  const burst = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.15, 64).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  burst.position.set(52.6, 1.2, 0);
  real.g.add(burst);
  const goalTitle = title(`${say("goalWord")}  ${a.score.join("–")}`, `${clock(a.goalS)} · ${lab.names[a.scorer]}`, "#ffffff");
  goalTitle.position.set(30, 17, 0);
  real.g.add(goalTitle);

  // the plans, as constellations
  const shapeLines = Array.from({ length: 6 }, () => fat(2.2, { order: 4 }));
  real.g.add(...shapeLines);
  const blocks = [0, 1].map((k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: kit(k), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.y = 0.04;
    real.g.add(m);
    return m;
  });
  const planTag = label(say("planLine", { team: lab.clubs[a.def].name }), { color: "#0b1028", bg: "#c6ff4d", size: 32, h: 2.4 });
  real.g.add(planTag);

  // each mistake: a ghost where he should have been, an arrow to it, and the grass he left to an attacker
  const mGhost = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: BUG, transparent: true, opacity: 0, depthWrite: false }));
  const mGhostTag = label(" ", { color: "#0b1028", bg: "#c6ff4d", size: 30, h: 2.2 });
  const mArrow = fat(3, { dashed: true, order: 6 });
  const maxCells = Math.max(1, ...(tr ? tr.mistakes.map((m) => m.cells.length) : [1]));
  const cells = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.36, 1.36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: BUG, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), maxCells);
  cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cells.count = 0;
  cells.frustumCulled = false;
  cells.renderOrder = 5;
  mGhostTag.center.set(1.08, 0.5);
  mGhostTag.renderOrder = 40;
  const spaceTag = label(say("space"), { color: "#c6ff4d", bg: "rgba(6,8,18,.82)", size: 28, h: 2 });
  real.g.add(mGhost, mGhostTag, mArrow, cells, spaceTag);

  // 200 replays each, falling into Goal and No goal
  const binsFor = (u: Universe, goals: number, trials: number) => {
    const g = new THREE.Group();
    g.position.set(0, 26, 0);
    u.g.add(g);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xd8e0ff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(20, 22, 8), glass);
      box.position.set(side * 12, 11, 0);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: side < 0 ? GOLD : 0x6b75a8, transparent: true, opacity: 0.8 }));
      e.position.copy(box.position);
      g.add(box, e);
    }
    const cap = [label(say("binGoal"), { color: "#1b1600", bg: "#e9c46a", size: 34, h: 2.6 }), label(say("binNo"), { color: "#eef1ff", bg: "rgba(60,70,120,.95)", size: 34, h: 2.6 })];
    cap[0].position.set(-12, -2.6, 4.5);
    cap[1].position.set(12, -2.6, 4.5);
    const count = label(" ", { size: 56, h: 5.4, weight: 800 });
    count.position.set(0, 27.5, 0);
    g.add(...cap, count);
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.62, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.25 }), trials);
    balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.add(balls);
    // goals stack left, misses right, 8 wide by 3 deep a layer, in a fixed shuffled order
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const order = Array.from({ length: trials }, (_, k) => k).sort(() => rnd() - 0.5);
    let gi = 0, mi = 0;
    const slots = order.map((k) => {
      const goal = k < goals, n = goal ? gi++ : mi++;
      return { goal, x: (goal ? -12 : 12) + ((n % 8) - 3.5) * 2.2, z: ((Math.floor(n / 8) % 3) - 1) * 2.2, y: 0.7 + Math.floor(n / 24) * 1.5, delay: rnd() * 2.6 };
    });
    return { g, balls, slots, count, trials };
  };
  const bins = culprit && uA ? [binsFor(real, culprit.base, culprit.trials), binsFor(uA, S1!.fixed, S1!.trials), ...(uB ? [binsFor(uB, S2!.fixed, S2!.trials)] : [])] : [];
  const m4 = new THREE.Matrix4();
  function rain(b: (typeof bins)[number], t: number) {
    let landed = 0, goals = 0;
    b.slots.forEach((s, k) => {
      const u = t - s.delay;
      if (u <= 0) { m4.makeScale(0, 0, 0); b.balls.setMatrixAt(k, m4); return; }
      let y = 34 - 30 * u * u;
      if (y <= s.y) { y = s.y; landed++; if (s.goal) goals++; }
      m4.makeTranslation(s.x, y, s.z);
      b.balls.setMatrixAt(k, m4);
    });
    b.balls.instanceMatrix.needsUpdate = true;
    return { landed, goals };
  }

  // the fix: the culprit's universe, with a ghost where he really was and the offside line
  const offFlag = label(" ", { color: "#0b1028", bg: "#c6ff4d", size: 36, h: 3 });
  const offLine = fat(3, { dashed: true, order: 6 });
  const ghost = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: kit(a.def), transparent: true, opacity: 0.3, depthWrite: false }));
  const ghostTag = label(S1 ? say("ghost", { name: sur(S1.player) }) : " ", { color: "#f4f1e8", bg: "rgba(150,40,40,.92)", size: 30, h: 2.2 });
  ghostTag.center.set(-0.08, 0.5);
  ghostTag.renderOrder = 40;
  const fixTag = label(S1 ? say("onLine", { name: sur(S1.player) }) : " ", { color: "#0b1028", bg: "#c6ff4d", size: 30, h: 2.2 });
  fixTag.center.set(1.08, 0.5);
  fixTag.renderOrder = 40;
  uA?.g.add(offFlag, offLine, ghost, ghostTag, fixTag);

  // ---------- steps: camera shots and where the universes stand ----------
  const steps = stepsOf(a);
  type Lay = [number, number, number, number, number];
  type Layout = { real: Lay; a: Lay; b: Lay };
  const SOLO: Layout = { real: [0, 0, 0, 0, 1], a: [-140, 0, -30, 0.32, 0], b: [140, 0, -30, -0.32, 0] };
  const MULTI: Layout = { real: [0, 0, 0, 0, 1], a: [-122, 0, -30, 0.34, 1], b: [122, 0, -30, -0.34, uB ? 1 : 0] };
  const COLUMN: Layout = { real: [0, 0, 0, 0, 1], a: [0, 0, -96, 0, 1], b: [0, 0, 96, 0, uB ? 1 : 0] };
  const FIX: Layout = { real: [140, 0, -30, -0.32, 0], a: [0, 0, 0, 0, 1], b: [260, 0, -40, -0.4, 0] };
  let w = 1, h = 1, inset = { left: 0, top: 0, bottom: 0 };
  const phone = () => w < 720;
  const beatOf = (i: number) => steps[i].beat;
  const multi = (b: Beat) => b === "runs" || b === "trial";
  const layoutOf = (b: Beat) => (multi(b) ? (phone() ? COLUMN : MULTI) : b === "fix" ? FIX : SOLO);
  const SHOTS: Partial<Record<Beat, { pos: number[]; at: number[] }>> = {
    goal: { pos: [-4, 46, 68], at: [34, 0, 0] },
    plans: { pos: [0, 118, 60], at: [0, 0, 4] },
    move: { pos: [-46, 50, 82], at: [22, 0, 2] },
    runs: { pos: [0, 285, 290], at: [0, 0, -6] },
    trial: { pos: [0, 225, 335], at: [0, 16, -10] },
    verdict: { pos: [-8, 40, 70], at: [34, 6, 2] },
    fix: { pos: [-12, 34, 58], at: [30, 0, 2] },
    engine: { pos: [-70, 120, 150], at: [10, 0, 0] },
    honest: { pos: [-14, 30, 46], at: [36, 0, 0] },
  };
  const shotOf = (i: number) => {
    const b = beatOf(i);
    if (phone() && multi(b)) return { pos: [0, 330, 150], at: [0, 0, 14] };
    if (b === "mistake" && tr) {
      // close on the defender, from behind the attack, high enough to see the line he broke
      const m = tr.mistakes[steps[i].k], px = (m.real[0] + m.ghost[0]) / 2 - 52.5, pz = m.real[1] - 34;
      const z = phone() ? 1.7 : 1;
      return { pos: [px - 34 * z, 44 * z, pz + 44 * z], at: [px + 4, 0, pz] };
    }
    return SHOTS[b]!;
  };

  let step = 0, since = 0, trans = 1, playing = false, shift = 1;
  let from: { cam: THREE.Vector3; at: THREE.Vector3; lay: Layout } | null = null;
  let lay: Layout = JSON.parse(JSON.stringify(SOLO));
  camera.position.set(-10, 170, 170);
  const place = (u: Universe, l: Lay) => { u.g.position.set(l[0], l[1], l[2]); u.g.rotation.y = l[3]; fade(u, l[4]); };

  const verdictAt = culprit ? Math.min(culprit.second + 2, a.goalS - 1) : a.goalS - 1;
  // with reduced motion each step holds on its telling moment
  const keyTime = (b: Beat) => {
    if (b === "goal") return goalDur(a);
    if (b === "plans") return 4;
    if (b === "move") {
      const target = culprit ? culprit.second : a.goalS;
      for (let t = 0; t < 60; t += 0.1) if (moveClock(a, t) >= target) return t;
      return 99;
    }
    if (b === "mistake") return 6;
    if (b === "fix" && S1) return (S1.end - fixSpan(S1).from) / 0.8;
    return 99;
  };

  function draw(dt: number) {
    if (playing && !opts.still) since += dt;
    trans += dt;
    const b = beatOf(step), k = steps[step].k;
    const sx = opts.reduced ? keyTime(b) : since;
    const T = opts.reduced || opts.still ? 1 : clamp01(trans / 2.4), e = ease(T);
    const shot = shotOf(step), to = layoutOf(b);
    if (from) {
      camera.position.lerpVectors(from.cam, new THREE.Vector3(...shot.pos), e);
      controls.target.lerpVectors(from.at, new THREE.Vector3(...shot.at), e);
      for (const key of ["real", "a", "b"] as const) lay[key] = from.lay[key].map((v, n) => v + (to[key][n] - v) * e) as Lay;
      if (T >= 1) from = null;
    }
    // keep the picture clear of the card: right on wide screens, up on phones
    shift += ((multi(b) && !phone() ? 0 : 1) - shift) * (opts.reduced ? 1 : Math.min(1, dt * 3));
    if (w >= 900) camera.setViewOffset(w, h, (-inset.left / 2) * shift, ((inset.bottom - inset.top) / 2) * 0.4 * shift, w, h);
    else camera.setViewOffset(w, h, 0, ((inset.bottom - inset.top) / 2) * shift, w, h);
    place(real, lay.real);
    if (uA) place(uA, lay.a);
    if (uB) place(uB, lay.b);

    // defaults; each beat turns on what it needs
    for (const m of marks) { m.r.visible = false; m.tag.visible = false; }
    for (const p of pillars) p.g.visible = false;
    scorerRing.visible = false;
    cone.visible = false;
    verdictLight.intensity = 0;
    offFlag.visible = offLine.visible = ghost.visible = ghostTag.visible = fixTag.visible = false;
    mGhost.visible = mGhostTag.visible = mArrow.visible = spaceTag.visible = false;
    cells.count = 0;
    shapeLines.forEach((l) => (l.visible = false));
    blocks.forEach((m) => (m.material.opacity = 0));
    planTag.visible = false;
    bins.forEach((x) => (x.g.visible = false));
    goalTitle.visible = false;
    burst.material.opacity = 0;
    if (uA) uA.head.visible = true;
    for (const u of [real, uA, uB]) {
      if (!u) continue;
      u.verdict.visible = false;
      for (const p of u.pieces) { p.body.material.color.copy(p.col); p.body.material.emissive.copy(p.col); p.body.material.emissiveIntensity = 0.18; p.t.scale.setScalar(1); }
    }
    const floods = step === 0 ? (n: number) => clamp01((sx - 0.3 - n * 0.35) * 3) : () => 1;
    towers.forEach((tw, n) => {
      const on = floods(n);
      tw.beam.material.uniforms.o.value = on * (multi(b) || b === "fix" ? 0 : 1);
      tw.head.material.color.setScalar(0.12 + 0.88 * on);
      tw.head.visible = tw.pole.visible = !multi(b);
      tw.spot.intensity = on * (multi(b) ? 0 : 0.9);
    });
    (bowl.children[0] as THREE.Mesh<THREE.LatheGeometry, THREE.MeshStandardMaterial>).material.opacity = multi(b) ? 0.15 : 1;
    bowl.visible = !(multi(b) && !from);
    key.intensity = 2.1;

    const glow = (u: Universe, i: number, col: THREE.Color, s = 0.8) => { const m = u.pieces[i].body.material; m.color.copy(col); m.emissive.copy(col); m.emissiveIntensity = s; };
    const goalFlash = (s: number) => {
      const g = s - a.goalS;
      if (g <= 0) return;
      burst.material.opacity = Math.max(0, 1 - g / 1.5);
      burst.scale.setScalar(1 + g * 14);
      goalTitle.visible = true;
      goalTitle.material.opacity = clamp01(g * 2);
    };
    const verdictScene = (t: number) => {
      // the pitch dims, one pillar per suspect rises, a spotlight finds the culprit
      const f = pose(real, realAt, verdictAt);
      for (const p of real.pieces) { p.body.material.color.copy(p.col).multiplyScalar(0.3); p.body.material.emissiveIntensity = 0.04; }
      for (const x of suspects) glow(real, x.player, x === culprit ? BUG : new THREE.Color("#f2a093"), 0.6);
      if (!culprit) return;
      real.pieces[culprit.player].t.scale.setScalar(1.25);
      pillars.forEach((p, n) => {
        const [x, y] = f.pos[p.x.player];
        p.g.visible = true;
        p.g.position.set(x - 52.5, 0, y - 34);
        const o = ease(clamp01((t - 0.6 - n * 0.45) / 1.6));
        (p.m.material as THREE.ShaderMaterial).uniforms.o.value = o;
        p.tag.position.set(0, p.h * o + 2.6, 0);
        p.tag.material.opacity = o;
      });
      const [cx, cy] = f.pos[culprit.player];
      const so = ease(clamp01((t - 2) / 1.2));
      cone.visible = true;
      cone.position.set(cx - 52.5, 0, cy - 34);
      (cone.material as THREE.ShaderMaterial).uniforms.o.value = so;
      verdictLight.position.set(cx - 52.5, 80, cy - 34);
      verdictLight.target.position.set(cx - 52.5, 0, cy - 34);
      verdictLight.intensity = 5 * so;
      towers.forEach((tw) => (tw.spot.intensity *= 1 - 0.75 * so));
      key.intensity = 2.1 * (1 - 0.65 * so);
    };

    if (b === "goal") {
      const s = goalClock(a, sx);
      pose(real, liveAt, s, false);
      goalFlash(s);
    } else if (b === "plans") {
      // Show the team shapes in motion during the build-up, rather than parking every
      // player on a static formation after the first two seconds.
      const s = Math.min(a.moveFrom + sx * 0.65, a.goalS - 1);
      const f = pose(real, liveAt, s, false), u = ease(clamp01(sx / 1.8));
      for (const team of [0, 1] as const) {
        const col = kit(team).lerp(new THREE.Color("#ffffff"), 0.45);
        formationGroups(a.plan, team).forEach((ps, unit) => {
          const pts: number[] = [], cols: number[] = [];
          ps.forEach((i) => {
            const p = real.pieces[i].t.position;
            pts.push(p.x, 0.4, p.z);
            cols.push(col.r * u, col.g * u, col.b * u);
          });
          const line = shapeLines[team * 3 + unit];
          if (ps.length > 1) setLine(line, pts, cols);
          line.visible = ps.length > 1;
        });
      }
      blocks.forEach((m, team) => {
        const xs = Array.from({ length: 11 }, (_, n) => team * 11 + n).filter((i) => a.plan.unit[i] !== "gk").map((i) => f.pos[i]);
        if (!xs.length) return;
        const x0 = Math.min(...xs.map((p) => p[0])), x1 = Math.max(...xs.map((p) => p[0]));
        const y0 = Math.min(...xs.map((p) => p[1])), y1 = Math.max(...xs.map((p) => p[1]));
        m.scale.set(x1 - x0, 1, y1 - y0);
        m.position.set((x0 + x1) / 2 - 52.5, 0.04, (y0 + y1) / 2 - 34);
        m.material.opacity = 0.07 * u;
      });
      const depth = lineOf(f);
      const [p, cl] = yellowLine(depth - 52.5);
      setLine(real.line, [...p], cl.map((v) => v * u));
      real.line.visible = true;
      planTag.visible = u > 0.6;
      planTag.position.set(depth - 52.5, 4, -30);
    } else if (b === "move") {
      const s = moveClock(a, sx);
      const f = pose(real, liveAt, s);
      for (const m of marks) {
        const behind = f.pos[m.x.player][0] - lineOf(f, m.x.player);
        const on = behind > 2.5;
        m.r.visible = on;
        m.r.material.opacity = 0.6 + 0.4 * Math.sin(performance.now() / 160);
        m.tag.visible = on && Math.abs(s - m.x.second) < 4;
        if (on) glow(real, m.x.player, BUG);
      }
      goalFlash(s);
    } else if (b === "mistake" && tr) {
      const m = tr.mistakes[k], who = m.x.player;
      const s = m.x.second - MISTAKE.lead + Math.min(sx, MISTAKE.lead);
      const f = pose(real, realAt, s, false);
      const line = lineOf(f, who);
      const [p, cl] = yellowLine(line - 52.5);
      setLine(real.line, [...p], [...cl]);
      real.line.visible = true;
      const u = ease(clamp01((sx - MISTAKE.lead) / 1.4));
      const mk = marks.find((q) => q.x === m.x);
      if (mk) { mk.r.visible = true; mk.tag.visible = sx > MISTAKE.lead * 0.6; mk.r.material.opacity = 0.7 + 0.3 * Math.sin(performance.now() / 160); }
      glow(real, who, BUG);
      // everyone else steps back so the one mistake reads
      real.pieces.forEach((q, i) => { if (i !== who && i !== a.scorer) { q.body.material.color.copy(q.col).multiplyScalar(1 - 0.45 * u); q.body.material.emissiveIntensity = 0.18 * (1 - u); } });
      const [rx, ry] = f.pos[who], [gx, gy] = [m.ghost[0], ry];
      mGhost.visible = mGhostTag.visible = mArrow.visible = u > 0.01;
      (mGhost.material as THREE.MeshBasicMaterial).opacity = 0.5 * u;
      mGhost.position.set(gx - 52.5, 0, gy - 34);
      relabel(mGhostTag, say("onLine", { name: sur(who) }), { color: "#0b1028", bg: "#c6ff4d", size: 30, h: 2.2 });
      mGhostTag.position.set(gx - 53.5, 1.6, gy - 34);
      mGhostTag.material.opacity = u;
      const yy = 0.5;
      setLine(mArrow, [rx - 52.5, yy, ry - 34, rx + (gx - rx) * u - 52.5, yy, ry - 34], [0.776, 1, 0.302, 0.776, 1, 0.302]);
      // the space he left: cells an attacker reaches first as played, that he would reach first if fixed
      const cu = clamp01((sx - MISTAKE.lead - 1.2) / 1.6);
      if (cu > 0 && m.cells.length) {
        cells.count = m.cells.length;
        m.cells.forEach(([x, y], n) => {
          const sc = clamp01(cu * 1.6 - (n / m.cells.length) * 0.6);
          m4.makeScale(sc, 1, sc).setPosition(x - 52.5, 0.08, y - 34);
          cells.setMatrixAt(n, m4);
        });
        cells.instanceMatrix.needsUpdate = true;
        const cx = m.cells.reduce((q, c) => q + c[0], 0) / m.cells.length, cy = m.cells.reduce((q, c) => q + c[1], 0) / m.cells.length;
        spaceTag.visible = cu > 0.5;
        spaceTag.position.set(cx - 52.5, 2.2, cy - 34);
      }
    } else if ((b === "runs" || b === "trial") && uA && S1) {
      const s = b === "runs" ? (opts.reduced ? a.goalS + 2 : Math.min(runsFrom(tr!) + sx * 0.9, a.goalS + 2)) : a.goalS + 2;
      pose(real, realAt, Math.min(s, a.goalS + 1));
      pose(uA, at1, s);
      if (uB && S2) pose(uB, at2, s);
      if (b === "runs") {
        const ends: [Universe | null, Suspect | null][] = [[real, null], [uA, S1], [uB, S2 ?? null]];
        for (const [u, x] of ends) {
          if (!u) continue;
          const done = x ? s >= x.end : s >= a.goalS;
          if (!done) continue;
          const note = x ? x.note : "goal";
          const txt = note === "offside" ? say("runOffside") : note === "goal" ? (x ? say("runGoalAnyway") : say("runGoal")) : say("runNoGoal");
          relabel(u.verdict, txt, { color: "#0b1028", bg: note === "goal" ? "#f4f1e8" : "#c6ff4d", size: 44, h: 6 });
          u.verdict.visible = true;
        }
      } else {
        bins.forEach((x) => {
          x.g.visible = true;
          const r = rain(x, opts.reduced ? 99 : sx - 0.4);
          relabel(x.count, say("count", { g: r.goals, n: r.landed }), { bg: "rgba(6,8,18,.8)", size: 56, h: 5.4, weight: 800 });
        });
      }
    } else if (b === "verdict") {
      verdictScene(sx);
    } else if (b === "engine") {
      verdictScene(99);
      controls.autoRotate = !opts.reduced && !opts.still && !from;
    } else if (b === "fix" && uA && S1) {
      // the culprit's replay: level with the line, and the move dies
      const fs = fixSpan(S1);
      const s = opts.reduced ? S1.end : Math.min(fs.from + sx * 0.8, fs.to);
      const f = pose(uA, at1, s);
      const r = realAt(Math.min(s, S1.end));
      uA.head.visible = false;
      glow(uA, S1.player, BUG, 0.7);
      ghost.visible = ghostTag.visible = fixTag.visible = s > S1.start;
      ghost.position.set(r.pos[S1.player][0] - 52.5, 0, r.pos[S1.player][1] - 34);
      ghostTag.position.set(r.pos[S1.player][0] - 52.5, 1.6, r.pos[S1.player][1] - 34);
      fixTag.position.set(f.pos[S1.player][0] - 52.5, 1.6, f.pos[S1.player][1] - 34);
      if (S1.note === "offside" && s >= S1.end - 0.5) {
        const [p, cl] = yellowLine(tr!.j.offsideLine(f) - 52.5, 0.4);
        setLine(offLine, [...p], [...cl]);
        offLine.visible = true;
        const o = S1.offside;
        relabel(offFlag, o ? say("offsideBy", { name: sur(o.player), m: o.by.toFixed(1) }) : say("runOffside"), { color: "#0b1028", bg: "#c6ff4d", size: 36, h: 3 });
        offFlag.visible = true;
        const at = o ? f.pos[o.player] : f.ball;
        offFlag.position.set(at[0] - 52.5, 6, at[1] - 34);
      }
    } else if (b === "honest") {
      // no defender at fault: hold on the finish, the scorer ringed
      pose(real, realAt, Math.min(a.goalS - 2 + sx * 0.4, a.goalS - 0.8), false);
      scorerRing.visible = true;
      scorerRing.material.opacity = 0.7 + 0.3 * Math.sin(performance.now() / 200);
      glow(real, a.scorer, new THREE.Color("#ffffff"), 0.5);
    }
    if (b !== "engine") controls.autoRotate = false;
  }

  // ---------- post: MSAA, bloom, tone mapping, then a vignette and fine grain ----------
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: opts.phone ? 2 : 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, t: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float t; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + t) * 43758.5453); }
      void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - .5; float v = smoothstep(.85, .2, length(d * vec2(1.1, 1.))); c.rgb *= mix(.55, 1., v); c.rgb += (hash(vUv * 1000.) - .5) * .028; gl_FragColor = c; }`,
  });
  composer.addPass(finish);

  // ---------- hover: who is this? ----------
  const v3 = new THREE.Vector3();
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    let best: [number, number, number] | null = null, bd = 20;
    for (const u of [real, uA, uB]) {
      if (!u || !u.g.visible) continue;
      u.pieces.forEach((p, i) => {
        p.t.getWorldPosition(v3).project(camera);
        const x = (v3.x * 0.5 + 0.5) * r.width, y = (-v3.y * 0.5 + 0.5) * r.height;
        const d = Math.hypot(x - (e.clientX - r.left), y - (e.clientY - r.top));
        if (d < bd) { bd = d; best = [i, x, y]; }
      });
    }
    const hit = best as [number, number, number] | null;
    if (!hit) return opts.onHover(null, 0, 0);
    const [i, x, y] = hit;
    const s = suspects.find((q) => q.player === i);
    opts.onHover(`#${lab.numbers[i]} ${lab.names[i]}<small>${lab.clubs[i < 11 ? 0 : 1].name}${s ? ` · ${say("suspectTag", { p: Math.round(s.blame) })}` : ""}</small>`, x, y);
  };
  const onLeave = () => opts.onHover(null, 0, 0);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  let raf = 0, last = performance.now();
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    draw(dt);
    controls.update();
    finish.uniforms.t.value = (now / 1000) % 10;
    camera.layers.set(0);
    composer.render();
    // labels on top, untouched by bloom, tone mapping and grain
    const bg = scene.background;
    scene.background = null;
    renderer.autoClear = false;
    camera.layers.set(1);
    renderer.render(scene, camera);
    renderer.autoClear = true;
    scene.background = bg;
    camera.layers.set(0);
  };
  raf = requestAnimationFrame(tick);

  return {
    show(i, t = 0) {
      const instant = opts.reduced || opts.still;
      from = instant ? null : { cam: camera.position.clone(), at: controls.target.clone(), lay: JSON.parse(JSON.stringify(lay)) };
      step = Math.max(0, Math.min(steps.length - 1, i));
      since = t;
      trans = 0;
      if (instant) {
        const shot = shotOf(step);
        camera.position.set(shot.pos[0], shot.pos[1], shot.pos[2]);
        controls.target.set(shot.at[0], shot.at[1], shot.at[2]);
        lay = JSON.parse(JSON.stringify(layoutOf(beatOf(step))));
      }
    },
    setPlaying(p) { playing = p; },
    time: () => since,
    resize(width, height, ins) {
      w = Math.max(width, 1);
      h = Math.max(height, 1);
      inset = ins;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.resolution.set(w, h);
      camera.aspect = w / h;
      camera.fov = phone() ? 60 : 40;
      camera.updateProjectionMatrix();
    },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) { (mat as THREE.MeshBasicMaterial).map?.dispose(); mat.dispose(); }
      });
      pitchTex.dispose();
      env.dispose();
      pmrem.dispose();
      composer.dispose();
      target.dispose();
      renderer.dispose();
    },
  };
}

export type { Pt };
