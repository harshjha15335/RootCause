import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { frameAt } from "../data";
import { fixedX, gapAt, isOffside, offsideLine, teamOf, wallAt, withFix } from "../goal";
import { BG, COL, clicks, clock, disposeScene, fatLine, label, pitchCanvas, project, relabel, setLine, surname, teamCol, texOf, who, type Ctx, type LabView } from "./kit";

/**
 * Time Column. The pitch is a glass floor at "now" and the last seconds hang beneath it: one
 * thread per player, a white thread for the ball, and the culprit's back line as a yellow
 * curtain. His thread peeling away behind the curtain is the mistake, from any angle.
 */
export function timeColumn(ctx: Ctx): LabView {
  const { lab, c, canvas, t: tr } = ctx;
  const H = 40;
  let depth = 30;
  let sel = -1;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.0042);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
  camera.position.set(-84 * c.sgn, 46, 104);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(8 * c.sgn, -12, 0);
  controls.enableDamping = true;
  controls.minDistance = 40;
  controls.maxDistance = 320;

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(105, 68).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texOf(pitchCanvas({ line: "rgba(214,224,255,.85)", lw: 0.16 })), transparent: true, depthWrite: false }),
  );
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(109, 72).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1a2a7a, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
  );
  sheet.position.y = -0.05;
  glass.renderOrder = 5;
  sheet.renderOrder = 4;
  scene.add(sheet, glass);

  // the column's frame, with a ring every few seconds
  const frame = new THREE.Group();
  scene.add(frame);
  const ringMat = new THREE.LineBasicMaterial({ color: 0x27326e, transparent: true, opacity: 0.8 });
  const corners: [number, number][] = [[-54.5, -36], [54.5, -36], [54.5, 36], [-54.5, 36]];
  function buildFrame() {
    for (const o of [...frame.children]) {
      frame.remove(o);
      (o as THREE.Line).geometry?.dispose();
      if (o instanceof THREE.Sprite) { o.material.map?.dispose(); o.material.dispose(); }
    }
    for (const [x, z] of corners)
      frame.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, z), new THREE.Vector3(x, -H, z)]), ringMat));
    const step = depth <= 30 ? 5 : 10;
    for (let s = step; s <= depth + 0.01; s += step) {
      const y = -(s / depth) * H;
      frame.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners.map(([x, z]) => new THREE.Vector3(x, y, z))), ringMat));
      const l = label(tr("lab.sAgo", { s }), { color: "#8f97c8", bg: null, size: 34, h: 2.2, bold: false });
      l.position.set(-54.5 * c.sgn, y + 1.2, 38.5);
      frame.add(l);
    }
  }
  buildFrame();

  const threads = Array.from({ length: 22 }, () => fatLine(1.7));
  scene.add(...threads);
  const ball = fatLine(3.4, { order: 3 });
  const ghost = fatLine(2.6, { dashed: true, dash: 1.4, gap: 1, order: 3 });
  const edgeA = fatLine(1.4), edgeB = fatLine(1.4);
  scene.add(ball, ghost, edgeA, edgeB);
  const curtain = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: COL.bug, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  curtain.frustumCulled = false;
  scene.add(curtain);
  const discs = Array.from({ length: 22 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.05, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: teamCol(i), transparent: true }));
    m.renderOrder = 6;
    scene.add(m);
    return m;
  });
  const nums = discs.map((_, i) => {
    const l = label(String(lab.numbers[i]), { color: "#060918", bg: teamOf(i) ? "#ff6b5e" : "#6ea8ff", size: 30, h: 1.9 });
    scene.add(l);
    return l;
  });
  const ballDot = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const gapBar = fatLine(4, { order: 7 });
  const gapLbl = label(" ", { color: "#1a1600", bg: "#ffd60a", size: 34, h: 3.6 });
  const flag = label(tr("lab.offsideFix"), { color: "#1a1600", bg: "#ffd60a", size: 34, h: 3.6 });
  const lineGhost = fatLine(2.4, { dashed: true, dash: 1.6, gap: 1.2, order: 7 });
  scene.add(ballDot, gapBar, gapLbl, flag, lineGhost);

  const pivot = c.decisions[c.pivot];
  const pick: [number, number, number, number, number][] = [];
  const col = new THREE.Color();
  const yel = [1, 0.84, 0.04, 1, 0.84, 0.04];

  function draw(t: number) {
    const n = 150;
    const pts: number[][] = Array.from({ length: 22 }, () => []);
    const cols: number[][] = Array.from({ length: 22 }, () => []);
    const bp: number[] = [], bc: number[] = [], cp: number[] = [], gp: number[] = [], gc: number[] = [], ea: number[] = [], eb: number[] = [], ec: number[] = [];
    pick.length = 0;
    for (let k = 0; k < n; k++) {
      const age = (k / (n - 1)) * depth, ts = Math.max(t - age, c.t0), y = -(age / depth) * H;
      const fade = Math.pow(1 - k / (n - 1), 1.15) * 0.92 + 0.08;
      const f = frameAt(lab, ts), wall = wallAt(c, f), gap = gapAt(c, f);
      for (let i = 0; i < 22; i++) {
        const [x, z] = f.pos[i];
        pts[i].push(x - 52.5, y, z - 34);
        col.copy(teamCol(i));
        if (i === c.culprit && gap > 0.8) col.lerp(COL.bug, Math.min(1, (gap - 0.8) / 1.6));
        const dim = sel < 0 || sel === i ? 1 : 0.13;
        col.multiplyScalar(fade * dim * (i === c.culprit || i === c.receiver ? 1.25 : 0.85));
        cols[i].push(col.r, col.g, col.b);
        if (k % 3 === 0) pick.push([i, x - 52.5, y, z - 34, ts]);
      }
      bp.push(f.ball[0] - 52.5, y + 0.02, f.ball[1] - 34);
      col.copy(COL.ball).lerp(f.team ? COL.away : COL.home, 0.3).multiplyScalar(0.3 + 0.9 * fade * (sel < 0 ? 1 : 0.5));
      bc.push(col.r, col.g, col.b);
      cp.push(wall - 52.5, y, -34, wall - 52.5, y, 34);
      ea.push(wall - 52.5, y, -34);
      eb.push(wall - 52.5, y, 34);
      col.copy(COL.bug).multiplyScalar(fade * 0.8);
      ec.push(col.r, col.g, col.b);
      gp.push(fixedX(c, f) - 52.5, y + 0.03, f.pos[c.culprit][1] - 34);
      col.set(0xffffff).lerp(COL.bug, 0.4).multiplyScalar(fade);
      gc.push(col.r, col.g, col.b);
    }
    threads.forEach((l, i) => setLine(l, pts[i], cols[i]));
    setLine(ball, bp, bc);
    setLine(edgeA, ea, ec);
    setLine(edgeB, eb, ec);
    const idx: number[] = [];
    for (let k = 0; k < n - 1; k++) { const a = 2 * k; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    curtain.geometry.dispose();
    curtain.geometry = new THREE.BufferGeometry();
    curtain.geometry.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
    curtain.geometry.setIndex(idx);
    ghost.visible = ctx.state.fix;
    if (ctx.state.fix) setLine(ghost, gp, gc);

    const f = frameAt(lab, t), wall = wallAt(c, f), gap = gapAt(c, f);
    f.pos.forEach(([x, z], i) => {
      discs[i].position.set(x - 52.5, 0.06, z - 34);
      nums[i].position.set(x - 52.5, 2.2, z - 34);
      discs[i].material.opacity = nums[i].material.opacity = sel < 0 || sel === i ? 1 : 0.25;
    });
    discs[c.culprit].material.color.copy(gap > 0.8 ? COL.bug : teamCol(c.culprit));
    ballDot.position.set(f.ball[0] - 52.5, 0.8, f.ball[1] - 34);
    const show = gap > 0.8;
    gapBar.visible = gapLbl.visible = show;
    if (show) {
      const z = f.pos[c.culprit][1] - 34;
      setLine(gapBar, [wall - 52.5, 0.3, z, f.pos[c.culprit][0] - 52.5, 0.3, z], yel);
      relabel(gapLbl, tr("lab.behind", { m: gap.toFixed(1) }));
      gapLbl.position.set((wall + f.pos[c.culprit][0]) / 2 - 52.5, 5, z);
    }
    // with the fix the offside line moves up and the receiver is caught at the pass
    const near = !!pivot && t >= pivot.s - 1.5 && t <= pivot.s + 6;
    flag.visible = lineGhost.visible = ctx.state.fix && near;
    if (ctx.state.fix && near && pivot) {
      const fp = frameAt(lab, pivot.s - 0.5), lx = offsideLine(c, withFix(c, fp)), y = -((t - pivot.s) / depth) * H;
      setLine(lineGhost, [lx - 52.5, y + 0.2, -34, lx - 52.5, y + 0.2, 34], yel);
      const r = fp.pos[c.receiver];
      flag.visible = isOffside(c, withFix(c, fp), r[0], pivot.from[0]);
      flag.position.set(r[0] - 52.5, y + 9, r[1] - 34);
    }
    return gap;
  }

  const nearest = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let best: [number, number, number, number] | null = null, bd = 14;
    for (const [i, x, y, z, ts] of pick) {
      const [px, py] = project(new THREE.Vector3(x, y, z), camera, canvas);
      const d = Math.hypot(px - mx, py - my);
      if (d < bd) { bd = d; best = [i, ts, px, py]; }
    }
    return best;
  };
  const onMove = (e: PointerEvent) => {
    const b = nearest(e);
    if (!b) return ctx.untag();
    const [i, ts, px, py] = b;
    const sub = tr("lab.tagSub", { club: lab.clubs[teamOf(i)].name, role: tr(`lab.role.${lab.roles[i]}`, { defaultValue: "" }), clock: clock(ts) });
    ctx.tag(px, py, `${who(lab, i)}<small>${sub}${i === c.culprit ? ` · ${tr("lab.culpritTag")}` : ""}</small>`);
  };
  const click = clicks(canvas, (e) => {
    const b = nearest(e);
    const i = b ? b[0] : -1;
    sel = i === sel ? -1 : i;
  });

  const name = surname(lab, c.culprit), receiver = surname(lab, c.receiver), team = lab.clubs[teamOf(c.culprit)].name;
  return {
    scene, camera, controls, bloom: [0.75, 0.55, 0.12], start: Math.max(c.dropS - 12, c.t0),
    tools: () => [
      { id: "depth", label: tr("lab.depth", { s: depth }), on: () => { depth = depth === 30 ? 60 : depth === 60 ? 15 : 30; buildFrame(); } },
      { id: "side", label: tr("lab.sideView"), on: () => { camera.position.set(0, -14, 150); controls.target.set(0, -16, 0); } },
      { id: "top", label: tr("lab.topView"), on: () => { camera.position.set(0, 140, 1); controls.target.set(0, -10, 0); } },
    ],
    frame(t) {
      const gap = draw(t);
      const p = { name, receiver, team, scorer: surname(lab, c.scorer), trials: c.trials, base: c.baseline, fixed: c.fixed };
      if (t >= c.goalS) return { kind: "goal", k: tr("lab.call.goalK", { clock: clock(c.goalS) }), html: tr(ctx.state.fix ? "lab.call.goalFix" : "lab.call.goal", p) };
      if (pivot && t >= pivot.s - 0.5)
        return { kind: "bug", k: tr("lab.call.passK", { clock: clock(pivot.s) }), html: ctx.state.fix ? tr("lab.call.passFix", { ...p, m: c.offsideBy.toFixed(1) }) : tr("lab.call.pass", { ...p, m: Math.max(gap, c.gapAtPass).toFixed(1) }) };
      if (gap > 0.8) return { kind: "bug", k: tr("lab.call.mistakeK"), html: tr("lab.call.mistake", p) };
      return { kind: "", k: clock(t), html: tr("lab.call.calm", p) };
    },
    on() { canvas.addEventListener("pointermove", onMove); click.on(); },
    off() { canvas.removeEventListener("pointermove", onMove); click.off(); },
    dispose() { controls.dispose(); disposeScene(scene); },
  };
}
