import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAnalysis } from "../api/analysis";
import { ControlLayer } from "../lab/ControlLayer";
import { PHASES, PX, PY, SECONDS, frameAt, useLab, type Frame, type Lab as LabData } from "../lab/data";
import { Dna, type Marker } from "../lab/Dna";
import { BOX, MARGIN, drawScene, nextPass, pick, type LensId } from "../lab/draw";
import { lanes, pressure, race, shape, spaceShare, teamOf, type Unit } from "../lab/model";
import { useUi } from "../store/uiStore";

const LENSES: LensId[] = ["space", "options", "shape", "pressure", "runs", "chain"];
const SPEEDS = [1, 3, 10];
type MomentKind = "goal" | "shot" | "fault" | "turnover";

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/**
 * Tactics Lab: the whole match on one live pitch. Every lens is a football model run on the
 * tracking of all 22 players, so the picture explains the moment instead of a paragraph.
 */
export function Lab() {
  const { t } = useTranslation();
  const lab = useLab();
  const an = useAnalysis();
  if (lab.error || an.error) return <p className="mx-auto max-w-[1200px] px-6 py-20 text-[17px] text-chalk-dim">{t("lab.failed")}</p>;
  if (!lab.data || !an.data)
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-10 lg:px-10">
        <p className="mb-4 text-[15px] text-chalk-dim">{t("lab.loading")}</p>
        <div className="aspect-[111/74] w-full animate-pulse rounded-panel bg-turf" />
      </div>
    );
  return <LabView lab={lab.data} an={an.data} />;
}

type Readout = {
  t: number;
  f: Frame;
  space: ReturnType<typeof spaceShare>;
  shapes: [ReturnType<typeof shape>, ReturnType<typeof shape>];
  press: ReturnType<typeof pressure>;
  open: number;
  total: number;
  best: number | null;
};

