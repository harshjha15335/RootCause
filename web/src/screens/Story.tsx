import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EngineMatchEvent, Evidence, MatchMeta, RecordedReplay } from "../api/types";
import { Track } from "../lib/frames";
import { loadGsap } from "../lib/motion";
import { go, pageHref } from "../lib/nav";
import { useUi } from "../store/uiStore";
import { css } from "../theme/palette";
import type { FreeArea, Shot, StackData, StackLabel, StackState, Timestack } from "../three/timestack";
import "./landingCopy";
import { buildStack } from "./TimestackStory";

/** The example: the traced 62nd-minute goal of Meeting 1, the same goal the demo autopsy opens on. */
const EXAMPLE = { match: "p-1008", goal: "p-1008-g4" };
const STEPS = 5;

// The camera stays level, beside the stack: time reads bottom to top, the goal at the far end.
const SIDE = -Math.PI / 2;
const SHOTS: Shot[] = [
  { frame: "all", az: SIDE + 0.14, el: 0.24, height: 1 },
  { frame: "all", az: SIDE + 0.1, el: 0.22, height: 1 },
  { frame: "fault", az: SIDE + 0.3, el: 0.32, height: 1, margin: 1.12 },
  { frame: "fix", az: SIDE + 0.42, el: 0.28, height: 1, margin: 1.12 },
  { frame: "all", az: SIDE + 0.14, el: 0.24, height: 1 },
];

/** Keeps the stack clear of the step rail at the top and the caption at the bottom. */
const storyFree: FreeArea = (w, h) => {
  const top = w >= 720 ? 96 : 84;
  const bottom = w >= 720 ? 230 : 290;
  return { x0: -0.94, x1: 0.94, y0: -1 + (2 * bottom) / h, y1: 1 - (2 * top) / h };
};

async function loadExample(): Promise<StackData> {
  const base = `${import.meta.env.BASE_URL}showcase/${EXAMPLE.match}/`;
  const get = async <T,>(f: string): Promise<T> => {
    const r = await fetch(base + f);
    if (!r.ok) throw new Error(`${f} returned ${r.status}`);
    return r.json() as Promise<T>;
  };
  const [meta, ticks, replays, ev] = await Promise.all([
    get<MatchMeta>("meta.json"),
    get<EngineMatchEvent[]>("ticks.json"),
    get<Record<string, Record<string, RecordedReplay>>>("replays.json"),
    get<Evidence>(`traces/${EXAMPLE.goal}.json`),
  ]);
  const track = new Track([...meta.home.players, ...meta.away.players].map((p) => p.id));
  for (const e of ticks) track.addEngine(e);
  const data = buildStack(track, ev, replays, meta);
  if (!data) throw new Error("the example goal has no stack");
  return data;
}

/** What each step shows. Step 1 also runs the scan sheet down the layers. */
function stepState(i: number, N: number, iFault: number): Partial<StackState> {
  const base = { height: 1, draw: 1 };
  if (i === 0) return { ...base, scan: N - 1, focus: 0, fault: 0, line: 0, patch: 0, gone: 0 };
  if (i === 1) return { ...base, focus: 0.25, fault: 0, line: 0, patch: 0, gone: 0 };
  if (i === 2) return { ...base, scan: iFault, focus: 1, fault: 1, line: 1, patch: 0, gone: 0 };
  if (i === 3) return { ...base, scan: iFault, focus: 0.6, fault: 1, line: 0.35, patch: 1, gone: 0 };
  return { ...base, scan: iFault, focus: 0.2, fault: 0.6, line: 0, patch: 1, gone: 1 };
}

/**
 * How Root Cause thinks, told with the Timestack on one real traced goal from the library:
 * goal on top, scan down, the mistake layer lights up, the fix is drawn beside it, the goal goes.
 */
