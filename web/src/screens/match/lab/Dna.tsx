import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PHASES, SECONDS, type Lab } from "../../../lab/data";
import { INK } from "./draw";

export type Marker = { s: number; kind: "goal" | "shot" | "fault"; team: number; size?: number };

const ALPHA = [0.28, 0.5, 0.78, 1];

/**
 * Match DNA: 90 minutes as two waves, home above the line and away below. A wave rises with how
 * much of the ball a side has and how far up the pitch it takes it, and is brighter the closer to
 * goal the phase is (build-up, progression, final third), solid on counters. Shots, goals and the traced faults sit on top. Drag anywhere to scrub.
 */
export function Dna({ lab, t, markers, onSeek }: { lab: Lab; t: number; markers: Marker[]; onSeek(s: number): void }) {
  const { t: tr } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{ x: number; s: number } | null>(null);
  const [w, setW] = useState(0);
  const H = 64;

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the strands only change with the match; draw them once per size
  useEffect(() => {
    if (!w) return;
    const dpr = Math.min(devicePixelRatio, 2);
    const c = document.createElement("canvas");
    c.width = w * dpr;
    c.height = H * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    // each strand is a wave: its height is the side's share of the ball over the surrounding
    // 90 seconds, its brightness the phase it spent most of that time in
    const mid = H / 2, amp = H / 2 - 9;
    for (let px = 0; px < w; px++) {
      const c = ((px + 0.5) / w) * SECONDS;
      const s0 = Math.max(Math.floor(c - 45), 0), s1 = Math.min(Math.ceil(c + 45), SECONDS);
      const tally = [new Array(4).fill(0), new Array(4).fill(0)];
      for (let s = s0; s < s1; s++) tally[lab.poss[s]][lab.phase[s]]++;
      for (const team of [0, 1]) {
        const n = tally[team].reduce((a, b) => a + b, 0);
        if (!n) continue;
        // weight each phase by how far up the pitch it is, so final-third spells stand taller
        const push = (tally[team][0] * 0.35 + tally[team][1] * 0.6 + tally[team][2] * 1 + tally[team][3] * 0.9) / (s1 - s0);
        const ph = tally[team].indexOf(Math.max(...tally[team]));
        const h = Math.max(1, push * amp * 1.5);
        g.fillStyle = team === 0 ? INK.chalk(ALPHA[ph]) : INK.blue(ALPHA[ph]);
        g.fillRect(px, team === 0 ? mid - h : mid, 1, Math.min(h, amp));
      }
    }
    g.fillStyle = INK.dark(0.9);
    g.fillRect(w / 2 - 0.5, 0, 1, H);
    g.fillRect(0, H / 2 - 0.5, w, 1);
    base.current = c;
  }, [lab, w]);

  useEffect(() => {
    const el = ref.current!;
    if (!w || !base.current) return;
    const dpr = Math.min(devicePixelRatio, 2);
    el.width = w * dpr;
    el.height = H * dpr;
    const g = el.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, el.width, el.height);
    g.drawImage(base.current, 0, 0);
    g.scale(dpr, dpr);
    const X = (s: number) => (s / SECONDS) * w;
    for (const m of markers) {
      const x = X(m.s);
      if (m.kind === "fault") {
        g.fillStyle = INK.flare;
        g.beginPath();
        g.moveTo(x, H / 2 - 5);
        g.lineTo(x + 5, H / 2);
        g.lineTo(x, H / 2 + 5);
        g.lineTo(x - 5, H / 2);
        g.fill();
        continue;
      }
      const y = m.team === 0 ? 4 : H - 4;
      g.fillStyle = m.team === 0 ? INK.home : INK.away;
      g.strokeStyle = INK.night;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, m.kind === "goal" ? 5 : 1.6 + (m.size ?? 0) * 6, 0, Math.PI * 2);
      g.fill();
      if (m.kind === "goal") g.stroke();
    }
    g.fillStyle = "#fff";
    g.fillRect(X(t) - 1, 0, 2, H);
  }, [t, markers, w, lab]);

  const seek = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const s = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 0.9999) * SECONDS;
    return { x: e.clientX - r.left, s };
  };
  const dragging = useRef(false);
  const hs = hover ? Math.floor(hover.s) : 0;
  return (
    <div className="relative">
      <canvas
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={tr("tlab.dnaLabel")}
        aria-valuemin={0}
        aria-valuemax={90}
        aria-valuenow={Math.floor(t / 60)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onSeek(Math.min(t + 10, SECONDS - 1));
          if (e.key === "ArrowLeft") onSeek(Math.max(t - 10, 0));
        }}
        className="block h-16 w-full cursor-ew-resize touch-none rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-flare"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onSeek(seek(e).s);
        }}
        onPointerMove={(e) => {
          const p = seek(e);
          setHover(p);
          if (dragging.current) onSeek(p.s);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => setHover(null)}
      />
      {hover && (
        <div className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[12px] font-semibold text-chalk shadow-lg" style={{ left: Math.min(Math.max(hover.x, 60), w - 60) }}>
          {Math.floor(hs / 60)}' · {lab.short[lab.poss[hs]]} · {tr(`tlab.phase.${PHASES[lab.phase[hs]]}`)}
        </div>
      )}
    </div>
  );
}
