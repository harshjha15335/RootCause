import { useEffect, useMemo, useRef } from "react";
import type { Evidence } from "../api/types";
import { pitchKit, playerInfo } from "../lib/format";
import { backLineX, chronological, metresBehind, PITCH_L, PITCH_W, rootLink } from "../lib/geometry";
import { samplePositions } from "../lib/sample";
import { useMatch } from "../store/matchStore";
import { useSelectedEvidence } from "../store/selectors";
import { useTrace } from "../store/traceStore";

const M = 3; // margin in metres

/**
 * The flat pitch: the reduced-motion and low-power stage, the placeholder while 3D loads, and
 * the illustrations in the Bug Report. Plain SVG, positions written straight to the DOM
 * every frame. With `at`, it renders a still of that second instead of following the playhead.
 */
export function Pitch({
  at,
  evidence,
  showThread = true,
  focusEvidenceId,
  className = "",
  label,
}: {
  at?: number;
  evidence?: Evidence | null;
  showThread?: boolean;
  focusEvidenceId?: string | null;
  className?: string;
  label?: string;
}) {
  const meta = useMatch((s) => s.meta);
  const order = useMatch((s) => s.track.order);
  const track = useMatch((s) => s.track);
  const version = useMatch((s) => s.trackVersion);
  const selected = useSelectedEvidence();
  const ev = evidence === undefined ? selected : evidence;
  const phase = useTrace((s) => s.phase);
  const focus = useTrace((s) => s.focus);
  const nodes = useRef<(SVGGElement | null)[]>([]);
  const ballRef = useRef<SVGCircleElement>(null);
  const traced = Boolean(ev) && (at !== undefined || phase === "traced" || phase === "review");
  const culprits = new Set(traced ? ev?.links.map((l) => l.player_id) : []);
  const root = ev ? rootLink(ev) : undefined;
  const focusLinkId = focusEvidenceId ?? focus.evidenceId;
  const focusPlayer = focus.playerId ?? ev?.links.find((l) => l.evidence_id === focusLinkId)?.player_id;

  useEffect(() => {
    const pos = new Float32Array(order.length * 2);
    const ball = new Float32Array(2);
    let raf = 0;
    const draw = () => {
      const ok = at !== undefined ? track.sample(at, pos, ball) : samplePositions(pos, ball);
      if (ok) {
        for (let i = 0; i < order.length; i++) {
          nodes.current[i]?.setAttribute("transform", `translate(${pos[i * 2] + M} ${pos[i * 2 + 1] + M})`);
        }
        ballRef.current?.setAttribute("cx", String(ball[0] + M));
        ballRef.current?.setAttribute("cy", String(ball[1] + M));
      }
      if (at === undefined) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [order, track, at, version]);

  const thread = useMemo(() => {
    if (!ev || !traced || !showThread) return null;
    const pts = chronological(ev)
      .map((l) => track.positionOf(l.player_id, l.second))
      .filter(Boolean) as [number, number][];
    pts.push([ev.goal.ball.x, ev.goal.ball.y]);
    let d = `M ${pts[0][0] + M} ${pts[0][1] + M}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2 + M;
      const my = (y0 + y1) / 2 + M - Math.min(8, Math.hypot(x1 - x0, y1 - y0) * 0.2);
      d += ` Q ${mx} ${my} ${x1 + M} ${y1 + M}`;
    }
    const r = root ? track.positionOf(root.player_id, root.second) : null;
    return { d, root: r };
  }, [ev, traced, showThread, track, root, version]);

  const backLine = useMemo(() => {
    const link = ev?.links.find((l) => l.evidence_id === focusLinkId && l.bug_type === "LATE_STEP_UP");
    if (!ev || !link) return null;
    const p = track.positionOf(link.player_id, link.second);
    const lx = p ? backLineX(link, p[0], ev) : null;
    return p && lx !== null ? { lx, cx: p[0], cy: p[1], d: metresBehind(link)!, second: link.second } : null;
  }, [ev, focusLinkId, track]);

  const showBackLine = backLine && (at !== undefined ? Math.abs(at - backLine.second) < 2 : true);

  return (
    <svg
      viewBox={`0 0 ${PITCH_L + M * 2} ${PITCH_W + M * 2}`}
      className={`block h-full w-full ${className}`}
      role="img"
      aria-label={label ?? "Pitch with 22 players and the ball"}
    >
      <rect width={PITCH_L + M * 2} height={PITCH_W + M * 2} fill="#0b1a8a" rx="1.5" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={M + (i * PITCH_L) / 12} y={M} width={PITCH_L / 12} height={PITCH_W} fill={i % 2 ? "#0e1f96" : "#0c1c90"} />
      ))}
      <g fill="none" stroke="rgb(238 240 230 / 0.7)" strokeWidth="0.25">
        <rect x={M} y={M} width={PITCH_L} height={PITCH_W} />
        <line x1={M + PITCH_L / 2} y1={M} x2={M + PITCH_L / 2} y2={M + PITCH_W} />
        <circle cx={M + PITCH_L / 2} cy={M + PITCH_W / 2} r="9.15" />
        <rect x={M} y={M + (PITCH_W - 40.32) / 2} width="16.5" height="40.32" />
        <rect x={M + PITCH_L - 16.5} y={M + (PITCH_W - 40.32) / 2} width="16.5" height="40.32" />
        <rect x={M} y={M + (PITCH_W - 18.32) / 2} width="5.5" height="18.32" />
        <rect x={M + PITCH_L - 5.5} y={M + (PITCH_W - 18.32) / 2} width="5.5" height="18.32" />
        <rect x={M - 1.5} y={M + PITCH_W / 2 - 3.66} width="1.5" height="7.32" />
        <rect x={M + PITCH_L} y={M + PITCH_W / 2 - 3.66} width="1.5" height="7.32" />
      </g>

      {showBackLine && backLine && (
        <g>
          <rect
            x={Math.min(backLine.lx, backLine.cx) + M}
            y={backLine.cy + M - 1.5}
            width={Math.abs(backLine.lx - backLine.cx)}
            height="3"
            fill="rgb(198 255 77 / 0.35)"
          />
          <line x1={backLine.lx + M} y1={M} x2={backLine.lx + M} y2={M + PITCH_W} stroke="#f3f5ff" strokeWidth="0.35" strokeDasharray="1.2 0.8" />
          <text x={(backLine.lx + backLine.cx) / 2 + M} y={backLine.cy + M - 2.6} textAnchor="middle" fontSize="2.6" fill="#c6ff4d" fontWeight="600" className="tabular-nums">
            {backLine.d.toFixed(1)} m
          </text>
        </g>
      )}

      {thread && (
        <g>
          <path d={thread.d} fill="none" stroke="#c6ff4d" strokeWidth="0.6" strokeLinecap="round" className="rc-draw" pathLength={1} />
          {thread.root && (
            <circle cx={thread.root[0] + M} cy={thread.root[1] + M} r="3.2" fill="rgb(198 255 77 / 0.16)" stroke="#c6ff4d" strokeWidth="0.45" />
          )}
        </g>
      )}

      {order.map((id, i) => {
        const info = playerInfo(meta, id);
        const { kit, trim } = pitchKit(info.side);
        const hot = culprits.has(id);
        const isFocus = focusPlayer === id;
        return (
          <g
            key={id}
            ref={(n) => (nodes.current[i] = n)}
            className={at === undefined ? "cursor-pointer" : undefined}
            onPointerEnter={at === undefined ? () => useTrace.getState().hover(ev?.links.find((l) => l.player_id === id)?.evidence_id ?? null, id) : undefined}
            onPointerLeave={at === undefined ? () => useTrace.getState().hover(null, null) : undefined}
            onClick={at === undefined ? () => useTrace.getState().pin(ev?.links.find((l) => l.player_id === id)?.evidence_id ?? null, id) : undefined}
          >
            {(hot || isFocus) && <circle r={isFocus ? 2.9 : 2.4} fill="none" stroke={hot ? "#c6ff4d" : "#f3f5ff"} strokeWidth="0.45" />}
            <circle r="1.55" fill={kit} stroke={trim} strokeWidth="0.35" />
            <text y="0.62" textAnchor="middle" fontSize="1.65" fontWeight="700" fill={trim} className="pointer-events-none select-none tabular-nums">
              {info.number}
            </text>
          </g>
        );
      })}
      <circle ref={ballRef} r="0.8" fill="#f6f7f0" stroke="#0c1d97" strokeWidth="0.2" />
    </svg>
  );
}
