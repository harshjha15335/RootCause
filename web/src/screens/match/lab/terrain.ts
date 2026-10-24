import * as THREE from "three";
import { PX, PY, type Frame } from "../../../lab/data";
import { MARGIN } from "./draw";
import { EDGE_S, REACT_S, RUN_MS, SOFT_TAU, homeControl, teamOf } from "./model";

/**
 * The Match Topography: the Tactics Lab's live pitch turned into a landscape, an architectural
 * model on a dark slab. The ground rises under whichever side would reach a ball there first
 * (the same pitch-control model as the old Lab, run per vertex on the GPU), so each team stands
 * on its own high ground and the valleys between them are no man's land. Contour lines ring the
 * hills, each player raises a small mound where they stand, and every lens is drawn on a canvas
 * that drapes over the land.
 */
export const LAND_HOME = "#4766ff";
export const LAND_AWAY = "#ff9f1c";
const RISE = 6.5; // metres of rise for ground a side fully owns
const MOUND = 1.8; // a player's own mound
const W = PX + 2 * MARGIN, D = PY + 2 * MARGIN;
const TRAIL = 26;

const VERT = /* glsl */ `
uniform vec2 pos[22];
uniform vec2 vel[22];
uniform float strength;
varying vec3 vWorld;
varying vec2 vUv;
varying float vC;
varying float vH;
varying float vIn;
float ctrl(vec2 q, out float mound) {
  float mh = 1e9, ma = 1e9;
  float ts[22];
  mound = 0.0;
  for (int i = 0; i < 22; i++) {
    vec2 p = pos[i] + vel[i] * ${REACT_S.toFixed(2)};
    float t = ${REACT_S.toFixed(2)} + length(q - p) / ${RUN_MS.toFixed(1)};
    ts[i] = t;
    if (i < 11) mh = min(mh, t); else ma = min(ma, t);
    float d = length(q - pos[i]);
    mound = max(mound, exp(-d * d / 7.0));
  }
  float sh = 0.0, sa = 0.0;
  for (int i = 0; i < 22; i++) {
    if (i < 11) sh += exp(-(ts[i] - mh) / ${SOFT_TAU.toFixed(2)}); else sa += exp(-(ts[i] - ma) / ${SOFT_TAU.toFixed(2)});
  }
  float th = mh - ${SOFT_TAU.toFixed(2)} * log(sh);
  float ta = ma - ${SOFT_TAU.toFixed(2)} * log(sa);
  return 1.0 / (1.0 + exp(-(ta - th) / ${EDGE_S.toFixed(2)}));
}
void main() {
  vUv = uv;
  vec3 p = position;
  // plane is laid flat: local x = pitch x, local -y = pitch y (0 at the far touchline)
  vec2 q = vec2(p.x + ${(PX / 2).toFixed(1)}, -p.y + ${(PY / 2).toFixed(1)});
  float edge = min(min(q.x, ${PX.toFixed(1)} - q.x), min(q.y, ${PY.toFixed(1)} - q.y));
  float inside = smoothstep(-2.0, 1.5, edge);
  float mound;
  float c = ctrl(q, mound);
  float own = pow(abs(c - 0.5) * 2.0, 0.85);
  float h = (${RISE.toFixed(2)} * own + ${MOUND.toFixed(2)} * mound) * inside * strength;
  vC = c; vH = h; vIn = inside;
  p.z += h;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D overlay;
uniform vec3 homeCol;
uniform vec3 awayCol;
uniform vec3 lightDir;
uniform float strength;
varying vec3 vWorld;
varying vec2 vUv;
varying float vC;
varying float vH;
varying float vIn;
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  float own = abs(vC - 0.5) * 2.0;
  vec3 team = vC > 0.5 ? homeCol : awayCol;
  vec3 base = vec3(0.055, 0.085, 0.07);
  vec3 col = mix(base, team * 0.62, smoothstep(0.05, 0.9, own) * vIn * strength);
  // light: a low key light from the south-west and a cool sky
  float diff = max(dot(n, normalize(lightDir)), 0.0);
  col *= 0.42 + 0.78 * diff;
  col += vec3(0.02, 0.025, 0.04) * (1.0 - diff);
  // contour lines every 0.45 m of rise, brighter on the high ground
  float k = vH / 0.8;
  float w = fwidth(k);
  float line = 1.0 - smoothstep(0.0, w * 1.4, abs(fract(k - 0.5) - 0.5));
  col = mix(col, team * 1.15 + 0.08, line * 0.55 * smoothstep(0.08, 0.5, vH) * vIn);
  // the seam where neither side wins: a dark valley floor
  float sw = max(fwidth(vC) * 1.6, 1e-4);
  col = mix(col, vec3(0.01, 0.012, 0.02), (1.0 - smoothstep(0.0, sw, abs(vC - 0.5))) * 0.7 * vIn * strength);
  vec4 ov = texture2D(overlay, vUv);
  col = mix(col, ov.rgb, ov.a);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function numberTexture(n: number, team: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = team === 0 ? "#eef1ff" : LAND_AWAY;
  g.beginPath();
  g.arc(32, 32, 27, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = team === 0 ? "#1d2fb8" : "#1a1206";
  g.font = "800 30px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Terrain {
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLCanvasElement;
  /** overlay pixels per metre */
  readonly overlayPx: number;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
  private land: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private ovTex: THREE.CanvasTexture;
  private players: THREE.Group[] = [];
  private ball: THREE.Mesh;
  private trail: THREE.Line;
  private trailPts: THREE.Vector3[] = [];
  private textures: THREE.Texture[] = [];
  private az = 0;
  private el = 0.72;
  private dist = 150;
  private target = new THREE.Vector3();
  private strength = 0;
  private phone = false;
  /** free space on the left of the stage (a card) in px */
  private padTop = 0;
  private padBottom = 0;
  private ray = new THREE.Raycaster();

  constructor(host: HTMLElement, numbers: number[], label: string, private reduced: boolean) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "absolute inset-0 block h-full w-full";
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", label);
    host.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color("#06070b");

    this.overlayPx = 14;
    this.overlay = document.createElement("canvas");
    this.overlay.width = Math.round(W * this.overlayPx);
    this.overlay.height = Math.round(D * this.overlayPx);
    this.ovTex = new THREE.CanvasTexture(this.overlay);
    this.ovTex.colorSpace = THREE.SRGBColorSpace;
    this.ovTex.anisotropy = 8;
    this.textures.push(this.ovTex);

    const geo = new THREE.PlaneGeometry(W, D, 190, 124);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        pos: { value: Array.from({ length: 22 }, () => new THREE.Vector2(-500, -500)) },
        vel: { value: Array.from({ length: 22 }, () => new THREE.Vector2()) },
        strength: { value: 0 },
        overlay: { value: this.ovTex },
        homeCol: { value: new THREE.Color(LAND_HOME) },
        awayCol: { value: new THREE.Color(LAND_AWAY) },
        lightDir: { value: new THREE.Vector3(-0.5, 0.9, 0.55) },
      },
    });
    this.land = new THREE.Mesh(geo, mat);
    this.land.rotation.x = -Math.PI / 2;
    this.scene.add(this.land);

    // the slab the model sits on, and a faint floor reflection of light around it
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 3, 3.2, D + 3), new THREE.MeshStandardMaterial({ color: "#0d0f15", roughness: 0.55, metalness: 0.2 }));
    slab.position.y = -1.62;
    this.scene.add(slab);
    const rimGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 3, 3.2, D + 3));
    const rim = new THREE.LineSegments(rimGeo, new THREE.LineBasicMaterial({ color: "#3a4060", transparent: true, opacity: 0.55 }));
    rim.position.y = -1.62;
    this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight("#c8d2ff", "#0a0a10", 0.7));
    const key = new THREE.DirectionalLight("#fff1dc", 1.6);
    key.position.set(-60, 90, 70);
    this.scene.add(key);

    const poleGeo = new THREE.CylinderGeometry(0.22, 0.22, 2.4, 8);
    const headGeo = new THREE.SphereGeometry(0.85, 18, 12);
    // players are lit from within so they read against any ground
    const homeMat = new THREE.MeshBasicMaterial({ color: "#f4f6ff", toneMapped: false });
    const awayMat = new THREE.MeshBasicMaterial({ color: "#ffc066", toneMapped: false });
    for (let i = 0; i < 22; i++) {
      const team = teamOf(i);
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, team === 0 ? homeMat : awayMat);
      pole.position.y = 1.2;
      const head = new THREE.Mesh(headGeo, team === 0 ? homeMat : awayMat);
      head.position.y = 2.6;
      const tex = numberTexture(numbers[i], team);
      this.textures.push(tex);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
      tag.scale.setScalar(3.2);
      tag.position.y = 5;
      tag.renderOrder = 5;
      g.add(pole, head, tag);
      this.players.push(g);
      this.scene.add(g);
    }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 12), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
    this.scene.add(this.ball);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    tg.setDrawRange(0, 0);
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, toneMapped: false }));
    this.scene.add(this.trail);
    this.resize();
  }

  /** world position of a pitch point, on the land */
  private world(x: number, y: number, h: number) {
    return new THREE.Vector3(x - PX / 2, h, y - PY / 2);
  }

  /** the same height the shader gives the land, at a pitch point */
  heightAt(f: Frame, x: number, y: number) {
    if (x < -1 || x > PX + 1 || y < -1 || y > PY + 1) return 0;
    const c = homeControl(f, x, y);
    let mound = 0;
    for (let i = 0; i < 22; i++) {
      const d = Math.hypot(x - f.pos[i][0], y - f.pos[i][1]);
      mound = Math.max(mound, Math.exp((-d * d) / 7));
    }
    return (RISE * Math.pow(Math.abs(c - 0.5) * 2, 0.85) + MOUND * mound) * this.strength;
  }

  /** pitch point under a screen point, read on the flat pitch */
  pitchAt(cx: number, cy: number): [number, number] | null {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
    const v = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2), v)) return null;
    const x = v.x + PX / 2, y = v.z + PY / 2;
    return x < -MARGIN || x > PX + MARGIN || y < -MARGIN || y > PY + MARGIN ? null : [x, y];
  }

  /** screen position (px in the stage) of a player's head */
  screenOf(i: number): [number, number] {
    const v = this.players[i].position.clone().add(new THREE.Vector3(0, 5.8, 0)).project(this.camera);
    return [((v.x + 1) / 2) * this.canvas.clientWidth, ((1 - v.y) / 2) * this.canvas.clientHeight];
  }

  turn(dx: number, dy: number) {
    this.az = Math.max(-1.1, Math.min(1.1, this.az + dx * 0.006));
    this.el = Math.max(0.5, Math.min(1.35, this.el + dy * 0.004));
    this.fit();
  }

  /** room kept clear at the top and bottom of the stage, in px, for the cards over it */
  setPads(top: number, bottom: number) {
    this.padTop = top;
    this.padBottom = bottom;
    this.fit();
  }

  resize() {
    const w = this.canvas.parentElement?.clientWidth ?? 1, h = this.canvas.parentElement?.clientHeight ?? 1;
    this.phone = w < 700;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  private place(dist: number) {
    // on a phone the pitch runs up the screen: the camera looks along the touchline
    const base = this.phone ? -Math.PI / 2 : 0;
    const a = base + this.az;
    this.camera.position.set(this.target.x + Math.sin(a) * Math.cos(this.el) * dist, this.target.y + Math.sin(this.el) * dist, this.target.z + Math.cos(a) * Math.cos(this.el) * dist);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** the shortest distance that keeps the whole slab on screen, clear of the cards */
  private fit() {
    const H = this.canvas.parentElement?.clientHeight ?? 1;
    const top = 1 - (2 * this.padTop) / H, bottom = -1 + (2 * this.padBottom) / H;
    // aim between the pads so the model sits in the free band
    const corners: THREE.Vector3[] = [];
    for (const x of [-W / 2 - 1.5, W / 2 + 1.5]) for (const z of [-D / 2 - 1.5, D / 2 + 1.5]) for (const y of [-3.2, 11]) corners.push(new THREE.Vector3(x, y, z));
    let lo = 40, hi = 600;
    for (let k = 0; k < 24; k++) {
      const d = (lo + hi) / 2;
      this.place(d);
      let ok = true, minY = 9, maxY = -9;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        if (Math.abs(p.x) > 0.96) ok = false;
      }
      if (maxY - minY > (top - bottom) * 0.96) ok = false;
      if (ok) hi = d;
      else lo = d;
    }
    this.dist = hi;
    this.place(this.dist);
    // shift the view so the model's centre sits in the middle of the free band
    const mid = (top + bottom) / 2;
    this.camera.setViewOffset(this.canvas.clientWidth || 1, this.canvas.clientHeight || 1, 0, (mid * (this.canvas.clientHeight || 1)) / 2, this.canvas.clientWidth || 1, this.canvas.clientHeight || 1);
    this.camera.updateProjectionMatrix();
  }

  render(f: Frame, o: { dt: number; focus: number | null; space: boolean }) {
    const want = o.space ? 1 : 0;
    this.strength += (want - this.strength) * Math.min(1, o.dt * (this.reduced ? 60 : 4));
    const u = this.land.material.uniforms;
    u.strength.value = this.strength;
    for (let i = 0; i < 22; i++) {
      (u.pos.value[i] as THREE.Vector2).set(f.pos[i][0], f.pos[i][1]);
      (u.vel.value[i] as THREE.Vector2).set(f.vel[i][0], f.vel[i][1]);
      const [x, y] = f.pos[i];
      const g = this.players[i];
      g.position.copy(this.world(x, y, this.heightAt(f, x, y)));
      g.scale.setScalar(o.focus === i ? 1.35 : 1);
    }
    const [bx, by] = f.ball;
    this.ball.position.copy(this.world(bx, by, this.heightAt(f, bx, by) + 0.9));
    this.trailPts.push(this.ball.position.clone());
    if (this.trailPts.length > TRAIL) this.trailPts.shift();
    const ta = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    this.trailPts.forEach((p, k) => ta.setXYZ(k, p.x, p.y, p.z));
    ta.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, this.trailPts.length);
    this.ovTex.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((x) => x.dispose());
    });
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.canvas.remove();
  }
}
