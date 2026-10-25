import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Analysis } from "../api/analysis";
import { DEMO_MATCHES } from "../api/rest";
import type { Evidence, RecordedReplay } from "../api/types";
import { DepthSwitch } from "../components/DepthSwitch";
import { registerAutopsyWords } from "../lab/autopsy/i18n";
import { buildAutopsy, goalsOf, prevented, type Autopsy as Data, type GoalRef, type StacksDossier, type Traced } from "../lab/autopsy/model";
import { betterLine, broadcastScript, honestLines, verdictVars } from "../lab/autopsy/script";
import { clock, createStage, slowAt, stepsOf, trialRows, type AutopsyStage, type Step } from "../lab/autopsy/stadium";
import "../lab/autopsy/autopsy.css";
import { useLab } from "../lab/data";
import { quality } from "../lib/device";
import { go, goalParam, pageHref } from "../lib/nav";
import { useFullTime } from "../store/selectors";
import { useUi } from "../store/uiStore";

registerAutopsyWords();

const getJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.json();
};
const surname = (name: string) => name.split(" ").slice(-1)[0];

/**
 * Goal Autopsy: one goal, taken apart in a floodlit 3D stadium. The goal, the two plans, the move
 * against the back line, each mistake with where he should have been, the suspects' fixed runs,
 * 200 replays each, the verdict, the fix and how the engine decides. A goal the Debugger finds no
 * defender at fault for gets an honest football answer.
 */
export function Autopsy() {
  const { t } = useTranslation();
  const [pick, setPick] = useState<string | null>(() => goalParam());
  const lab = useLab();
  const full = useFullTime();
  const id = lab.data?.id;
  const replays = useQuery({
    queryKey: ["replays", id],
    enabled: !!id,
    staleTime: Infinity,
    queryFn: () => getJson<Record<string, Record<string, RecordedReplay>>>(`${import.meta.env.BASE_URL}showcase/${id}/replays.json`),
  });
  const analyses = useQueries({
    queries: DEMO_MATCHES.map((m) => ({
      queryKey: ["analysis", m],
      staleTime: Infinity,
      queryFn: () => getJson<Analysis>(`${import.meta.env.BASE_URL}showcase/${m}/analysis.json`),
    })),
  });
  // the Match page's export carries the pre-match dossier; without it the autopsy derives its own
  const stacks = useQuery({
    queryKey: ["stacks", id],
    enabled: !!id,
    staleTime: Infinity,
    queryFn: () => getJson<{ dossier?: StacksDossier }>(`${import.meta.env.BASE_URL}showcase/${id}/stacks.json`).catch((): { dossier?: StacksDossier } => ({})),
  });
  const ready = !!lab.data && !!replays.data && analyses.every((q) => q.data) && !full.loading && !stacks.isPending;
  const goals = useMemo(() => (ready ? goalsOf(lab.data!, full.traces) : []), [ready, lab.data, full.traces]);
  // the goal asked for in the link, else the first traced goal, else the first goal
  const goal = useMemo(() => {
    if (!goals.length) return null;
    if (pick) {
      const exact = goals.find((g) => g.id === pick);
      if (exact) return exact;
      const suffix = goals.find((g) => g.id.endsWith(pick) || pick.endsWith(g.id));
      if (suffix) return suffix;
      const secondMatch = goals.find((g) => pick.includes(String(g.s)) || g.id.includes(pick));
      if (secondMatch) return secondMatch;
      return null;
    }
    return goals.find((g) => g.traced) ?? goals[0];
  }, [goals, pick]);

  const data = useMemo(() => {
    if (!ready || !goal) return null;
    const all = Object.fromEntries(DEMO_MATCHES.map((m, k) => [m, analyses[k].data!]));
    const ev = full.traces.find((e: Evidence) => e.goal_id === goal.id) ?? null;
    return buildAutopsy(lab.data!, goal, ev, replays.data![goal.id] ?? {}, all, stacks.data?.dossier ?? null);
  }, [ready, goal, full.traces, lab.data, replays.data, stacks.data]);
  const failed = lab.error || replays.error || analyses.some((q) => q.error) || full.error;
  const choose = (g: GoalRef) => {
    setPick(g.id);
    history.replaceState(null, "", pageHref("autopsy", { goal: g.id }));
  };

  return (
    <section className="relative h-[calc(100dvh-var(--header-h))] min-h-[560px] w-full overflow-hidden bg-[#04060f]">
      {failed ? (
        <p className="grid h-full place-items-center px-6 text-center text-[17px] text-chalk-dim">{t("autopsy.failed")}</p>
      ) : !ready ? (
        <p className="absolute left-6 top-6 animate-pulse text-[15px] text-chalk-dim">{t("autopsy.loading")}</p>
      ) : pick && !goal ? (
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <p className="text-[17px] font-semibold text-chalk-dim mb-4">
              Goal &ldquo;{pick}&rdquo; not found in this match.
            </p>
            <button
              type="button"
              onClick={() => {
                setPick(null);
                history.replaceState(null, "", pageHref("autopsy"));
              }}
              className="rounded-full border border-white/20 bg-[#070a1d]/80 px-4 py-2 text-[13px] font-semibold text-chalk hover:border-[#c6ff4d]"
            >
              View Match Autopsy
            </button>
          </div>
        </div>
      ) : !data ? (
        <p className="grid h-full place-items-center px-6 text-center text-[17px] text-chalk-dim">{t("autopsy.noGoals")}</p>
      ) : (
        <Theatre key={data.id} a={data} goals={goals} onGoal={choose} />
      )}
    </section>
  );
}

