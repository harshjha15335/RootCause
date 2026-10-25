import * as THREE from "three";
import { PX, PY, SECONDS } from "../../lab/data";
import { STEP, type Reel } from "./reelModel";

/**
 * The player reel's 3D stage. One player's match on a dark floating pitch:
 * - a speed curtain: their path, raised as high as they were running and tinted from chalk
 *   (settled play) to the flare colour (broken play), grows as the match plays;
 * - every pass leaps out of them as an arc, higher the harder it was, gold if it broke a line;
 * - shots fly at the goal as thick bright streaks.
 * The camera trails the player and slowly circles; at full time it pulls up to see the whole day.
 */
const X = (x: number) => x - PX / 2;
const Z = (y: number) => y - PY / 2;
const H = (ms: number) => 0.3 + ms * 1.15;
/** the curtain shows the last few match minutes; the rest of the day stays as a trail on the grass */
const WINDOW = 75;

function rgb(v: string, fallback: string) {
  const parts = getComputedStyle(document.documentElement).getPropertyValue(v).trim().split(/[\s,]+/).map(Number);
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255) : new THREE.Color(fallback);
}

type Arc = { s: number; line: THREE.Line; n: number; mat: THREE.LineBasicMaterial };
type Streak = { s: number; mesh: THREE.Mesh; count: number; mat: THREE.MeshBasicMaterial };

