import { AnimatePresence, motion } from "framer-motion";
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BugName } from "../components/bits";
import { Pitch } from "../components/Pitch";
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

const Stage3D = lazy(() => import("../three/Stage"));

function canRun3D() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function MatchScreen() {
  return (
    <div className="mx-auto grid max-w-[1600px] lg:h-[calc(100dvh-var(--header-h))] lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_480px]">
      <div className="flex min-h-0 flex-col lg:border-r lg:border-turf-edge/70">
        <StageArea />
        <div className="sticky bottom-0 z-30 lg:static">
          <ReplayBar />
        </div>
      </div>
      <Panel />
    </div>
  );
}

function StageArea() {
  const view = useUi((s) => s.view);
  const reduced = useUi((s) => s.reducedMotion);
  const [webgl] = useState(canRun3D);
  const use3d = view === "3d" && webgl && !reduced;
  return (
    <div className="relative h-[54svh] min-h-[300px] overflow-hidden bg-turf-deep lg:h-auto lg:min-h-0 lg:flex-1">
      {use3d ? (
        // the flat pitch holds the stage while the 3D chunk loads: never a blank box
        <StageBoundary>
          <Suspense fallback={<FlatStage />}>
            <Stage3D />
          </Suspense>
        </StageBoundary>
      ) : (
        <FlatStage />
      )}
      <GoalMoment />
      <LowerThird />
      <div className="absolute right-3 top-3 z-20 flex gap-2">
        {webgl && !reduced && (
          <button
            type="button"
            onClick={() => useUi.getState().setView(view === "3d" ? "2d" : "3d")}
            className="rc-press min-h-[36px] rounded-full bg-turf-deep/85 px-3 text-[12px] font-semibold text-chalk-dim ring-1 ring-turf-edge transition-colors duration-150 hover:text-chalk"
            aria-label={view === "3d" ? "Switch to flat pitch" : "Switch to 3D pitch"}
          >
            {view === "3d" ? "2D" : "3D"}
          </button>
        )}
      </div>
    </div>
  );
}

/** If WebGL or the 3D chunk fails, the flat pitch takes over; the match never stops. */
class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D stage unavailable, using the flat pitch", error);
  }
  render() {
    return this.state.failed ? <FlatStage /> : this.props.children;
  }
}

function FlatStage() {
  return (
    <div className="absolute inset-0 grid place-items-center p-3 sm:p-6">
      <div className="aspect-[111/74] max-h-full w-full max-w-full">
        <Pitch />
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

  return (
    <aside className="flex min-h-0 flex-col bg-turf" aria-label={t("panel.label")}>
      <div role="tablist" aria-label={t("panel.label")} className="flex gap-1 overflow-x-auto border-b border-turf-edge/70 px-3 pt-2 [scrollbar-width:none]">
        {(ev ? tabs : (["live"] as Tab[])).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={active === k}
            onClick={() => useUi.getState().setTab(k)}
            className={`rc-press relative min-h-[44px] shrink-0 px-3 text-[14px] font-semibold transition-colors duration-150 ${active === k ? "text-chalk" : "text-chalk-dim hover:text-chalk"}`}
          >
            {t(`tab.${k}`)}
            {active === k && <motion.span layoutId="tab-ink" className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-chalk" transition={{ type: "spring", duration: 0.35, bounce: 0.1 }} />}
          </button>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5" role="tabpanel">
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