function LabView({ lab, an }: { lab: LabData; an: NonNullable<ReturnType<typeof useAnalysis>["data"]> }) {
  const { t: tr } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion);
  const unitOf = useMemo(() => {
    const m = new Map(an.players.map((p) => [p.id, p.unit as Unit]));
    return (i: number) => m.get(i < 11 ? `H${i + 1}` : `A${i - 10}`) ?? "mid";
  }, [an]);
  const idx = (id: string) => (id[0] === "H" ? Number(id.slice(1)) - 1 : 10 + Number(id.slice(1)));
  const faults = useMemo(() => an.mistakes.map((m) => ({ s: m.second, player: idx(m.player_id) })), [an]);
  const moments = useMemo(() => {
    const shots = lab.actions.filter((a) => a.type === "shot");
    return {
      goal: shots.filter((a) => a.outcome === "goal").map((a) => a.s),
      shot: shots.map((a) => a.s),
      fault: faults.map((f) => f.s),
      turnover: an.turnovers.map((x) => x.second),
    } satisfies Record<MomentKind, number[]>;
  }, [lab, an, faults]);
  const markers = useMemo<Marker[]>(
    () => [
      ...lab.actions.filter((a) => a.type === "shot").map((a) => ({ s: a.s, kind: a.outcome === "goal" ? ("goal" as const) : ("shot" as const), team: a.team, size: a.xg ?? 0 })),
      ...faults.map((f) => ({ s: f.s, kind: "fault" as const, team: teamOf(f.player) })),
    ],
    [lab, faults],
  );

  const start = faults[0] ? faults[0].s - 10 : (moments.goal[0] ?? 600) - 15;
  const time = useRef(Math.max(start, 0));
  const [playing, setPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(1);
  const [lenses, setLenses] = useState<Set<LensId>>(new Set(["space", "options"]));
  const [focus, setFocus] = useState<number | null>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [probe, setProbe] = useState<[number, number] | null>(null);
  const [kind, setKind] = useState<MomentKind>(faults.length ? "fault" : "goal");
  const [read, setRead] = useState<Readout | null>(null);
  const [lastLens, setLastLens] = useState<LensId>("options");

  const box = useRef<HTMLDivElement>(null);
  const gl = useRef<HTMLCanvasElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const layer = useRef<ControlLayer | null>(null);
  const live = useRef({ playing, speed, lenses, focus, hover: hover?.i ?? null, probe });
  live.current = { playing, speed, lenses, focus, hover: hover?.i ?? null, probe };

  useEffect(() => {
    try {
      layer.current = new ControlLayer(gl.current!);
    } catch (e) {
      // without WebGL the pitch still works; only the Space colours are missing
      console.warn("pitch control layer unavailable", e);
      layer.current = null;
    }
  }, []);

  // one loop draws both layers; the side panel reads the frame ten times a second
  useEffect(() => {
    let raf = 0, last = performance.now(), lastRead = 0;
    const size = { w: 0, h: 0, dpr: 1 };
    const ro = new ResizeObserver(() => {
      const el = box.current!;
      size.w = el.clientWidth;
      size.h = el.clientHeight;
      size.dpr = Math.min(devicePixelRatio, 2);
      for (const c of [gl.current!, cv.current!]) {
        c.width = Math.round(size.w * size.dpr);
        c.height = Math.round(size.h * size.dpr);
      }
    });
    ro.observe(box.current!);
    const loop = (now: number) => {
      const L = live.current;
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      if (L.playing) {
        time.current += dt * L.speed;
        if (time.current >= SECONDS - 1) time.current = 0;
      }
      const tt = time.current;
      const f = frameAt(lab, tt);
      if (size.w) {
        layer.current?.draw(f, BOX, { strength: L.lenses.has("space") ? 0.5 : 0, focus: L.focus ?? -1, only: L.focus != null });
        const g = cv.current!.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, cv.current!.width, cv.current!.height);
        const k = (size.w * size.dpr) / BOX[2];
        drawScene(g, k, { lab, t: tt, f, lenses: L.lenses, unitOf, grid: an.xt_grid, focus: L.focus, hover: L.hover, probe: L.probe, faults });
      }
      if (now - lastRead > 110) {
        lastRead = now;
        const ls = lanes(f, an.xt_grid);
        setRead({
          t: tt,
          f,
          space: spaceShare(f),
          shapes: [shape(f, 0, unitOf), shape(f, 1, unitOf)],
          press: pressure(f),
          open: ls.filter((l) => l.open >= 0.5).length,
          total: ls.length,
          best: ls[0]?.j ?? null,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [lab, an, unitOf, faults]);

  const toPitch = (e: React.MouseEvent): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BOX[2] - MARGIN, ((e.clientY - r.top) / r.height) * BOX[3] - MARGIN];
  };
  const seek = (s: number) => {
    time.current = Math.min(Math.max(s, 0), SECONDS - 1);
  };
  const jump = (dir: 1 | -1) => {
    const list = moments[kind];
    const now = time.current + 8;
    const target = dir > 0 ? list.find((s) => s > now + 1) : [...list].reverse().find((s) => s < now - 2);
    if (target != null) {
      seek(target - 8);
      setPlaying(true);
      setSpeed(1);
    }
  };
  const toggle = (l: LensId) => {
    setLenses((cur) => {
      const n = new Set(cur);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });
    setLastLens(l);
  };

  const r = read;
  const s = r ? Math.min(Math.floor(r.t), SECONDS - 1) : 0;
  const team = lab.poss[s];
  const score = lab.actions.filter((a) => a.type === "shot" && a.outcome === "goal" && a.s <= (r?.t ?? 0));
  const goals = [score.filter((a) => a.team === 0).length, score.filter((a) => a.team === 1).length];
  const defShape = r?.shapes[1 - team];
  const played = r ? nextPass(lab, r.t, r.f.carrier) : undefined;
  const hoverRace = probe && r ? race(r.f, probe[0], probe[1]) : null;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-6 lg:px-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-chalk-faint">{tr("lab.eyebrow")}</p>
          <h1 className="font-display text-[clamp(30px,4.4vw,56px)] font-black uppercase leading-[0.92] [font-stretch:135%]">{tr("lab.title")}</h1>
        </div>
        <p className="max-w-[46ch] text-[15px] leading-snug text-chalk-dim">{tr("lab.lede")}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {/* the moment, in two pills: who has it and what the other side is doing about it */}
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-full bg-ink/60 px-3 py-1.5 font-display text-[18px] font-black tabular-nums [font-stretch:120%]">
              {lab.short[0]} {goals[0]}–{goals[1]} <span className="text-[#8fa4ff]">{lab.short[1]}</span>
            </span>
            <span className="rounded-full bg-ink/60 px-3 py-1.5 font-semibold tabular-nums">{r ? clock(r.t) : "–"}</span>
            {r && (
              <>
                <Pill team={team}>
                  {lab.short[team]} · {tr(`lab.phase.${PHASES[lab.phase[s]]}`)}
                </Pill>
                {defShape && (
                  <Pill team={1 - team}>
                    {lab.short[1 - team]} · {tr(`lab.block.${defShape.block}`)}
                  </Pill>
                )}
              </>
            )}
            <span className="ml-auto hidden text-chalk-faint sm:inline">{tr("lab.attacks", { home: lab.short[0] })}</span>
          </div>

          <div
            ref={box}
            className="relative aspect-[111/74] w-full cursor-crosshair touch-none overflow-hidden rounded-panel bg-[#0b1a8a] shadow-[inset_0_0_0_1px_rgb(86_110_236/0.4)]"
            onPointerMove={(e) => {
              if (!r) return;
              const [x, y] = toPitch(e);
              const i = pick(r.f, x, y);
              const rb = box.current!.getBoundingClientRect();
              setHover(i == null ? null : { i, x: e.clientX - rb.left, y: e.clientY - rb.top });
            }}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              if (!r) return;
              const [x, y] = toPitch(e);
              const i = pick(r.f, x, y);
              if (i != null) {
                setFocus(focus === i ? null : i);
                setProbe(null);
              } else if (x >= 0 && x <= PX && y >= 0 && y <= PY) setProbe([x, y]);
              else setProbe(null);
            }}
          >
            <canvas ref={gl} className="absolute inset-0 h-full w-full" aria-hidden="true" />
            <canvas ref={cv} className="absolute inset-0 h-full w-full" role="img" aria-label={tr("lab.pitchLabel")} />
            {hover && r && <HoverCard lab={lab} f={r.f} i={hover.i} x={hover.x} y={hover.y} unit={unitOf(hover.i)} w={box.current?.clientWidth ?? 0} />}
          </div>

          {/* lenses */}
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={tr("lab.lensesLabel")}>
            {LENSES.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lenses.has(l)}
                onClick={() => toggle(l)}
                className={`rc-press flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[14px] font-semibold ring-1 ring-inset transition-colors ${
                  lenses.has(l) ? "bg-chalk text-ink ring-chalk" : "text-chalk-dim ring-turf-edge hover:text-chalk"
                }`}
              >
                <LensIcon l={l} />
                {tr(`lab.lens.${l}`)}
              </button>
            ))}
          </div>
          <p className="mt-2 min-h-[2.6em] max-w-[80ch] text-[14px] leading-snug text-chalk-dim" aria-live="polite">
            <b className="font-semibold text-chalk">{tr(`lab.lens.${lastLens}`)}.</b> {tr(`lab.how.${lastLens}`)}
          </p>

          {/* transport */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying(!playing)}
              aria-label={playing ? tr("lab.pause") : tr("lab.play")}
              className="rc-press grid h-11 w-11 place-items-center rounded-full bg-chalk text-ink"
            >
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.6v10.8a.8.8 0 0 0 1.2.7l8.6-5.4a.8.8 0 0 0 0-1.4L4.2.9A.8.8 0 0 0 3 1.6z" fill="currentColor" /></svg>
              )}
            </button>
            <div className="flex rounded-full p-1 ring-1 ring-inset ring-turf-edge" role="group" aria-label={tr("lab.speed")}>
              {SPEEDS.map((v) => (
                <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)} className={`min-h-[36px] rounded-full px-3 text-[13px] font-semibold tabular-nums ${speed === v ? "bg-turf-raised text-chalk" : "text-chalk-dim"}`}>
                  {v}×
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1 rounded-full p-1 ring-1 ring-inset ring-turf-edge">
              <button type="button" onClick={() => jump(-1)} aria-label={tr("lab.prev")} className="grid h-9 w-9 place-items-center rounded-full text-chalk hover:bg-turf-raised">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2 3.5 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <select value={kind} onChange={(e) => setKind(e.target.value as MomentKind)} aria-label={tr("lab.jumpTo")} className="min-h-[36px] rounded-full bg-transparent px-2 text-[13px] font-semibold text-chalk">
                {(["goal", "fault", "shot", "turnover"] as MomentKind[]).filter((k) => moments[k].length).map((k) => (
                  <option key={k} value={k} className="bg-ink">
                    {tr(`lab.moment.${k}`)} ({moments[k].length})
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => jump(1)} aria-label={tr("lab.next")} className="grid h-9 w-9 place-items-center rounded-full text-chalk hover:bg-turf-raised">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[12px] text-chalk-faint">
              <span className="font-semibold uppercase tracking-[0.12em]">{tr("lab.dna")}</span>
              <span className="flex flex-wrap items-center gap-3">
                {PHASES.map((p, n) => (
                  <span key={p} className="flex items-center gap-1">
                    <i className="inline-block h-2.5 w-4 rounded-sm" style={{ background: `rgba(243,245,255,${[0.28, 0.5, 0.78, 1][n]})` }} />
                    {tr(`lab.phase.${p}`)}
                  </span>
                ))}
                <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rotate-45 bg-flare" />{tr("lab.moment.fault")}</span>
              </span>
            </div>
            <Dna lab={lab} t={r?.t ?? 0} markers={markers} onSeek={seek} />
            <div className="mt-1 flex justify-between text-[12px] text-chalk-faint">
              <span>{lab.short[0]} ↑</span>
              <span>{tr("lab.half")}</span>
              <span>↓ {lab.short[1]}</span>
            </div>
          </div>
        </div>

        {/* the moment in numbers; each one opens the lens that shows it */}
        <aside className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1" aria-label={tr("lab.nowLabel")}>
          {r && (
            <>
              <Gauge title={tr("lab.g.space")} lens="space" on={lenses.has("space")} onLens={toggle}>
                <Split a={r.space.home} labels={lab.short} />
                <p className="mt-1.5 text-[13px] text-chalk-dim">{tr("lab.g.spaceSub", { home: Math.round(r.space.homeInAway * 100), away: Math.round(r.space.awayInHome * 100), h: lab.short[0], a: lab.short[1] })}</p>
              </Gauge>
              <Gauge title={tr("lab.g.options")} lens="options" on={lenses.has("options")} onLens={toggle}>
                <div className="flex items-end gap-3">
                  <Big>{r.open}</Big>
                  <span className="pb-1 text-[13px] text-chalk-dim">{tr("lab.g.optionsOf", { n: r.total })}</span>
                </div>
                <Dots n={r.total} on={r.open} team={teamOf(r.f.carrier)} />
                {r.best != null && (
                  <p className="mt-1.5 text-[13px] text-chalk-dim">
                    {tr("lab.g.best")} <b className="text-chalk">#{lab.numbers[r.best]} {lab.names[r.best]}</b>
                    {played?.receiver != null && played.receiver !== r.best && <> · {tr("lab.g.played")} #{lab.numbers[played.receiver]}</>}
                  </p>
                )}
              </Gauge>
              <Gauge title={tr("lab.g.pressure")} lens="pressure" on={lenses.has("pressure")} onLens={toggle}>
                <div className="flex items-end gap-3">
                  <Big>{r.press && r.press.nearest < 50 ? `${r.press.nearest.toFixed(1)} m` : "–"}</Big>
                  <span className="pb-1 text-[13px] text-chalk-dim">{tr("lab.g.pressureSub", { n: r.press?.pressers.length ?? 0 })}</span>
                </div>
                <Meter v={r.press ? Math.max(0, 1 - r.press.nearest / 10) : 0} />
                <p className="mt-1.5 text-[13px] text-chalk-dim">{tr("lab.g.behind", { n: r.press?.behind ?? 0, team: lab.short[1 - team] })}</p>
              </Gauge>
              <Gauge title={tr("lab.g.shape")} lens="shape" on={lenses.has("shape")} onLens={toggle}>
                <Blocks shapes={r.shapes} short={lab.short} />
              </Gauge>
              <Gauge title={tr("lab.g.probe")} lens={null}>
                {hoverRace ? (
                  <p className="text-[14px] leading-snug text-chalk-dim">
                    {tr("lab.g.probeWin", { name: lab.names[hoverRace.first.i], s: hoverRace.first.t.toFixed(1), team: lab.short[teamOf(hoverRace.first.i)] })}
                    <span className="mt-1 block text-[13px]">{tr("lab.g.probeOwn", { team: lab.short[0], p: Math.round(hoverRace.control * 100) })}</span>
                  </p>
                ) : focus != null ? (
                  <p className="text-[14px] leading-snug text-chalk-dim">{tr("lab.g.focus", { name: lab.names[focus] })}</p>
                ) : (
                  <p className="text-[14px] leading-snug text-chalk-dim">{tr("lab.g.probeHint")}</p>
                )}
              </Gauge>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Pill({ team, children }: { team: number; children: ReactNode }) {
  return <span className={`rounded-full px-3 py-1.5 font-semibold ${team === 0 ? "bg-chalk text-ink" : "bg-[#5a78ff] text-white"}`}>{children}</span>;
}

function Gauge({ title, lens, on, onLens, children }: { title: string; lens: LensId | null; on?: boolean; onLens?(l: LensId): void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="min-w-0 rounded-panel bg-turf p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-chalk-faint">{title}</h2>
        {lens && onLens && (
          <button type="button" onClick={() => onLens(lens)} aria-pressed={on} className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${on ? "bg-chalk text-ink ring-chalk" : "text-chalk-dim ring-turf-edge"}`}>
            {on ? t("lab.shown") : t("lab.show")}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

const Big = ({ children }: { children: ReactNode }) => <span className="font-display text-[34px] font-black leading-none tabular-nums [font-stretch:115%]">{children}</span>;

function Split({ a, labels }: { a: number; labels: [string, string] }) {
  const p = Math.round(a * 100);
  return (
    <div>
      <div className="flex h-9 overflow-hidden rounded-md">
        <div className="flex items-center bg-chalk px-2 font-display text-[18px] font-black text-ink transition-[width] duration-200" style={{ width: `${p}%` }}>{p}%</div>
        <div className="flex flex-1 items-center justify-end bg-[#5a78ff] px-2 font-display text-[18px] font-black text-white">{100 - p}%</div>
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-chalk-faint"><span>{labels[0]}</span><span>{labels[1]}</span></div>
    </div>
  );
}

function Dots({ n, on, team }: { n: number; on: number; team: number }) {
  return (
    <div className="mt-2 flex gap-1" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={`h-2.5 flex-1 rounded-sm ${i < on ? (team === 0 ? "bg-chalk" : "bg-[#8fa4ff]") : "bg-turf-raised"}`} />
      ))}
    </div>
  );
}

function Meter({ v }: { v: number }) {
  return (
    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-turf-raised" aria-hidden="true">
      <div className="h-full rounded-full bg-chalk transition-[width] duration-200" style={{ width: `${Math.round(v * 100)}%` }} />
    </div>
  );
}

/** Each side's block drawn to scale on a mini pitch: where its back line is, how long and wide it is. */
function Blocks({ shapes, short }: { shapes: ReturnType<typeof shape>[]; short: [string, string] }) {
  const { t } = useTranslation();
  return (
    <div>
      <svg viewBox="-2 -2 109 72" className="w-full rounded-md bg-[#0b1a8a]" aria-hidden="true">
        <rect x="0" y="0" width="105" height="68" fill="none" stroke="rgba(243,245,255,.35)" strokeWidth=".6" />
        <line x1="52.5" y1="0" x2="52.5" y2="68" stroke="rgba(243,245,255,.35)" strokeWidth=".6" />
        {shapes.map((s) => {
          const back = s.team === 0 ? s.line.def : PX - s.line.def;
          const x = s.team === 0 ? back : back - s.depth;
          const y = 34 - s.width / 2;
          return (
            <g key={s.team}>
              <rect x={x} y={y} width={s.depth} height={s.width} rx="2" fill={s.team === 0 ? "rgba(243,245,255,.35)" : "rgba(90,120,255,.55)"} stroke={s.team === 0 ? "#f3f5ff" : "#8fa4ff"} strokeWidth=".8" />
              <line x1={back} x2={back} y1={y - 3} y2={y + s.width + 3} stroke={s.team === 0 ? "#f3f5ff" : "#8fa4ff"} strokeWidth="1.4" />
            </g>
          );
        })}
      </svg>
      <dl className="mt-2 grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 text-[13px] tabular-nums">
        <dt />
        <dd className="font-semibold">{short[0]}</dd>
        <dd className="font-semibold text-[#8fa4ff]">{short[1]}</dd>
        <dt className="text-chalk-faint">{t("lab.g.line")}</dt>
        <dd>{Math.round(shapes[0].line.def)} m</dd>
        <dd>{Math.round(shapes[1].line.def)} m</dd>
        <dt className="text-chalk-faint">{t("lab.g.depth")}</dt>
        <dd>{Math.round(shapes[0].depth)} m</dd>
        <dd>{Math.round(shapes[1].depth)} m</dd>
        <dt className="text-chalk-faint">{t("lab.g.width")}</dt>
        <dd>{Math.round(shapes[0].width)} m</dd>
        <dd>{Math.round(shapes[1].width)} m</dd>
      </dl>
    </div>
  );
}

function HoverCard({ lab, f, i, x, y, unit, w }: { lab: LabData; f: Frame; i: number; x: number; y: number; unit: Unit; w: number }) {
  const { t } = useTranslation();
  const sp = Math.hypot(f.vel[i][0], f.vel[i][1]);
  const left = Math.min(Math.max(x, 90), w - 90);
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink/95 px-3 py-2 text-[13px] shadow-xl" style={{ left, top: y - 14 }}>
      <div className="font-semibold">
        #{lab.numbers[i]} {lab.names[i]}
      </div>
      <div className="text-chalk-dim">
        {lab.short[teamOf(i)]} · {t(`lab.unit.${unit}`)} · {sp.toFixed(1)} m/s
      </div>
      <div className="text-[12px] text-chalk-faint">{t("lab.clickFocus")}</div>
    </div>
  );
}

function LensIcon({ l }: { l: LensId }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {l === "space" && (
        <>
          <rect x="2" y="3" width="14" height="12" rx="1.5" {...p} />
          <path d="M8 3c2 3-1 6 1 12" {...p} />
        </>
      )}
      {l === "options" && (
        <>
          <circle cx="4" cy="9" r="1.8" {...p} />
          <path d="M6 8 14 3.5M6 9h8.5M6 10l8 4.5" {...p} />
        </>
      )}
      {l === "shape" && <path d="M3 4.5h3.5M3 9h12M3 13.5h3.5M10 4.5h5M10 13.5h5" {...p} />}
      {l === "pressure" && (
        <>
          <circle cx="9" cy="9" r="2" {...p} />
          <circle cx="9" cy="9" r="6" {...p} strokeDasharray="2 2" />
        </>
      )}
      {l === "runs" && <path d="M3 13c3 0 4-8 9-8m0 0-2.5-1.8M12 5l-1.6 2.6" {...p} />}
      {l === "chain" && <path d="M3 14c2-6 4-6 6-3s4 2 6-6" {...p} />}
    </svg>
  );
}
