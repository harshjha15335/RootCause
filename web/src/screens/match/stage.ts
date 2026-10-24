import { gsap } from "gsap";
import * as THREE from "three";

/**
 * A small Timestack stage for the Match page: one renderer, a calm orbit rig fitted to whatever
 * is in view, HTML tags pinned to 3D points, drag to turn, tap and hover picking. It renders only
 * when something changed and only while on screen. Plain three.js, like three/timestack.ts.
 */

export const C = { cobalt: 0x1530d6, deep: 0x0b1a8a, chalk: 0xf3f5ff, sky: 0x9fb0ff, var: 0xffd60a, plate: 0x2f4dff };
export const X = (x: number) => x - 52.5;
export const Z = (y: number) => y - 34;
export const PHONE = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;

export type Rig = { az: number; el: number; dist: number; tx: number; ty: number; tz: number };
export type FitOpts = { az?: number; el?: number; margin?: number; padRight?: number; padTop?: number; padBottom?: number; duration?: number; instant?: boolean };

const TAG_BASE = "pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-md px-2 py-0.5 font-body text-[12px] font-semibold tabular-nums transition-opacity duration-300";
const TAG: Record<string, string> = {
  "": "bg-[#06104f]/85 text-chalk ring-1 ring-inset ring-chalk/15",
  "rc-stack-tag--var": "bg-flare text-flare-ink",
  "rc-stack-tag--chalk": "bg-chalk text-turf-deep",
  "rc-stack-tag--quiet": "text-chalk-faint",
};

type Tag = { el: HTMLDivElement; at: () => THREE.Vector3 | null; on: boolean };