export class ReelStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
  private curtain: THREE.Mesh;
  private edge: THREE.Line;
  private trail: THREE.Line;
  private head: THREE.Group;
  private arcs: Arc[] = [];
  private streaks: Streak[] = [];
  private look = new THREE.Vector3();
  private eye = new THREE.Vector3(0, 90, 90);
  private orbit = 0;
  private last = -1;

  constructor(private host: HTMLElement, private reel: Reel) {
    const chalk = rgb("--chalk", "#f3f5ff");
    const flare = rgb("--flare", "#ffd60a");
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x06070b);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.scene.fog = new THREE.Fog(0x06070b, 120, 260);

    // the pitch: a dark slab with hairline chalk
    const slab = new THREE.Mesh(new THREE.BoxGeometry(PX + 6, 1.2, PY + 6), new THREE.MeshBasicMaterial({ color: 0x0b1020 }));
    slab.position.y = -0.62;
    this.scene.add(slab);
    const L: number[] = [];
    const seg = (a: number, b: number, c: number, d: number) => L.push(X(a), 0.02, Z(b), X(c), 0.02, Z(d));
    seg(0, 0, PX, 0); seg(PX, 0, PX, PY); seg(PX, PY, 0, PY); seg(0, PY, 0, 0); seg(PX / 2, 0, PX / 2, PY);
    for (const [x0, dir] of [[0, 1], [PX, -1]] as const) {
      seg(x0, 13.84, x0 + dir * 16.5, 13.84); seg(x0 + dir * 16.5, 13.84, x0 + dir * 16.5, 54.16); seg(x0 + dir * 16.5, 54.16, x0, 54.16);
      seg(x0, 24.84, x0 + dir * 5.5, 24.84); seg(x0 + dir * 5.5, 24.84, x0 + dir * 5.5, 43.16); seg(x0 + dir * 5.5, 43.16, x0, 43.16);
    }
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2, b = ((k + 1) / 48) * Math.PI * 2;
      seg(PX / 2 + 9.15 * Math.cos(a), PY / 2 + 9.15 * Math.sin(a), PX / 2 + 9.15 * Math.cos(b), PY / 2 + 9.15 * Math.sin(b));
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(L, 3));
    this.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: chalk, transparent: true, opacity: 0.28 })));

    // the speed curtain and its glowing top edge
    const S = reel.samples;
    const pos = new Float32Array(S.length * 6), col = new Float32Array(S.length * 6), top = new Float32Array(S.length * 3);
    const c = new THREE.Color();
    S.forEach((p, k) => {
      const h = H(p.ms);
      pos.set([X(p.x), 0, Z(p.y), X(p.x), h, Z(p.y)], k * 6);
      top.set([X(p.x), h, Z(p.y)], k * 3);
      c.copy(chalk).lerp(flare, p.chaos);
      col.set([c.r * 0.25, c.g * 0.25, c.b * 0.25, c.r, c.g, c.b], k * 6);
    });
    const idx: number[] = [];
    for (let k = 0; k < S.length - 1; k++) {
      // no wall across a half-time or restart jump
      if (Math.hypot(S[k + 1].x - S[k].x, S[k + 1].y - S[k].y) > 40) {
        idx.push(0, 0, 0, 0, 0, 0);
        continue;
      }
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    cg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    cg.setIndex(idx);
    this.curtain = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    this.scene.add(this.curtain);
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.BufferAttribute(top, 3));
    this.edge = new THREE.Line(eg, new THREE.LineBasicMaterial({ color: chalk, transparent: true, opacity: 0.9 }));
    this.scene.add(this.edge);
    const ground = new Float32Array(S.length * 3);
    S.forEach((p, k) => ground.set([X(p.x), 0.06, Z(p.y)], k * 3));
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(ground, 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: flare, transparent: true, opacity: 0.3 }));
    this.scene.add(this.trail);

    // the player: a bright bead on a beam of light
    this.head = new THREE.Group();
    const bead = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshBasicMaterial({ color: flare }));
    bead.position.y = 1.1;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 30, 8, 1, true), new THREE.MeshBasicMaterial({ color: flare, transparent: true, opacity: 0.35, depthWrite: false }));
    beam.position.y = 15;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.3, 40), new THREE.MeshBasicMaterial({ color: flare, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.head.add(bead, beam, ring);
    this.scene.add(this.head);

    // passes: arcs, higher when harder
    for (const p of reel.passes) {
      const a = new THREE.Vector3(X(p.from[0]), 0.4, Z(p.from[1])), b = new THREE.Vector3(X(p.to[0]), 0.4, Z(p.to[1]));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y = 1.5 + p.difficulty / 6 + a.distanceTo(b) / 8;
      const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(28);
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      g.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({ color: p.lineBreaking ? flare : p.ok ? chalk : new THREE.Color(0xff6b6b), transparent: true, opacity: 0.95 });
      const line = new THREE.Line(g, mat);
      this.scene.add(line);
      this.arcs.push({ s: p.s, line, n: pts.length, mat });
    }
    // shots: thick streaks at the goal
    for (const x of reel.shots) {
      const a = new THREE.Vector3(X(x.from[0]), 0.6, Z(x.from[1])), b = new THREE.Vector3(X(x.to[0]), 1.4, Z(x.to[1]));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y = 3 + a.distanceTo(b) / 10;
      const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 40, x.goal ? 0.55 : 0.35, 8);
      geo.setDrawRange(0, 0);
      const mat = new THREE.MeshBasicMaterial({ color: x.goal ? flare : chalk, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
      this.streaks.push({ s: x.s, mesh, count: geo.index!.count, mat });
    }
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Draw the match up to second t. dt in seconds of wall time, for camera easing. */
  render(t: number, dt: number) {
    const S = this.reel.samples;
    const k = Math.min(S.length - 1, Math.max(0, Math.floor(t / STEP)));
    const f = Math.min(1, Math.max(0, t / STEP - k));
    const a = S[k], b = S[Math.min(S.length - 1, k + 1)];
    const jump = Math.hypot(b.x - a.x, b.y - a.y) > 40;
    const x = jump ? a.x : a.x + (b.x - a.x) * f, y = jump ? a.y : a.y + (b.y - a.y) * f;
    const from = Math.max(0, k - WINDOW);
    this.curtain.geometry.setDrawRange(from * 6, (k - from) * 6);
    this.edge.geometry.setDrawRange(from, k - from + 1);
    this.trail.geometry.setDrawRange(0, k + 1);
    this.head.position.set(X(x), 0, Z(y));
    const end = t >= SECONDS - 2;
    this.head.visible = !end;

    for (const arc of this.arcs) {
      const age = t - arc.s;
      if (age < 0) arc.line.geometry.setDrawRange(0, 0);
      else {
        arc.line.geometry.setDrawRange(0, Math.min(arc.n, Math.ceil((age / 3) * arc.n)));
        // fresh arcs shine, old ones settle into a faint web of the day's passing
        arc.mat.opacity = age < 25 ? 1 : 0.22;
      }
    }
    for (const st of this.streaks) {
      const age = t - st.s;
      st.mesh.geometry.setDrawRange(0, age < 0 ? 0 : Math.min(st.count, Math.ceil((age / 2) * st.count) - (Math.ceil((age / 2) * st.count) % 3)));
      st.mat.opacity = age < 40 ? 1 : 0.4;
    }

    // camera: trail the player and circle slowly; at full time, rise over the whole pitch
    const ease = 1 - Math.exp(-dt * 2.2);
    if (end) {
      this.look.lerp(new THREE.Vector3(0, 0, 0), ease);
      this.eye.lerp(new THREE.Vector3(0, 92, 78), ease);
    } else {
      this.orbit += dt * 0.12;
      const target = new THREE.Vector3(X(x) * 0.7, 2, Z(y) * 0.7);
      this.look.lerp(target, ease);
      const ang = -0.6 + Math.sin(this.orbit) * 0.7;
      this.eye.lerp(new THREE.Vector3(target.x + Math.sin(ang) * 58, 40, target.z + Math.cos(ang) * 58), ease);
    }
    if (this.last < 0) {
      this.look.set(0, 0, 0);
    }
    this.last = t;
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.look);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
