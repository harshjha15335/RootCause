import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAnalysis } from "../api/analysis";
import { coachLine, type Line } from "../lab/coach";
import { PHASES, PX, PY, SECONDS, frameAt, useLab, type Frame, type Lab as LabData } from "../lab/data";
import { Dna, type Marker } from "../lab/Dna";
import { drawScene, pick, type LensId } from "../lab/draw";
import { race, shape, teamOf, type Unit } from "../lab/model";
import { LabStage, type View } from "../lab/Stage";
import { SurfaceView } from "../lab/SurfaceView";
import { useUi } from "../store/uiStore";

const LENSES: LensId[] = ["space", "options", "shape", "pressure", "runs", "chain"];
const SPEEDS = [0.5, 1, 3];
type MomentKind = "goal" | "shot" | "fault" | "turnover";
const clock = (t: number) => `${Math.floor(t / 60)}'`;

/**
 * Tactics Lab: the whole match on a floodlit 3D pitch. In Coach mode it watches the game with
 * you and points at one thing at a time; in Explore mode every lens is yours to switch.
 */
export function Lab() {
  const { t } = useTranslation();
  const lab = useLab();
  const an = useAnalysis();
  if (lab.error || an.error) return <p className="mx-auto max-w-[1200px] px-6 py-20 text-[17px] text-chalk-dim">{t("lab.failed")}</p>;
  if (!lab.data || !an.data)
    return (
      <div className="relative h-[min(80vh,880px)] min-h-[460px] w-full animate-pulse bg-[#0a2a1a]">
        <p className="absolute left-6 top-6 text-[15px] text-chalk-dim">{t("lab.loading")}</p>
      </div>
    );
  return <Scenes lab={lab.data} an={an.data} />;
}

/** The surface first; clicking it steps onto the pitch at that moment, and back again. */
function Scenes({ lab, an }: { lab: LabData; an: NonNullable<ReturnType<typeof useAnalysis>["data"]> }) {
  const [scene, setScene] = useState<{ kind: "surface" | "pitch"; t: number }>({ kind: an.territory ? "surface" : "pitch", t: 0 });
  if (scene.kind === "surface") return <SurfaceView lab={lab} an={an} start={scene.t} onDive={(t) => setScene({ kind: "pitch", t })} />;
  return <LabView lab={lab} an={an} start={scene.t} onBack={an.territory ? (t) => setScene({ kind: "surface", t }) : undefined} />;
}

type Live = {
  playing: boolean;
  speed: number;
  coach: boolean;
  lenses: Set<LensId>;
  focus: number | null;
  probe: [number, number] | null;
  hover: number | null;
  view: View;
  line: Line | null;
  lineAt: number;
  since: number;
};

