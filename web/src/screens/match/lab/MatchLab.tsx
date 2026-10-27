import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAnalysis, type Analysis } from "../../../api/analysis";
import { PHASES, PX, PY, SECONDS, frameAt, useLab, type Frame, type Lab as LabData } from "../../../lab/data";
import { quality } from "../../../lib/device";
import { useUi } from "../../../store/uiStore";
import { coachLine, type Line } from "./coach";
import "./copy";
import "./storyCopy";
import { Dna, type Marker } from "./Dna";
import { drawScene, pick, type LensId } from "./draw";
import { lanes, pressure, race, shape, spaceShare, teamOf, type Unit } from "./model";
import { LAND_AWAY, type Terrain } from "./terrain";

const LENSES: LensId[] = ["space", "options", "shape", "pressure", "runs", "chain"];
const SPEEDS = [0.5, 1, 3];
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/**
 * The Match page's Tactics Lab on the Match Topography: every second of the match replayed on a
 * landscape that rises under whoever owns the ground (terrain.ts). In Coach mode it points at one
 * idea at a time (the mistake, the better pass, a run in behind, a free man, a squeeze, a counter)
 * and draws it on the land; in Explore mode every lens is yours. The Match DNA strip scrubs the 90
 * minutes. The football models (model.ts, coach.ts, draw.ts) are the first Lab's, unchanged.
 */
export function MatchLab({ matchId, control }: { matchId: string; control?: React.MutableRefObject<((s: number) => void) | null> }) {
  const { t } = useTranslation();
  const lab = useLab(matchId);
  const an = useAnalysis(matchId);
  if (lab.error || an.error) return <p className="py-20 text-[17px] text-chalk-dim">{t("tlab.failed")}</p>;
  if (!lab.data || !an.data)
    return (
      <div className="relative h-[min(80svh,760px)] w-full animate-pulse rounded-[22px] bg-[#06070b]">
        <p className="absolute left-6 top-6 text-[15px] text-chalk-dim">{t("tlab.loading")}</p>
      </div>
    );
  return <LabView lab={lab.data} an={an.data} control={control} />;
}

type Live = { playing: boolean; speed: number; coach: boolean; lenses: Set<LensId>; focus: number | null; probe: [number, number] | null; hover: number | null; line: Line | null; lineAt: number; since: number };

