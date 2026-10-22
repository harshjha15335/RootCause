import { Billboard, Html, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CatmullRomCurve3,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  TubeGeometry,
  Vector3,
} from "three";
import type { Evidence } from "../api/types";
import { backLineX, chronological, goalEnd, metresBehind, PITCH_L, PITCH_W, rootLink } from "../lib/geometry";
import { playerInfo, surname } from "../lib/format";
import { samplePositions } from "../lib/sample";
import { useMatch } from "../store/matchStore";
import { useSelectedEvidence } from "../store/selectors";
import { playhead, useTrace } from "../store/traceStore";
import { makePitchTexture } from "./pitchTexture";
import { useUi } from "../store/uiStore";
// a local font: troika would otherwise fetch one from a CDN at runtime
import numberFont from "@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff?url";

const FLARE = new Color("#ff8a3d");
const CHALK = new Color("#eef0e6");
const HX = PITCH_L / 2;
const HZ = PITCH_W / 2;
const PLAYER_SCALE = 1.7; // exaggerated so 22 players read at broadcast distance

const pos = new Float32Array(44);
const ball = new Float32Array(2);

/** Pitch metres (x along length, y across) to world (X right, Z toward camera). */
const wx = (x: number) => x - HX;
const wz = (y: number) => y - HZ;

export default function Stage() {
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 1.75]}
      camera={{ fov: 32, near: 1, far: 600, position: [0, 60, 80] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => useTrace.getState().hover(null, null)}
    >
      <color attach="background" args={["#0f1e19"]} />
      <fog attach="fog" args={["#0f1e19", 130, 260]} />
      <hemisphereLight args={["#eef0e6", "#0f1e19", 1.1]} />
      <directionalLight position={[-30, 80, 40]} intensity={1.6} />
      <CameraRig />
      <Pitch />
      <Goals />
      <Players />
      <Ball />
      <Thread />
      <BackLine />
    </Canvas>
  );
}

