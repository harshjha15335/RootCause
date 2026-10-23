import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * 200 Futures: the Story's one picture. A made-up attack on a floodlit pitch, seen from a level
 * broadcast camera behind the attack, the mistakes the rewind flags, and 200 replays forking out
 * of the first of them as hairlines of light. Fixing a mistake re-runs the fan with fewer goals;
 * the goals that vanish are that mistake's share of the blame.
 * Everything here is invented and illustrative, never a demo match's numbers.
 */

/** Pitch metres: x along the length (attacking right, goal at 105), y across, z up. */
export type Pt = [number, number, number?];

export interface StoryMistake {
  /** Goals out of 200 when only this mistake is fixed. */
  fixedGoals: number;
  pos: Pt;
  /** Where the plan had that player. */
  to: Pt;
}

export const TRIALS = 200;
export const BASE_GOALS = 146;
export const MISTAKES: StoryMistake[] = [
  { fixedGoals: 21, pos: [74, 30], to: [80.5, 30] },
  { fixedGoals: 118, pos: [62, 42], to: [60, 47] },
  { fixedGoals: 129, pos: [79, 47], to: [76, 42] },
];
const drops = MISTAKES.map((m) => BASE_GOALS - m.fixedGoals);
const dropSum = drops.reduce((a, b) => a + b, 0);
/** Each mistake's share of the blame: its drop in goals over all the drops. */
export const BLAME = drops.map((d) => d / dropSum);

const ATTACK: Pt[] = [[44, 18], [55, 26], [62, 40], [70, 33], [84, 35], [95, 33], [105, 34, 0.8]];
const ATTACKERS: Pt[] = [[55, 26], [62, 40], [84, 35], [95, 33], [70, 18]];
const LINE_X = 80.5;
const DEFENDERS: { at: Pt; mistake?: number }[] = [
  { at: [80.5, 16] },
  { at: [80.5, 24] },
  { at: MISTAKES[0].pos, mistake: 0 },
  { at: MISTAKES[2].pos, mistake: 2 },
  { at: MISTAKES[1].pos, mistake: 1 },
  { at: [66, 22] },
  { at: [101, 34] },
];
const START: Pt = [70, 33];

const CHALK = 0xf3f5ff;
const DEF = 0x8597ff;
const FLARE = 0xffd60a;
const NIGHT = 0x060d44;

export interface Labels {
  goal: string;
  start: string;
  fixed: string;
  mistakes: string[];
}

