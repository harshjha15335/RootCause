import * as THREE from "three";
import { frameAt, type Frame } from "../data";
import { fixedX, gapAt, isOffside, offsideLine, safety, teamOf, wallAt, withFix } from "../goal";
import { COL, clock, disposeScene, fatLine, label, pitchCanvas, setLine, surname, teamCol, texOf, type Ctx, type LabView } from "./kit";

/**
 * Their Eyes. Stand inside a player at head height. Opponents' reach glows on the grass, the
 * open passing lanes light up, and the culprit's back line is a yellow wall. As the culprit,
 * the wall is in front of you, not beside you.
 */
export function theirEyes(ctx: Ctx): LabView {
  const { lab, c, canvas, mini, t: tr } = ctx;
  const scene = new THREE.Scene();
  const sky = document.createElement("canvas");
  sky.width = 4;
  sky.height = 256;
  const sg = sky.getContext("2d")!;
  const grd = sg.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#03050f");
  grd.addColorStop(0.55, "#0d1850");
  grd.addColorStop(1, "#1a2a6c");
  sg.fillStyle = grd;
  sg.fillRect(0, 0, 4, 256);
  scene.background = texOf(sky);
  scene.fog = new THREE.Fog(0x0d1645, 40, 160);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x0b1a12, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-30, 60, 20);
  scene.add(sun);
  scene.add(new THREE.Mesh(
    new THREE.PlaneGeometry(125, 88).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: texOf(pitchCanvas({ fill: "#0e2f22", stripes: "#113726", line: "rgba(235,240,255,.85)", lw: 0.12, pad: 10, k: 16 })), roughness: 0.95 }),
  ));

  const people = Array.from({ length: 22 }, (_, i) => {
    const g = new THREE.Group();
    const away = teamOf(i) === 1;
    const mat = new THREE.MeshStandardMaterial({ color: away ? 0xb23a3a : 0x2a5fb0, emissive: away ? 0x3a0c0c : 0x0b1e44, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.85, 4, 12), mat);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd9b48f, roughness: 0.8 }));
    head.position.y = 1.68;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }));
    shadow.position.y = 0.02;
    const glow = { color: teamCol(i), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const;
    const reach = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...glow, opacity: 0.55 }));
    reach.position.y = 0.04;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...glow, opacity: 0.08 }));
    disc.position.y = 0.03;
    const n = label(`${lab.numbers[i]} ${surname(lab, i)}`, { color: "#060918", bg: away ? "#ff8a7f" : "#8cbcff", size: 30, h: 0.55 });
    n.position.y = 2.25;
    g.add(body, head, shadow, reach, disc, n);
    scene.add(g);
    return { g, mat, reach, disc, n };
  });
  const ballM = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x666666 }));
  const wallM = new THREE.Mesh(
    new THREE.PlaneGeometry(68, 2.4).rotateY(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: COL.bug, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  wallM.position.y = 1.2;
  const wallTop = fatLine(3, { order: 3 });
  const wallLbl = label(tr("lab.theLine", { team: lab.clubs[teamOf(c.culprit)].name }), { color: "#1a1600", bg: "#ffd60a", size: 32, h: 0.7 });
  const ghostMe = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.85, 4, 12), new THREE.MeshBasicMaterial({ color: COL.bug, transparent: true, opacity: 0.45 }));
  const ghostLbl = label(tr("lab.shouldBe", { name: surname(lab, c.culprit) }), { color: "#1a1600", bg: "#ffd60a", size: 32, h: 0.32 });
  scene.add(ballM, wallM, wallTop, wallLbl, ghostMe, ghostLbl);
  const lanes = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.y = 0.05;
    scene.add(m);
    return m;
  });

  let me = c.culprit, ballCam = false, yawOff = 0, pitchOff = 0, lastYaw: number | null = null;
  let drag: [number, number, number, number] | null = null;
  const lookFrom = new THREE.Vector3(), lookAt = new THREE.Vector3(), dirV = new THREE.Vector3();
  const pitchImg = pitchCanvas({ line: "rgba(200,210,255,.5)", lw: 0.35, k: 4 });
  const g2 = mini.getContext("2d")!;
  const yel = [1, 0.84, 0.04, 1, 0.84, 0.04];

  function drawMini(f: Frame) {
    const w = mini.width, h = mini.height, k = w / 115;
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.clearRect(0, 0, w, h);
    g2.translate(5 * k, (h - 68 * k) / 2);
    g2.scale(k, k);
    g2.drawImage(pitchImg, 0, 0, 105, 68);
    const wall = wallAt(c, f);
    g2.strokeStyle = "#ffd60a";
    g2.lineWidth = 0.6;
    g2.beginPath(); g2.moveTo(wall, 0); g2.lineTo(wall, 68); g2.stroke();
    const p = ballCam ? f.pos[Math.max(f.carrier, 0)] : f.pos[me];
    camera.getWorldDirection(dirV);
    const ang = Math.atan2(dirV.z, dirV.x);
    g2.fillStyle = "rgba(233,236,255,.14)";
    g2.beginPath(); g2.moveTo(p[0], p[1]); g2.arc(p[0], p[1], 30, ang - 0.55, ang + 0.55); g2.fill();
    f.pos.forEach(([x, y], i) => {
      g2.fillStyle = i === c.culprit ? "#ffd60a" : teamOf(i) ? "#ff6b5e" : "#6ea8ff";
      g2.beginPath(); g2.arc(x, y, i === me && !ballCam ? 2.4 : 1.4, 0, 7); g2.fill();
      if (i === me && !ballCam) { g2.strokeStyle = "#fff"; g2.lineWidth = 0.5; g2.stroke(); }
    });
    g2.fillStyle = "#fff";
    g2.beginPath(); g2.arc(f.ball[0], f.ball[1], 0.9, 0, 7); g2.fill();
  }
  const become = (i: number) => { me = i; ballCam = false; yawOff = 0; lastYaw = null; ctx.refresh(); };
  const onMini = (e: MouseEvent) => {
    const r = mini.getBoundingClientRect(), k = r.width / 115;
    const x = (e.clientX - r.left) / k - 5, y = (e.clientY - r.top - (r.height - 68 * k) / 2) / k;
    const f = frameAt(lab, ctx.state.t);
    let best = 0, bd = 1e9;
    f.pos.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
    become(best);
  };
  const onDown = (e: PointerEvent) => (drag = [e.clientX, e.clientY, yawOff, pitchOff]);
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    yawOff = drag[2] - (e.clientX - drag[0]) * 0.006;
    pitchOff = Math.max(-0.5, Math.min(0.4, drag[3] - (e.clientY - drag[1]) * 0.004));
  };
  const onUp = () => (drag = null);

  const name = surname(lab, c.culprit), receiver = surname(lab, c.receiver);
  const pivot = c.decisions[c.pivot];
  return {
    scene, camera, controls: null, bloom: [0.3, 0.35, 0.75], start: Math.max(c.dropS - 9, c.t0),
    tools: () => [
      { id: "culprit", label: tr("lab.be", { name: `${name} (#${lab.numbers[c.culprit]})` }), pressed: !ballCam && me === c.culprit, on: () => become(c.culprit) },
      { id: "receiver", label: tr("lab.be", { name: `${receiver} (#${lab.numbers[c.receiver]})` }), pressed: !ballCam && me === c.receiver, on: () => become(c.receiver) },
      { id: "ball", label: tr("lab.followBall"), pressed: ballCam, on: () => { ballCam = !ballCam; lastYaw = null; } },
    ],
    frame(t, dt) {
      const f = frameAt(lab, t), f2 = frameAt(lab, t + 0.2), wall = wallAt(c, f);
      const myTeam = teamOf(ballCam ? Math.max(f.carrier, 0) : me);
      f.pos.forEach(([x, z], i) => {
        const P = people[i];
        P.g.position.set(x - 52.5, 0, z - 34);
        const vx = f2.pos[i][0] - x, vz = f2.pos[i][1] - z, sp = Math.hypot(vx, vz) * 5;
        if (sp > 0.2) P.g.rotation.y = Math.atan2(-vz, vx);
        // nobody stands inside the camera, and names close up would fill the screen
        const near = ballCam ? 99 : Math.hypot(x - f.pos[me][0], z - f.pos[me][1]);
        P.g.visible = ballCam || (i !== me && near > 1.2);
        P.n.visible = near > 6;
        const r = 1.2 + sp * 0.45;
        P.reach.scale.setScalar(r);
        P.disc.scale.setScalar(r);
        P.reach.visible = P.disc.visible = teamOf(i) !== myTeam;
        P.mat.emissive.set(i === c.culprit ? 0x4a3a00 : teamOf(i) ? 0x3a0c0c : 0x0b1e44);
        P.n.material.opacity = i === c.culprit || i === c.receiver || i === f.carrier ? 1 : 0.7;
      });
      ballM.position.set(f.ball[0] - 52.5, 0.13, f.ball[1] - 34);
      wallM.position.set(wall - 52.5, 1.2, 0);
      setLine(wallTop, [wall - 52.5, 2.4, -34, wall - 52.5, 2.4, 34], yel);
      wallLbl.position.set(wall - 52.5, 3.1, f.pos[c.culprit][1] - 34 + 6);

      // passing lanes from the man on the ball
      const car = Math.max(f.carrier, 0), ct = teamOf(car);
      let li = 0, open = 0;
      for (let j = ct * 11 + 1; j < ct * 11 + 11; j++) {
        if (j === car || li >= lanes.length) continue;
        const L = lanes[li++], a = f.pos[car], b = f.pos[j];
        const s = ct === c.attack ? safety(c, a, b, f) : 0.3;
        if (s > 0.5) open++;
        L.scale.set(Math.hypot(b[0] - a[0], b[1] - a[1]), 1, 0.5 + s * 0.9);
        L.position.set((a[0] + b[0]) / 2 - 52.5, 0.05, (a[1] + b[1]) / 2 - 34);
        L.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
        L.material.color.copy(teamCol(car));
        L.material.opacity = 0.03 + 0.32 * s * s;
      }
      for (; li < lanes.length; li++) lanes[li].material.opacity = 0;

      const gap = gapAt(c, f);
      ghostMe.visible = ghostLbl.visible = ctx.state.fix && gap > 0.8;
      ghostMe.position.set(fixedX(c, f) - 52.5, 0.95, f.pos[c.culprit][1] - 34);
      ghostLbl.position.set(fixedX(c, f) - 52.5, 2.05, f.pos[c.culprit][1] - 34);

      if (ballCam) {
        const p = f.pos[car], dir = ct === 0 ? 1 : -1;
        lookFrom.set(p[0] - 52.5 - dir * 9, 4.5, p[1] - 34 + 2);
        lookAt.set(p[0] - 52.5 + dir * 12, 0.5, p[1] - 34);
        camera.position.lerp(lookFrom, lastYaw === null ? 1 : 0.08);
        lastYaw = 0;
        camera.lookAt(lookAt);
      } else {
        const p = f.pos[me];
        camera.position.set(p[0] - 52.5, 1.7, p[1] - 34);
        const target = Math.atan2(f.ball[1] - p[1], f.ball[0] - p[0]);
        if (lastYaw === null) lastYaw = target;
        const d = Math.atan2(Math.sin(target - lastYaw), Math.cos(target - lastYaw));
        lastYaw += d * Math.min(1, dt * 3);
        if (!drag) { yawOff *= 1 - Math.min(1, dt * 0.8); pitchOff *= 1 - Math.min(1, dt * 0.8); }
        const yaw = lastYaw + yawOff, pit = -0.06 + pitchOff;
        camera.lookAt(camera.position.x + Math.cos(yaw) * Math.cos(pit), 1.7 + Math.sin(pit), camera.position.z + Math.sin(yaw) * Math.cos(pit));
      }
      drawMini(f);

      const p = { name, receiver, scorer: surname(lab, c.scorer), trials: c.trials, base: c.baseline, fixed: c.fixed };
      const youK = ballCam ? tr("lab.call.ballK", { clock: clock(t) }) : tr("lab.call.youK", { name: surname(lab, me), clock: clock(t) });
      if (t >= c.goalS) return { kind: "goal", k: tr("lab.call.goalK", { clock: clock(c.goalS) }), html: tr(ctx.state.fix ? "lab.call.eyesGoalFix" : "lab.call.eyesGoal", p) };
      if (!ballCam && me === c.culprit && gap > 0.8)
        return { kind: "bug", k: youK, html: tr(pivot && t >= pivot.s - 1 ? "lab.call.youCulpritLate" : "lab.call.youCulprit", { ...p, m: gap.toFixed(1) }) };
      if (!ballCam && me === c.receiver) {
        const fx = withFix(c, f), x = f.pos[me][0];
        const off = gap > 0.8 && isOffside(c, fx, x, f.ball[0]) && !isOffside(c, f, x, f.ball[0]);
        return { kind: off ? "bug" : "", k: youK, html: off ? tr("lab.call.youReceiverOff", { ...p, m: Math.abs(offsideLine(c, f) - x).toFixed(1) }) : tr("lab.call.youReceiver") };
      }
      return { kind: "", k: youK, html: tr("lab.call.lanes", { open, n: 10 }) };
    },
    on() {
      mini.hidden = false;
      canvas.addEventListener("pointerdown", onDown);
      addEventListener("pointermove", onMove);
      addEventListener("pointerup", onUp);
      mini.addEventListener("click", onMini);
    },
    off() {
      mini.hidden = true;
      canvas.removeEventListener("pointerdown", onDown);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      mini.removeEventListener("click", onMini);
    },
    dispose() { disposeScene(scene); },
  };
}
