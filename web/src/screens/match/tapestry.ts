import * as THREE from "three";
import { slotOf, type Tapestry } from "./tapestryModel";

/**
 * The Match Tapestry: the whole match woven as one cloth hanging in a dark gallery.
 * Minutes run left to right, the three bands are the top wing, the middle and the bottom wing.
 * Thread colour is who controlled that strip (blue home, amber away), the cloth bulges where a
 * team kept getting into the final third and pinches where a team won the ball high. Gold
 * stitches are goals and knots are big chances. Tapping a stitch cuts the cloth and raises a
 * small pitch with all 22 players one second before the goal.
 */
export type TapStage = {
  /** read a minute without a pointer (keyboard, the card's buttons) */
  setMinute(m: number): void;
  openGoal(gi: number | null): void;
  resize(w: number, h: number, phone: boolean, cardW: number, cardH: number): void;
  dispose(): void;
};
export type TapOpts = {
  reduced: boolean;
  dpr: number;
  overlay: HTMLElement;
  bands: [string, string, string];
  halfTime: string;
  goalTag(gi: number): string;
  scorerTag(gi: number): string;
  culpritTag(gi: number): string | null;
  onMinute(m: number): void;
  onGoal(gi: number | null): void;
};

export const TAP_HOME = "#6f7bff";
export const TAP_AWAY = "#ffad33";
export const TAP_GOLD = "#ffd75e";
const HOME = new THREE.Color(TAP_HOME), AWAY = new THREE.Color(TAP_AWAY), GOLD = new THREE.Color(TAP_GOLD), CALM = new THREE.Color("#3a3446");

const LEN = 180, BAND_H = 19, GAP = 2.2, PER = 16, SEG = 360, SPLIT = 30;
const X = (m: number) => (m / 90 - 0.5) * LEN;
const CLOTH_H = 3 * BAND_H + 2 * GAP;

// a weighted moving average so the cloth reads as a whole instead of flickering minute to minute
const smooth = (arr: number[], r = 2) =>
  arr.map((_, i) => {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j >= 0 && j < arr.length) { const w = r + 1 - Math.abs(k); s += arr[j] * w; n += w; }
    }
    return s / n;
  });
const at = (arr: number[], m: number) => {
  const i = Math.max(0, Math.min(arr.length - 1, m)), a = Math.floor(i), b = Math.min(arr.length - 1, a + 1);
  return arr[a] + (arr[b] - arr[a]) * (i - a);
};