function LabView({ lab, an, start, onBack }: { lab: LabData; an: NonNullable<ReturnType<typeof useAnalysis>["data"]>; start: number; onBack?: (t: number) => void }) {
  const { t: tr } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion);
  const unitOf = useMemo(() => {
    const m = new Map(an.players.map((p) => [p.id, p.unit as Unit]));
    return (i: number) => m.get(i < 11 ? `H${i + 1}` : `A${i - 10}`) ?? "mid";
  }, [an]);
  const faults = useMemo(
    () => an.mistakes.map((m) => ({ s: m.second, player: m.player_id[0] === "H" ? Number(m.player_id.slice(1)) - 1 : 10 + Number(m.player_id.slice(1)), bug: m.bug })),
    [an],
  );
  const moments = useMemo(() => {
    const shots = lab.actions.filter((a) => a.type === "shot");
    return {
      goal: shots.filter((a) => a.outcome === "goal").map((a) => a.s),
      fault: faults.map((f) => f.s),
      shot: shots.map((a) => a.s),
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

  const firstGoal = moments.goal[0] ?? 600;
  const time = useRef(start > 0 ? Math.max(start - 4, 0) : Math.max((faults[0]?.s ?? firstGoal) - 14, 0));
  const [playing, setPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(1);
  const [coach, setCoach] = useState(true);
  const [view, setView] = useState<View>("broadcast");
  const [lenses, setLenses] = useState<Set<LensId>>(new Set(["space", "options"]));
  const [focus, setFocus] = useState<number | null>(null);
  const [probe, setProbe] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [kind, setKind] = useState<MomentKind>("goal");
  const [line, setLine] = useState<Line | null>(null);
  const [now, setNow] = useState<{ t: number; f: Frame } | null>(null);
  const [failed, setFailed] = useState(false);

  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<LabStage | null>(null);
  const live = useRef<Live>({ playing, speed, coach, lenses, focus, probe, hover, view, line: null, lineAt: 0, since: 0 });
  Object.assign(live.current, { playing, speed, coach, lenses, focus, probe, hover, view });

  useEffect(() => {
    let st: LabStage;
    try {
      st = new LabStage(host.current!, lab.numbers, tr("lab.pitchLabel"));
    } catch (e) {
      console.warn("3D pitch unavailable", e);
      setFailed(true);
      return;
    }
    stage.current = st;
    const ro = new ResizeObserver(() => st.resize());
    ro.observe(host.current!);
    let raf = 0, last = performance.now(), lastUi = 0;
    const loop = (ms: number) => {
      const L = live.current;
      const dt = Math.min(ms - last, 100) / 1000;
      last = ms;
      st.view = L.view;
      // the coach slows the clock while it shows something worth reading
      const slow = L.coach && L.line && L.line.rank >= 5 ? 0.55 : 1;
      if (L.playing) {
        time.current += dt * L.speed * slow;
        if (time.current >= SECONDS - 1) time.current = 0;
      }
      const t = time.current;
      const f = frameAt(lab, t);
      // pick the coach's line twice a second, and hold each one long enough to read
      if (ms - L.lineAt > 500) {
        const next = coachLine(lab, t, f, { unitOf, grid: an.xt_grid, faults });
        const held = L.line && ms - L.since < 3800;
        if (!L.line || !held || next.rank > L.line.rank) {
          if (!L.line || next.key !== L.line.key || next.at !== L.line.at) L.since = ms;
          L.line = next;
        }
        L.lineAt = ms;
      }
      const shown = L.coach ? new Set<LensId>(L.line ? [L.line.lens] : []) : L.lenses;
      const g = st.overlay.getContext("2d")!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, st.overlay.width, st.overlay.height);
      // lines and labels are sized for half the canvas resolution, so they read at broadcast distance
      g.scale(2, 2);
      drawScene(g, st.overlayPx / 2, {
        lab,
        t,
        f,
        lenses: new Set([...shown].filter((l) => l !== "space")),
        unitOf,
        grid: an.xt_grid,
        focus: L.focus ?? (L.coach ? (L.line?.at ?? null) : null),
        hover: L.hover,
        probe: L.probe,
        faults,
        solid: true,
      });
      const spaceOn = L.coach || L.lenses.has("space");
      st.render(f, { strength: spaceOn ? (L.coach && L.line?.lens !== "space" ? 0.16 : 0.42) : 0, focus: L.focus, dt, follow: L.focus });
      if (ms - lastUi > 120) {
        lastUi = ms;
        setNow({ t, f });
        setLine(L.line);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      st.dispose();
      stage.current = null;
    };
  }, [lab, an, unitOf, faults, tr]);

  const seek = (s: number) => {
    time.current = Math.min(Math.max(s, 0), SECONDS - 1);
    live.current.line = null;
  };
  const jump = (dir: 1 | -1) => {
    const list = moments[kind];
    const cur = time.current + 10;
    const target = dir > 0 ? list.find((s) => s > cur + 1) : [...list].reverse().find((s) => s < cur - 2);
    if (target != null) {
      seek(target - 10);
      setPlaying(true);
    }
  };
  const toggle = (l: LensId) =>
    setLenses((cur) => {
      const n = new Set(cur);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });

  const at = (e: React.MouseEvent) => stage.current?.pitchAt(e.clientX, e.clientY) ?? null;
  const s = now ? Math.min(Math.floor(now.t), SECONDS - 1) : 0;
  const team = lab.poss[s];
  const score = lab.actions.filter((a) => a.type === "shot" && a.outcome === "goal" && a.s <= (now?.t ?? 0));
  const goals = [score.filter((a) => a.team === 0).length, score.filter((a) => a.team === 1).length];
  const block = now ? shape(now.f, 1 - team, unitOf).block : "mid";
  const raced = probe && now ? race(now.f, probe[0], probe[1]) : null;
  const lineText = line
    ? tr(`lab.coach.${line.key}`, {
        ...line.params,
        bug: line.params.bug ? tr(`bug.${line.params.bug}`).toLowerCase() : "",
        block: line.params.block ? tr(`lab.block.${line.params.block}`).toLowerCase() : "",
      })
    : "";
  const warn = line && (line.key === "fault" || line.key === "better");

  return (
    <div className="pb-14">
      {/* the stage: full bleed, everything else floats on it */}
      <div
        ref={host}
        className="relative h-[min(80vh,880px)] min-h-[480px] w-full touch-pan-y overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,#0b1a8a_0%,#050d4a_70%)]"
        onPointerMove={(e) => {
          if (!now) return;
          const p = at(e);
          setHover(p ? pick(now.f, p[0], p[1], 2.4) : null);
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          if (!now || (e.target as HTMLElement).closest("button, select, [role=slider]")) return;
          const p = at(e);
          if (!p) return;
          const i = pick(now.f, p[0], p[1], 2.4);
          if (i != null) {
            setFocus(focus === i ? null : i);
            setProbe(null);
          } else if (p[0] >= 0 && p[0] <= PX && p[1] >= 0 && p[1] <= PY) {
            setProbe([p[0], p[1]]);
            setCoach(false);
          }
        }}
        style={{ cursor: hover != null ? "pointer" : "crosshair" }}
      >
        {failed && <p className="absolute inset-0 grid place-items-center px-6 text-center text-[16px] text-chalk-dim">{tr("lab.noGl")}</p>}

        {/* score and the moment */}
        <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap items-center gap-2 sm:left-6 sm:top-5">
          <span className="rounded-full bg-[#050d4a]/75 px-4 py-2 font-display text-[20px] font-black tabular-nums backdrop-blur [font-stretch:120%] sm:text-[24px]">
            {lab.short[0]} {goals[0]}–{goals[1]} <span className="text-[#8fa4ff]">{lab.short[1]}</span>
            <span className="ml-3 text-[15px] font-bold text-chalk-dim">{now ? clock(now.t) : ""}</span>
          </span>
          {now && (
            <span className="hidden rounded-full bg-[#050d4a]/75 px-3 py-2 text-[13px] font-semibold text-chalk-dim backdrop-blur md:inline">
              {lab.short[team]} · {tr(`lab.phase.${PHASES[lab.phase[s]]}`)} <span className="mx-1 text-chalk-faint">/</span> {lab.short[1 - team]} · {tr(`lab.block.${block}`)}
            </span>
          )}
        </div>

        {/* modes */}
        <div className="absolute right-4 top-4 flex flex-col items-end gap-2 sm:right-6 sm:top-5">
          {onBack && (
            <button type="button" onClick={() => onBack(time.current)} className="rc-press min-h-[40px] rounded-full bg-chalk px-4 text-[13px] font-bold text-ink">
              {tr("lab.backToSurface")}
            </button>
          )}
          <Seg
            label={tr("lab.modeLabel")}
            value={coach ? "coach" : "explore"}
            options={[
              ["coach", tr("lab.coachMode")],
              ["explore", tr("lab.exploreMode")],
            ]}
            onChange={(v) => {
              setCoach(v === "coach");
              if (v === "coach") setProbe(null);
            }}
          />
          <Seg
            label={tr("lab.viewLabel")}
            value={view}
            options={[
              ["broadcast", tr("lab.broadcast")],
              ["tactical", tr("lab.tactical")],
            ]}
            onChange={(v) => setView(v as View)}
          />
        </div>

        {/* the one line: what to look at right now */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[128px] flex justify-center px-4" aria-live="polite">
          {coach && line ? (
            <div key={line.key + line.at} className="lab-caption flex max-w-[780px] items-start gap-3 rounded-2xl bg-[#050d4a]/80 px-5 py-4 shadow-2xl backdrop-blur-md">
              <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${warn ? "bg-flare text-flare-ink" : "bg-chalk text-ink"}`}>
                <LensIcon l={line.lens} />
              </span>
              <p className="text-[16px] font-semibold leading-snug text-chalk sm:text-[20px]">
                <span className={`mr-2 text-[12px] font-bold uppercase tracking-[0.14em] ${warn ? "text-flare" : "text-chalk-faint"}`}>{tr(`lab.lens.${line.lens}`)}</span>
                {lineText}
              </p>
            </div>
          ) : raced ? (
            <div className="max-w-[640px] rounded-2xl bg-[#050d4a]/80 px-5 py-4 text-[17px] font-semibold text-chalk shadow-2xl backdrop-blur-md">
              {tr("lab.g.probeWin", { name: lab.names[raced.first.i], s: raced.first.t.toFixed(1), team: lab.short[teamOf(raced.first.i)] })}
            </div>
          ) : focus != null ? (
            <div className="rounded-2xl bg-[#050d4a]/80 px-5 py-3 text-[16px] font-semibold text-chalk shadow-2xl backdrop-blur-md">{tr("lab.g.focus", { name: lab.names[focus] })}</div>
          ) : null}
        </div>

        {hover != null && now && <Tag lab={lab} i={hover} stage={stage.current} f={now.f} unit={unitOf(hover)} />}

        {/* transport */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#050d4a] via-[#050d4a]/85 to-transparent px-4 pb-3 pt-8 sm:px-6">
          {!coach && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={tr("lab.lensesLabel")}>
              {LENSES.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={lenses.has(l)}
                  onClick={() => toggle(l)}
                  title={tr(`lab.how.${l}`)}
                  className={`rc-press flex min-h-[40px] items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold backdrop-blur ${lenses.has(l) ? "bg-chalk text-ink" : "bg-[#050d4a]/60 text-chalk-dim ring-1 ring-inset ring-turf-edge hover:text-chalk"}`}
                >
                  <LensIcon l={l} />
                  {tr(`lab.lens.${l}`)}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? tr("lab.pause") : tr("lab.play")} className="rc-press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-chalk text-ink">
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.6v10.8a.8.8 0 0 0 1.2.7l8.6-5.4a.8.8 0 0 0 0-1.4L4.2.9A.8.8 0 0 0 3 1.6z" fill="currentColor" /></svg>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <Dna lab={lab} t={now?.t ?? 0} markers={markers} onSeek={seek} />
            </div>
            <div className="hidden shrink-0 items-center gap-1 sm:flex" role="group" aria-label={tr("lab.speed")}>
              {SPEEDS.map((v) => (
                <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)} className={`min-h-[34px] rounded-full px-2.5 text-[12px] font-semibold tabular-nums ${speed === v ? "bg-turf-raised text-chalk" : "text-chalk-dim"}`}>
                  {v}×
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-chalk-faint">
            <span className="hidden sm:inline">{tr("lab.attacks", { home: lab.short[0] })}</span>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => jump(-1)} aria-label={tr("lab.prev")} className="grid h-8 w-8 place-items-center rounded-full text-chalk hover:bg-turf-raised">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2 3.5 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <select value={kind} onChange={(e) => setKind(e.target.value as MomentKind)} aria-label={tr("lab.jumpTo")} className="min-h-[32px] rounded-full bg-transparent px-1 text-[13px] font-semibold text-chalk">
                {(["goal", "fault", "shot", "turnover"] as MomentKind[]).filter((k) => moments[k].length).map((k) => (
                  <option key={k} value={k} className="bg-ink">
                    {tr(`lab.moment.${k}`)} ({moments[k].length})
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => jump(1)} aria-label={tr("lab.next")} className="grid h-8 w-8 place-items-center rounded-full text-chalk hover:bg-turf-raised">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* a short key, then the idea behind each lens for anyone who wants it */}
      <div className="mx-auto mt-10 grid max-w-[1400px] gap-x-12 gap-y-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)]">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-chalk-faint">{tr("lab.eyebrow")}</p>
          <h1 className="mt-1 font-display text-[clamp(30px,4vw,52px)] font-black uppercase leading-[0.92] [font-stretch:135%]">{tr("lab.title")}</h1>
          <p className="mt-3 max-w-[44ch] text-[15px] leading-relaxed text-chalk-dim">{tr("lab.lede")}</p>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-chalk-dim">
            <li className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-chalk" />{lab.short[0]}</li>
            <li className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#3654ff] ring-1 ring-chalk" />{lab.short[1]}</li>
            <li className="flex items-center gap-2"><i className="h-3 w-3 rotate-45 bg-flare" />{tr("lab.keyFault")}</li>
          </ul>
        </div>
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
          {LENSES.map((l) => (
            <div key={l} className="min-w-0">
              <dt className="flex items-center gap-2 font-display text-[16px] font-extrabold uppercase [font-stretch:115%]">
                <LensIcon l={l} />
                {tr(`lab.lens.${l}`)}
              </dt>
              <dd className="mt-1 text-[14px] leading-snug text-chalk-dim">{tr(`lab.how.${l}`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function Seg({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange(v: string): void }) {
  return (
    <div className="flex rounded-full bg-[#050d4a]/75 p-1 backdrop-blur" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={`min-h-[36px] rounded-full px-3.5 text-[13px] font-semibold ${value === v ? "bg-chalk text-ink" : "text-chalk-dim hover:text-chalk"}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Tag({ lab, i, stage, f, unit }: { lab: LabData; i: number; stage: LabStage | null; f: Frame; unit: Unit }) {
  const { t } = useTranslation();
  if (!stage) return null;
  const [x, y] = stage.toScreen(f.pos[i][0], f.pos[i][1], 3.8);
  const sp = Math.hypot(f.vel[i][0], f.vel[i][1]);
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-[#050d4a]/90 px-3 py-2 text-[13px] shadow-xl backdrop-blur" style={{ left: x, top: y - 8 }}>
      <div className="whitespace-nowrap font-semibold">
        #{lab.numbers[i]} {lab.names[i]}
      </div>
      <div className="whitespace-nowrap text-chalk-dim">
        {lab.short[teamOf(i)]} · {t(`lab.unit.${unit}`)} · {sp.toFixed(1)} m/s
      </div>
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
