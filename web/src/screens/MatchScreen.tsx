import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { BugName } from "../components/bits";
import { Scoreboard } from "../components/Header";
import { StageView, useStageMode } from "../components/StageView";
import { ReplayBar } from "../components/ReplayBar";
import { clock, pct, playerInfo } from "../lib/format";
import { rootLink } from "../lib/geometry";
import { useMatch } from "../store/matchStore";
import { useLatestGoal, useSelectedEvidence } from "../store/selectors";
import { useTrace } from "../store/traceStore";
import { useUi, type Tab } from "../store/uiStore";
import { Counterfactual } from "./Counterfactual";
import { LiveMatch } from "./LiveMatch";
import { RootCause } from "./RootCause";
import { StackTrace } from "./StackTrace";
import { StudioScript } from "./StudioScript";

export function MatchScreen() {
  return (
    <div className="mx-auto grid max-w-[1600px] lg:h-[calc(100dvh-var(--header-h))] lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_520px]">
      <div className="flex min-h-0 flex-col">
        <StageArea />
        <div className="sticky bottom-0 z-30 lg:static">
          <ReplayBar />
        </div>
      </div>
      <div className="flex min-h-0 flex-col border-l border-turf-edge/70 bg-turf"><Panel /></div>
    </div>
  );
}

