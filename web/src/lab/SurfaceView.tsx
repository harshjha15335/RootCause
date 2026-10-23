import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Analysis } from "../api/analysis";
import { Badge } from "../components/bits";
import { useUi } from "../store/uiStore";
import { SECONDS, frameAt, type Lab } from "./data";
import { Surface, type SurfaceData } from "./Surface";

const HALF = 2700;

/**
 * The opening view of the Lab: the match as a living surface, after the "attacking pressure"
 * terrain broadcasters use. Almost no text: a scoreboard, the minute, one fact, and the pressure
 * line along the bottom to scrub. Click the surface to step onto the pitch at that moment.
 */
export function SurfaceView({ lab, an, start, onDive }: { lab: Lab; an: Analysis; start: number; onDive(t: number): void }) {
  const { t: tr } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion);
  const host = useRef<HTMLDivElement>(null);
  const surf = useRef<Surface | null>(null);
  const time = useRef(start);
  const [playing, setPlaying] = useState(!reduced);
  const [intro, setIntro] = useState(!reduced && start === 0);
  const [now, setNow] = useState(start);
  const [fault, setFault] = useState<{ x: number; y: number; text: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const live = useRef({ playing, drag: null as null | { x: number; y: number; az: number; el: number }, moved: false });
  live.current.playing = playing;

  const shotsAll = useMemo(() => lab.actions.filter((a) => a.type === "shot"), [lab]);
  const data = useMemo<SurfaceData>(() => {
    const terr = an.territory!;
    const goals = shotsAll.filter((a) => a.outcome === "goal");
    return {
      control: terr.control,
      nx: terr.nx,
      ny: terr.ny,
      homeXt: terr.home_xt,
      awayXt: terr.away_xt,
      shots: shotsAll.map((a) => ({ s: a.s, team: a.team, xg: a.xg ?? 0, goal: a.outcome === "goal", at: a.from })),
      moves: goals.map((g) => {
        const start = lab.possStart[Math.min(g.s, SECONDS - 1)];
        const acts = lab.actions.filter((a) => a.s >= Math.max(start, g.s - 25) && a.s <= g.s && a.team === g.team && (a.type === "pass" || a.type === "carry" || a.type === "shot"));
        const path: [number, number][] = acts.length ? [acts[0].from, ...acts.map((a) => (a.type === "shot" ? a.from : a.to))] : [g.from];
        const m = an.mistakes.find((x) => Math.abs(x.goal_second - g.s) <= 3);
        const fb = m ? frameAt(lab, m.second).ball : null;
        return { s: g.s, path, fault: fb, faultS: m?.second ?? null };
      }),
    };
  }, [lab, an, shotsAll]);

  const goals = useMemo(() => {
    return shotsAll
      .filter((a) => a.outcome === "goal")
      .map((g) => {
        const assist = lab.actions.filter((a) => a.type === "pass" && a.team === g.team && a.receiver === g.player && a.s <= g.s && a.s >= g.s - 8).pop();
        return { s: g.s, team: g.team, scorer: lab.names[g.player], assist: assist ? lab.names[assist.player] : null };
      });
  }, [lab, shotsAll]);

  useEffect(() => {
    if (!intro) return;
    const id = setTimeout(() => setIntro(false), 2600);
    return () => clearTimeout(id);
  }, [intro]);

  useEffect(() => {
    let s: Surface;
    try {
      s = new Surface(host.current!, data, tr("lab.surfaceLabel"));
    } catch (e) {
      console.warn("3D surface unavailable", e);
      setFailed(true);
      return;
    }
    surf.current = s;
    const ro = new ResizeObserver(() => s.resize());
    ro.observe(host.current!);
    let raf = 0, last = performance.now(), lastUi = 0;
    const loop = (ms: number) => {
      const dt = Math.min(ms - last, 100) / 1000;
      last = ms;
      const t = time.current;
      // a minute a second, slowing to watch each goal and the mistake behind it
      const near = data.moves.some((m) => (t >= m.s - 22 && t <= m.s + 8) || (m.faultS != null && t >= m.faultS - 4 && t <= m.faultS + 4));
      if (live.current.playing) time.current = (time.current + dt * (near ? 8 : 60)) % (SECONDS - 1);
      s.render(time.current, ms / 1000, dt, !!live.current.drag);
      if (ms - lastUi > 100) {
        lastUi = ms;
        setNow(time.current);
        const m = data.moves.find((x) => x.fault && x.faultS != null && time.current >= x.faultS - 3 && time.current <= x.s + 14);
        if (m && m.fault) {
          const mk = an.mistakes.find((x) => x.second === m.faultS)!;
          const [x, y] = s.toScreen(m.fault[0], m.fault[1], s.heightAt(m.fault[0], m.fault[1]) + 3);
          const idx = mk.player_id[0] === "H" ? Number(mk.player_id.slice(1)) - 1 : 10 + Number(mk.player_id.slice(1));
          setFault({ x, y, text: `${lab.names[idx]} · ${tr(`bug.${mk.bug}`)}` });
        } else setFault(null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      s.dispose();
      surf.current = null;
    };
  }, [data, an, lab, tr]);

  const sec = Math.floor(now);
  const done = goals.filter((g) => g.s <= now);
  const score = [done.filter((g) => g.team === 0), done.filter((g) => g.team === 1)];
  const recent = shotsAll.filter((a) => a.s <= now && a.s > now - 600);
  const lastGoal = goals.filter((g) => now >= g.s && now <= g.s + 26).pop();
  const leader = recent.length ? (recent.filter((a) => a.team === 0).length >= recent.length / 2 ? 0 : 1) : null;

  return (
    <div
      ref={host}
      className="relative h-[min(84vh,900px)] min-h-[520px] w-full touch-pan-y select-none overflow-hidden bg-[radial-gradient(90%_70%_at_50%_45%,#15161f_0%,#07080c_75%)]"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button, [data-scrub]")) return;
        live.current.drag = { x: e.clientX, y: e.clientY, az: surf.current?.az ?? 0, el: surf.current?.el ?? 0.6 };
        live.current.moved = false;
      }}
      onPointerMove={(e) => {
        const d = live.current.drag;
        if (!d || !surf.current) return;
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6) live.current.moved = true;
        surf.current.az = d.az - (e.clientX - d.x) * 0.006;
        surf.current.el = Math.min(Math.max(d.el + (e.clientY - d.y) * 0.004, 0.3), 1.35);
      }}
      onPointerUp={(e) => {
        const d = live.current.drag;
        live.current.drag = null;
        if (d && !live.current.moved && surf.current?.pitchAt(e.clientX, e.clientY)) onDive(time.current);
      }}
      style={{ cursor: live.current.drag ? "grabbing" : "grab" }}
    >
      {failed && <p className="absolute inset-0 grid place-items-center px-6 text-center text-[16px] text-chalk-dim">{tr("lab.noGl")}</p>}

      {/* scoreboard */}
      <div className="pointer-events-none absolute left-5 top-5 flex gap-6 sm:left-8 sm:top-7">
        {[0, 1].map((k) => (
          <div key={k}>
            <div className="flex items-center gap-2 text-[13px] font-bold tracking-[0.08em] text-chalk">
              <span className="h-[3px] w-5 rounded" style={{ background: k === 0 ? "#2464c8" : "#b23a3a" }} />
              {lab.short[k]}
              <Badge club={lab.clubs[k]} size={20} />
            </div>
            <div className="font-display text-[54px] font-black leading-none tabular-nums [font-stretch:110%] sm:text-[68px]">{score[k].length}</div>
            <div className="mt-1 flex flex-col text-[12px] font-semibold text-chalk-dim">
              {score[k].map((g) => (
                <span key={g.s} className="flex items-center gap-1.5">
                  <i className="h-1.5 w-1.5 rounded-full" style={{ background: k === 0 ? "#2464c8" : "#b23a3a" }} />
                  {Math.floor(g.s / 60) + 1}'
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-6 hidden -translate-x-1/2 text-center text-[12px] font-semibold leading-tight text-chalk-dim md:block">
        <div className="text-chalk">{lab.clubs[0].name} v {lab.clubs[1].name}</div>
        <div>{tr("lab.surfaceTitle")}</div>
      </div>
      <div className="pointer-events-none absolute right-5 top-5 text-right sm:right-8 sm:top-7">
        <div className="font-display text-[54px] font-black italic leading-none tabular-nums [font-stretch:105%] sm:text-[68px]">{Math.min(Math.floor(now / 60) + 1, 90)}'</div>
        <div className="mt-1 text-[12px] font-semibold text-chalk-dim">{now < HALF ? tr("lab.firstHalf") : tr("lab.secondHalf")}</div>
      </div>

      {fault && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-flare px-2.5 py-1.5 text-[12px] font-bold text-flare-ink shadow-lg" style={{ left: fault.x, top: fault.y }}>
          {tr("lab.theMistake")} · {fault.text}
        </div>
      )}
      {lastGoal && (
        <div key={lastGoal.s} className="lab-caption pointer-events-none absolute bottom-[132px] right-5 text-right sm:right-8">
          <div className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: lastGoal.team === 0 ? "#9cc8ff" : "#ff9d8f" }}>
            {tr("lab.goalFor", { team: lab.short[lastGoal.team] })}
          </div>
          <div className="font-display text-[28px] font-black leading-tight [font-stretch:110%] sm:text-[34px]">{lastGoal.scorer}</div>
          {lastGoal.assist && <div className="text-[13px] text-chalk-dim">{tr("lab.assist", { name: lastGoal.assist })}</div>}
        </div>
      )}

      {intro && (
        <div className="lab-intro pointer-events-none absolute inset-0 grid place-items-center bg-[#07080c]/80">
          <div className="flex items-center gap-10 sm:gap-20">
            {[0, 1].map((k) => (
              <div key={k} className="flex flex-col items-center gap-3">
                <Badge club={lab.clubs[k]} size={120} />
                <span className="font-display text-[22px] font-black uppercase [font-stretch:115%] sm:text-[28px]">{lab.clubs[k].name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* attacking pressure, the one line to scrub */}
      <div className="absolute inset-x-0 bottom-0 px-5 pb-4 sm:px-8" data-scrub>
        <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-chalk-faint">
          <span>{tr("lab.pressure")}</span>
          <span className={leader == null ? "" : "text-chalk"}>{recent.length ? tr("lab.shotsRecent", { count: recent.length, team: lab.short[leader ?? 0] }) : tr("lab.quiet")}</span>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? tr("lab.pause") : tr("lab.play")} className="rc-press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-chalk text-ink">
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.6v10.8a.8.8 0 0 0 1.2.7l8.6-5.4a.8.8 0 0 0 0-1.4L4.2.9A.8.8 0 0 0 3 1.6z" fill="currentColor" /></svg>
            )}
          </button>
          <PressureLine an={an} t={now} goals={goals} onSeek={(s) => (time.current = s)} />
        </div>
        <div className="mt-1 flex justify-between pl-[52px] text-[11px] text-chalk-faint">
          <span>{tr("lab.kickoff")}</span>
          <span>{tr("lab.half")}</span>
          <span>{tr("lab.fullTime")}</span>
        </div>
        <p className="mt-2 text-center text-[12px] text-chalk-faint">{tr("lab.surfaceHint")}</p>
      </div>
      <span className="sr-only">{sec}</span>
    </div>
  );
}

/** The pressure line: home above, away below, a dot for each goal; drag to move through the match. */
function PressureLine({ an, t, goals, onSeek }: { an: Analysis; t: number; goals: { s: number; team: number }[]; onSeek(s: number): void }) {
  const { t: tr } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  useEffect(() => {
    const c = ref.current!;
    const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    if (!w) return;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    const terr = an.territory!;
    const top = Math.max(...terr.home_xt, ...terr.away_xt, 1e-6);
    const mid = h / 2, X = (s: number) => (s / SECONDS) * w;
    const wave = (arr: number[], sign: number, color: string) => {
      g.beginPath();
      g.moveTo(0, mid);
      arr.forEach((v, k) => g.lineTo(X((k + 0.5) * 60), mid - sign * (v / top) * (mid - 3)));
      g.lineTo(w, mid);
      g.strokeStyle = color;
      g.lineWidth = 1.4;
      g.stroke();
    };
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(X(HALF), 0, 1, h);
    g.fillRect(0, mid, w, 1);
    // what has been played is bright, the rest is still to come
    g.save();
    g.beginPath();
    g.rect(0, 0, X(t), h);
    g.clip();
    wave(terr.home_xt, 1, "#9cc8ff");
    wave(terr.away_xt, -1, "#ff9d8f");
    g.restore();
    g.save();
    g.beginPath();
    g.rect(X(t), 0, w, h);
    g.clip();
    wave(terr.home_xt, 1, "rgba(156,200,255,0.25)");
    wave(terr.away_xt, -1, "rgba(255,157,143,0.25)");
    g.restore();
    for (const gl of goals) {
      g.fillStyle = gl.team === 0 ? "#9cc8ff" : "#ff9d8f";
      g.beginPath();
      g.arc(X(gl.s), gl.team === 0 ? 4 : h - 4, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const m of an.mistakes) {
      g.fillStyle = "#ffd60a";
      g.fillRect(X(m.second) - 3, mid - 3, 6, 6);
    }
    g.fillStyle = "#fff";
    g.fillRect(X(t) - 1, 0, 2, h);
  }, [an, t, goals]);
  const seek = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onSeek(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 0.999) * SECONDS);
  };
  return (
    <canvas
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={tr("lab.dnaLabel")}
      aria-valuemin={0}
      aria-valuemax={90}
      aria-valuenow={Math.floor(t / 60)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeek(Math.min(t + 60, SECONDS - 1));
        if (e.key === "ArrowLeft") onSeek(Math.max(t - 60, 0));
      }}
      onPointerDown={(e) => {
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seek(e);
      }}
      onPointerMove={(e) => drag.current && seek(e)}
      onPointerUp={() => (drag.current = false)}
      className="h-12 min-w-0 flex-1 cursor-ew-resize touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-flare"
    />
  );
}
