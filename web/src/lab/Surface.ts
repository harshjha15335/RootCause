import * as THREE from "three";
import { PX, PY } from "./data";

/**
 * The match surface: the whole pitch as one cloth floating in the dark. Each side's colour floods
 * the grass it controls and the cloth swells where that side is attacking, minute by minute, from
 * the exported territory and expected-threat series. Shots rise as spikes, the move behind a goal
 * is traced over the cloth, and the mistake behind it glows yellow.
 */
export type SurfaceData = {
  control: number[][];
  nx: number;
  ny: number;
  homeXt: number[];
  awayXt: number[];
  shots: { s: number; team: number; xg: number; goal: boolean; at: [number, number] }[];
  /** for each goal: the passes of the move, oldest first, and the traced mistake if any */
  moves: { s: number; path: [number, number][]; fault: [number, number] | null; faultS: number | null }[];
};

const SX = 211, SY = 137;
const COL = {
  contested: new THREE.Color("#23252f"),
  home: new THREE.Color("#2464c8"),
  homePeak: new THREE.Color("#9cc8ff"),
  away: new THREE.Color("#b23a3a"),
  awayPeak: new THREE.Color("#ff9d8f"),
};

function lines() {
  const s = 12, M = 0;
  const c = document.createElement("canvas");
  c.width = PX * s;
  c.height = PY * s;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "#fff";
  g.lineWidth = 0.2 * s;
  const R = (x: number, y: number, w: number, h: number) => g.strokeRect((x + M) * s, (y + M) * s, w * s, h * s);
  R(0.2, 0.2, PX - 0.4, PY - 0.4);
  g.beginPath();
  g.moveTo((PX / 2) * s, 0);
  g.lineTo((PX / 2) * s, PY * s);
  g.stroke();
  g.beginPath();
  g.arc((PX / 2) * s, (PY / 2) * s, 9.15 * s, 0, Math.PI * 2);
  g.stroke();
  R(0.2, 13.84, 16.5, 40.32);
  R(PX - 16.7, 13.84, 16.5, 40.32);
  R(0.2, 24.84, 5.5, 18.32);
  R(PX - 5.7, 24.84, 5.5, 18.32);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

const ss = (a: number, b: number, x: number) => {
  const u = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return u * u * (3 - 2 * u);
};

export class Surface {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 800);
  private geo: THREE.PlaneGeometry;
  private colors: Float32Array;
  private smooth: Float32Array[] = [];
  private hx: number[] = [];
  private ax: number[] = [];
  private path: THREE.Line;
  private dots: THREE.InstancedMesh;
  private crack: THREE.Line;
  private ring: THREE.Mesh;
  private ray = new THREE.Raycaster();
  az = -0.62;
  el = 0.6;
  height = 0;

  constructor(private host: HTMLElement, private d: SurfaceData, label: string) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const el = this.renderer.domElement;
    el.className = "absolute inset-0 h-full w-full";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", label);
    host.prepend(el);

    this.scene.add(new THREE.HemisphereLight(0xdfe4ff, 0x101018, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-60, 90, 50);
    this.scene.add(key);

    this.geo = new THREE.PlaneGeometry(PX, PY, SX - 1, SY - 1);
    this.geo.rotateX(-Math.PI / 2);
    this.colors = new Float32Array(SX * SY * 3);
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    const cloth = new THREE.Mesh(
      this.geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, emissive: 0xffffff, emissiveMap: lines(), emissiveIntensity: 0.55, side: THREE.DoubleSide }),
    );
    this.scene.add(cloth);
    // the slab's dark underside and the pool of shadow it floats over
    const base = new THREE.Mesh(new THREE.BoxGeometry(PX, 3, PY), new THREE.MeshStandardMaterial({ color: 0x07070b, roughness: 1 }));
    base.position.y = -2.6;
    this.scene.add(base);
    const sc = document.createElement("canvas");
    sc.width = sc.height = 128;
    const sg = sc.getContext("2d")!;
    const rg = sg.createRadialGradient(64, 64, 10, 64, 64, 64);
    rg.addColorStop(0, "rgba(0,0,0,0.75)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    sg.fillStyle = rg;
    sg.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(PX * 1.7, PY * 1.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -9;
    this.scene.add(shadow);

    this.path = new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(400 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.scene.add(this.path);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), 24);
    this.scene.add(this.dots);
    this.crack = new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(80 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xffd60a }));
    this.scene.add(this.crack);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, depthWrite: false }));
    this.scene.add(this.ring);

    // a minute's control is blended with its neighbours so the cloth moves like a slow sea
    const n = d.control.length;
    for (let k = 0; k < n; k++) {
      const a = d.control[Math.max(k - 1, 0)], b = d.control[k], c = d.control[Math.min(k + 1, n - 1)];
      this.smooth.push(Float32Array.from(b, (v, i) => (a[i] + 2 * v + c[i]) / 400));
    }
    const sm = (arr: number[]) =>
      arr.map((_, k) => {
        let s = 0, w = 0;
        for (let j = -4; j <= 4; j++) {
          const v = arr[k + j];
          if (v != null) {
            s += v * (5 - Math.abs(j));
            w += 5 - Math.abs(j);
          }
        }
        return s / w;
      });
    this.hx = sm(d.homeXt);
    this.ax = sm(d.awayXt);
    const top = Math.max(...this.hx, ...this.ax, 1e-6);
    this.hx = this.hx.map((v) => v / top);
    this.ax = this.ax.map((v) => v / top);
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Control (-1 away .. 1 home) at a pitch point and fractional minute. */
  private field(fm: number) {
    const n = this.smooth.length;
    const k0 = Math.min(Math.max(Math.floor(fm), 0), n - 1), k1 = Math.min(k0 + 1, n - 1), f = Math.min(Math.max(fm - k0, 0), 1);
    const A = this.smooth[k0], B = this.smooth[k1], NX = this.d.nx, NY = this.d.ny;
    return (x: number, y: number) => {
      const gx = Math.min(Math.max(x / (PX / NX) - 0.5, 0), NX - 1.001), gy = Math.min(Math.max(y / (PY / NY) - 0.5, 0), NY - 1.001);
      const i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j;
      const at = (G: Float32Array) => (G[j * NX + i] * (1 - u) + G[j * NX + i + 1] * u) * (1 - v) + (G[(j + 1) * NX + i] * (1 - u) + G[(j + 1) * NX + i + 1] * u) * v;
      return at(A) * (1 - f) + at(B) * f;
    };
  }

  /** Surface height at a pitch point, valid after the last render(). */
  heightAt: (x: number, y: number) => number = () => 0;

  render(t: number, clock: number, dt: number, dragging: boolean) {
    const fm = t / 60 - 0.5;
    const field = this.field(fm);
    const k0 = Math.min(Math.max(Math.floor(fm), 0), this.hx.length - 1), k1 = Math.min(k0 + 1, this.hx.length - 1), f = Math.min(Math.max(fm - k0, 0), 1);
    const hp = this.hx[k0] * (1 - f) + this.hx[k1] * f, ap = this.ax[k0] * (1 - f) + this.ax[k1] * f;
    const spikes = this.d.shots
      .filter((s) => t >= s.s - 2 && t <= s.s + (s.goal ? 40 : 18))
      .map((s) => {
        const rise = t < s.s ? (t - s.s + 2) / 2 : 1;
        const fall = t < s.s ? 1 : Math.exp(-(t - s.s) / (s.goal ? 14 : 6));
        return { at: s.at, team: s.team, a: (s.goal ? 26 : 3 + 20 * s.xg) * rise * rise * fall, r: s.goal ? 4 : 2.8 };
      });
    const hAt = (x: number, y: number, c: number) => {
      const ph = Math.pow(Math.max(c, 0), 1.1) * ss(28, 100, x) * (0.3 + 1.6 * hp);
      const pa = Math.pow(Math.max(-c, 0), 1.1) * ss(28, 100, PX - x) * (0.3 + 1.6 * ap);
      let h = 3.2 * Math.pow(Math.abs(c), 0.8) * (0.6 + Math.max(hp, ap)) + 22 * (ph + pa) + 0.4 * (1 + Math.sin(x * 0.17 + clock * 0.8) * Math.sin(y * 0.21 - clock * 0.6));
      for (const s of spikes) h += s.a * Math.exp(-((x - s.at[0]) ** 2 + (y - s.at[1]) ** 2) / (2 * s.r * s.r));
      return h;
    };
    this.heightAt = (x, y) => hAt(x, y, field(x, y));
    const pos = this.geo.attributes.position.array as Float32Array;
    const col = new THREE.Color();
    for (let j = 0; j < SY; j++)
      for (let i = 0; i < SX; i++) {
        const idx = j * SX + i, x = (i / (SX - 1)) * PX, y = (j / (SY - 1)) * PY;
        const c = field(x, y), h = hAt(x, y, c);
        pos[idx * 3 + 1] = h;
        const w = ss(0.06, 0.5, Math.abs(c));
        const peak = Math.min(Math.max(h / 18, 0), 1);
        col.copy(c > 0 ? COL.home : COL.away).lerp(c > 0 ? COL.homePeak : COL.awayPeak, peak * 0.85);
        col.lerp(COL.contested, 1 - w);
        // a shot's spike takes the shooting side's colour
        for (const sp of spikes) {
          const k = (sp.a / 26) * Math.exp(-((x - sp.at[0]) ** 2 + (y - sp.at[1]) ** 2) / (2 * sp.r * sp.r * 1.8));
          if (k > 0.02) col.lerp(sp.team === 0 ? COL.homePeak : COL.awayPeak, Math.min(k * 1.4, 1));
        }
        this.colors[idx * 3] = col.r;
        this.colors[idx * 3 + 1] = col.g;
        this.colors[idx * 3 + 2] = col.b;
      }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.computeVertexNormals();

    // the move behind a goal, traced over the cloth as it happens, then held while the spike falls
    const move = this.d.moves.find((m) => t >= m.s - 20 && t <= m.s + 30);
    const pp = this.path.geometry.attributes.position.array as Float32Array;
    let n = 0, dots = 0;
    const m4 = new THREE.Matrix4();
    if (move) {
      const pts = move.path;
      // show passes up to now (the path's points are spread evenly over the 20 s before the goal)
      const shown = Math.min(pts.length, Math.max(1, Math.ceil(((t - (move.s - 20)) / 20) * pts.length)));
      for (let k = 0; k < shown - 1 && n < 396 * 3; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
        for (let u = 0; u <= 1.0001; u += 0.1) {
          const x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
          pp[n++] = x - PX / 2;
          pp[n++] = this.heightAt(x, y) + 0.9 + Math.sin(u * Math.PI) * 1.2;
          pp[n++] = y - PY / 2;
        }
      }
      for (let k = 0; k < shown && dots < 24; k++) {
        const [x, y] = pts[k];
        m4.makeTranslation(x - PX / 2, this.heightAt(x, y) + 0.9, y - PY / 2);
        this.dots.setMatrixAt(dots++, m4);
      }
    }
    this.path.geometry.setDrawRange(0, n / 3);
    this.path.geometry.attributes.position.needsUpdate = true;
    this.dots.count = dots;
    this.dots.instanceMatrix.needsUpdate = true;

    // the mistake: a yellow pulse where it happened and a crack running to the shot
    const fm2 = this.d.moves.find((m) => m.fault && m.faultS != null && t >= m.faultS - 3 && t <= m.s + 14);
    this.ring.visible = this.crack.visible = !!fm2;
    if (fm2 && fm2.fault) {
      const [fx, fy] = fm2.fault;
      const pulse = (clock * 0.9) % 1;
      this.ring.position.set(fx - PX / 2, this.heightAt(fx, fy) + 0.4, fy - PY / 2);
      this.ring.scale.setScalar(2 + pulse * 8);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 1 - pulse;
      const end = this.d.shots.find((s) => s.goal && Math.abs(s.s - fm2.s) < 2)?.at ?? fm2.fault;
      const prog = Math.min(Math.max((t - (fm2.faultS ?? t)) / Math.max(fm2.s - (fm2.faultS ?? fm2.s), 1), 0), 1);
      const cp = this.crack.geometry.attributes.position.array as Float32Array;
      let r = 0;
      for (let k = 0; k <= 40 * prog; k++) {
        const u = k / 40, x = fx + (end[0] - fx) * u, y = fy + (end[1] - fy) * u;
        const jig = Math.sin(u * 41 + fx) * 1.2 * Math.sin(u * Math.PI);
        cp[r++] = x + jig - PX / 2;
        cp[r++] = this.heightAt(x, y) + 0.3;
        cp[r++] = y - jig - PY / 2;
      }
      this.crack.geometry.setDrawRange(0, r / 3);
      this.crack.geometry.attributes.position.needsUpdate = true;
    }

    // slow drift unless the viewer is turning it
    const narrow = this.camera.aspect < 1.1;
    const a = this.az + (dragging ? 0 : Math.sin(clock / 11) * 0.1);
    const r = narrow ? 230 : 150;
    this.camera.position.set(Math.sin(a) * r * Math.cos(this.el), Math.sin(this.el) * r + this.height, Math.cos(a) * r * Math.cos(this.el));
    this.camera.lookAt(0, 3, 4);
    void dt;
    this.renderer.render(this.scene, this.camera);
  }

  toScreen(x: number, y: number, h: number): [number, number] {
    const v = new THREE.Vector3(x - PX / 2, h, y - PY / 2).project(this.camera);
    return [((v.x + 1) / 2) * this.host.clientWidth, ((1 - v.y) / 2) * this.host.clientHeight];
  }

  pitchAt(clientX: number, clientY: number): [number, number] | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -2), new THREE.Vector3());
    if (!hit) return null;
    const x = hit.x + PX / 2, y = hit.z + PY / 2;
    return x >= 0 && x <= PX && y >= 0 && y <= PY ? [x, y] : null;
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