function StageArea() {
  const { webgl, reduced, view } = useStageMode();
  return (
    <div className="relative h-[52svh] min-h-[300px] overflow-hidden bg-turf-deep lg:h-auto lg:min-h-0 lg:flex-1">
      <StageView />
      <Scoreboard className="absolute left-3 top-3 z-20" />
      <GoalMoment />
      <LowerThird />
      <div className="absolute right-3 top-3 z-20 flex gap-2">
        {webgl && !reduced && (
          <button
            type="button"
            onClick={() => useUi.getState().setView(view === "3d" ? "2d" : "3d")}
            className="rc-press min-h-[38px] rounded-full bg-turf-deep/85 px-3 text-[12px] font-semibold text-chalk-dim ring-1 ring-turf-edge transition-colors duration-150 hover:text-chalk"
            aria-label={view === "3d" ? "Switch to flat pitch" : "Switch to 3D pitch"}
          >
            {view === "3d" ? "2D" : "3D"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Freeze-frame, "Goal", then the Debugger's progress, then out of the way. */
function GoalMoment() {
  const { t } = useTranslation();
  const phase = useTrace((s) => s.phase);
  const goal = useLatestGoal();
  const meta = useMatch((s) => s.meta);
  const steps = useMatch((s) => (goal?.goalId ? s.steps[goal.goalId]?.length ?? 0 : 0));
  const traced = Boolean(goal?.goalId);
  const untraced = useMatch((s) => (goal ? s.untraced[goal.eventId] : undefined));
  const scorer = goal ? playerInfo(meta, goal.playerId) : null;
  const on = phase === "goal" || phase === "tracing";

  const stages = [
    { label: t("tracing.walk"), done: traced || Boolean(untraced) },
    { label: t("tracing.replay"), done: traced },
    { label: t("tracing.explain"), done: steps > 0 },
  ];
  const current = stages.findIndex((s) => !s.done);

  return (
    <AnimatePresence>
      {on && goal && (
        <motion.div
          key={goal.eventId}
          className="pointer-events-none absolute inset-0 z-10 flex flex-col items-start justify-end p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
        >
          <motion.div className="absolute inset-0 bg-turf-deep/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} />
          <div className="relative">
            <motion.div
              className="font-display text-[clamp(56px,11vw,140px)] font-black leading-[0.85] tracking-[-0.04em] text-chalk [font-stretch:118%]"
              initial={{ clipPath: "inset(0 100% 0 0)" }}
              animate={{ clipPath: "inset(0 0% 0 0)" }}
              transition={{ duration: 0.5, ease: [0.77, 0, 0.175, 1] }}
            >
              {t("goal.word")}
            </motion.div>
            <motion.div
              className="mt-2 text-[17px] font-semibold text-chalk sm:text-[20px]"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            >
              {scorer?.name} · {scorer?.club?.short_name} · <span className="tabular-nums">{clock(goal.second)}</span>
            </motion.div>
            <AnimatePresence>
              {phase === "tracing" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  className="mt-5 w-[min(420px,calc(100vw-48px))] rounded-panel bg-turf-deep/95 p-4 ring-1 ring-turf-edge"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2 font-display text-[18px] font-bold text-chalk">
                    <span className="h-2 w-2 rounded-full bg-flare rc-blink" aria-hidden="true" />
                    {untraced ? t("tracing.noneTitle") : t("tracing.title")}
                  </div>
                  {untraced ? (
                    <p className="mt-2 text-[14px] leading-relaxed text-chalk-dim">{t("live.untraced")}</p>
                  ) : (
                    <ol className="mt-3 space-y-1.5 text-[14px]">
                      {stages.map((s, i) => (
                        <li key={i} className={`flex items-center gap-2.5 ${s.done ? "text-chalk" : i === current ? "text-chalk" : "text-chalk-faint"}`}>
                          <span className="grid h-4 w-4 place-items-center" aria-hidden="true">
                            {s.done ? (
                              <svg width="14" height="14" viewBox="0 0 14 14"><path d="m3 7.3 2.6 2.6L11 4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            ) : i === current ? (
                              <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-chalk border-t-transparent rc-spin" />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-chalk-faint" />
                            )}
                          </span>
                          {s.label}
                        </li>
                      ))}
                    </ol>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Studio mode: broadcast lower third for the root cause, over the pitch. */
function LowerThird() {
  const { t } = useTranslation();
  const mode = useUi((s) => s.mode);
  const phase = useTrace((s) => s.phase);
  const ev = useSelectedEvidence();
  const meta = useMatch((s) => s.meta);
  const root = ev ? rootLink(ev) : undefined;
  const info = root ? playerInfo(meta, root.player_id) : null;
  const on = mode === "studio" && root && info && (phase === "traced" || phase === "review");
  return (
    <AnimatePresence>
      {on && (
        <motion.div
          className="pointer-events-none absolute bottom-4 left-4 z-10 flex max-w-[calc(100%-32px)] items-stretch overflow-hidden rounded-[10px] shadow-xl"
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          animate={{ clipPath: "inset(0 0% 0 0)" }}
          exit={{ clipPath: "inset(0 0 0 100%)" }}
          transition={{ duration: 0.55, ease: [0.77, 0, 0.175, 1] }}
        >
          <div className="grid w-16 place-items-center bg-flare font-display text-[34px] font-black text-flare-ink tabular-nums">{info!.number}</div>
          <div className="bg-chalk px-4 py-2 text-turf-deep">
            <div className="font-display text-[20px] font-extrabold leading-tight [font-stretch:110%]">{info!.name}</div>
            <div className="text-[14px] font-semibold">
              {t("studio.ltRoot")} · <BugName code={root!.bug_type} /> · {t("studio.blame", { blame: pct(root!.blame_percent) })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const ORDER: Record<string, Tab[]> = {
  fan: ["cause", "whatif", "trace", "live"],
  analyst: ["trace", "whatif", "cause", "live"],
  studio: ["script", "cause", "trace", "whatif", "live"],
};

function Panel() {
  const { t } = useTranslation();
  const mode = useUi((s) => s.mode);
  const tab = useUi((s) => s.tab);
  const ev = useSelectedEvidence();
  const phase = useTrace((s) => s.phase);
  const tabs = ORDER[mode];
  const scroller = useRef<HTMLDivElement>(null);
  const active = ev ? (tabs.includes(tab) ? tab : tabs[0]) : "live";

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [active]);

  const meta = useMatch((s) => s.meta);
  const scorer = ev ? playerInfo(meta, ev.goal.player_id) : null;
  return (
    <aside className="flex min-h-0 flex-col" aria-labelledby="panel-h">
      <div className="px-5 pt-5 sm:px-6">
        <h2 id="panel-h" className="font-display text-[44px] leading-[0.95] text-chalk">
          {ev && scorer ? t("panel.goalTitle", { club: scorer.club?.short_name ?? "", time: clock(ev.goal.second) }) : t("panel.label")}
        </h2>
        <p className="mt-2 text-[15px] leading-snug text-chalk-faint">{t(`panel.hint.${active}`)}</p>
      </div>
      <div role="tablist" aria-label={t("panel.label")} className="mt-3 flex gap-1 overflow-x-auto border-b border-turf-edge px-3 [scrollbar-width:none] sm:px-4">
        {(ev ? tabs : (["live"] as Tab[])).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={active === k}
            onClick={() => useUi.getState().setTab(k)}
            className={`rc-press relative min-h-[48px] shrink-0 px-2.5 text-[15px] transition-colors duration-300 ${active === k ? "text-chalk" : "text-chalk-faint hover:text-chalk"}`}
          >
            {t(`tab.${k}`)}
            {active === k && <motion.span layoutId="tab-ink" className="absolute inset-x-2 bottom-0 h-px bg-chalk" transition={{ type: "spring", duration: 0.35, bounce: 0.1 }} />}
          </button>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6" role="tabpanel">
        {phase === "tracing" && active === "live" && <p className="mb-4 text-[14px] text-chalk-dim">{t("tracing.panel")}</p>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active + (ev?.goal_id ?? "")}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            {active === "live" || !ev ? (
              <LiveMatch />
            ) : active === "trace" ? (
              <StackTrace ev={ev} />
            ) : active === "whatif" ? (
              <Counterfactual ev={ev} />
            ) : active === "script" ? (
              <StudioScript ev={ev} />
            ) : (
              <RootCause ev={ev} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}
