import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Line2 } from "three/examples/jsm/lines/Line2.js";
import { frameAt, type Frame } from "../data";
import { isOffside, safety, threat, withFix } from "../goal";
import { BG, COL, W, arc, clicks, clock, disposeScene, fatLine, label, pitchCanvas, project, setLine, surname, teamCol, texOf, who, type Ctx, type LabView } from "./kit";

type Branch = { line: Line2; k: number; chosen: boolean; better: boolean; pts: THREE.Vector3[]; info: string };

/**
 * Forks. Every touch of the move is a floor and the move climbs from floor to floor. From each
 * touch, ghost branches fan out to every team-mate: brighter is safer, higher is more dangerous.
 * The fix re-reads every branch with the culprit on his line.
 */
export function forks(ctx: Ctx): LabView {
  const { lab, c, canvas, t: tr } = ctx;
  const GAP = 5.5;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.004);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
  camera.position.set(-48 * c.sgn, 66, 118);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(22 * c.sgn, 20, 0);
  controls.enableDamping = true;
  controls.minDistance = 30;
  controls.maxDistance = 320;

  const decs = c.decisions.map((d, k) => ({ ...d, y: k * GAP }));
  const floorTex = texOf(pitchCanvas({ line: "rgba(160,176,255,.9)", lw: 0.22, k: 10 }));
  const floors = decs.map((d) => {
    const g = new THREE.Group();
    g.position.y = d.y;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(105, 68).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(105, 68).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1530d6, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }));
    const f = frameAt(lab, d.s - 0.5);
    const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.85, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }), 22);
    const o = new THREE.Object3D();
    f.pos.forEach(([x, z], i) => {
      o.position.set(x - 52.5, 0.05, z - 34);
      o.updateMatrix();
      dots.setMatrixAt(i, o.matrix);
      dots.setColorAt(i, i === c.culprit ? COL.bug : teamCol(i));
    });
    const text = d.type === "shot" ? tr("lab.floorShot", { clock: clock(d.s), name: surname(lab, d.player) }) : tr("lab.floor", { clock: clock(d.s), from: surname(lab, d.player), to: surname(lab, d.receiver ?? d.player) });
    const lb = label(text, { color: "#e9ecff", bg: "rgba(21,48,214,.9)", size: 32, h: 3.8 });
    lb.position.set(d.from[0] - 52.5, 3.2, d.from[1] - 34);
    lb.center.set(0.5, 0);
    g.add(m, tint, dots, lb);
    scene.add(g);
    return { m, tint, dots, lb, f };
  });

  const branches: Branch[] = [];
  const ballDot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const goalRing = new THREE.Mesh(new THREE.RingGeometry(2.5, 3.2, 48).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide }));
  const offFlag = label(tr("lab.offsideFixM", { m: c.offsideBy.toFixed(1) }), { color: "#1a1600", bg: "#ffd60a", size: 34, h: 4 });
  scene.add(ballDot, goalRing, offFlag);
  const goalX = c.attack === 0 ? 105 : 0;
  const A = c.attack;

  let built: boolean | null = null;
  function build(fixed: boolean) {
    for (const b of branches) { scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); }
    branches.length = 0;
    decs.forEach((d, k) => {
      const raw = floors[k].f, f: Frame = fixed ? withFix(c, raw) : raw;
      const y0 = d.y, y1 = decs[k + 1] ? decs[k + 1].y : d.y + GAP;
      const a = W(d.from[0], d.from[1], y0);
      if (d.type === "shot") {
        const pts = arc(a, W(goalX, 34.5, y0 + 1.2), 3);
        const l = fatLine(4.5, { order: 4 });
        setLine(l, pts.flatMap((p) => [p.x, p.y, p.z]), pts.flatMap(() => [1, 1, 1]));
        scene.add(l);
        branches.push({ line: l, k, chosen: true, better: false, pts, info: tr("lab.shotTag", { name: who(lab, d.player), xg: (d.xg ?? 0).toFixed(2) }) });
        return;
      }
      const chosenS = safety(c, d.from, d.to, f), chosenV = threat(c, ...d.to);
      for (let j = A * 11 + 1; j < A * 11 + 11; j++) {
        if (j === d.player) continue;
        const chosen = j === d.receiver;
        const tgt: [number, number] = chosen ? d.to : raw.pos[j];
        const s = chosen ? chosenS : safety(c, d.from, tgt, f), v = threat(c, ...tgt);
        const offside = isOffside(c, f, raw.pos[j][0], d.from[0]);
        const better = !chosen && !offside && s >= chosenS && v > chosenV * 1.3;
        const b = W(tgt[0], tgt[1], chosen ? y1 : y0 + GAP * 0.55);
        const pts = arc(a, b, chosen ? 2.5 + a.distanceTo(b) * 0.05 : 1 + v * 40);
        const col = new THREE.Color();
        let l: Line2;
        if (chosen) {
          l = fatLine(offside ? 4 : 4.5, { order: 4, dashed: offside });
          col.set(offside ? COL.bug : 0xdfe6ff).multiplyScalar(0.8);
        } else {
          l = fatLine(better ? 2.6 : 1.5, { dashed: offside, order: 2 });
          if (offside) col.set(0x5a5f80);
          else if (better) col.copy(COL.bug);
          else col.copy(teamCol(d.player)).multiplyScalar(0.25 + 1.1 * s);
        }
        const cols = pts.flatMap((_, i) => {
          const u = i / (pts.length - 1);
          const cc = col.clone().multiplyScalar(chosen ? 1 : 0.55 + 0.45 * u);
          return [cc.r, cc.g, cc.b];
        });
        setLine(l, pts.flatMap((p) => [p.x, p.y, p.z]), cols);
        scene.add(l);
        const tags = [tr("lab.branch.safe", { p: Math.round(s * 100) }), tr("lab.branch.threat", { v: v.toFixed(2) })];
        if (offside) tags.push(tr("lab.branch.offside"));
        if (better) tags.push(tr("lab.branch.better"));
        branches.push({ line: l, k, chosen, better, pts, info: `${chosen ? tr("lab.branch.played") : ""}${surname(lab, d.player)} → ${who(lab, j)}<small>${tags.join(" · ")}</small>` });
      }
    });
    built = fixed;
  }

  let hover: Branch | null = null;
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let best: [Branch, number, number] | null = null, bd = 12;
    for (const b of branches) {
      if (!b.line.visible) continue;
      for (let i = 2; i < b.pts.length; i += 3) {
        const [px, py] = project(b.pts[i], camera, canvas);
        const d = Math.hypot(px - mx, py - my);
        if (d < bd) { bd = d; best = [b, px, py]; }
      }
    }
    hover = best ? best[0] : null;
    if (!best) return ctx.untag();
    ctx.tag(best[1], best[2], best[0].info);
  };
  const click = clicks(canvas, () => { if (hover) ctx.seek(decs[hover.k].s - 0.3); });
  const kOf = (t: number) => { let k = 0; decs.forEach((d, i) => { if (t >= d.s - 0.3) k = i; }); return k; };

  const name = surname(lab, c.culprit), receiver = surname(lab, c.receiver);
  return {
    scene, camera, controls, bloom: [0.32, 0.4, 0.4], start: decs.length ? decs[0].s - 1 : c.t0,
    tools: () => [
      { id: "prev", label: tr("lab.prevTouch"), on: () => decs.length && ctx.seek(decs[Math.max(kOf(ctx.state.t) - 1, 0)].s - 0.3) },
      { id: "next", label: tr("lab.nextTouch"), on: () => decs.length && ctx.seek(decs[Math.min(kOf(ctx.state.t) + 1, decs.length - 1)].s - 0.3) },
    ],
    frame(t) {
      if (built !== ctx.state.fix) build(ctx.state.fix);
      const p = { name, receiver, scorer: surname(lab, c.scorer), trials: c.trials, base: c.baseline, fixed: c.fixed, n: decs.length };
      if (!decs.length) return { kind: "", k: clock(t), html: "" };
      const k = kOf(t), dead = ctx.state.fix && c.pivot >= 0 && c.offsideBy > 0 ? c.pivot : 99;
      floors.forEach((fl, i) => {
        const on = i === k, gone = i > dead;
        fl.m.material.opacity = gone ? 0.03 : on ? 0.75 : 0.16;
        fl.tint.material.opacity = on ? 0.16 : 0.03;
        fl.dots.visible = !gone && Math.abs(i - k) <= 1;
        fl.dots.material.opacity = on ? 1 : 0.35;
        fl.lb.visible = on && !gone;
      });
      for (const b of branches) {
        b.line.visible = b.k <= dead && (b.chosen || b.k === k || b.better);
        b.line.material.opacity = b.k === k || b.chosen ? 1 : 0.5;
      }
      // the ball runs along the branches that were played
      const d = decs[k], nx = decs[k + 1];
      const played = branches.find((b) => b.k === k && b.chosen);
      if (played) {
        const u = nx ? Math.min(Math.max((t - d.s + 0.3) / Math.max(nx.s - d.s, 0.6), 0), 1) : Math.min(Math.max(t - d.s + 0.3, 0), 1);
        ballDot.position.copy(played.pts[Math.min(Math.floor(u * (played.pts.length - 1)), played.pts.length - 1)]);
      }
      ballDot.visible = k <= dead;
      const top = decs[decs.length - 1];
      goalRing.position.copy(W(goalX, 34.5, top.y + 1.2));
      goalRing.visible = dead === 99;
      goalRing.scale.setScalar(1 + 0.15 * Math.sin(performance.now() / 300));
      const pv = decs[c.pivot];
      offFlag.visible = dead !== 99 && !!pv;
      if (pv) offFlag.position.copy(W(pv.to[0], pv.to[1], pv.y + GAP + 3));
      controls.target.y += (Math.min(d.y, top.y) + 2 - controls.target.y) * 0.03;

      if (dead !== 99 && k >= dead) return { kind: "bug", k: tr("lab.call.fixK", { clock: clock(pv.s) }), html: tr("lab.call.forksFix", { ...p, m: c.offsideBy.toFixed(1) }) };
      if (d.type === "shot") return { kind: "goal", k: tr("lab.call.goalK", { clock: clock(c.goalS) }), html: tr(ctx.state.fix ? "lab.call.goalFix" : "lab.call.forksGoal", p) };
      if (k === c.pivot) return { kind: "bug", k: tr("lab.call.passK", { clock: clock(d.s) }), html: tr("lab.call.forksPass", { ...p, m: c.gapAtPass.toFixed(1) }) };
      const opts = branches.filter((b) => b.k === k).length, better = branches.filter((b) => b.k === k && b.better).length;
      return {
        kind: "",
        k: tr("lab.call.touchK", { clock: clock(d.s), k: k + 1, n: decs.length }),
        html: better ? tr("lab.call.touchBetter", { name: surname(lab, d.player), n: opts, b: better }) : tr("lab.call.touch", { name: surname(lab, d.player), n: opts }),
      };
    },
    on() { canvas.addEventListener("pointermove", onMove); click.on(); },
    off() { canvas.removeEventListener("pointermove", onMove); click.off(); },
    dispose() { controls.dispose(); disposeScene(scene); },
  };
}