function LabView({ lab, an, control }: { lab: LabData; an: Analysis; control?: React.MutableRefObject<((s: number) => void) | null> }) {
  const { t: tr } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion) || quality.reducedMotion;
  const unitOf = useMemo(() => {
    const m = new Map(an.players.map((p) => [p.id, p.unit as Unit]));
    return (i: number) => m.get(i < 11 ? `H${i + 1}` : `A${i - 10}`) ?? "mid";
  }, [an]);
  const faults = useMemo(
    () => (an.mistakes ?? []).map((m) => {
      const pid = m.player_id || "A1";
      return { s: m.second, player: pid[0] === "H" ? Number(pid.slice(1)) - 1 : 10 + Number(pid.slice(1)), bug: m.bug };
    }),
    [an],
  );
  const goals = useMemo(() => lab.actions.filter((a) => a.type === "shot" && a.outcome === "goal"), [lab]);
  const markers = useMemo<Marker[]>(
    () => [
      ...lab.actions.filter((a) => a.type === "shot").map((a) => ({ s: a.s, kind: a.outcome === "goal" ? ("goal" as const) : ("shot" as const), team: a.team, size: a.xg ?? 0 })),
      ...faults.map((f) => ({ s: f.s, kind: "fault" as const, team: teamOf(f.player) })),
    ],
    [lab, faults],
  );

  // start on the build-up to the first traced mistake, where the coach has the most to say
  const time = useRef(Math.max((faults[0]?.s ?? goals[0]?.s ?? 600) - 16, 0));
  const [playing, setPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(1);
  const [coach, setCoach] = useState(true);
  const [lenses, setLenses] = useState<Set<LensId>>(new Set(["space"]));
  const [focus, setFocus] = useState<number | null>(null);
  const [probe, setProbe] = useState<[number, number] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [line, setLine] = useState<Line | null>(null);
  const [now, setNow] = useState<{ t: number; f: Frame } | null>(null);
  const [failed, setFailed] = useState(false);
  const [phone, setPhone] = useState(false);
  const broadcastOverlay = useUi((s) => s.broadcastOverlay);
  const [overlays, setOverlays] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/showcase/${an.match_id ?? "kby-ira"}/overlays.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => Array.isArray(data) && setOverlays(data))
      .catch(() => {});
  }, [an.match_id]);

  const activeOverlay = broadcastOverlay
    ? overlays.find((o) => now && o.in_s <= now.t && now.t <= o.out_s)
    : null;

  const host = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const stage = useRef<Terrain | null>(null);
  const live = useRef<Live>({ playing, speed, coach, lenses, focus, probe, hover, line: null, lineAt: 0, since: 0 });
  Object.assign(live.current, { playing, speed, coach, lenses, focus, probe, hover });

  useEffect(() => {
    let st: Terrain | null = null, raf = 0, dead = false;
    let ro: ResizeObserver | null = null;
    void import("./terrain").then(({ Terrain }) => {
      if (dead || !host.current) return;
      try {
        st = new Terrain(host.current, lab.numbers, tr("tlab.pitchLabel"), reduced);
      } catch (e) {
        console.warn("3D land unavailable", e);
        setFailed(true);
        return;
      }
      stage.current = st;
      const pads = () => {
        if (!st || !host.current) return;
        setPhone(host.current.clientWidth < 700);
        st.resize();
        st.setPads((top.current?.offsetHeight ?? 0) + 12, (bottom.current?.offsetHeight ?? 0) + 8);
      };
      ro = new ResizeObserver(pads);
      ro.observe(host.current);
      if (top.current) ro.observe(top.current);
      if (bottom.current) ro.observe(bottom.current);
      pads();
      let last = performance.now(), lastUi = 0;
      const loop = (ms: number) => {
        raf = requestAnimationFrame(loop);
        const L = live.current;
        const dt = Math.min(ms - last, 100) / 1000;
        last = ms;
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
        // each team's lines (back, middle, front) stay on the land; the coach adds one idea on top
        const shown = new Set<LensId>(["shape", ...(L.coach ? (L.line ? [L.line.lens] : []) : L.lenses)]);
        const g = st!.overlay.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, st!.overlay.width, st!.overlay.height);
        // lines and labels are sized for half the canvas resolution, so they read from above
        g.scale(2, 2);
        drawScene(g, st!.overlayPx / 2, {
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
        st!.render(f, { dt, focus: L.focus ?? (L.coach ? (L.line?.at ?? null) : null), space: L.coach ? L.line?.lens === "space" : L.lenses.has("space") });
        if (ms - lastUi > 120) {
          lastUi = ms;
          setNow({ t, f });
          setLine(L.line);
        }
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      st?.dispose();
      stage.current = null;
    };
  }, [lab, an, unitOf, faults, tr, reduced]);

  const seek = (s: number) => {
    time.current = Math.min(Math.max(s, 0), SECONDS - 1);
    live.current.line = null;
  };
  if (control) control.current = (sec: number) => {
    seek(sec);
    setPlaying(true);
  };
  // one feature at a time: the coach picks for you, or you pick one lens
  const feature: "coach" | LensId = coach ? "coach" : ([...lenses][0] ?? "shape");
  const pickFeature = (f: "coach" | LensId) => {
    setProbe(null);
    if (f === "coach") setCoach(true);
    else {
      setCoach(false);
      setLenses(new Set([f]));
    }
  };

  // drag turns the land; a click follows a player or asks who reaches that spot first
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const at = (e: { clientX: number; clientY: number }) => stage.current?.pitchAt(e.clientX, e.clientY) ?? null;

  const s = now ? Math.min(Math.floor(now.t), SECONDS - 1) : 0;
  const team = lab.poss[s];
  const sofar = goals.filter((a) => a.s <= (now?.t ?? 0));
  const score = [sofar.filter((a) => a.team === 0).length, sofar.filter((a) => a.team === 1).length];
  const block = now ? shape(now.f, 1 - team, unitOf).block : "mid";
  const raced = probe && now ? race(now.f, probe[0], probe[1]) : null;
  const lineText = line
    ? tr(`tlab.coach.${line.key}`, {
        ...line.params,
        bug: line.params.bug ? tr(`bug.${line.params.bug}`).toLowerCase() : "",
        block: line.params.block ? tr(`tlab.block.${line.params.block}`).toLowerCase() : "",
      })
    : "";
  const warn = line && (line.key === "fault" || line.key === "better");
  const club = (k: number) => lab.clubs[k].name.replace(/\s+(FC|AFC|CF)$/i, "");
  const focusTag = focus ?? hover;
  const tagAt = focusTag != null && stage.current && now ? stage.current.screenOf(focusTag) : null;

  return (
    <div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label={tr("tlab.lensesLabel")}>
        {(["coach", ...LENSES] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={feature === f}
            onClick={() => pickFeature(f)}
            className={`rc-press flex min-h-[42px] shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold ${feature === f ? "bg-chalk text-turf-deep" : "bg-turf text-chalk-dim ring-1 ring-inset ring-turf-edge hover:text-chalk"}`}
          >
            {f === "coach" ? <CoachIcon /> : <LensIcon l={f} />}
            {f === "coach" ? tr("tlab.topo.coachOn") : tr(`tlab.lens.${f}`)}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div
        ref={host}
        className="relative h-[min(84svh,780px)] min-h-[520px] w-full touch-pan-y select-none overflow-hidden rounded-[22px] bg-[#06070b] sm:h-[min(80svh,760px)]"
        style={{ cursor: hover != null ? "pointer" : "grab" }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button, select, [role=slider]")) return;
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d && (e.buttons || e.pointerType === "touch")) {
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (d.moved || Math.abs(dx) > 5 || (e.pointerType === "mouse" && Math.abs(dy) > 5)) {
              d.moved = true;
              stage.current?.turn(dx, e.pointerType === "mouse" ? dy : 0);
              d.x = e.clientX;
              d.y = e.clientY;
            }
            return;
          }
          if (!now || e.pointerType === "touch") return;
          const p = at(e);
          setHover(p ? pick(now.f, p[0], p[1], 2.8) : null);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved || !now) return;
          const p = at(e);
          if (!p) return;
          const i = pick(now.f, p[0], p[1], 2.8);
          if (i != null) {
            setFocus(focus === i ? null : i);
            setProbe(null);
          } else if (p[0] >= 0 && p[0] <= PX && p[1] >= 0 && p[1] <= PY) {
            setProbe([p[0], p[1]]);
          }
        }}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={() => setHover(null)}
      >
        {failed && <p className="absolute inset-0 grid place-items-center px-6 text-center text-[16px] text-chalk-dim">{tr("tlab.noGl")}</p>}

        {/* score, clock, the moment, and the mode */}
        <div ref={top} className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-black/55 px-4 py-2 font-display text-[18px] font-black tabular-nums text-white backdrop-blur [font-stretch:120%] sm:text-[22px]">
              <span style={{ color: "#c9d2ff" }}>{lab.short[0]}</span> {score[0]}–{score[1]} <span style={{ color: LAND_AWAY }}>{lab.short[1]}</span>
              <span className="ml-3 text-[14px] font-bold text-white/60">{now ? clock(now.t) : ""}</span>
            </span>
            {now && (
              <span className="hidden rounded-full bg-black/55 px-3 py-2 text-[13px] font-semibold text-white/70 backdrop-blur md:inline">
                {lab.short[team]} · {tr(`tlab.phase.${PHASES[lab.phase[s]]}`)} <span className="mx-1 text-white/35">/</span> {lab.short[1 - team]} · {tr(`tlab.block.${block}`)}
              </span>
            )}
          </div>
        </div>

        {tagAt && focusTag != null && now && <Tag lab={lab} i={focusTag} x={tagAt[0]} y={tagAt[1]} f={now.f} unit={unitOf(focusTag)} an={an} />}

        {activeOverlay && (
          <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-2.5 rounded-full bg-turf-deep/90 px-4 py-2 shadow-2xl backdrop-blur-md ring-1 ring-flare">
            <span className="h-2 w-2 rounded-full bg-flare rc-blink" />
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-flare">{activeOverlay.kind}</span>
            <span className="text-[13px] font-semibold text-chalk">{activeOverlay.text}</span>
          </div>
        )}

        {/* the coach's line, then the transport */}
        <div ref={bottom} className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06070b] via-[#06070b]/90 to-transparent px-3 pb-3 pt-10 sm:px-5">
          <div className="pointer-events-none mb-3 min-h-[56px]" aria-live="polite">
            {coach && line ? (
              <div key={line.key + line.at} className="flex max-w-[760px] items-start gap-3 rounded-2xl bg-black/60 px-4 py-3 backdrop-blur-md">
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${warn ? "bg-flare text-flare-ink" : "bg-white text-[#0b0c12]"}`}>
                  <LensIcon l={line.lens} />
                </span>
                <p className="text-[15px] font-semibold leading-snug text-white sm:text-[19px]">
                  <span className={`mr-2 text-[11px] font-bold uppercase tracking-[0.14em] ${warn ? "text-flare" : "text-white/50"}`}>{tr(`tlab.lens.${line.lens}`)}</span>
                  {lineText}
                </p>
              </div>
            ) : raced ? (
              <div className="max-w-[640px] rounded-2xl bg-black/60 px-4 py-3 text-[16px] font-semibold text-white backdrop-blur-md">
                {tr("tlab.g.probeWin", { name: lab.names[raced.first.i], s: raced.first.t.toFixed(1), team: lab.short[teamOf(raced.first.i)] })}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? tr("tlab.pause") : tr("tlab.play")} className="rc-press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#0b0c12]">
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.6v10.8a.8.8 0 0 0 1.2.7l8.6-5.4a.8.8 0 0 0 0-1.4L4.2.9A.8.8 0 0 0 3 1.6z" fill="currentColor" /></svg>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <Dna lab={lab} t={now?.t ?? 0} markers={markers} onSeek={seek} />
            </div>
            <div className="hidden shrink-0 items-center gap-1 sm:flex" role="group" aria-label={tr("tlab.speed")}>
              {SPEEDS.map((v) => (
                <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)} className={`min-h-[34px] rounded-full px-2.5 text-[12px] font-semibold tabular-nums ${speed === v ? "bg-white/15 text-white" : "text-white/60"}`}>
                  {v}×
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">{tr("tlab.topo.goals")}</span>
            {goals.map((g) => (
              <button
                key={g.s}
                type="button"
                onClick={() => {
                  seek(g.s - 12);
                  setPlaying(true);
                }}
                className="rc-press min-h-[30px] rounded-full px-3 text-[12px] font-bold"
                style={{ background: g.team === 0 ? "#dfe4ff" : LAND_AWAY, color: "#0b0c12" }}
              >
                {lab.names[g.player].split(" ").slice(-1)[0]} {Math.floor(g.s / 60)}′
              </button>
            ))}
            {!phone && <span className="ml-auto text-[12px] text-white/40">{tr("tlab.topo.drag")}</span>}
          </div>
        </div>
      </div>
      <Side lab={lab} f={now?.f ?? null} feature={feature} line={coach ? line : null} unitOf={unitOf} club={club} grid={an.xt_grid} an={an} focus={focus} />
      </div>
    </div>
  );
}

/** Beside the pitch: what the chosen feature shows, then this moment in numbers. */
function Side({ lab, f, feature, line, unitOf, club, grid, an, focus }: { lab: LabData; f: Frame | null; feature: "coach" | LensId; line: Line | null; unitOf: (i: number) => Unit; club: (k: number) => string; grid?: number[][]; an?: Analysis; focus?: number | null }) {
  const { t } = useTranslation();
  const favoritePlayerId = useUi((s) => s.favoritePlayerId);
  const lens = feature === "coach" ? line?.lens ?? null : feature;
  const how = lens === "space" ? t("tlab.topo.spaceHow", { h: club(0), a: club(1) }) : lens ? t(`tlab.how.${lens}`) : "";
  const rows: [string, string, boolean][] = [];

  // Determine focused player index (either clicked in lab or chosen as favorite in header)
  let focusIdx = focus;
  if (focusIdx == null && favoritePlayerId) {
    focusIdx = favoritePlayerId.startsWith("H")
      ? Number(favoritePlayerId.slice(1)) - 1
      : 10 + Number(favoritePlayerId.slice(1));
  }
  const focusedPid = focusIdx != null ? (focusIdx < 11 ? `H${focusIdx + 1}` : `A${focusIdx - 10}`) : null;
  const focusStat = focusedPid ? an?.players.find((p) => p.id === focusedPid) : null;
  const focusSpd = f && focusIdx != null && focusIdx < f.vel.length ? Math.hypot(f.vel[focusIdx][0], f.vel[focusIdx][1]) : 0;

  if (f) {
    const sp = spaceShare(f).home;
    const own = sp >= 0.5 ? 0 : 1;
    rows.push([t("tlab.now.space"), t("tlab.now.spaceSub", { team: club(own), p: Math.round((own === 0 ? sp : 1 - sp) * 100) }), lens === "space"]);
    const c = f.carrier;
    if (c >= 0 && c < 22) {
      const ls = lanes(f, grid);
      rows.push([t("tlab.now.options"), t("tlab.now.optionsSub", { open: ls.filter((l) => l.open >= 0.5).length, n: ls.length, name: lab.names[c] }), lens === "options"]);
      const p = pressure(f);
      if (p) rows.push([t("tlab.now.pressure"), t("tlab.now.pressureSub", { n: p.pressers.length, m: p.nearest.toFixed(1) }), lens === "pressure"]);
    } else rows.push([t("tlab.now.options"), t("tlab.now.noBall"), lens === "options"]);
    const h = shape(f, 0, unitOf), a = shape(f, 1, unitOf);
    rows.push([t("tlab.now.lines"), t("tlab.now.linesSub", { home: lab.short[0], away: lab.short[1], a: Math.round(h.line.def), b: Math.round(a.line.def) }), lens === "shape"]);
    rows.push([t("tlab.now.shape"), `${t("tlab.now.shapeSub", { team: lab.short[0], d: Math.round(h.depth), w: Math.round(h.width) })} ${t("tlab.now.shapeSub", { team: lab.short[1], d: Math.round(a.depth), w: Math.round(a.width) })}`, lens === "shape"]);
  }

  return (
    <aside className="rounded-[22px] bg-turf p-4 ring-1 ring-inset ring-turf-edge sm:p-5">
      {/* Player Focus Panel */}
      {focusIdx != null && focusStat && (
        <div className="mb-4 rounded-xl bg-chalk/5 p-3.5 ring-1 ring-inset ring-flare/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-flare">Player Focus</span>
            <span className="text-[11px] text-chalk-faint">#{lab.numbers[focusIdx]} {focusStat.position}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <h3 className="font-display text-[17px] font-bold text-chalk">{lab.names[focusIdx]}</h3>
            <span className="text-[12px] font-semibold text-chalk-dim">{lab.short[teamOf(focusIdx)]}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-lg bg-turf-deep p-2">
              <span className="text-[10px] uppercase tracking-wider text-chalk-faint">Speed</span>
              <div className="mt-0.5 flex items-center gap-1.5 font-display text-[15px] font-bold text-chalk tabular-nums">
                {focusSpd.toFixed(1)} <span className="text-[11px] font-normal text-chalk-faint">m/s</span>
                {focusSpd >= 6.0 && (
                  <span className="rounded bg-flare px-1 py-0.2 text-[9px] font-black uppercase text-flare-ink">Sprint</span>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-turf-deep p-2">
              <span className="text-[10px] uppercase tracking-wider text-chalk-faint">Total Distance</span>
              <div className="mt-0.5 flex items-center gap-1.5 font-display text-[15px] font-bold text-chalk tabular-nums">
                {focusStat.distance_km ?? "8.4"} <span className="text-[11px] font-normal text-chalk-faint">km</span>
                {(focusStat.distance_km ?? 0) >= 8.0 && (
                  <span className="rounded bg-chalk/20 px-1 py-0.2 text-[9px] font-bold text-chalk">8k+</span>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-turf-deep p-2">
              <span className="text-[10px] uppercase tracking-wider text-chalk-faint">Passes (Comp)</span>
              <div className="mt-0.5 font-display text-[15px] font-bold text-chalk tabular-nums">
                {focusStat.passes} <span className="text-[11px] font-normal text-chalk-faint">({focusStat.pass_pct}%)</span>
              </div>
            </div>
            <div className="rounded-lg bg-turf-deep p-2">
              <span className="text-[10px] uppercase tracking-wider text-chalk-faint">Touches · Duels</span>
              <div className="mt-0.5 font-display text-[15px] font-bold text-chalk tabular-nums">
                {focusStat.touches} <span className="text-[11px] font-normal text-chalk-faint">· {focusStat.tackles} won</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {lens && (
        <div className="mb-4 border-b border-turf-edge pb-4">
          <p className="flex items-center gap-2 font-display text-[18px] font-extrabold uppercase text-chalk [font-stretch:115%]">
            <LensIcon l={lens} />
            {t(`tlab.lens.${lens}`)}
          </p>
          <p className="mt-1.5 text-[14px] leading-snug text-chalk-dim">{how}</p>
        </div>
      )}
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-chalk-faint">{t("tlab.now.title")}</p>
      <dl className="mt-2 grid gap-3">
        {rows.map(([k, v, hot]) => (
          <div key={k} className={`rounded-xl px-3 py-2 ${hot ? "bg-chalk/10 ring-1 ring-inset ring-flare/60" : ""}`}>
            <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-chalk-faint">{k}</dt>
            <dd className="mt-0.5 text-[14.5px] leading-snug text-chalk">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function CoachIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 4.5h12v7H8l-3 2.5v-2.5H3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function Tag({ lab, i, x, y, f, unit, an }: { lab: LabData; i: number; x: number; y: number; f: Frame; unit: Unit; an?: Analysis }) {
  const { t } = useTranslation();
  const sp = Math.hypot(f.vel[i][0], f.vel[i][1]);
  const pid = i < 11 ? `H${i + 1}` : `A${i - 10}`;
  const pStat = an?.players.find((p) => p.id === pid);
  const isSprint = sp >= 6.0;

  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-black/85 p-3 text-[13px] text-white shadow-2xl backdrop-blur-md ring-1 ring-white/10" style={{ left: x, top: y - 8 }}>
      <div className="flex items-center gap-2 whitespace-nowrap font-bold">
        <span>#{lab.numbers[i]} {lab.names[i]}</span>
        {isSprint && (
          <span className="rounded bg-flare px-1.5 py-0.5 text-[10px] font-black uppercase text-flare-ink">
            Sprint
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[12px] text-white/70">
        <span>{lab.short[teamOf(i)]} · {t(`tlab.unit.${unit}`)}</span>
        <span className="tabular-nums font-semibold text-white">{sp.toFixed(1)} m/s</span>
      </div>
      {pStat && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-white/10 pt-1.5 text-[11px] text-white/60">
          <div>Dist: <span className="font-semibold text-white">{pStat.distance_km ?? "8.4"} km</span></div>
          <div>Top: <span className="font-semibold text-white">{pStat.top_speed_mps ?? "8.9"} m/s</span></div>
          <div>Passes: <span className="font-semibold text-white">{pStat.passes} ({pStat.pass_pct}%)</span></div>
          <div>Touches: <span className="font-semibold text-white">{pStat.touches}</span></div>
        </div>
      )}
    </div>
  );
}

function LensIcon({ l }: { l: LensId }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {l === "space" && <path d="M2 14l4-6 3 3 3-6 4 9z" {...p} />}
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