interface Future {
  pts: Pt[];
  goal: boolean;
  offside: boolean;
  delay: number;
  speed: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const ease = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
/** World space: centred on the action, y up. */
const W = (p: Pt) => new THREE.Vector3(p[0] - 80, p[2] ?? 0, p[1] - 34);

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** 200 ball paths out of the mistake, `goals` of them ending in the net. Seeded, so a fix always draws the same fan. */
function futures(goals: number, seed: number): Future[] {
  const r = rng(seed);
  const scoring = new Set<number>();
  while (scoring.size < goals) scoring.add(Math.floor(r() * TRIALS));
  const out: Future[] = [];
  for (let i = 0; i < TRIALS; i++) {
    const goal = scoring.has(i);
    const start: Pt = [START[0] + r() * 2 - 1, START[1] + r() * 2 - 1, 0.2];
    const mid: Pt = [80 + r() * 10, 22 + r() * 24, 1.5 + r() * 6];
    let end: Pt;
    let offside = false;
    if (goal) end = [105, 31 + r() * 6, 0.3 + r() * 2];
    else {
      const k = r();
      if (k < 0.45) end = [83 + r() * 10, 18 + r() * 32, 0]; // a defender wins it
      else if (k < 0.7) (end = [mid[0] + 2, mid[1], 0]), (offside = true); // the flag goes up
      else end = [105, r() < 0.5 ? 22 + r() * 7 : 40 + r() * 7, r() * 3]; // wide
    }
    const bend: Pt = [lerp(mid[0], end[0], 0.6), lerp(mid[1], end[1], 0.6) + (r() - 0.5) * 4, lerp(mid[2]!, end[2] ?? 0, 0.6)];
    out.push({ pts: [start, mid, bend, end], goal, offside, delay: r() * 1.1, speed: 0.55 + r() * 0.4 });
  }
  return out;
}

/** How far along its path a replay is, `t` seconds after the fan starts. The tally uses the same clock. */
const progress = (f: Future, t: number) => ease(((t - f.delay) * f.speed) / 1.4);

function curve(pts: Pt[]) {
  return new THREE.CatmullRomCurve3(pts.map(W), false, "centripetal");
}

/** A replay as one clean arc: from the mistake, lofted over the middle, down to where it ends. */
function arc(f: Future) {
  const a = W(f.pts[0]), b = W(f.pts[3]);
  const c = a.clone().lerp(b, 0.5);
  c.z += (f.pts[1][1] - 34) * 0.9;
  c.y = f.pts[1][2]!;
  return new THREE.QuadraticBezierCurve3(a, c, b);
}

/** The pitch as one texture: hairline chalk, quiet stripes and a floodlight pool over the box. */
function pitchTexture() {
  const m = 8;
  const px = 24;
  const c = document.createElement("canvas");
  c.width = (105 + m * 2) * px;
  c.height = (68 + m * 2) * px;
  const g = c.getContext("2d")!;
  const X = (v: number) => (v + m) * px;
  g.fillStyle = "#081455";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = i % 2 ? "#0a1762" : "#09155b";
    g.fillRect(X((i * 105) / 14), X(0), (105 / 14) * px + 1, 68 * px);
  }
  const pool = g.createRadialGradient(X(86), X(34), 0, X(86), X(34), 52 * px);
  pool.addColorStop(0, "rgba(120,150,255,0.22)");
  pool.addColorStop(0.5, "rgba(80,110,255,0.07)");
  pool.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = pool;
  g.fillRect(0, 0, c.width, c.height);
  const fade = g.createLinearGradient(X(20), 0, X(60), 0);
  fade.addColorStop(0, "rgba(6,13,68,0.92)");
  fade.addColorStop(1, "rgba(6,13,68,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, X(60), c.height);

  g.strokeStyle = "rgba(226,232,255,0.62)";
  g.lineWidth = 0.12 * px;
  const rect = (x: number, y: number, w: number, h: number) => g.strokeRect(X(x), X(y), w * px, h * px);
  rect(0, 0, 105, 68);
  g.beginPath();
  g.moveTo(X(52.5), X(0));
  g.lineTo(X(52.5), X(68));
  g.stroke();
  g.beginPath();
  g.arc(X(52.5), X(34), 9.15 * px, 0, Math.PI * 2);
  g.stroke();
  rect(105 - 16.5, 34 - 20.16, 16.5, 40.32);
  rect(105 - 5.5, 34 - 9.16, 5.5, 18.32);
  g.beginPath();
  g.arc(X(94), X(34), 9.15 * px, Math.PI - 0.93, Math.PI + 0.93);
  g.stroke();
  g.fillStyle = "rgba(226,232,255,0.7)";
  for (const x of [94, 52.5]) {
    g.beginPath();
    g.arc(X(x), X(34), 0.3 * px, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { texture: t, w: 105 + m * 2, h: 68 + m * 2 };
}

/** A soft round sprite for contact shadows and glows. */
function softDot(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, inner);
  r.addColorStop(1, outer);
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const FAN_VERT = /* glsl */ `
  attribute float u;
  attribute float delay;
  attribute float speed;
  attribute vec3 tint;
  uniform float time;
  varying float vU;
  varying float vHead;
  varying vec3 vTint;
  varying float aAlpha;
  attribute float lineAlpha;
  void main() {
    aAlpha = lineAlpha;
    float p = clamp(((time - delay) * speed) / 1.4, 0.0, 1.0);
    p = 1.0 - pow(1.0 - p, 3.0);
    vU = u - p;
    vHead = p;
    vTint = tint;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FAN_FRAG = /* glsl */ `
  varying float vU;
  varying float vHead;
  varying vec3 vTint;
  varying float aAlpha;
  uniform float alpha;
  void main() {
    if (vU > 0.0 || vHead <= 0.0) discard;
    // brighter near the moving head, settling to a hairline behind it
    float head = vHead < 1.0 ? smoothstep(-0.12, 0.0, vU) * 1.5 : 0.0;
    gl_FragColor = vec4(vTint * (1.0 + head), alpha * aAlpha);
  }
`;
const DOT_VERT = /* glsl */ `
  attribute float delay;
  attribute float speed;
  attribute vec3 tint;
  attribute float size;
  uniform float time;
  uniform float scale;
  varying vec3 vTint;
  varying float vOn;
  void main() {
    float p = clamp(((time - delay) * speed) / 1.4, 0.0, 1.0);
    vOn = step(0.999, 1.0 - pow(1.0 - p, 3.0));
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const DOT_FRAG = /* glsl */ `
  varying vec3 vTint;
  varying float vOn;
  void main() {
    if (vOn < 0.5) discard;
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vTint, smoothstep(0.5, 0.2, d));
  }
`;

interface Player {
  group: THREE.Group;
  body: THREE.Mesh;
  ring?: THREE.Mesh;
  mistake?: number;
  home: THREE.Vector3;
}

export class FuturesStage {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1.6, 1, 400);
  private overlay: HTMLDivElement;
  private tags = new Map<string, HTMLDivElement>();
  private raf = 0;
  private ro: ResizeObserver;
  private beat = 0;
  private beatAt = performance.now();
  private fixed = -1;
  private fixAt = performance.now();
  private landed = -1;
  private fan: Future[] = [];
  private fanLines!: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private fanDots!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private attack: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  private attackGhost: THREE.Mesh;
  private ball: THREE.Mesh;
  private flash: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private wall: THREE.Group;
  private players: Player[] = [];
  private dash: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private attackCurve = curve(ATTACK);

  constructor(
    private canvas: HTMLCanvasElement,
    private labels: Labels,
    private onTally: (goals: number) => void,
    private still = false,
  ) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.renderer = r;
    this.scene.background = new THREE.Color(NIGHT);
    this.scene.fog = new THREE.Fog(NIGHT, 60, 150);

    this.overlay = document.createElement("div");
    Object.assign(this.overlay.style, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden" });
    canvas.parentElement!.appendChild(this.overlay);

    this.scene.add(new THREE.HemisphereLight(0xc8d2ff, 0x0a1450, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-20, 40, -10);
    this.scene.add(key);

    // the pitch, and the dark beyond it
    const { texture, w, h } = pitchTexture();
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(52.5 - 80, 0, 0);
    this.scene.add(pitch);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: 0x081455 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);

    this.addGoal();
    this.wall = this.addWall();

    // the attack: a ghost of the whole move, and the bright thread that draws it
    const tube = new THREE.TubeGeometry(this.attackCurve, 240, 0.16, 8, false);
    this.attackGhost = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: CHALK, transparent: true, opacity: 0.16, depthWrite: false }));
    this.attack = new THREE.Mesh(tube.clone(), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.scene.add(this.attackGhost, this.attack);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.scene.add(this.ball);

    const flash = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    flash.position.copy(W([105, 34, 1.2]));
    flash.rotation.y = Math.PI / 2;
    this.flash = flash;
    this.scene.add(flash);

    const shadow = softDot("rgba(0,0,20,0.6)", "rgba(0,0,20,0)");
    const halo = softDot("rgba(255,214,10,0.55)", "rgba(255,214,10,0)");
    for (const a of ATTACKERS) this.players.push(this.addPlayer(a, CHALK, shadow));
    for (const d of DEFENDERS) {
      const p = this.addPlayer(d.at, DEF, shadow);
      if (d.mistake !== undefined) {
        p.mistake = d.mistake;
        const ring = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        p.group.add(ring);
        p.ring = ring;
      }
      this.players.push(p);
    }

    this.dash = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: FLARE, dashSize: 0.6, gapSize: 0.5, transparent: true }));
    this.scene.add(this.dash);

    this.buildFan(futures(BASE_GOALS, 7));

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.5, 0.72));
    this.composer.addPass(new OutputPass());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.overlay.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    this.composer.dispose();
    this.renderer.dispose();
  }

  setLabels(l: Labels) {
    this.labels = l;
  }

  setBeat(b: number) {
    if (b === this.beat) return;
    this.beat = b;
    this.beatAt = performance.now();
    if (b === 2) this.setFix(-1);
  }

  setFix(i: number) {
    this.fixed = i;
    this.fixAt = performance.now();
    this.buildFan(futures(i < 0 ? BASE_GOALS : MISTAKES[i].fixedGoals, 7 + (i + 1) * 13));
  }

  private resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    const cam = this.camera;
    cam.aspect = width / height;
    // a level broadcast camera behind the attack, goal at the far centre; pulled back on narrow screens
    const narrow = cam.aspect < 1.3;
    cam.fov = narrow ? 40 : 30;
    cam.position.set(narrow ? -40 : -56, narrow ? 30 : 28, 0);
    cam.lookAt(narrow ? 10 : 14, -3, 0);
    cam.updateProjectionMatrix();
    this.fanDots.material.uniforms.scale.value = height * 0.9;
  }

  private addGoal() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });
    const post = new THREE.CylinderGeometry(0.07, 0.07, 2.44, 12);
    for (const y of [30.34, 37.66]) {
      const m = new THREE.Mesh(post, mat);
      m.position.copy(W([105, y, 1.22]));
      this.scene.add(m);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.32, 12), mat);
    bar.rotation.x = Math.PI / 2;
    bar.position.copy(W([105, 34, 2.44]));
    this.scene.add(bar);
    // the net, as a few faint lines
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const y = 30.34 + (7.32 * i) / 8;
      pts.push(W([105, y, 2.44]), W([107.2, y, 0]));
    }
    for (let i = 0; i <= 4; i++) {
      const k = i / 4;
      pts.push(W([105 + 2.2 * k, 30.34, 2.44 * (1 - k)]), W([105 + 2.2 * k, 37.66, 2.44 * (1 - k)]));
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: CHALK, transparent: true, opacity: 0.22 })));
  }

  /** The line the back four should hold: a faint pane of light across the pitch. */
  private addWall() {
    const g = new THREE.Group();
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 2.2),
      new THREE.MeshBasicMaterial({ color: CHALK, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false }),
    );
    pane.rotation.y = Math.PI / 2;
    pane.position.y = 1.1;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(52, 2.2)),
      new THREE.LineBasicMaterial({ color: CHALK, transparent: true, opacity: 0.22 }),
    );
    edge.rotation.y = Math.PI / 2;
    edge.position.y = 1.1;
    g.add(pane, edge);
    g.position.copy(W([LINE_X, 34]));
    this.scene.add(g);
    return g;
  }

  private addPlayer(at: Pt, color: number, shadow: THREE.Texture): Player {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.1, 6, 16),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.1 }),
    );
    body.position.y = 0.97;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false }));
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.02;
    group.add(s, body);
    const home = W(at);
    group.position.copy(home);
    this.scene.add(group);
    return { group, body, home };
  }

  private buildFan(fan: Future[]) {
    this.fan = fan;
    const N = 48;
    const la: number[] = [], pos: number[] = [], u: number[] = [], delay: number[] = [], speed: number[] = [], tint: number[] = [];
    const dPos: number[] = [], dDelay: number[] = [], dSpeed: number[] = [], dTint: number[] = [], dSize: number[] = [];
    const goal = new THREE.Color(0xdfe5ff), miss = new THREE.Color(0x3e55d8), flag = new THREE.Color(FLARE);
    for (const f of fan) {
      const c = arc(f);
      const col = f.goal ? goal : miss;
      let prev = c.getPoint(0);
      for (let i = 1; i <= N; i++) {
        const p = c.getPoint(i / N);
        pos.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        u.push((i - 1) / N, i / N);
        for (let k = 0; k < 2; k++) delay.push(f.delay), speed.push(f.speed), tint.push(col.r, col.g, col.b), la.push(f.goal ? 0.45 : 0.9);
        prev = p;
      }
      const end = W(f.pts[3]);
      const dc = f.goal ? new THREE.Color(0xffffff) : f.offside ? flag : new THREE.Color(0x6f84ff);
      dPos.push(end.x, end.y + 0.05, end.z);
      dDelay.push(f.delay);
      dSpeed.push(f.speed);
      dTint.push(dc.r, dc.g, dc.b);
      dSize.push(f.goal ? 0.7 : 0.8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("u", new THREE.Float32BufferAttribute(u, 1));
    g.setAttribute("delay", new THREE.Float32BufferAttribute(delay, 1));
    g.setAttribute("speed", new THREE.Float32BufferAttribute(speed, 1));
    g.setAttribute("tint", new THREE.Float32BufferAttribute(tint, 3));
    g.setAttribute("lineAlpha", new THREE.Float32BufferAttribute(la, 1));
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.Float32BufferAttribute(dPos, 3));
    dg.setAttribute("delay", new THREE.Float32BufferAttribute(dDelay, 1));
    dg.setAttribute("speed", new THREE.Float32BufferAttribute(dSpeed, 1));
    dg.setAttribute("tint", new THREE.Float32BufferAttribute(dTint, 3));
    dg.setAttribute("size", new THREE.Float32BufferAttribute(dSize, 1));

    if (!this.fanLines) {
      this.fanLines = new THREE.LineSegments(
        g,
        new THREE.ShaderMaterial({
          vertexShader: FAN_VERT,
          fragmentShader: FAN_FRAG,
          uniforms: { time: { value: 0 }, alpha: { value: 0.5 } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      this.fanDots = new THREE.Points(
        dg,
        new THREE.ShaderMaterial({
          vertexShader: DOT_VERT,
          fragmentShader: DOT_FRAG,
          uniforms: { time: { value: 0 }, scale: { value: 600 } },
          transparent: true,
          depthWrite: false,
        }),
      );
      this.scene.add(this.fanLines, this.fanDots);
    } else {
      this.fanLines.geometry.dispose();
      this.fanLines.geometry = g;
      this.fanDots.geometry.dispose();
      this.fanDots.geometry = dg;
    }
  }

  private tag(key: string, at: THREE.Vector3 | null, text = "", kind: "flare" | "chalk" | "panel" = "chalk", lift = 2.6) {
    let el = this.tags.get(key);
    if (!at) {
      if (el) el.style.opacity = "0";
      return;
    }
    if (!el) {
      el = document.createElement("div");
      Object.assign(el.style, {
        position: "absolute",
        left: "0",
        top: "0",
        padding: "5px 10px",
        borderRadius: "999px",
        font: "600 12px/1 'Hanken Grotesk Variable', system-ui, sans-serif",
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        transition: "opacity .3s",
        backdropFilter: "blur(6px)",
      });
      this.overlay.appendChild(el);
      this.tags.set(key, el);
    }
    const look = {
      flare: ["#ffd60a", "#14123a", "none"],
      chalk: ["#f3f5ff", "#0e22a6", "none"],
      panel: ["rgba(8,18,85,.72)", "#f3f5ff", "inset 0 0 0 1px rgba(174,187,255,.35)"],
    }[kind];
    el.style.background = look[0];
    el.style.color = look[1];
    el.style.boxShadow = look[2];
    el.textContent = text;
    const p = at.clone().add(new THREE.Vector3(0, lift, 0)).project(this.camera);
    const { width, height } = this.overlay.getBoundingClientRect();
    const w = el.offsetWidth;
    const x = Math.max(4, Math.min(width - w - 4, ((p.x + 1) / 2) * width - w / 2));
    const y = ((1 - p.y) / 2) * height - 26;
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.opacity = "1";
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const { beat } = this;
    // reduced motion: every animation is shown at its end state
    const T = this.still ? 99 : (now - this.beatAt) / 1000;

    this.wall.visible = beat >= 1;

    // the attack thread
    let u = 1;
    if (beat === 0) u = ease(T / 2.8);
    else if (beat === 1) u = 1 - ease(T / 2.2) * 0.62;
    this.attack.visible = beat <= 1;
    this.attack.geometry.setDrawRange(0, Math.floor(u * 240) * 8 * 6);
    (this.attackGhost.material as THREE.MeshBasicMaterial).opacity = beat <= 1 ? 0.16 : 0.1;
    this.ball.visible = beat <= 1;
    this.ball.position.copy(this.attackCurve.getPoint(u)).add(new THREE.Vector3(0, 0.45, 0));

    // the goal flash
    const ft0 = T - 2.8;
    this.flash.visible = beat === 0 && ft0 > 0 && ft0 < 1.6;
    if (this.flash.visible) {
      const k = ft0 / 1.6;
      this.flash.scale.setScalar(1 + k * 9);
      this.flash.material.opacity = 1 - k;
    }
    this.tag("goal", beat === 0 && ft0 > 0 ? W([105, 34, 2.4]) : null, this.labels.goal, "chalk", 1.2);

    // the 200 futures
    const fanOn = beat >= 2;
    this.fanLines.visible = this.fanDots.visible = fanOn;
    let landed = 0;
    if (fanOn) {
      const ft = this.still ? 99 : (now - Math.max(this.fixAt, this.beatAt)) / 1000;
      this.fanLines.material.uniforms.time.value = ft;
      this.fanDots.material.uniforms.time.value = ft;
      for (const f of this.fan) if (f.goal && progress(f, ft) >= 0.999) landed++;
    }
    if (landed !== this.landed) this.onTally((this.landed = landed));
    this.tag("start", beat === 2 ? W(START) : null, this.labels.start, "panel", 3.2);

    // players; a fixed defender walks to where the plan had him
    let dashed = false;
    for (const p of this.players) {
      const m = p.mistake;
      if (m === undefined) continue;
      const isFixed = this.fixed === m && beat >= 3;
      const k = isFixed ? (this.still ? 1 : ease((now - this.fixAt) / 900)) : 0;
      p.group.position.lerpVectors(p.home, W(MISTAKES[m].to), k);
      const flagged = beat >= 1 && !(beat === 1 && T < 0.6 + m * 0.5);
      const mat = p.body.material as THREE.MeshStandardMaterial;
      mat.color.set(isFixed ? CHALK : flagged ? 0xffe773 : DEF);
      mat.emissive.set(isFixed ? CHALK : flagged ? FLARE : DEF);
      mat.emissiveIntensity = flagged && !isFixed ? 0.6 : 0.35;
      if (p.ring) {
        p.ring.visible = flagged && !isFixed;
        const pulse = this.still ? 0.4 : ((now / 1000 + m * 0.4) % 1.8) / 1.8;
        p.ring.scale.setScalar(0.7 + pulse * 0.9);
        (p.ring.material as THREE.MeshBasicMaterial).opacity = 1 - pulse;
      }
      const showName = flagged && !isFixed && (beat === 1 || (beat >= 3 && this.fixed < 0));
      this.tag(`m${m}`, showName ? p.group.position : null, this.labels.mistakes[m], "flare");
      this.tag(`f${m}`, isFixed ? p.group.position : null, this.labels.fixed, "chalk");
      if (isFixed) {
        dashed = true;
        this.dash.geometry.setFromPoints([p.home.clone().setY(0.05), p.group.position.clone().setY(0.05)]);
        this.dash.computeLineDistances();
      }
    }
    this.dash.visible = dashed;

    this.composer.render();
  };
}