export function createTapestry(canvas: HTMLCanvasElement, D: Tapestry, opts: TapOpts): TapStage {
  const ctrl = [0, 1, 2].map((b) => smooth(D.ctrl.map((r) => r[b])));
  const attack = [0, 1, 2].map((b) => smooth(D.att.map((r) => r[0][b] + r[1][b])));
  const attMax = Math.max(...attack.flat(), 0.01);
  const pressH = smooth(D.press.map((p) => p[0])), pressA = smooth(D.press.map((p) => p[1]));
  const pressMax = Math.max(...pressH, ...pressA, 0.01);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(opts.dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0b12);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x1a1422, 0.9));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(-60, 80, 120);
  const rim = new THREE.DirectionalLight(0x9aa4ff, 0.8);
  rim.position.set(80, -30, 60);
  scene.add(key, rim);
  const textures: THREE.Texture[] = [];
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d")!);
    const t = new THREE.CanvasTexture(c);
    textures.push(t);
    return t;
  };
  // a soft gallery spotlight on the wall behind the cloth
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 260),
    new THREE.MeshBasicMaterial({
      map: canvasTex(256, 256, (g) => {
        const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        r.addColorStop(0, "rgba(255,236,210,.16)");
        r.addColorStop(1, "rgba(255,236,210,0)");
        g.fillStyle = r;
        g.fillRect(0, 0, 256, 256);
      }),
      transparent: true,
      depthWrite: false,
    }),
  );
  wall.position.z = -30;
  scene.add(wall);

  // ------------------------------------------------------------------------------ the cloth
  const fabric = new THREE.Group();
  const left = new THREE.Group(), right = new THREE.Group();
  fabric.add(left, right);
  scene.add(fabric);
  const threadW = (BAND_H / PER) * 0.78;
  const bandY = (b: number, k: number, m: number) => {
    // a team pressing high squeezes the cloth: the pinch is the traffic jam they caused
    const pinch = 1 - (0.28 * Math.max(at(pressH, m), at(pressA, m))) / pressMax;
    return ((1.5 - b) * (BAND_H + GAP) + (BAND_H / 2 - (k + 0.5) * (BAND_H / PER))) * pinch;
  };
  const bulge = (b: number, m: number) => (3.4 * at(attack[b], m)) / attMax;
  const colourAt = (b: number, m: number, out: THREE.Color) => {
    const v = at(ctrl[b], m);
    out.copy(CALM).lerp(v > 0 ? HOME : AWAY, 0.25 + 0.75 * Math.min(1, Math.abs(v) / 0.22));
    // brighter where a team was getting in
    return out.multiplyScalar(0.75 + (0.6 * at(attack[b], m)) / attMax);
  };
  const threadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide });
  const weftMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 });
  // one band woven as PER flat threads that pass over and under the weft; one geometry per band half
  function buildBand(b: number, m0: number, m1: number, group: THREE.Group) {
    const n = Math.max(2, Math.round((SEG * (m1 - m0)) / 90));
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    for (let k = 0; k < PER; k++) {
      const base = pos.length / 3;
      // a slight thread-to-thread shimmer so it reads as cloth
      const sh = 0.9 + 0.1 * Math.sin(k * 12.9898 + b * 4.1);
      for (let i = 0; i <= n; i++) {
        const m = m0 + ((m1 - m0) * i) / n;
        const x = X(m), y = bandY(b, k, m);
        const z = bulge(b, m) + 0.28 * Math.sin(m * Math.PI + k * Math.PI);
        colourAt(b, m, c);
        pos.push(x, y + threadW / 2, z, x, y - threadW / 2, z);
        col.push(c.r * sh, c.g * sh, c.b * sh, c.r * sh * 0.82, c.g * sh * 0.82, c.b * sh * 0.82);
        if (i < n) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, threadMat));
    // weft: a fine cross thread every minute, catching the light
    const w: number[] = [];
    for (let m = Math.ceil(m0); m <= m1; m++) w.push(X(m), bandY(b, 0, m) + threadW, bulge(b, m) - 0.05, X(m), bandY(b, PER - 1, m) - threadW, bulge(b, m) - 0.05);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(w, 3));
    group.add(new THREE.LineSegments(wg, weftMat));
  }
  function buildCloth(split: number | null) {
    for (const g of [left, right]) {
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      g.clear();
    }
    for (let b = 0; b < 3; b++) {
      if (split === null) buildBand(b, 0, 90, left);
      else { buildBand(b, 0, split, left); buildBand(b, split, 90, right); }
    }
  }
  buildCloth(null);

  // half-time: a pale stitch down the cloth
  const ht = new THREE.Mesh(new THREE.BoxGeometry(0.25, CLOTH_H + 4, 0.25), new THREE.MeshBasicMaterial({ color: 0xf6f1e7, transparent: true, opacity: 0.35 }));
  ht.position.set(X(45), 0, 1);
  fabric.add(ht);

  // gold: goals are stitched right through the cloth, big chances are knots in their band
  const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.6 });
  const stitchGeo = new THREE.CylinderGeometry(0.42, 0.42, CLOTH_H + 6, 16);
  const golds: { obj: THREE.Object3D; m: number }[] = [];
  const goalStitches = D.goals.map((g) => {
    const m = g.s / 60, grp = new THREE.Group();
    grp.add(new THREE.Mesh(stitchGeo, goldMat));
    const team = g.side === "home" ? 0 : 1;
    const b = D.shots.find((s) => Math.abs(s.s - g.s) <= 1 && s.team === team)?.lane ?? 1;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), goldMat);
    knot.position.set(0, bandY(b, PER / 2, m), bulge(b, m) + 1);
    grp.add(knot);
    grp.position.set(X(m), 0, 1.4);
    fabric.add(grp);
    golds.push({ obj: grp, m });
    return grp;
  });
  for (const s of D.shots) {
    if (s.goal || s.xg < 0.12) continue;
    const m = s.s / 60;
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.5 + s.xg * 2.2, 16, 12), goldMat);
    k.position.set(X(m), bandY(s.lane, PER / 2, m), bulge(s.lane, m) + 0.9);
    fabric.add(k);
    golds.push({ obj: k, m });
  }

  // the minute needle
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.18, CLOTH_H + 10, 0.18), new THREE.MeshBasicMaterial({ color: 0xf6f1e7 }));
  needle.position.z = 4;
  fabric.add(needle);

  // the slice: the second before a goal, frozen on a small pitch that rises out of the cut
  const slice = new THREE.Group();
  slice.visible = false;
  scene.add(slice);
  slice.add(new THREE.Mesh(new THREE.PlaneGeometry(52.5, 34), new THREE.MeshStandardMaterial({ color: 0x1b2a22, roughness: 0.35, transparent: true, opacity: 0.94, side: THREE.DoubleSide })));
  const lines = new THREE.Mesh(
    new THREE.PlaneGeometry(52.5, 34),
    new THREE.MeshBasicMaterial({
      map: canvasTex(1050, 680, (g) => {
        g.strokeStyle = "rgba(246,241,231,.7)";
        g.lineWidth = 4;
        g.strokeRect(4, 4, 1042, 672);
        g.beginPath(); g.moveTo(525, 0); g.lineTo(525, 680); g.stroke();
        g.beginPath(); g.arc(525, 340, 91, 0, Math.PI * 2); g.stroke();
        g.strokeRect(0, 138, 165, 404);
        g.strokeRect(885, 138, 165, 404);
      }),
      transparent: true,
      depthWrite: false,
    }),
  );
  lines.position.z = 0.05;
  slice.add(lines);
  const dotMat = (c: THREE.Color | number) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5 });
  const homeMat = dotMat(HOME), awayMat = dotMat(AWAY), ballMat = dotMat(0xffffff);
  const playerGeo = new THREE.SphereGeometry(0.8, 16, 12), ballGeo = new THREE.SphereGeometry(0.6, 16, 12);
  const dots = Array.from({ length: 23 }, (_, i) => {
    const d = new THREE.Mesh(i === 22 ? ballGeo : playerGeo, i === 22 ? ballMat : i < 11 ? homeMat : awayMat);
    slice.add(d);
    return d;
  });
  const ringGeo = new THREE.RingGeometry(1.3, 1.65, 32);
  const rings = [new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: GOLD })), new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf6f1e7 }))];
  slice.add(...rings);
  let sliceWho: [number | null, number | null] = [null, null];

  // ------------------------------------------------------------------------------ html overlays
  const over = opts.overlay;
  const mk = (cls: string, text: string) => {
    const e = document.createElement("span");
    e.className = cls;
    e.textContent = text;
    over.appendChild(e);
    return e;
  };
  const bandLabels = opts.bands.map((t) => mk("tap-lab", t));
  const goalTags = D.goals.map((_, gi) => mk("tap-gtag", opts.goalTag(gi)));
  // two goals close together: lift every other tag so they never sit on each other
  const tagLift = D.goals.map((g, i) => (i > 0 && Math.abs(g.s - D.goals[i - 1].s) < 600 ? 1 : 0));
  for (let i = 1; i < tagLift.length; i++) if (tagLift[i] && tagLift[i - 1]) tagLift[i] = 0;
  const ticks = [0, 15, 30, 45, 60, 75, 90].map((m) => [m, mk("tap-tick", m === 45 ? opts.halfTime : `${m}′`)] as const);
  const tip = mk("tap-tip", "");
  const sliceTags = [mk("tap-gtag", ""), mk("tap-gtag tap-culprit", "")];
  const v3 = new THREE.Vector3();
  let W = 1, H = 1;
  const project = (v: THREE.Vector3) => {
    const p = v.project(camera);
    return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H] as const;
  };
  const place = (e: HTMLElement, x: number, y: number) => {
    e.style.left = `${x.toFixed(1)}px`;
    e.style.top = `${y.toFixed(1)}px`;
  };

  // ------------------------------------------------------------------------------ camera
  let phone = false, cardW = 0, cardH = 0, focusM = 45;
  const view = { x: 0, y: 0, d: 200 };
  function frame() {
    const aspect = W / H;
    const fov = (camera.fov * Math.PI) / 180, tan = Math.tan(fov / 2);
    if (phone) {
      // the cloth is too wide for a phone: show about 36 minutes around the needle, above the card
      const free = Math.max(0.35, (H - cardH) / H);
      view.d = Math.max(((CLOTH_H + 22) / 2 / tan) / free, 72 / 2 / tan / aspect);
      view.x = X(focusM);
      view.y = -(1 - free) * view.d * tan;
    } else {
      const usable = (W - cardW) / W;
      view.d = Math.max(((CLOTH_H + 22) / 2 / tan) * 1.05, (LEN + 30) / 2 / tan / (aspect * usable));
      view.x = (cardW / W) * view.d * tan * aspect;
      view.y = 0;
    }
  }

  // ------------------------------------------------------------------------------ state
  let minute = 45, open: number | null = null, cut = 0, cutTarget = 0;
  const cutOffset = (m: number) => (open === null ? 0 : m <= D.goals[open].s / 60 ? -cut * SPLIT : cut * SPLIT);
  function setMinute(m: number) {
    minute = Math.max(0, Math.min(90, m));
    needle.position.x = X(minute);
    tip.textContent = `${Math.min(89, Math.floor(minute))}′`;
    if (phone && (minute < focusM - 14 || minute > focusM + 14)) { focusM = Math.max(16, Math.min(74, minute)); frame(); }
    opts.onMinute(minute);
  }
  function openGoal(gi: number | null) {
    if (gi === null) {
      if (open === null) return;
      cutTarget = 0;
      open = null;
      opts.onGoal(null);
      return;
    }
    open = gi;
    const g = D.goals[gi], m = g.s / 60;
    buildCloth(m);
    g.pos.forEach((p, i) => dots[i].position.set((p[0] - 52.5) / 2, (p[1] - 34) / 2, 0.6));
    dots[22].position.set((g.ball[0] - 52.5) / 2, (g.ball[1] - 34) / 2, 0.8);
    slice.position.set(X(m), 0, 6);
    const sc = slotOf(g.scorer), cu = g.verdict ? slotOf(g.verdict.culprit) : null;
    sliceWho = [sc, cu];
    sliceTags[0].textContent = opts.scorerTag(gi);
    sliceTags[1].textContent = opts.culpritTag(gi) ?? "";
    rings.forEach((r, i) => {
      const who = sliceWho[i];
      r.visible = who !== null;
      if (who !== null) r.position.set(dots[who].position.x, dots[who].position.y, 0.3);
    });
    slice.visible = true;
    cutTarget = 1;
    focusM = Math.max(16, Math.min(74, m));
    frame();
    opts.onGoal(gi);
  }

  // ------------------------------------------------------------------------------ input
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const minuteAt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, v3)) return null;
    const m = (v3.x / LEN + 0.5) * 90;
    return m >= 0 && m <= 90 && Math.abs(v3.y) < CLOTH_H / 2 + 6 ? m : null;
  };
  let dragging = false, downX = 0, lastX = 0;
  const onDown = (e: PointerEvent) => { dragging = true; downX = lastX = e.clientX; };
  const onMove = (e: PointerEvent) => {
    if (open !== null) return;
    if (phone && dragging && e.pointerType !== "mouse") {
      // on a phone the finger drags the cloth sideways under a fixed needle in the middle
      focusM = Math.max(16, Math.min(74, focusM - ((e.clientX - lastX) / W) * 36));
      lastX = e.clientX;
      frame();
      setMinute(focusM);
      return;
    }
    if (e.pointerType === "touch") return;
    const m = minuteAt(e);
    if (m !== null) setMinute(m);
  };
  const onUp = (e: PointerEvent) => {
    const was = dragging;
    dragging = false;
    if (!was || Math.abs(e.clientX - downX) > 8) return;
    const m = minuteAt(e);
    if (m === null) { if (open !== null) openGoal(null); return; }
    const near = D.goals.map((g, gi) => ({ gi, d: Math.abs(g.s / 60 - m) })).sort((a, b) => a.d - b.d)[0];
    if (near && near.d < (phone ? 2.5 : 1.6)) openGoal(open === near.gi ? null : near.gi);
    else if (open !== null) openGoal(null);
    else setMinute(m);
  };
  const onCancel = () => { dragging = false; };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);

  // ------------------------------------------------------------------------------ loop
  const cam = new THREE.Vector3(0, 0, 200), look = new THREE.Vector3(), target = new THREE.Vector3(), aim = new THREE.Vector3();
  let first = true, raf = 0, last = performance.now(), visible = true;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
  io.observe(canvas);
  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible) return;
    cut += (cutTarget - cut) * Math.min(1, dt * (opts.reduced ? 60 : 3.2));
    if (cut < 0.002 && cutTarget === 0 && slice.visible) { slice.visible = false; buildCloth(null); }
    left.position.x = -cut * SPLIT;
    right.position.x = cut * SPLIT;
    for (const gd of golds) gd.obj.position.x = X(gd.m) + cutOffset(gd.m);
    needle.visible = open === null;
    slice.scale.setScalar(Math.max(0.001, cut));
    slice.rotation.y = (1 - cut) * 0.6;
    // a gentle sway, like cloth in a draught
    fabric.rotation.y = opts.reduced ? -0.12 : -0.12 + Math.sin(now / 5200) * 0.04;
    fabric.rotation.x = -0.06;
    target.set(view.x, view.y + 4, view.d * (open !== null ? 0.97 : 1));
    aim.set(open !== null && !phone ? slice.position.x * 0.4 + view.x * 0.6 : view.x, view.y, 0);
    const k = first || opts.reduced ? 1 : Math.min(1, dt * 3);
    first = false;
    cam.lerp(target, k);
    look.lerp(aim, k);
    camera.position.copy(cam);
    camera.lookAt(look);
    renderer.render(scene, camera);
    fabric.updateMatrixWorld();
    // overlays follow the cloth
    bandLabels.forEach((l, b) => {
      const [x, y] = project(v3.set(X(0) + left.position.x, bandY(b, PER / 2, 0), 0).applyMatrix4(fabric.matrixWorld));
      l.style.visibility = x < 70 ? "hidden" : "";
      place(l, x, y);
    });
    goalTags.forEach((t, gi) => {
      const [x, y] = project(v3.set(goalStitches[gi].position.x, CLOTH_H / 2 + 4 + tagLift[gi] * 5, 1.4).applyMatrix4(fabric.matrixWorld));
      t.style.visibility = y < 12 || x < 0 || x > W - (phone ? 0 : cardW) ? "hidden" : "";
      place(t, x, y);
    });
    for (const [m, e] of ticks) {
      const [x, y] = project(v3.set(X(m) + cutOffset(m), -CLOTH_H / 2 - 5, 0).applyMatrix4(fabric.matrixWorld));
      e.style.visibility = x < 0 || x > W - (phone ? 0 : cardW) ? "hidden" : "";
      place(e, x, y);
    }
    {
      const [x, y] = project(v3.set(needle.position.x, CLOTH_H / 2 + 6, 4).applyMatrix4(fabric.matrixWorld));
      tip.style.visibility = open === null ? "" : "hidden";
      place(tip, x, y);
    }
    sliceTags.forEach((t, i) => {
      const who = sliceWho[i];
      const on = open !== null && who !== null && cut > 0.9 && t.textContent !== "";
      t.style.visibility = on ? "" : "hidden";
      if (!on || who === null) return;
      const [x, y] = project(v3.copy(dots[who].position).add(new THREE.Vector3(0, i ? -1.2 : 1.2, 0)).applyMatrix4(slice.matrixWorld));
      const half = t.offsetWidth / 2 + 8;
      place(t, Math.max(half, Math.min(W - half, x)), y);
    });
  }
  needle.position.x = X(minute);
  tip.textContent = `${minute}′`;
  raf = requestAnimationFrame(loop);

  return {
    setMinute,
    openGoal,
    resize(w, h, isPhone, cw, ch) {
      W = Math.max(1, w);
      H = Math.max(1, h);
      phone = isPhone;
      cardW = cw;
      cardH = ch;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      frame();
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((x) => x.dispose());
      });
      textures.forEach((t) => t.dispose());
      over.replaceChildren();
      renderer.dispose();
    },
  };
}
