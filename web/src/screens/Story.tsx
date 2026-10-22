import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Evidence } from "../api/types";
import { BlameBar, BugName, PlayerChip } from "../components/bits";
import { clock, pct, playerInfo } from "../lib/format";
import { chronological, rootLink } from "../lib/geometry";
import { go } from "../lib/nav";
import { breakdown } from "../lib/sample";
import { begin, chainBounds, jumpTo, skipAhead } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { useExplanation, useLatestGoal, useSelectedEvidence } from "../store/selectors";
import { useTrace } from "../store/traceStore";
import { useUi } from "../store/uiStore";
import { ReplayGrid } from "./Counterfactual";
import { Sentences } from "./RootCause";

const CHAPTERS = 6;
/** How long a chapter holds before the story moves on by itself (ms). The first three follow the match. */
const HOLD_MS = [0, 0, 8000, 11000, 13000, 0];

/**
 * The guided story: the same broadcast as Explore, with a narrator. The first three chapters
 * follow the match (build-up, goal, trace); the rest move the replay to make one point each.
 */
export function StoryPanel() {
  const { t } = useTranslation();
  const phase = useTrace((s) => s.phase);
  const ev = useSelectedEvidence();
  const [chapter, setChapter] = useState(0);
  const [paused, setPaused] = useState(false);

  // the match drives the opening chapters
  useEffect(() => {
    if (phase === "live") setChapter(0);
    else if (phase === "goal") setChapter(1);
    else if (phase === "tracing") setChapter(2);
    else if (phase === "traced") setChapter((c) => Math.max(c, 2));
  }, [phase]);

  // each later chapter stages its own moment on the pitch
  useEffect(() => {
    if (!ev) return;
    const tr = useTrace.getState();
    const root = rootLink(ev)!;
    const b = chainBounds(ev.goal_id)!;
    if (chapter === 3) {
      tr.setMorph(0, root.evidence_id);
      tr.pin(null, null);
      tr.pin(root.evidence_id, root.player_id);
      tr.setWindow(b);
      jumpTo(root.second - 2, { play: true });
      tr.setSpeed(0.5);
    } else if (chapter === 4) {
      tr.pin(null, null);
      tr.setMorph(1, root.evidence_id);
      tr.setWindow(b);
      jumpTo(Math.max(b[0], root.second - 2), { play: true });
      tr.setSpeed(0.5);
    } else if (chapter === 5) {
      tr.setMorph(0);
      tr.pin(null, null);
      tr.setWindow(b);
      tr.setPhase("traced");
      tr.setPlaying(true);
    }
  }, [chapter, ev]);

  const hold = HOLD_MS[chapter];
  const canNext = chapter === 0 || (chapter >= 2 && chapter < CHAPTERS - 1 && phase !== "tracing" && Boolean(ev));
  const next = () => {
    if (chapter === 0) skipAhead();
    else if (canNext) setChapter((c) => c + 1);
  };
  const back = () => {
    if (chapter <= 2) {
      begin("buildup");
      setChapter(0);
    } else setChapter((c) => c - 1);
  };

  return (
    <section
      aria-labelledby="story-h"
      className="flex min-h-0 flex-1 flex-col"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
    >
      <div className="px-5 pt-5 sm:px-7">
        <div className="flex items-center justify-between gap-4">
          <h2 id="story-h" className="text-[14px] font-semibold text-chalk-dim">
            {t("story.label")}
          </h2>
          <button type="button" onClick={() => go("explore")} className="rc-press min-h-[36px] text-[14px] font-semibold text-chalk-dim underline decoration-1 underline-offset-4 hover:text-chalk">
            {t("story.skip")}
          </button>
        </div>
        <Rail chapter={chapter} hold={hold && canNext && !paused ? hold : 0} onDone={next} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-6 sm:px-7" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={chapter}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="text-[13px] font-semibold text-chalk-faint tabular-nums">{t("story.chapter", { n: chapter + 1, total: CHAPTERS })}</div>
            <Chapter chapter={chapter} ev={ev} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3 border-t border-turf-edge px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7">
        <button
          type="button"
          onClick={back}
          disabled={chapter === 0}
          className="rc-press min-h-[46px] rounded-full px-4 text-[15px] font-semibold text-chalk ring-1 ring-turf-edge transition-colors duration-150 hover:bg-turf-raised disabled:opacity-40"
        >
          {t("story.back")}
        </button>
        {chapter === CHAPTERS - 1 ? (
          <button
            type="button"
            onClick={() => {
              begin("buildup");
              setChapter(0);
            }}
            className="rc-press ml-auto min-h-[46px] rounded-full px-4 text-[15px] font-semibold text-chalk ring-1 ring-turf-edge hover:bg-turf-raised"
          >
            {t("story.restart")}
          </button>
        ) : (
          <button
            type="button"
            onClick={next}
            disabled={!canNext}
            className="rc-press ml-auto inline-flex min-h-[46px] items-center gap-2 rounded-full bg-chalk px-6 text-[15px] font-bold text-turf transition-[opacity,background-color] duration-150 disabled:opacity-40"
          >
            {chapter === 0 ? t("story.skipAhead") : phase === "goal" || phase === "tracing" ? t("story.working") : t("story.next")}
            {canNext && (
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h9m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}
      </div>
    </section>
  );
}

/** Six segments: the current one fills while it holds, so people know the story will move on. */
function Rail({ chapter, hold, onDone }: { chapter: number; hold: number; onDone: () => void }) {
  const { t } = useTranslation();
  const names = [t("story.c1"), t("story.c2"), t("story.c3"), t("story.c4"), t("story.c5"), t("story.c6")];
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!hold) return;
    const id = setTimeout(() => done.current(), hold);
    return () => clearTimeout(id);
  }, [hold, chapter]);
  return (
    <ol className="mt-3 grid grid-cols-6 gap-1.5" aria-label={t("story.label")}>
      {names.map((n, i) => (
        <li key={i} aria-current={i === chapter ? "step" : undefined}>
          <span className="relative block h-[3px] overflow-hidden rounded-full bg-turf-edge">
            {i < chapter && <span className="absolute inset-0 bg-chalk" />}
            {i === chapter && (
              <motion.span
                key={`${chapter}-${hold}`}
                className="absolute inset-0 origin-left bg-chalk"
                initial={{ scaleX: hold ? 0 : 1 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: hold ? hold / 1000 : 0, ease: "linear" }}
              />
            )}
          </span>
          <span className={`mt-1.5 hidden truncate text-[12px] font-semibold sm:block ${i === chapter ? "text-chalk" : "text-chalk-faint"}`}>{n}</span>
        </li>
      ))}
    </ol>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h3 className="mt-1 font-display text-[clamp(40px,5vw,60px)] font-extrabold uppercase leading-[0.9] text-chalk">{children}</h3>;
}

function Body({ children }: { children: ReactNode }) {
  return <p className="mt-3 max-w-[48ch] text-[17px] leading-[1.6] text-chalk sm:text-[18px]">{children}</p>;
}

function Chapter({ chapter, ev }: { chapter: number; ev: Evidence | null }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const goal = useLatestGoal();
  const phase = useTrace((s) => s.phase);
  const steps = useMatch((s) => (goal?.goalId ? s.steps[goal.goalId]?.length ?? 0 : 0));
  const lower = (s: string) => (useUi.getState().lang === "hi" ? s : s.charAt(0).toLowerCase() + s.slice(1));

  if (chapter === 0) {
    return (
      <>
        <Title>{t("story.c1")}</Title>
        <Body>{t("story.c1Body", { home: meta?.home.name ?? "", away: meta?.away.name ?? "" })}</Body>
      </>
    );
  }
  if (chapter === 1 || (chapter === 2 && !ev)) {
    const scorer = goal ? playerInfo(meta, goal.playerId) : null;
    const stages = [
      { label: t("tracing.walk"), done: Boolean(goal?.goalId) },
      { label: t("tracing.replay"), done: Boolean(goal?.goalId) },
      { label: t("tracing.explain"), done: steps > 0 },
    ];
    const current = stages.findIndex((s) => !s.done);
    return (
      <>
        <Title>{chapter === 1 ? t("story.c2") : t("story.c3")}</Title>
        <Body>{t("story.c2Body", { scorer: scorer?.name ?? "", time: clock(goal?.second ?? 0) })}</Body>
        {phase === "tracing" && (
          <ol className="mt-5 space-y-2 text-[15px]" role="status">
            {stages.map((s, i) => (
              <li key={i} className={`flex items-center gap-3 ${s.done || i === current ? "text-chalk" : "text-chalk-faint"}`}>
                <span className="grid h-4 w-4 place-items-center" aria-hidden="true">
                  {s.done ? (
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      <path d="m3 7.3 2.6 2.6L11 4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : i === current ? (
                    <span className="h-3 w-3 rounded-full border-2 border-chalk border-t-transparent rc-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-chalk-faint" />
                  )}
                </span>
                {s.label}
              </li>
            ))}
          </ol>
        )}
      </>
    );
  }
  if (!ev) return null;
  const root = rootLink(ev)!;
  const culprit = playerInfo(meta, root.player_id);

  if (chapter === 2) {
    const links = [...chronological(ev)].reverse();
    return (
      <>
        <Title>{t("story.c3")}</Title>
        <Body>{ev.links.length === 1 ? t("story.c3BodyOne") : t("story.c3Body", { count: ev.links.length })}</Body>
        <ol className="mt-5 divide-y divide-turf-edge border-y border-turf-edge">
          {links.map((l, i) => (
            <motion.li
              key={l.evidence_id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.25, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="py-3"
            >
              <div className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className={l.evidence_id === ev.root_cause_evidence_id ? "font-semibold text-flare" : "text-chalk"}>
                  <BugName code={l.bug_type} />
                </span>
                <span className="text-[13px] text-chalk-dim tabular-nums">{clock(l.second)}</span>
              </div>
              <div className="mt-1 text-[15px]">
                <PlayerChip id={l.player_id} evidenceId={l.evidence_id} full />
              </div>
              <div className="mt-2">
                <BlameBar link={l} root={l.evidence_id === ev.root_cause_evidence_id} delay={300 + i * 250} />
              </div>
            </motion.li>
          ))}
        </ol>
        <p className="mt-3 text-[13px] leading-relaxed text-chalk-dim">{t("term.blameDef")}</p>
      </>
    );
  }
  if (chapter === 3) {
    return (
      <>
        <Title>{t("story.c4")}</Title>
        <Body>
          {t("story.c4Body", {
            name: culprit.name,
            bug: lower(t(`bug.${root.bug_type}`, { defaultValue: root.bug_type })),
            time: clock(root.second),
            blame: pct(root.blame_percent),
          })}
        </Body>
        <PlainWords ev={ev} />
      </>
    );
  }
  if (chapter === 4) {
    const brk = breakdown(root.evidence_id);
    return (
      <>
        <Title>{t("story.c5")}</Title>
        <Body>
          {t("story.c5Body", {
            name: culprit.name,
            fix: t(`fix.${root.bug_type}`, { defaultValue: t("fix.generic") }),
            note: brk ? t(`note.${brk.note}`, { time: clock(brk.second) }) : t("note.attack_changed", { time: clock(root.second) }),
            before: root.baseline_goals,
            after: root.fixed_goals,
          })}
        </Body>
        <div className="mt-5 max-w-[380px]">
          <ReplayGrid trials={root.trials} lit={root.fixed_goals} compact />
          <p className="mt-2 text-[13px] text-chalk-dim">{t("whatif.gridCaption", { trials: root.trials, goals: root.fixed_goals })}</p>
        </div>
      </>
    );
  }
  return (
    <>
      <Title>{t("story.c6")}</Title>
      <Body>{t("story.c6Body")}</Body>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => go("explore")} className="rc-press min-h-[48px] rounded-full bg-chalk px-6 text-[15px] font-bold text-turf hover:opacity-90">
          {t("story.exploreCta")}
        </button>
        <button type="button" onClick={() => go("report")} className="rc-press min-h-[48px] rounded-full px-6 text-[15px] font-semibold text-chalk ring-1 ring-turf-edge hover:bg-turf-raised">
          {t("story.reportCta")}
        </button>
      </div>
    </>
  );
}

/** The agents' own words for the root cause, in the chosen mode and language. */
function PlainWords({ ev }: { ev: Evidence }) {
  const { t } = useTranslation();
  const q = useExplanation(ev.goal_id, true);
  if (!q.data) return null;
  return (
    <div className="mt-6 border-l-2 border-turf-edge pl-4">
      <div className="text-[13px] font-semibold text-chalk-dim">{t(`explain.title.${useUi.getState().mode}`)}</div>
      <div className="mt-1">
        <Sentences sentences={q.data.sentences.slice(0, 3)} ev={ev} lang={q.data.lang} />
      </div>
    </div>
  );
}