export function Story() {
  const { t, i18n } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const engine = useRef<{ stack: Timestack; data: StackData; gsap: typeof import("gsap").gsap | null } | null>(null);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let off = false;
    let dispose = () => {};
    setStatus("loading");
    Promise.all([loadExample(), import("../three/timestack"), reduced ? Promise.resolve(null) : loadGsap()])
      .then(([data, { Timestack, stackPoint }, g]) => {
        if (off || !canvas.current || !labels.current) return;
        const N = data.seconds.length;
        const iFault = data.seconds.indexOf(data.faultSecond);
        const cj = data.ids.indexOf(data.culprit);
        const last = data.fix[data.fix.length - 1];
        const top = (s: StackState) => stackPoint(data.ball[N - 1][0], data.ball[N - 1][1], N - 1, s.height);
        const defs: StackLabel[] = [
          { text: t("storyx.tagGoal"), at: top, show: (s) => s.gone < 0.5 },
          { text: t("storyx.tagFault"), bug: true, at: (s) => stackPoint(data.pos[iFault][cj][0], data.pos[iFault][cj][1], iFault, s.height), show: (s) => s.fault > 0.5 && s.patch < 0.5 },
          ...(last ? [{ text: t("storyx.tagFix"), bug: true, at: (s: StackState) => stackPoint(last.culprit[0], last.culprit[1], last.second - data.seconds[0], s.height), show: (s: StackState) => s.patch > 0.7 }] : []),
          { text: t("storyx.tagGone"), at: top, show: (s) => s.gone > 0.6 },
        ];
        const first: StackState = reduced
          ? { shot: 0, ...(stepState(0, N, iFault) as Omit<StackState, "shot">) }
          : { shot: 0, height: 0.02, draw: 0, scan: N - 1, focus: 0, fault: 0, line: 0, patch: 0, gone: 0 };
        const stack = new Timestack(canvas.current, labels.current, data, first, defs, [SHOTS[0]], storyFree);
        engine.current = { stack, data, gsap: g?.gsap ?? null };
        setStatus("ready");

        const onResize = () => stack.resize();
        addEventListener("resize", onResize);
        let drag: number | null = null;
        const el = canvas.current;
        const down = (e: PointerEvent) => (drag = e.clientX);
        const move = (e: PointerEvent) => {
          if (drag === null) return;
          stack.yawTarget = Math.max(-0.6, Math.min(0.6, stack.yawTarget + (e.clientX - drag) * 0.005));
          drag = e.clientX;
        };
        const up = () => (drag = null);
        el.addEventListener("pointerdown", down);
        addEventListener("pointermove", move);
        addEventListener("pointerup", up);
        dispose = () => {
          g?.gsap.killTweensOf(stack.state);
          removeEventListener("resize", onResize);
          el.removeEventListener("pointerdown", down);
          removeEventListener("pointermove", move);
          removeEventListener("pointerup", up);
          stack.dispose();
        };
      })
      .catch((e) => {
        console.warn(e);
        if (!off) setStatus("failed");
      });
    return () => {
      off = true;
      engine.current = null;
      dispose();
    };
    // the 3D tags are written once, so a language change rebuilds the stage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, i18n.language]);

  // each step: glide the camera, ease the layers into that step's state
  useEffect(() => {
    const e = engine.current;
    if (!e || status !== "ready") return;
    const { stack, data, gsap } = e;
    const N = data.seconds.length;
    const iFault = data.seconds.indexOf(data.faultSecond);
    const to = stepState(step, N, iFault);
    if (!gsap) {
      stack.glideTo(SHOTS[step]);
      Object.assign(stack.state, to, { shot: 1, scan: step === 1 ? iFault : (to.scan ?? iFault) });
      return;
    }
    gsap.killTweensOf(stack.state);
    stack.glideTo(SHOTS[step]);
    gsap.to(stack.state, { ...to, shot: 1, duration: 1.8, ease: "power2.inOut" });
    if (step === 1) {
      gsap.fromTo(stack.state, { scan: N - 1 }, { scan: iFault, duration: 3.4, ease: "power1.inOut", repeat: -1, repeatDelay: 0.8, delay: 0.6 });
    }
  }, [step, status]);

  // the story is scrolled: the stage stays pinned while the page runs through one screen per step
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => {
      const el = track.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const range = Math.max(1, r.height - innerHeight);
      const p = Math.min(0.9999, Math.max(0, -r.top / range));
      setStep(Math.floor(p * STEPS));
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, []);
  const show = (i: number) => {
    const el = track.current;
    if (!el) return;
    const k = Math.max(0, Math.min(STEPS - 1, i));
    const range = Math.max(1, el.offsetHeight - innerHeight);
    const top = el.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + ((k + 0.5) / STEPS) * range, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div ref={track} style={{ height: `${STEPS * 90 + 40}svh` }}>
    <section aria-labelledby="story-h" className="sticky top-[var(--header-h)] h-[calc(100svh-var(--header-h))] min-h-[560px] overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#1d3cf0_0%,#1530d6_45%,#0b1a8a_100%)]">
      <canvas ref={canvas} className={`absolute inset-0 block h-full w-full cursor-grab touch-pan-y transition-opacity duration-700 active:cursor-grabbing ${status === "ready" ? "opacity-100" : "opacity-0"}`} role="img" aria-label={t("storyx.canvas")} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#1530d6_0%,transparent_9%,transparent_91%,#1530d6_100%)]" aria-hidden="true" />
      <div ref={labels} className="pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="pointer-events-none absolute inset-x-0 top-0 px-5 pt-5 sm:px-10 sm:pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="font-trace text-[12px] font-bold uppercase tracking-[0.14em] text-chalk">{t("storyx.eyebrow")}</p>
          <p className="text-[13px] text-chalk-dim">{t("storyx.example")}</p>
        </div>
        <ol className="pointer-events-auto mt-4 grid max-w-[720px] grid-cols-5 gap-1.5" aria-label={t("storyx.steps")}>
          {Array.from({ length: STEPS }, (_, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => show(i)}
                aria-current={i === step ? "step" : undefined}
                className={`rc-press grid min-h-[40px] w-full content-start gap-2 text-left text-[12px] font-semibold ${i === step ? "text-chalk" : "text-chalk-faint hover:text-chalk"}`}
              >
                <span className="relative block h-[3px] overflow-hidden rounded-full bg-chalk/15">
                  <span className={`absolute inset-0 origin-left transition-transform duration-500 ease-out ${i === 2 || i === 3 ? "bg-flare" : "bg-chalk"} ${i <= step ? "scale-x-100" : "scale-x-0"}`} />
                </span>
                <span className="truncate">
                  <span className="sm:hidden">{i + 1}</span>
                  <span className="hidden sm:inline">{t(`storyx.s${i + 1}`)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b1a8a] via-[#0b1a8a]/80 to-transparent px-5 pb-6 pt-16 sm:px-10 sm:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-h-[132px] max-w-[640px]" aria-live="polite">
            {status === "failed" ? (
              <p className="text-[17px] text-chalk">{t("storyx.failed")}</p>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: reduced ? 0 : 0.35, ease: [0.23, 1, 0.32, 1] }}>
                  <h1 id="story-h" className="font-display text-[clamp(32px,4.6vw,64px)] leading-[0.95] text-chalk [text-wrap:balance]">
                    {t(`storyx.t${step + 1}`)}
                  </h1>
                  <p className="mt-3 max-w-[46ch] text-[16px] leading-[1.5] text-chalk-dim sm:text-[18px]">{status === "loading" && step === 0 ? t("storyx.loading") : t(`storyx.l${step + 1}`)}</p>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
          <div className="flex flex-col items-start gap-4 sm:items-end">
            <div className="flex flex-wrap gap-3.5 text-[12px] font-semibold text-chalk-dim" aria-hidden="true">
              <Key color={css.chalk}>{t("storyx.keyAttack")}</Key>
              <Key color={css.sky}>{t("storyx.keyDefence")}</Key>
              <Key color={css.var}>{t("storyx.keyMistake")}</Key>
            </div>
            <div className="flex flex-wrap gap-3">
              {step === STEPS - 1 ? (
                <>
                  <a href={pageHref("autopsy", { demo: EXAMPLE.match, goal: EXAMPLE.goal })} className="rc-press inline-flex min-h-[46px] items-center rounded-full bg-flare px-6 text-[15px] font-bold text-flare-ink hover:brightness-105">
                    {t("storyx.autopsy")}
                  </a>
                  <button
                    type="button"
                    onClick={() => go("matches")}
                    className="rc-press min-h-[46px] rounded-full bg-chalk px-6 text-[15px] font-bold text-turf hover:opacity-90"
                  >
                    {t("storyx.library")}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => show(step + 1)} className="rc-press inline-flex min-h-[46px] items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-chalk-dim ring-1 ring-inset ring-chalk/25 hover:text-chalk">
                  {t("storyx.scroll")}
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8m0 0L2.5 6.5M6 10l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
    </div>
  );
}

function Key({ color, children }: { color: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}
