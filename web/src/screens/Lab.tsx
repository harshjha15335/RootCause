import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Analysis } from "../api/analysis";
import { DEMO_MATCHES } from "../api/rest";
import type { Evidence, RecordedReplay } from "../api/types";
import { useLab, type Lab as LabData } from "../lab/data";
import { buildCase } from "../lab/goal";
import { buildJourney, type Journey } from "../lab/journey/model";
import { CHAPTERS, createStage, type Stage } from "../lab/journey/stage";
import { useFullTime } from "../store/selectors";
import { useUi } from "../store/uiStore";

const clock = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const surname = (lab: LabData, i: number) => lab.names[i].split(" ").slice(-1)[0];
const getJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} returned ${r.status}`);
  return r.json();
};

/**
 * Tactics Lab: one traced goal, told as a guided journey in a floodlit 3D stadium. The two
 * teams' plans, the move, every suspect the engine flagged and its recorded fixed replay, the
 * 200 replays behind each verdict, the blame, and what should have happened.
 */
export function Lab() {
  const { t } = useTranslation();
  const lab = useLab();
  const full = useFullTime();
  const id = lab.data?.id;
  const replays = useQuery({
    queryKey: ["replays", id],
    enabled: !!id,
    staleTime: Infinity,
    queryFn: () => getJson<Record<string, Record<string, RecordedReplay>>>(`${import.meta.env.BASE_URL}showcase/${id}/replays.json`),
  });
  // every demo match's analysis: this match's plans against the same sides' other matches
  const analyses = useQueries({
    queries: DEMO_MATCHES.map((m) => ({
      queryKey: ["analysis", m],
      staleTime: Infinity,
      queryFn: () => getJson<Analysis>(`${import.meta.env.BASE_URL}showcase/${m}/analysis.json`),
    })),
  });
  const ready = !!lab.data && !!replays.data && analyses.every((q) => q.data) && !full.loading;
  const journeys = useMemo(() => {
    if (!ready) return [];
    const all = Object.fromEntries(DEMO_MATCHES.map((m, k) => [m, analyses[k].data!]));
    return full.traces
      .map((ev: Evidence) => {
        const c = buildCase(lab.data!, ev);
        return c ? buildJourney(lab.data!, c, ev, replays.data![ev.goal_id] ?? {}, all) : null;
      })
      .filter((x): x is Journey => x !== null)
      .sort((a, b) => a.c.goalS - b.c.goalS);
  }, [ready, full.traces, lab.data, replays.data]);
  const [pick, setPick] = useState(0);
  const j = journeys[Math.min(pick, journeys.length - 1)];
  const failed = lab.error || replays.error || analyses.some((q) => q.error);

  return (
    <section className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-8 sm:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="max-w-[680px]">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-flare">{t("lab.eyebrow")}</p>
          <h1 className="mt-1 text-balance font-display text-[34px] font-black leading-[0.95] tracking-display [font-stretch:125%] sm:text-[48px]">{t("lab.title")}</h1>
          <p className="mt-3 text-[16px] text-chalk-dim">{t("lab.lede")}</p>
        </div>
        {journeys.length > 1 && (
          <div role="group" aria-label={t("lab.goalsLabel")} className="flex flex-wrap gap-2">
            {journeys.map((g, i) => (
              <button
                key={g.c.id}
                type="button"
                aria-pressed={g === j}
                onClick={() => setPick(i)}
                className="rc-press rounded-full border border-turf-edge px-4 py-2 text-[14px] font-semibold text-chalk-dim aria-pressed:border-chalk aria-pressed:bg-chalk aria-pressed:text-ink"
              >
                {t("lab.goalChip", { clock: clock(g.c.goalS), name: surname(g.lab, g.c.scorer) })}
              </button>
            ))}
          </div>
        )}
      </div>
      {failed ? (
        <p className="rounded-panel bg-turf px-6 py-16 text-center text-[17px] text-chalk-dim">{t("lab.failed")}</p>
      ) : !ready ? (
        <div className="relative h-[min(84vh,860px)] min-h-[560px] animate-pulse rounded-panel bg-[#070a1d]">
          <p className="absolute left-6 top-6 text-[15px] text-chalk-dim">{t("lab.loading")}</p>
        </div>
      ) : !j ? (
        <p className="rounded-panel bg-turf px-6 py-16 text-center text-[17px] text-chalk-dim">{t("lab.noTrace")}</p>
      ) : (
        <JourneyStage key={j.c.id} j={j} />
      )}
      <p className="mt-3 text-[13px] text-chalk-faint">{t("lab.foot", { home: lab.data?.clubs[0].name ?? "", away: lab.data?.clubs[1].name ?? "" })}</p>
    </section>
  );
}

function JourneyStage({ j }: { j: Journey }) {
  const { t } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion);
  const setScreen = useUi((s) => s.setScreen);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const [ch, setCh] = useState(() => (import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("ch") ?? 0) : 0));
  const [glFailed, setGlFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!, box = stageRef.current!;
    let s: Stage;
    try {
      const q = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
      s = createStage(canvas, j, (k, v) => t(`lab.s.${k}`, v), {
        reduced,
        hold: q?.has("hold") ? Number(q.get("hold")) : undefined,
        onTag: (html, x, y) => {
          const el = tagRef.current;
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
      s.resize(r.width, r.height);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);
    s.go(ch);
    return () => {
      ro.disconnect();
      s.dispose();
      stage.current = null;
    };
  }, [j, t, reduced]);

  const go = useCallback((i: number) => {
    const n = Math.max(0, Math.min(CHAPTERS.length - 1, i));
    setCh(n);
    stage.current?.go(n);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(ch + 1);
      if (e.key === "ArrowLeft") go(ch - 1);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [ch, go]);

  const { lab, c, culprit } = j;
  const [A, B] = j.shown;
  const att = lab.clubs[j.att].name, def = lab.clubs[j.def].name;
  const prevented = (x: { base: number; fixed: number }) => Math.max(0, x.base - x.fixed);
  const total = j.suspects.reduce((n, x) => n + prevented(x), 0);
  const names = j.suspects.map((x) => surname(lab, x.player));
  const list = names.length > 1 ? t("lab.and", { a: names.slice(0, -1).join(", "), b: names[names.length - 1] }) : names[0];
  const off = A.offside;
  const fmt = (v: number | null, d = 1) => (v == null ? "—" : v.toFixed(d));
  const chips: [string, string, string, boolean][] = [
    [t("lab.chip.line", { team: def }), `${fmt(j.cmp.line.now)} m`, fmt(j.cmp.line.usual), true],
    [t("lab.chip.width", { team: def }), `${fmt(j.cmp.width.now)} m`, fmt(j.cmp.width.usual), false],
    [t("lab.chip.poss", { team: att }), `${fmt(j.cmp.poss.now, 0)}%`, `${fmt(j.cmp.poss.usual, 0)}%`, false],
    [t("lab.chip.ppda", { team: att }), fmt(j.cmp.ppda.now, 2), fmt(j.cmp.ppda.usual, 2), false],
  ];
  const lineDiff = j.cmp.line.usual == null ? 0 : j.cmp.line.now - j.cmp.line.usual;
  const v = {
    clock: clock(c.goalS), scorer: surname(lab, c.scorer), score: j.score.join("–"), s: Math.round(c.goalS - culprit.second),
    att, def, fa: lab.clubs[j.att].formation, fd: lab.clubs[j.def].formation, line: fmt(j.cmp.line.now),
    d: Math.abs(lineDiff).toFixed(1), n: j.suspects.length, list,
    trials: culprit.trials, base: culprit.base, a: surname(lab, A.player), fa2: A.fixed, b: B ? surname(lab, B.player) : "", fb: B?.fixed ?? 0,
    name: surname(lab, culprit.player), p: Math.round(culprit.blame), mine: prevented(culprit), total,
    at: clock(A.end), receiver: off ? surname(lab, off.player) : "", m: off ? off.by.toFixed(1) : "", fixed: A.fixed,
  };
  const body: Record<(typeof CHAPTERS)[number], string> = {
    goal: t("lab.c.goal.body", v),
    plans: `${t("lab.c.plans.body", v)} ${j.samePlan ? t("lab.c.plans.same", v) : t(lineDiff < 0 ? "lab.c.plans.deeper" : "lab.c.plans.higher", v)}`,
    move: t("lab.c.move.body", v),
    suspects: `${t("lab.c.suspects.body", v)}${j.suspects.length > 2 ? ` ${t("lab.c.suspects.more")}` : ""}`,
    replays: t(B ? "lab.c.replays.body" : "lab.c.replays.bodyOne", v),
    verdict: t("lab.c.verdict.body", v),
    fix: t(off ? "lab.c.fix.body" : "lab.c.fix.bodyOpen", v),
  };
  const id = CHAPTERS[ch];
  const heading = id === "suspects" ? t(j.suspects.length === 2 ? "lab.c.suspects.titleTwo" : "lab.c.suspects.title", v) : t(`lab.c.${id}.title`, v);

  return (
    <div
      ref={stageRef}
      className="relative h-[min(84vh,860px)] min-h-[600px] touch-none select-none overflow-hidden rounded-panel border border-[#1d2347] bg-[#04060f]"
    >
      <canvas ref={canvasRef} role="img" aria-label={t("lab.stageLabel")} className="absolute inset-0 block h-full w-full cursor-grab active:cursor-grabbing" />
      {glFailed && <p className="absolute inset-0 grid place-items-center px-6 text-center text-[16px] text-chalk-dim">{t("lab.noGl")}</p>}
      <div className="pointer-events-none absolute left-4 right-[150px] top-[18px] truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c9b27a] sm:left-6 sm:top-6">
        {t("lab.matchLine", { home: lab.clubs[0].name, away: lab.clubs[1].name, clock: clock(c.goalS) })}
      </div>
      <button
        type="button"
        onClick={() => stage.current?.again()}
        className="rc-press absolute right-3 top-3 rounded-full border border-[#2a3160] bg-[#070a1d]/75 px-3.5 py-2 text-[13px] font-semibold text-chalk backdrop-blur sm:right-4 sm:top-4"
      >
        {t("lab.again")}
      </button>

      <article
        key={ch}
        aria-live="polite"
        className="lab-card absolute bottom-[84px] left-3 right-3 max-h-[46%] overflow-y-auto rounded-[16px] border border-[#2a3160] bg-[#05070f]/80 px-4 pb-4 pt-3.5 backdrop-blur-md sm:bottom-[96px] sm:left-6 sm:right-auto sm:w-[440px] sm:max-h-none sm:px-5 sm:pb-5 sm:pt-4"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e9c46a]">{t("lab.chapterOf", { n: ch + 1, of: CHAPTERS.length, name: t(`lab.c.${id}.k`) })}</p>
        <h2 className="mt-2 text-balance font-display text-[24px] font-black leading-[1.02] tracking-display [font-stretch:118%] sm:text-[32px]">{heading}</h2>
        <p className="mt-2 text-[14.5px] leading-[1.5] text-[#d9ddf2] sm:text-[15.5px]" dangerouslySetInnerHTML={{ __html: body[id] }} />
        {id === "plans" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map(([k, now, usual, hot]) => (
              <span key={k} className={`rounded-full border px-2.5 py-1.5 text-[12.5px] font-semibold ${hot ? "border-[#ffd60a]/50 text-[#ffd60a]" : "border-[#2a3160] text-[#9aa3d6]"}`}>
                {k} <b className={hot ? "" : "text-chalk"}>{now}</b> · {t("lab.usual", { v: usual })}
              </span>
            ))}
          </div>
        )}
        {id === "suspects" && (
          <button type="button" onClick={() => setScreen("story")} className="mt-2 text-[14px] font-semibold text-[#e9c46a] underline underline-offset-4">
            {t("lab.howEngine")}
          </button>
        )}
      </article>

      <nav aria-label={t("lab.chapters")} className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-b from-transparent to-[#04060f]/95 px-3 pb-3.5 pt-6 sm:px-6">
        <button
          type="button"
          onClick={() => go(ch - 1)}
          disabled={ch === 0}
          className="rc-press h-11 shrink-0 rounded-full border border-[#2a3160] bg-white/5 px-4 text-[14px] font-bold text-chalk disabled:opacity-35"
        >
          {t("lab.back")}
        </button>
        <ol className="flex min-w-0 flex-1 gap-1.5">
          {CHAPTERS.map((k, i) => (
            <li key={k} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === ch ? "step" : undefined}
                aria-label={t("lab.chapterOf", { n: i + 1, of: CHAPTERS.length, name: t(`lab.c.${k}.k`) })}
                className={`grid h-11 w-full content-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] ${i === ch ? "text-chalk" : "text-[#7d86b8]"}`}
              >
                <i className={`block h-[3px] rounded ${i <= ch ? (i === ch ? "bg-[#e9c46a]" : "bg-chalk") : "bg-[#2a3160]"}`} />
                <span className="hidden truncate md:block">{t(`lab.c.${k}.k`)}</span>
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => go(ch === CHAPTERS.length - 1 ? 0 : ch + 1)}
          className="rc-press h-11 shrink-0 rounded-full bg-[#e9c46a] px-5 text-[14px] font-bold text-[#1b1600]"
        >
          {ch === CHAPTERS.length - 1 ? t("lab.restart") : t("lab.next")}
        </button>
      </nav>
      <div ref={tagRef} hidden className="lab-tag pointer-events-none absolute translate-x-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-chalk px-2.5 py-1.5 text-[13px] font-semibold leading-snug text-ink" />
    </div>
  );
}