function Theatre({ a, goals, onGoal }: { a: Data; goals: GoalRef[]; onGoal: (g: GoalRef) => void }) {
  const { t, i18n } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion) || quality.reducedMotion;
  const expert = useUi((s) => s.depth) === "expert";
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const stage = useRef<AutopsyStage | null>(null);
  const steps = useMemo(() => stepsOf(a), [a]);
  const dev = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
  const [n, setN] = useState(() => Math.min(Number(dev?.get("step") ?? 0), steps.length - 1));
  const [playing, setPlaying] = useState(() => !reduced && !dev?.has("hold"));
  const [glFailed, setGlFailed] = useState(false);
  const [engine, setEngine] = useState(false);
  const [wide, setWide] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const { lab } = a;
  const say = useCallback((k: string, v?: Record<string, string | number>) => t(`autopsy.${k}`, v), [t]);

  useEffect(() => {
    const canvas = canvasRef.current!, box = boxRef.current!;
    let s: AutopsyStage;
    try {
      s = createStage(canvas, a, {
        reduced,
        phone: quality.phone,
        dpr: quality.dpr,
        say,
        still: !!dev?.has("hold"),
        onHover: (html, x, y) => {
          const el = hoverRef.current;
          if (!el) return;
          el.hidden = !html;
          if (!html) return;
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          el.innerHTML = html;
        },
      });
    } catch {
      setGlFailed(true);
      return;
    }
    stage.current = s;
    const size = () => {
      const r = box.getBoundingClientRect();
      const w = r.width >= 900;
      setWide(w);
      // the copy sits in a left column on wide screens and along the bottom on narrow ones
      s.resize(r.width, r.height, w ? { left: 452, top: 96, bottom: 72 } : { left: 0, top: 108, bottom: Math.round(r.height * 0.4) + 64 });
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);
    const hold = dev?.has("hold") ? Number(dev.get("hold")) : undefined;
    s.show(n, hold ?? 0);
    s.setPlaying(playing && hold == null);
    return () => {
      ro.disconnect();
      s.dispose();
      stage.current = null;
    };
    // the stage is rebuilt for a new goal or language only; steps and play state are pushed to it below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, say, reduced]);

  const goTo = useCallback((i: number, play = true) => {
    const k = Math.max(0, Math.min(steps.length - 1, i));
    setN(k);
    setElapsed(0);
    stage.current?.show(k);
    const p = play && !reduced;
    setPlaying(p);
    stage.current?.setPlaying(p);
  }, [steps.length, reduced]);

  // the clock: advance through the steps while playing, stop after the verdict
  useEffect(() => {
    let raf = 0, lastPush = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = stage.current;
      if (!s) return;
      const tt = s.time();
      if (now - lastPush > 120) { setElapsed(tt); lastPush = now; }
      if (!playing || tt < steps[n].dur - 0.01) return;
      if (n < steps.length - 1) goTo(n + 1);
      else { setPlaying(false); s.setPlaying(false); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [n, playing, steps, goTo]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [role=radiogroup]")) return;
      if (e.key === "ArrowRight") goTo(n + 1);
      else if (e.key === "ArrowLeft") goTo(n - 1);
      else if (e.key === " " && !(e.target as HTMLElement).closest("button")) {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") setEngine(false);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const done = n === steps.length - 1 && !playing && elapsed >= steps[n].dur - 0.05;
  function toggle() {
    if (done) return goTo(0);
    const p = !playing;
    setPlaying(p);
    stage.current?.setPlaying(p);
  }

  const download = () => {
    const text = broadcastScript(a, i18n.getFixedT(i18n.language));
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = t("autopsy.script.file", { id: a.id });
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const st = steps[n];
  const total = steps.reduce((x, s) => x + s.dur, 0);
  const before = steps.slice(0, n).reduce((x, s) => x + s.dur, 0);
  const [home, away] = [lab.clubs[0].name, lab.clubs[1].name];
  const rail: { key: string; label: string; from: number; to: number }[] = [];
  steps.forEach((s, i) => {
    const key = s.beat === "mistake" ? "mistakes" : s.beat;
    const last = rail[rail.length - 1];
    if (last && last.key === key) last.to = i;
    else rail.push({ key, label: t(`autopsy.beat.${key}`), from: i, to: i });
  });

  return (
    <div ref={boxRef} className="absolute inset-0 select-none">
      <canvas ref={canvasRef} role="img" aria-label={t("autopsy.stageLabel")} className={`absolute inset-0 block h-full w-full ${reduced ? "autopsy-fade" : ""}`} key={reduced ? n : "c"} />
      <div ref={hoverRef} hidden className="autopsy-hover" />
      {glFailed && <p className="absolute inset-0 grid place-items-center px-6 text-center text-[16px] text-chalk-dim">{t("autopsy.noGl")}</p>}

      {/* top: which meeting and goal, the depth switch, play */}
      <header className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-[#04060f]/90 to-transparent px-4 pb-6 pt-3 sm:px-6 sm:pt-4">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-[#c6ff4d]">{t("autopsy.eyebrow")}</p>
          <p className="truncate text-[13px] font-semibold text-chalk-dim">{t("autopsy.matchLine", { home, away, n: a.dossier.meeting })}</p>
          {goals.length > 1 && (
            <div role="group" aria-label={t("autopsy.goalsLabel")} className="-mx-1 mt-2 flex max-w-[calc(100vw-32px)] gap-1.5 overflow-x-auto px-1 pb-1 sm:max-w-[640px]">
              {goals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={g.id === a.id}
                  onClick={() => g.id !== a.id && onGoal(g)}
                  className="rc-press flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-[#070a1d]/60 px-3 text-[12.5px] font-semibold text-chalk-dim backdrop-blur aria-pressed:border-chalk aria-pressed:bg-chalk aria-pressed:text-[#070a1d]"
                >
                  <i aria-hidden className={`block h-1.5 w-1.5 rounded-full ${g.traced ? "bg-[#c6ff4d]" : "bg-current opacity-40"}`} />
                  {t("autopsy.goalChip", { clock: clock(g.s), name: surname(lab.names[g.scorer]) })}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DepthSwitch className="hidden bg-[#070a1d]/60 backdrop-blur sm:inline-flex" />
          <button
            type="button"
            onClick={toggle}
            className="rc-press h-10 rounded-full bg-chalk px-4 text-[13.5px] font-bold text-[#070a1d]"
          >
            {done ? t("autopsy.again") : playing ? t("autopsy.pause") : t("autopsy.play")}
          </button>
        </div>
      </header>

      {/* the copy for this step */}
      <article
        key={`${n}-${expert}`}
        aria-live="polite"
        className={`autopsy-card absolute overflow-y-auto rounded-[18px] border border-[#2a3160] bg-[#05070f]/80 backdrop-blur-md ${
          wide ? "bottom-[84px] left-6 max-h-[calc(100%-200px)] w-[420px] px-6 pb-6 pt-5" : "bottom-[68px] left-3 right-3 max-h-[40%] px-4 pb-4 pt-3.5"
        }`}
      >
        <Copy a={a} st={st} t={t} expert={expert} elapsed={reduced ? 1e3 : elapsed} download={download} openEngine={() => setEngine(true)} wide={wide} />
        {!wide && <DepthSwitch className="mt-3" />}
      </article>

      {/* the rail: one segment per beat, filled as it plays */}
      <nav aria-label={t("autopsy.beats")} className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-b from-transparent to-[#04060f]/95 px-3 pb-3 pt-5 sm:gap-3 sm:px-6">
        <button type="button" onClick={() => goTo(n - 1)} disabled={n === 0} aria-label={t("autopsy.back")} className="rc-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 text-chalk disabled:opacity-30">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <ol className="flex min-w-0 flex-1 gap-1.5">
          {rail.map((r) => {
            const a0 = steps.slice(0, r.from).reduce((x, s) => x + s.dur, 0);
            const len = steps.slice(r.from, r.to + 1).reduce((x, s) => x + s.dur, 0);
            const fillK = Math.max(0, Math.min(1, (before + elapsed - a0) / len));
            const here = n >= r.from && n <= r.to;
            return (
              <li key={r.key} className="min-w-0" style={{ flex: `${Math.max(len, total * 0.08)} 1 0` }}>
                <button
                  type="button"
                  onClick={() => goTo(r.from)}
                  aria-current={here ? "step" : undefined}
                  className={`grid h-10 w-full content-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] ${here ? "text-chalk" : "text-chalk-faint"}`}
                >
                  <span className="relative block h-[3px] overflow-hidden rounded bg-white/20">
                    <i className={`absolute inset-y-0 left-0 rounded ${r.key === "verdict" || r.key === "mistakes" ? "bg-[#c6ff4d]" : "bg-chalk"}`} style={{ width: `${fillK * 100}%` }} />
                  </span>
                  <span className="hidden truncate sm:block">{r.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={() => goTo(n + 1)} disabled={n === steps.length - 1} aria-label={t("autopsy.next")} className="rc-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 text-chalk disabled:opacity-30">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </nav>

      {engine && <EngineDiagram t={t} close={() => setEngine(false)} />}
    </div>
  );
}

type T = ReturnType<typeof useTranslation>["t"];

function Copy({ a, st, t, expert, elapsed, download, openEngine, wide }: { a: Data; st: Step; t: T; expert: boolean; elapsed: number; download: () => void; openEngine: () => void; wide: boolean }) {
  const { lab } = a;
  const [home, away] = [lab.clubs[0].name, lab.clubs[1].name];
  const Kicker = ({ children }: { children: React.ReactNode }) => <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c6ff4d]">{children}</p>;
  const Title = ({ children }: { children: React.ReactNode }) => (
    <h2 className={`mt-1.5 text-balance font-display font-black leading-[1.02] tracking-display [font-stretch:118%] ${wide ? "text-[30px]" : "text-[22px]"}`}>{children}</h2>
  );
  const Line = ({ children, dim }: { children: React.ReactNode; dim?: boolean }) => <p className={`mt-2 text-[15px] leading-[1.45] ${dim ? "text-chalk-faint" : "text-chalk-dim"}`}>{children}</p>;

  if (st.beat === "plans") {
    const fact = (k: 0 | 1) => {
      const f = a.dossier.facts[k][0];
      return t(`autopsy.pre.${f.key}`, { team: lab.clubs[k].name, ...f.params });
    };
    return (
      <>
        <Kicker>{t("autopsy.plans.k")}</Kicker>
        <Title>{fact(a.def)}</Title>
        <Line>{fact(a.att)}</Line>
        <Line dim>{a.dossier.prev ? t("autopsy.pre.prev", { home, away, h: a.dossier.prev[0], a: a.dossier.prev[1] }) : t("autopsy.pre.first")}</Line>
        {expert && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {([a.def, a.att] as const).flatMap((k) =>
              a.dossier.facts[k].map((f) => (
                <li key={`${k}${f.key}`} className="rounded-full border border-white/20 px-2.5 py-1 text-[12.5px] text-chalk-dim">
                  <b>{lab.clubs[k].short_name}</b> {t(`autopsy.pre.x.${f.key}`, f.params)}
                </li>
              )),
            )}
          </ul>
        )}
      </>
    );
  }
  if (st.beat === "goal") {
    return (
      <>
        <div className="flex items-center gap-2">
          <Kicker>{t("autopsy.goal.k")}</Kicker>
          {elapsed >= slowAt(a) && <span className="autopsy-fade rounded-full border border-[#c6ff4d]/50 px-2 py-0.5 text-[11px] font-semibold text-[#c6ff4d]">{t("autopsy.goal.slow")}</span>}
        </div>
        <Title>{t("autopsy.goal.title", { clock: clock(a.goalS), scorer: lab.names[a.scorer] })}</Title>
        <Line>{t("autopsy.goal.score", { home, away, h: a.score[0], a: a.score[1] })}</Line>
        <Line dim>{t("autopsy.reconstruction")}</Line>
        {a.kind === "traced" && <Line>{t("autopsy.goal.traced", { s: Math.round(a.goalS - a.j.culprit.second) })}</Line>}
        {expert && a.chance && <Line dim>{`${a.chance.xg.toFixed(2)} xG · ${a.chance.distance_m.toFixed(1)} m`}</Line>}
      </>
    );
  }
  if (st.beat === "move") {
    const v = { att: lab.clubs[a.att].name, def: lab.clubs[a.def].name };
    return (
      <>
        <Kicker>{t("autopsy.move.k")}</Kicker>
        <Title>{t("autopsy.move.title")}</Title>
        <Line>{t(a.kind === "traced" ? "autopsy.move.body" : "autopsy.move.bodyHonest", v)}</Line>
      </>
    );
  }
  if (st.beat === "runs" && a.kind === "traced") {
    return (
      <>
        <Kicker>{t("autopsy.runs.k")}</Kicker>
        <Title>{t("autopsy.runs.title")}</Title>
        <Line>{t("autopsy.runs.body")}</Line>
      </>
    );
  }
  if (st.beat === "fix" && a.kind === "traced") {
    const v = verdictVars(a), c = a.j.culprit;
    return (
      <>
        <Kicker>{t("autopsy.fix.k")}</Kicker>
        <Title>{t("autopsy.fix.title")}</Title>
        <Line>{c.offside ? t("autopsy.fix.body", { ...v, m: v.by }) : t("autopsy.fix.bodyOpen", v)}</Line>
        <Line dim>{t("autopsy.verdict.why2Count", v)}</Line>
      </>
    );
  }
  if (st.beat === "engine" && a.kind === "traced") {
    return (
      <>
        <Kicker>{t("autopsy.engine.k")}</Kicker>
        <EngineSteps t={t} />
      </>
    );
  }
  if (st.beat === "mistake" && a.kind === "traced") {
    const m = a.mistakes[st.k];
    return (
      <>
        <Kicker>{t("autopsy.mistake.k", { n: st.k + 1, of: a.mistakes.length })}</Kicker>
        <Title>{t("autopsy.mistake.title", { name: lab.names[m.x.player], m: m.x.behind.toFixed(1) })}</Title>
        <Line>{betterLine(a, st.k, t)}</Line>
        {expert && (
          <>
            <Line dim>{t("autopsy.mistake.x", { base: m.x.base, fixed: m.x.fixed })}</Line>
            <p className="mt-2 flex items-center gap-2 text-[12.5px] text-chalk-faint">
              <i aria-hidden className="block h-3 w-3 shrink-0 rounded-[3px] bg-[#c6ff4d]/60" />
              {t("autopsy.mistake.spaceX")}
            </p>
          </>
        )}
      </>
    );
  }
  if (st.beat === "trial" && a.kind === "traced") {
    return (
      <>
        <Kicker>{t("autopsy.trial.k")}</Kicker>
        <Title>{t("autopsy.trial.title")}</Title>
        <Trial a={a} t={t} expert={expert} elapsed={elapsed} />
        <Line dim>{t("autopsy.trial.line")}</Line>
      </>
    );
  }
  if (st.beat === "verdict" && a.kind === "traced") {
    const v = verdictVars(a);
    const c = a.j.culprit;
    return (
      <>
        <Kicker>{t("autopsy.verdict.k")}</Kicker>
        <Title>{t("autopsy.verdict.title", v)}</Title>
        <Formula a={a} t={t} expert={expert} />
        <Line>{t("autopsy.verdict.why1", v)}</Line>
        <Line>{t(c.offside && c.fixed === 0 ? "autopsy.verdict.why2" : "autopsy.verdict.why2Count", v)}</Line>
        <Actions t={t} download={download} openEngine={openEngine} show={elapsed > 2} expert={expert} />
      </>
    );
  }
  const [title, line, x] = honestLines(a, t);
  return (
    <>
      <Kicker>{t("autopsy.honest.k")}</Kicker>
      <Title>{title}</Title>
      <Line>{line}</Line>
      {expert && x && <Line dim>{x}</Line>}
      <Actions t={t} download={download} openEngine={openEngine} show expert={expert} />
    </>
  );
}

function Actions({ t, download, openEngine, show, expert }: { t: T; download: () => void; openEngine: () => void; show: boolean; expert: boolean }) {
  return (
    <div className={`mt-4 flex flex-wrap gap-2 transition-opacity duration-500 ${show ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      {expert && <button type="button" onClick={download} className="rc-press inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[#c6ff4d] px-4 text-[13.5px] font-bold text-[#0b1028]">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M8 2v8m0 0-3.5-3.5M8 10l3.5-3.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {t("autopsy.verdict.script")}
      </button>}
      <button type="button" onClick={openEngine} className="rc-press min-h-[40px] rounded-full border border-white/25 px-4 text-[13.5px] font-semibold text-chalk">
        {t("autopsy.engine.open")}
      </button>
    </div>
  );
}

/** 200 replays per row as a 20 × 10 field: goals fill from the left (bright), no-goals stay hollow. */
function Trial({ a, t, expert, elapsed }: { a: Traced; t: T; expert: boolean; elapsed: number }) {
  const rows = [
    { key: "base", label: t("autopsy.trial.asPlayed"), g: a.j.culprit.base, n: a.j.culprit.trials, tone: "#f4f6ff", at: 0.4 },
    ...trialRows(a).map((x, k) => ({ key: String(x.player), label: t("autopsy.trial.fixed", { name: surname(a.lab.names[x.player]) }), g: x.fixed, n: x.trials, tone: k === 0 ? "#c6ff4d" : "#9ecb42", at: 1.2 + 2.4 * k })),
  ];
  return (
    <div className="mt-3 grid gap-2.5">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <p className="truncate text-[13px] font-semibold text-chalk">{r.label}</p>
          <p className="text-right text-[12.5px] tabular-nums text-chalk-faint">{expert ? t("autopsy.trial.count", { g: r.g, n: r.n }) : `${Math.round((100 * r.g) / r.n)}%`}</p>
          <Field g={r.g} n={r.n} tone={r.tone} k={Math.max(0, Math.min(1, (elapsed - r.at) / 1.6))} />
        </div>
      ))}
      <p className="flex gap-4 text-[12px] text-chalk-faint">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="block h-2 w-2 rounded-full bg-chalk" />{t("autopsy.trial.goal")}</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="block h-2 w-2 rounded-full border border-chalk/50" />{t("autopsy.trial.noGoal")}</span>
      </p>
    </div>
  );
}

function Field({ g, n, tone, k }: { g: number; n: number; tone: string; k: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(devicePixelRatio, 2), w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const x = c.getContext("2d")!;
    x.scale(dpr, dpr);
    const cols = 40, rows = Math.ceil(n / cols), step = w / cols, r = Math.min(step, h / rows) * 0.34;
    // each replay drops into place in a shuffled order: goals land on the left, misses on the right
    for (let i = 0; i < n; i++) {
      const order = (i * 97) % n;
      const land = Math.max(0, Math.min(1, k * 1.25 - (order / n) * 0.25));
      if (land <= 0) continue;
      const col = Math.floor(i / rows), row = i % rows;
      const cx = step * (col + 0.5), cy = (h / rows) * (row + 0.5) - (1 - land) * 10;
      x.globalAlpha = land;
      x.beginPath();
      x.arc(cx, cy, r, 0, Math.PI * 2);
      if (i < g) { x.fillStyle = tone; x.fill(); }
      else { x.strokeStyle = "rgba(244,246,255,.4)"; x.lineWidth = 1; x.stroke(); }
    }
  }, [g, n, tone, k]);
  return <canvas ref={ref} aria-hidden className="col-span-2 block h-[30px] w-full" />;
}

/** blame = his prevented goals ÷ all prevented goals, drawn as one bar split by who prevents them */
function Formula({ a, t, expert }: { a: Traced; t: T; expert: boolean }) {
  const parts = a.mistakes.map((m) => m.x).filter((x) => prevented(x) > 0).sort((p, q) => prevented(q) - prevented(p));
  const v = verdictVars(a);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <figure className="mt-3">
      <figcaption className="text-[12.5px] text-chalk-faint">{t("autopsy.verdict.formula")}</figcaption>
      <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-white/10">
        {parts.map((x) => (
          <i key={x.player} className={`autopsy-bar block h-full ${x === a.j.culprit ? "bg-[#c6ff4d]" : "bg-chalk/45"}`} style={{ width: on ? `${(100 * prevented(x)) / a.total}%` : "0%" }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 text-[12.5px] text-chalk-dim">
        {parts.map((x) => (
          <span key={x.player} className={x === a.j.culprit ? "font-semibold text-[#c6ff4d]" : ""}>
            {expert ? t("autopsy.verdict.prevented", { name: surname(a.lab.names[x.player]), n: prevented(x) }) : `${surname(a.lab.names[x.player])} ${Math.round(x.blame)}%`}
          </span>
        ))}
        {expert && <span className="tabular-nums text-chalk-faint">{t("autopsy.verdict.formulaX", v)}</span>}
      </div>
    </figure>
  );
}

/** the engine's five steps, as a short list in the card */
function EngineSteps({ t }: { t: T }) {
  const steps = t("autopsy.engine.steps", { returnObjects: true }) as [string, string][];
  return (
    <>
      <h2 className="mt-1.5 text-balance font-display text-[24px] font-black leading-[1.02] tracking-display [font-stretch:118%] sm:text-[28px]">{t("autopsy.engine.title")}</h2>
      <ol className="mt-3 grid gap-2">
        {steps.map(([k, line], i) => (
          <li key={k} className="grid grid-cols-[22px_1fr] gap-2 text-[14px] leading-snug">
            <span className="font-bold text-[#c6ff4d]">{i + 1}</span>
            <span><b className="text-chalk">{k}.</b> <span className="text-chalk-dim">{line}</span></span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => go("story")} className="mt-3 text-[14px] font-semibold text-[#c6ff4d] underline underline-offset-4">{t("autopsy.engine.story")}</button>
    </>
  );
}

function EngineDiagram({ t, close }: { t: T; close: () => void }) {
  const steps = t("autopsy.engine.steps", { returnObjects: true }) as [string, string][];
  const icons = [
    <g key="0"><rect x="6" y="20" width="36" height="14" rx="2" fill="none" stroke="currentColor" opacity=".5" /><rect x="6" y="10" width="36" height="14" rx="2" fill="none" stroke="#c6ff4d" /><circle cx="28" cy="17" r="3" fill="#c6ff4d" /></g>,
    <g key="1"><circle cx="16" cy="24" r="4" fill="none" stroke="currentColor" strokeDasharray="2 2" /><circle cx="32" cy="24" r="4" fill="#c6ff4d" /><path d="M20 24h8" stroke="#c6ff4d" strokeDasharray="2 2" /></g>,
    <g key="2">{Array.from({ length: 24 }, (_, i) => <circle key={i} cx={8 + (i % 8) * 4.6} cy={14 + Math.floor(i / 8) * 7} r="1.6" fill="currentColor" opacity={0.35 + (i % 3) * 0.25} />)}</g>,
    <g key="3"><rect x="8" y="12" width="30" height="7" rx="3.5" fill="currentColor" opacity=".7" /><rect x="8" y="26" width="4" height="7" rx="3.5" fill="#c6ff4d" /></g>,
    <g key="4"><circle cx="24" cy="22" r="11" fill="none" stroke="currentColor" opacity=".35" strokeWidth="5" /><path d="M24 11a11 11 0 1 1-10.5 14.3" fill="none" stroke="#c6ff4d" strokeWidth="5" /></g>,
  ];
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="engine-h" className="autopsy-fade absolute inset-0 z-20 grid place-items-center bg-[#04060f]/80 p-4 backdrop-blur-sm" onClick={close}>
      <div className="w-full max-w-[880px] rounded-[20px] border border-[#2a3160] bg-[#070a1d] p-5 sm:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4">
          <h2 id="engine-h" className="font-display text-[24px] font-black [font-stretch:118%] sm:text-[30px]">{t("autopsy.engine.title")}</h2>
          <button type="button" autoFocus onClick={close} className="rc-press min-h-[40px] rounded-full border border-white/25 px-4 text-[13.5px] font-semibold">{t("autopsy.engine.close")}</button>
        </div>
        <ol className="mt-5 grid gap-3 sm:grid-cols-5">
          {steps.map(([k, line], i) => (
            <li key={k} className="flex gap-3 rounded-[14px] border border-[#2a3160] bg-[#04060f]/60 p-3 sm:block">
              <svg width="48" height="44" viewBox="0 0 48 44" aria-hidden className="shrink-0 text-chalk">{icons[i]}</svg>
              <div>
                <p className="text-[14px] font-bold sm:mt-2">{i + 1} · {k}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-chalk-dim">{line}</p>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => go("story")} className="mt-5 text-[14px] font-semibold text-[#c6ff4d] underline underline-offset-4">{t("autopsy.engine.story")}</button>
      </div>
    </div>
  );
}
