import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { go } from "../lib/nav";
import { BASE_GOALS, BLAME, FuturesStage, MISTAKES, TRIALS } from "../story/futures";
import { useUi } from "../store/uiStore";

const BEATS = 5;
const FIX_BEAT = 3;

/**
 * How Root Cause thinks, on one made-up attack: the goal, the rewind, 200 replays, fix one
 * mistake. It explains the engine only; real goals belong to the Lab, which this hands off to.
 */
export function Story() {
  const { t } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<FuturesStage | null>(null);
  const [beat, setBeat] = useState(0);
  const [fixed, setFixed] = useState(-1);
  const [goals, setGoals] = useState(0);

  const labels = useMemo(
    () => ({
      goal: t("story.tagGoal"),
      start: t("story.tagStart"),
      fixed: t("story.tagFixed"),
      mistakes: MISTAKES.map((_, i) => t(`story.m${i + 1}`)),
    }),
    [t],
  );

  useEffect(() => {
    const s = new FuturesStage(canvas.current!, labels, setGoals, reduced);
    stage.current = s;
    return () => s.dispose();
    // labels are pushed separately below; the stage lives as long as the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  useEffect(() => stage.current?.setLabels(labels), [labels]);

  const fix = (i: number) => {
    setFixed(i);
    stage.current?.setFix(i);
  };
  const show = (b: number) => {
    const next = Math.max(0, Math.min(BEATS - 1, b));
    setBeat(next);
    stage.current?.setBeat(next);
    if (next === 2) setFixed(-1);
    if (next === BEATS - 1 && fixed < 0) fix(0);
  };

  // on the fix step, fix the biggest mistake for people who don't tap
  useEffect(() => {
    if (beat !== FIX_BEAT || fixed >= 0) return;
    const id = setTimeout(() => fix(0), 2600);
    return () => clearTimeout(id);
  }, [beat, fixed]);

  const names = Array.from({ length: BEATS }, (_, i) => t(`story.b${i + 1}`));

  return (
    <section aria-labelledby="story-h" className="mx-auto max-w-[1280px] px-5 pb-16 pt-8 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-trace text-[12px] font-bold uppercase tracking-[0.14em] text-chalk-faint">{t("story.eyebrow")}</p>
        <p className="text-[13px] text-chalk-faint">{t("story.invented")}</p>
      </div>

      <ol className="mt-4 grid grid-cols-5 gap-1.5" aria-label={t("story.steps")}>
        {names.map((n, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => show(i)}
              aria-current={i === beat ? "step" : undefined}
              className={`rc-press grid w-full gap-1.5 text-left text-[12px] font-semibold ${i === beat ? "text-chalk" : "text-chalk-faint hover:text-chalk"}`}
            >
              <span className="relative block h-[3px] overflow-hidden rounded-full bg-turf-edge">
                <span className={`absolute inset-0 origin-left bg-chalk transition-transform duration-500 ease-out ${i <= beat ? "scale-x-100" : "scale-x-0"}`} />
              </span>
              <span className="hidden truncate sm:block">{n}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-6 min-h-[168px]" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={beat}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            <h1 id="story-h" className="font-display text-[clamp(36px,5.4vw,72px)] leading-[0.95] text-chalk [text-wrap:balance]">
              {t(`story.t${beat + 1}`)}
            </h1>
            <p className="mt-3 max-w-[56ch] text-[17px] leading-[1.55] text-chalk-dim sm:text-[18px]">{t(`story.l${beat + 1}`)}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="relative aspect-[4/3.4] min-w-0 overflow-hidden rounded-[24px] bg-[radial-gradient(120%_90%_at_50%_0%,#2a48ec_0%,#1027b8_55%,#0a1a8c_100%)] sm:aspect-[16/10]">
          <canvas ref={canvas} className="block h-full w-full" role="img" aria-label={t("story.canvasLabel")} />
          <div className="absolute bottom-3 left-3.5 flex flex-wrap gap-3.5 text-[12px] font-semibold text-chalk-dim" aria-hidden="true">
            <Key color="#f3f5ff">{t("story.keyAttack")}</Key>
            <Key color="#7f93ff">{t("story.keyDefence")}</Key>
            <Key color="#ffd60a">{t("story.keyMistake")}</Key>
          </div>
        </div>

        <div className={`flex min-w-0 flex-col gap-3 transition-opacity duration-300 ${beat < 2 ? "invisible opacity-0" : "opacity-100"}`}>
          <Tally goals={goals} fixed={fixed >= 0 && beat >= FIX_BEAT} />
          {beat >= FIX_BEAT && (
            <div className="grid gap-2">
              {MISTAKES.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={fixed === i}
                  onClick={() => fix(fixed === i ? -1 : i)}
                  className={`rc-press grid gap-1.5 rounded-2xl bg-turf px-3.5 py-3 text-left ring-inset hover:bg-turf-raised/60 ${fixed === i ? "ring-2 ring-flare" : "ring-1 ring-turf-edge"}`}
                >
                  <span className="flex justify-between gap-2 text-[14px] font-semibold text-chalk">
                    {t(`story.m${i + 1}`)}
                    <span className="font-trace text-[13px] text-flare tabular-nums">{Math.round(BLAME[i] * 100)}%</span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-turf-raised">
                    <span className="block h-full bg-flare transition-[width] duration-700 ease-out" style={{ width: fixed === i ? `${BLAME[i] * 100}%` : 0 }} />
                  </span>
                  <span className="text-[12px] text-chalk-faint">{t("story.fixedLine", { who: t(`story.who${i + 1}`), goals: m.fixedGoals, trials: TRIALS })}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => show(beat - 1)}
          disabled={beat === 0}
          className="rc-press min-h-[46px] rounded-full px-5 text-[15px] font-semibold text-chalk ring-1 ring-turf-edge hover:bg-turf-raised disabled:opacity-40"
        >
          {t("story.back")}
        </button>
        {beat === BEATS - 1 ? (
          <button type="button" onClick={() => go("lab")} className="rc-press min-h-[46px] rounded-full bg-chalk px-6 text-[15px] font-bold text-turf hover:opacity-90">
            {t("story.labCta")}
          </button>
        ) : (
          <button type="button" onClick={() => show(beat + 1)} className="rc-press min-h-[46px] rounded-full bg-chalk px-6 text-[15px] font-bold text-turf hover:opacity-90">
            {t("story.next")}
          </button>
        )}
      </div>
    </section>
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

/** One dot per replay: white goes in, yellow is a goal the fix took away. */
function Tally({ goals, fixed }: { goals: number; fixed: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-[20px] bg-turf p-4">
      <p className="font-trace text-[12px] font-bold uppercase tracking-[0.14em] text-chalk-faint">{t("story.tally", { trials: TRIALS })}</p>
      <p className="mt-2 font-display text-[44px] leading-none text-chalk tabular-nums">
        {goals} <span className="text-[18px] text-chalk-faint">/ {TRIALS}</span>
      </p>
      <div className="mt-3 grid grid-cols-[repeat(20,minmax(0,1fr))] gap-[3px]" aria-hidden="true">
        {Array.from({ length: TRIALS }, (_, i) => (
          <i key={i} className={`aspect-square rounded-full transition-colors duration-200 ${i < goals ? "bg-chalk" : fixed && i < BASE_GOALS ? "bg-flare" : "bg-turf-raised"}`} />
        ))}
      </div>
    </div>
  );
}