export function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: Rig;
  readonly canvas: HTMLCanvasElement;
  /** Called with the picked object (or null) on a tap that was not a drag. */
  onTap: ((o: THREE.Object3D | null) => void) | null = null;
  onHover: ((o: THREE.Object3D | null) => void) | null = null;
  pickables: THREE.Object3D[] = [];
  private renderer: THREE.WebGLRenderer;
  private tags: Tag[] = [];
  private dirty = true;
  private visible = false;
  private raf = 0;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private ray = new THREE.Raycaster();
  private reduced: boolean;
  private drag: { x: number; y: number; az: number; el: number; moved: boolean } | null = null;

  constructor(private host: HTMLElement, opts: { az?: number; el?: number; fov?: number; reduced?: boolean } = {}) {
    this.reduced = !!opts.reduced;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "block h-full w-full cursor-grab touch-pan-y";
    host.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !PHONE, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PHONE ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x0b1a8a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-30, 60, 40);
    this.scene.add(key);
    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 30, 1, 0.5, 2000);
    this.rig = { az: opts.az ?? -Math.PI / 2, el: opts.el ?? 0.3, dist: 160, tx: 0, ty: 0, tz: 0 };

    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      this.drag = { x: e.clientX, y: e.clientY, az: this.rig.az, el: this.rig.el, moved: false };
    });
    c.addEventListener("pointermove", (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) < 6) return;
        if (!this.drag.moved) {
          this.drag.moved = true;
          c.setPointerCapture(e.pointerId);
          c.style.cursor = "grabbing";
          gsap.killTweensOf(this.rig);
        }
        // turn gently, and never under the pitch or past overhead
        this.rig.az = this.drag.az + dx * 0.005;
        this.rig.el = Math.min(1.25, Math.max(0.06, this.drag.el + dy * 0.004));
        this.poke();
      } else if (this.onHover && e.pointerType === "mouse") {
        this.onHover(this.pick(e));
      }
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      this.drag = null;
      c.style.cursor = "grab";
      if (d && !d.moved && e.type === "pointerup") this.onTap?.(this.pick(e));
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => this.onHover?.(null));

    this.ro = new ResizeObserver(() => this.size());
    this.ro.observe(host);
    this.io = new IntersectionObserver((es) => {
      this.visible = es[0].isIntersecting;
      if (this.visible) this.loop();
    }, { rootMargin: "120px" });
    this.io.observe(host);
    this.size();
    this.place();
  }

  poke() {
    this.dirty = true;
  }

  private pick(e: PointerEvent): THREE.Object3D | null {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.intersectObjects(this.pickables, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !this.pickables.includes(o)) o = o.parent;
    return o;
  }

  private size() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.poke();
  }

  private place() {
    const { az, el, dist, tx, ty, tz } = this.rig;
    const ce = Math.cos(el);
    this.camera.position.set(tx + dist * ce * Math.cos(az), ty + dist * Math.sin(el), tz + dist * ce * Math.sin(az));
    this.camera.lookAt(tx, ty, tz);
    this.camera.updateMatrixWorld();
  }

  /**
   * Fit a box in view from an angle: project its corners and solve for the distance and target
   * that keep every corner inside the free part of the frame (the pads are shares of the frame
   * kept clear for panels and copy).
   */
  fitTo(box: THREE.Box3, o: FitOpts = {}) {
    const corners: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const save = { ...this.rig };
    const az = o.az ?? this.rig.az, el = o.el ?? this.rig.el;
    const padR = o.padRight ?? 0, padT = o.padTop ?? 0, padB = o.padBottom ?? 0;
    const margin = o.margin ?? 1.08;
    let dist = box.getSize(new THREE.Vector3()).length() * 1.4;
    const t = box.getCenter(new THREE.Vector3());
    for (let it = 0; it < 14; it++) {
      Object.assign(this.rig, { az, el, dist, tx: t.x, ty: t.y, tz: t.z });
      this.place();
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const p of corners) {
        const v = p.clone().project(this.camera);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      const availX = 2 - padR * 2, availY = 2 - (padT + padB) * 2;
      const k = Math.max((maxX - minX) / availX, (maxY - minY) / availY) * margin;
      const vH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const wantY = padB - padT, wantX = -padR;
      t.add(up.multiplyScalar((((minY + maxY) / 2 - wantY) * vH) / 2 * 0.9));
      t.add(right.multiplyScalar((((minX + maxX) / 2 - wantX) * vH * this.camera.aspect) / 2 * 0.9));
      dist *= 1 + (k - 1) * 0.9;
    }
    const to = { az, el, dist, tx: t.x, ty: t.y, tz: t.z };
    Object.assign(this.rig, save);
    gsap.killTweensOf(this.rig);
    if (this.reduced || o.instant) {
      Object.assign(this.rig, to);
      this.poke();
      return;
    }
    gsap.to(this.rig, { ...to, duration: o.duration ?? 1.8, ease: "power2.inOut", onUpdate: () => this.poke() });
  }

  tag(text: string, at: () => THREE.Vector3 | null, cls = "") {
    const el = document.createElement("div");
    el.className = `${TAG_BASE} ${TAG[cls] ?? TAG[""]}`;
    el.textContent = text;
    el.setAttribute("aria-hidden", "true");
    this.host.appendChild(el);
    const t: Tag = { el, at, on: true };
    this.tags.push(t);
    this.poke();
    return t;
  }

  clearTags() {
    for (const t of this.tags.splice(0)) t.el.remove();
  }

  private drawTags() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    for (const t of this.tags) {
      const p = t.on ? t.at() : null;
      if (!p) {
        t.el.style.opacity = "0";
        continue;
      }
      const v = p.clone().project(this.camera);
      if (v.z > 1) {
        t.el.style.opacity = "0";
        continue;
      }
      const half = t.el.offsetWidth / 2 + 8;
      const x = Math.min(w - half, Math.max(half, (v.x * 0.5 + 0.5) * w));
      const y = Math.min(h - 14, Math.max(28, (-v.y * 0.5 + 0.5) * h));
      t.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -120%)`;
      t.el.style.opacity = "1";
    }
  }

  private loop = () => {
    cancelAnimationFrame(this.raf);
    if (!this.visible) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.dirty) return;
    this.dirty = false;
    this.place();
    this.renderer.render(this.scene, this.camera);
    this.drawTags();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    gsap.killTweensOf(this.rig);
    this.ro.disconnect();
    this.io.disconnect();
    this.clearTags();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
        (x as THREE.MeshBasicMaterial).map?.dispose();
        x.dispose();
      });
    });
    this.renderer.dispose();
    this.canvas.remove();
  }
}

// ------------------------------------------------------------------------------ building blocks

export function pitchLines(y: number, opacity: number, w = 105) {
  const pts: number[] = [];
  const seg = (a: number, b: number, c: number, d: number) => pts.push(X(a), y, Z(b), X(c), y, Z(d));
  seg(52.5, 0, 52.5, 68);
  for (const [x0, x1] of [[0, 16.5], [w, w - 16.5]]) { seg(x0, 13.84, x1, 13.84); seg(x1, 13.84, x1, 54.16); seg(x1, 54.16, x0, 54.16); }
  for (const [x0, x1] of [[0, 5.5], [w, w - 5.5]]) { seg(x0, 24.84, x1, 24.84); seg(x1, 24.84, x1, 43.16); seg(x1, 43.16, x0, 43.16); }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2, b = ((i + 1) / 48) * Math.PI * 2;
    seg(52.5 + 9.15 * Math.cos(a), 34 + 9.15 * Math.sin(a), 52.5 + 9.15 * Math.cos(b), 34 + 9.15 * Math.sin(b));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: C.chalk, transparent: true, opacity, depthWrite: false }));
}

export type Plate = THREE.Group & { userData: { fill: THREE.Mesh; edge: THREE.LineSegments; lines?: THREE.LineSegments; y: number } };

export function plate(y: number, o: { fill?: number; edgeOp?: number; lineOp?: number; lines?: boolean } = {}): Plate {
  const grp = new THREE.Group() as Plate;
  const geo = new THREE.PlaneGeometry(105, 68);
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C.plate, transparent: true, opacity: o.fill ?? 0.06, depthWrite: false, side: THREE.DoubleSide }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = y;
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: C.chalk, transparent: true, opacity: o.edgeOp ?? 0.25, depthWrite: false }));
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = y;
  grp.add(fill, edge);
  let lines: THREE.LineSegments | undefined;
  if (o.lines !== false) {
    lines = pitchLines(y, o.lineOp ?? 0.08);
    grp.add(lines);
  }
  grp.userData = { fill, edge, lines, y };
  return grp;
}

export function ribbon(pts: THREE.Vector3[], color: number, r: number, opacity = 1) {
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(24, pts.length * 10), r, 8, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: opacity >= 1 }),
  );
}

export function polyline(pts: THREE.Vector3[], color: number, opacity = 1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

export function dashed(pts: THREE.Vector3[], color: number, opacity = 1) {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 1.2, gapSize: 0.8, depthWrite: false }));
  l.computeLineDistances();
  return l;
}

let glowTex: THREE.Texture | null = null;
export function glow(p: THREE.Vector3, color: number, size: number, opacity = 0.9) {
  if (!glowTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.copy(p);
  s.scale.set(size, size, 1);
  return s;
}

/** A readable player: a capsule standing on a ring, never a tiny pin. */
export function figure(p: THREE.Vector3, color: number, opacity = 1, scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.62 * scale, 1.4 * scale, 6, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, transparent: opacity < 1, opacity }),
  );
  body.position.y = 1.32 * scale;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0 * scale, 1.3 * scale, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 * opacity, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(body, ring);
  g.position.copy(p);
  return g;
}

export function fade(mat: THREE.Material, to: number, reduced: boolean, onUpdate: () => void, d = 0.9) {
  const m = mat as THREE.MeshBasicMaterial;
  gsap.killTweensOf(m);
  if (reduced) {
    m.opacity = to;
    onUpdate();
    return;
  }
  gsap.to(m, { opacity: to, duration: d, ease: "power2.inOut", onUpdate });
}