function Pitch() {
  const tex = useMemo(() => makePitchTexture(6), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial color="#0f1e19" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[PITCH_L + 12, PITCH_W + 12]} />
        <meshStandardMaterial map={tex} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

function Goals() {
  const frame = (end: 0 | 1) => {
    const x = end ? HX + 1 : -HX - 1;
    return (
      <group key={end} position={[x, 0, 0]}>
        {[-3.66, 3.66].map((z) => (
          <mesh key={z} position={[0, 1.22, z]}>
            <boxGeometry args={[0.15, 2.44, 0.15]} />
            <meshBasicMaterial color={CHALK} />
          </mesh>
        ))}
        <mesh position={[0, 2.44, 0]}>
          <boxGeometry args={[0.15, 0.15, 7.47]} />
          <meshBasicMaterial color={CHALK} />
        </mesh>
        <mesh position={[end ? 1 : -1, 1.22, 0]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[7.32, 2.44]} />
          <meshBasicMaterial color={CHALK} transparent opacity={0.12} />
        </mesh>
      </group>
    );
  };
  return (
    <>
      {frame(0)}
      {frame(1)}
    </>
  );
}

/**
 * Broadcast angle by default; swoops to the goal mouth on a goal; frames the chain once traced;
 * follows focus. Distances are fitted to the viewport so the framing holds from phone to desktop.
 * Portrait screens look down the length of the pitch from behind a goal.
 */
function CameraRig() {
  const { camera, size } = useThree();
  const target = useRef(new Vector3(0, 0, 0));
  const want = useRef(new Vector3());
  const wantTarget = useRef(new Vector3());
  const dir = useRef(new Vector3());
  const ev = useSelectedEvidence();

  useFrame((_, dt) => {
    const tr = useTrace.getState();
    const m = useMatch.getState();
    const portrait = size.width / size.height < 0.9;
    // copy overlaid on the left (home hero): shift the projection so the scene centres in the rest
    const inset = portrait ? 0 : useUi.getState().stageInset;
    const cam = camera as PerspectiveCamera;
    if (inset > 0) cam.setViewOffset(size.width, size.height, (-inset * size.width) / 2, 0, size.width, size.height);
    else if (cam.view?.enabled) cam.clearViewOffset();
    const aspect = (size.width * (1 - inset)) / size.height;
    const vfov = MathUtils.degToRad(cam.fov ?? 32);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    /** distance that fits `across` metres horizontally and `deep` metres of ground in view */
    const fit = (across: number, deep: number, elev: number) => {
      const d1 = across / 2 / Math.tan(hfov / 2);
      const d2 = (deep * Math.sin(elev)) / 2 / Math.tan(vfov / 2);
      return Math.max(d1, d2);
    };
    const view = (elev: number) =>
      portrait ? dir.current.set(-Math.cos(elev), Math.sin(elev), 0) : dir.current.set(0, Math.sin(elev), Math.cos(elev));
    let damping = 2.2;

    const lastGoal = m.goals[m.goals.length - 1];
    if ((tr.phase === "goal" || tr.phase === "tracing") && lastGoal) {
      const ge = m.events.find((e) => e.id === lastGoal.eventId);
      const gx = ge && ge.ball.x < HX ? -HX : HX;
      const side = gx < 0 ? 1 : -1;
      wantTarget.current.set(gx + side * 10, 0, 0);
      dir.current.set(side * 0.62, 0.55, portrait ? 0 : 0.56).normalize();
      want.current.copy(wantTarget.current).addScaledVector(dir.current, fit(portrait ? 34 : 38, 26, 0.6));
      damping = 1.5;
    } else if (tr.focus.playerId || tr.focus.evidenceId) {
      const link = ev?.links.find((l) => l.evidence_id === tr.focus.evidenceId);
      const pid = tr.focus.playerId ?? link?.player_id;
      const p = pid ? m.track.positionOf(pid, playhead.t) : null;
      if (p) {
        wantTarget.current.set(wx(p[0]), 0, wz(p[1]));
        want.current.copy(wantTarget.current).addScaledVector(view(0.95), fit(portrait ? 30 : 50, 34, 0.95));
      }
    } else if (tr.phase === "traced" && ev) {
      const pts = ev.links.map((l) => m.track.positionOf(l.player_id, l.second)).filter(Boolean) as [number, number][];
      pts.push([ev.goal.ball.x, ev.goal.ball.y]);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const spanX = Math.max(...xs) - Math.min(...xs) + 26;
      const spanY = Math.max(...ys) - Math.min(...ys) + 22;
      wantTarget.current.set(wx(cx), 0, wz(cy));
      const elev = 0.92;
      const d = portrait ? fit(spanY, spanX, elev) : fit(spanX, spanY, elev);
      want.current.copy(wantTarget.current).addScaledVector(view(elev), d);
    } else {
      // like a TV camera: follow the ball, about 60 m of pitch in view
      const elev = portrait ? 0.95 : 0.74;
      const bx = MathUtils.clamp(wx(ball[0]), portrait ? -32 : -24, portrait ? 32 : 24);
      wantTarget.current.set(portrait ? bx + 8 : bx, 0, portrait ? 0 : 3);
      const d = portrait ? fit(PITCH_W + 4, 56, elev) : fit(66, 52, elev);
      want.current.copy(wantTarget.current).addScaledVector(view(elev), d);
      damping = 1.4;
    }
    const k = 1 - Math.exp(-damping * dt);
    camera.position.lerp(want.current, k);
    target.current.lerp(wantTarget.current, k);
    camera.lookAt(target.current);
  });
  return null;
}

function Players() {
  const meta = useMatch((s) => s.meta);
  const order = useMatch((s) => s.track.order);
  const ev = useSelectedEvidence();
  const phase = useTrace((s) => s.phase);
  const focus = useTrace((s) => s.focus);
  const groups = useRef<(Group | null)[]>([]);
  const culprits = useMemo(() => new Set(phase === "traced" || phase === "review" ? ev?.links.map((l) => l.player_id) ?? [] : []), [ev, phase]);
  const root = ev ? rootLink(ev)?.player_id : undefined;
  const focusId = focus.playerId ?? ev?.links.find((l) => l.evidence_id === focus.evidenceId)?.player_id ?? null;

  useFrame(() => {
    if (!samplePositions(pos, ball)) return;
    for (let i = 0; i < order.length; i++) {
      const g = groups.current[i];
      if (g) g.position.set(wx(pos[i * 2]), 0, wz(pos[i * 2 + 1]));
    }
  });

  const onOver = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const link = ev?.links.find((l) => l.player_id === id);
    useTrace.getState().hover(link?.evidence_id ?? null, id);
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    useTrace.getState().hover(null, null);
    document.body.style.cursor = "";
  };
  const onClick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const link = ev?.links.find((l) => l.player_id === id);
    useTrace.getState().pin(link?.evidence_id ?? null, id);
  };

  return (
    <>
      {order.map((id, i) => {
        const info = playerInfo(meta, id);
        const kit = info.club?.kit_primary ?? (info.side === "home" ? "#3b6ea8" : "#9a4848");
        const trim = info.club?.kit_secondary ?? "#eef0e6";
        const isCulprit = culprits.has(id);
        const isFocus = focusId === id;
        return (
          <group key={id} ref={(g) => (groups.current[i] = g)}>
            <group scale={PLAYER_SCALE} onPointerOver={onOver(id)} onPointerOut={onOut} onClick={onClick(id)}>
              <mesh position-y={0.9}>
                <capsuleGeometry args={[0.32, 0.9, 4, 12]} />
                <meshStandardMaterial color={kit} roughness={0.7} />
              </mesh>
              <mesh position-y={1.62}>
                <sphereGeometry args={[0.2, 12, 12]} />
                <meshStandardMaterial color={trim} roughness={0.6} />
              </mesh>
              <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
                <circleGeometry args={[0.55, 20]} />
                <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
              </mesh>
            </group>
            {(isCulprit || isFocus) && (
              <Ring color={isCulprit ? FLARE : CHALK} pulse={id === root} radius={isFocus ? 2.3 : 1.8} />
            )}
            <Billboard position-y={PLAYER_SCALE * 2.25}>
              <Text font={numberFont} fontSize={isFocus ? 1.5 : 1.05} color={isCulprit ? "#ff8a3d" : "#eef0e6"} outlineWidth={0.06} outlineColor="#0f1e19" anchorY="bottom">
                {String(info.number ?? "")}
              </Text>
            </Billboard>
            {isFocus && (
              <Html position={[0, PLAYER_SCALE * 3.4, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
                <div className="whitespace-nowrap rounded-md bg-turf-deep/90 px-2 py-1 font-body text-[13px] text-chalk shadow-lg ring-1 ring-turf-edge">
                  <span className="tabular-nums text-chalk-dim">{info.number}</span> {surname(info.name)}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}

function Ring({ color, pulse, radius }: { color: Color; pulse?: boolean; radius: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = pulse ? 1 + Math.sin(clock.elapsedTime * 3) * 0.08 : 1;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.05}>
      <ringGeometry args={[radius - 0.28, radius, 40]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.95} />
    </mesh>
  );
}

function Ball() {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current || !samplePositions(pos, ball)) return;
    ref.current.position.set(wx(ball[0]), 0, wz(ball[1]));
  });
  return (
    <group ref={ref}>
      <mesh position-y={0.55}>
        <sphereGeometry args={[0.55, 20, 20]} />
        <meshStandardMaterial color="#f6f7f0" roughness={0.35} emissive="#eef0e6" emissiveIntensity={0.25} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <circleGeometry args={[0.6, 16]} />
        <meshBasicMaterial color="#000" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * The causal chain as one line, drawn backward from the goal to the root cause, ending on a
 * breakpoint at the spot where the root mistake was made.
 */
function Thread() {
  const ev = useSelectedEvidence();
  const phase = useTrace((s) => s.phase);
  const visible = Boolean(ev) && (phase === "traced" || phase === "review");
  return visible && ev ? <ThreadLine key={ev.goal_id} ev={ev} /> : null;
}

function ThreadLine({ ev }: { ev: Evidence }) {
  const track = useMatch((s) => s.track);
  const meshRef = useRef<Mesh>(null);
  const progress = useRef(0);
  const [root, setRoot] = useState<[number, number] | null>(null);
  const nodes = useMemo(
    () => ev.links.map((l) => ({ id: l.evidence_id, p: track.positionOf(l.player_id, l.second) })).filter((n) => n.p) as { id: string; p: [number, number] }[],
    [ev, track],
  );

  const geometry = useMemo(() => {
    const links = chronological(ev);
    const pts: Vector3[] = [new Vector3(wx(ev.goal.ball.x), 0.25, wz(ev.goal.ball.y))];
    for (const l of [...links].reverse()) {
      const p = track.positionOf(l.player_id, l.second);
      if (!p) continue;
      const prev = pts[pts.length - 1];
      const here = new Vector3(wx(p[0]), 0.25, wz(p[1]));
      const mid = prev.clone().lerp(here, 0.5);
      mid.y = 0.25 + Math.min(2.5, prev.distanceTo(here) * 0.08);
      pts.push(mid, here);
    }
    if (pts.length < 2) return null;
    const curve = new CatmullRomCurve3(pts, false, "centripetal");
    return new TubeGeometry(curve, 240, 0.16, 8, false);
  }, [ev, track]);

  useEffect(() => {
    const r = rootLink(ev);
    setRoot(r ? track.positionOf(r.player_id, r.second) : null);
    progress.current = 0;
  }, [ev, track]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  useFrame((_, dt) => {
    if (!geometry || !meshRef.current) return;
    progress.current = Math.min(1, progress.current + dt / 1.6);
    const eased = 1 - Math.pow(1 - progress.current, 3);
    const total = geometry.index!.count;
    geometry.setDrawRange(0, Math.floor((total * eased) / 6) * 6);
    (meshRef.current.material as MeshBasicMaterial).opacity = 0.9;
  });

  if (!geometry) return null;
  return (
    <>
      <mesh ref={meshRef} geometry={geometry}>
        <meshBasicMaterial color={FLARE} toneMapped={false} transparent opacity={0.9} />
      </mesh>
      {nodes.map((n) => (
        <mesh key={n.id} rotation-x={-Math.PI / 2} position={[wx(n.p[0]), 0.08, wz(n.p[1])]}>
          <circleGeometry args={[0.7, 24]} />
          <meshBasicMaterial color={FLARE} toneMapped={false} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[wx(ev.goal.ball.x), 0.08, wz(ev.goal.ball.y)]}>
        <ringGeometry args={[0.6, 0.95, 24]} />
        <meshBasicMaterial color={CHALK} toneMapped={false} />
      </mesh>
      {root && <Breakpoint x={wx(root[0])} z={wz(root[1])} />}
    </>
  );
}

function Breakpoint({ x, z }: { x: number; z: number }) {
  const ref = useRef<Group>(null);
  const born = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    born.current ??= clock.elapsedTime;
    const age = clock.elapsedTime - born.current;
    // appears as the thread arrives, then breathes
    const s = age < 1.5 ? 0 : MathUtils.damp(ref.current.scale.x, 1, 6, 1 / 60);
    ref.current.scale.setScalar(s * (1 + Math.sin(clock.elapsedTime * 2.4) * 0.05));
  });
  return (
    <group ref={ref} position={[x, 0, z]} scale={0}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.06}>
        <ringGeometry args={[3.1, 3.5, 48]} />
        <meshBasicMaterial color={FLARE} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.05}>
        <circleGeometry args={[3.1, 48]} />
        <meshBasicMaterial color={FLARE} transparent opacity={0.16} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh position-y={4}>
        <cylinderGeometry args={[0.07, 0.07, 8, 8]} />
        <meshBasicMaterial color={FLARE} transparent opacity={0.7} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * For a late step-up in focus: the line the back four held, and how far behind it the
 * culprit stood, at the second the Debugger flagged.
 */
function BackLine() {
  const ev = useSelectedEvidence();
  const focusId = useTrace((s) => s.focus.evidenceId);
  const track = useMatch((s) => s.track);
  const group = useRef<Group>(null);
  const link = ev?.links.find((l) => l.evidence_id === focusId && l.bug_type === "LATE_STEP_UP");
  const geo = useMemo(() => {
    if (!ev || !link) return null;
    const p = track.positionOf(link.player_id, link.second);
    if (!p) return null;
    const lx = backLineX(link, p[0], ev);
    return lx === null ? null : { cx: p[0], cy: p[1], lx, d: metresBehind(link)!, end: goalEnd(ev) };
  }, [ev, link, track]);

  const [near, setNear] = useState(false);
  useFrame(() => {
    const n = link ? Math.abs(playhead.t - link.second) < 2.5 : false;
    if (n !== near) setNear(n);
  });
  if (!geo) return null;
  const width = Math.abs(geo.lx - geo.cx);
  return (
    <group ref={group} visible={near}>
      <mesh rotation-x={-Math.PI / 2} position={[wx(geo.lx), 0.04, 0]}>
        <planeGeometry args={[0.4, PITCH_W]} />
        <meshBasicMaterial color={CHALK} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[wx((geo.lx + geo.cx) / 2), 0.035, wz(geo.cy)]}>
        <planeGeometry args={[width, 3]} />
        <meshBasicMaterial color={FLARE} transparent opacity={0.35} toneMapped={false} depthWrite={false} />
      </mesh>
      {near && <Html position={[wx((geo.lx + geo.cx) / 2), 2.5, wz(geo.cy) + 3]} center style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded-md bg-flare px-2 py-0.5 font-body text-[13px] font-semibold text-flare-ink tabular-nums">
          {geo.d.toFixed(1)} m
        </div>
      </Html>}
    </group>
  );
}
