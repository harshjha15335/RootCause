import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Evidence, Mode } from "../api/types";
import { Badge, BugName } from "../components/bits";
import { StageView } from "../components/StageView";
import { clock, pct, playerInfo, rate } from "../lib/format";
import { chronological, rootLink } from "../lib/geometry";
import { go } from "../lib/nav";
import { useMatch } from "../store/matchStore";
import { useSelectedEvidence, useTruth } from "../store/selectors";
import { useUi } from "../store/uiStore";
import { ReplayGrid } from "./Counterfactual";

/** Everything the home page says about the featured goal, from the trace itself. */
function useFeatured(ev: Evidence | null) {
  const meta = useMatch((s) => s.meta);
  const truth = useTruth();
  if (!ev) return null;
  const root = rootLink(ev)!;
  const scorer = playerInfo(meta, ev.goal.player_id);
  const culprit = playerInfo(meta, root.player_id);
  const links = chronological(ev);
  return {
    ev,
    root,
    scorer,
    culprit,
    links,
    seconds: ev.goal.second - links[0].second,
    before: root.baseline_goals,
    after: root.fixed_goals,
    trials: root.trials,
    found: truth ? truth.root_cause_player_id === root.player_id && truth.bug === root.bug_type : null,
  };
}

export function Home() {
  const ev = useSelectedEvidence();
  const f = useFeatured(ev);
  return (
    <>
      <Hero f={f} />
      <How f={f} />
      <Modes />
      <Footer />
    </>
  );
}

function Hero({ f }: { f: ReturnType<typeof useFeatured> }) {
  const { t } = useTranslation();
  const wide = useWide();

  useEffect(() => {
    useUi.getState().setStageInset(wide ? 0.42 : 0);
    return () => useUi.getState().setStageInset(0);
  }, [wide]);

  return (
    <section aria-labelledby="hero-h" className="relative isolate overflow-hidden bg-turf-deep">
      <div className="relative h-[46svh] min-h-[280px] lg:absolute lg:inset-0 lg:h-auto" aria-hidden="true">
        <StageView />
        {/* floodlight falloff: the copy side reads, the pitch side stays lit */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_72%_40%,transparent_35%,rgb(var(--turf-deep)/0.85)_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[58%] bg-gradient-to-r from-turf-deep via-turf-deep/80 to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-turf-deep to-transparent lg:hidden" />
      </div>

      <div className="relative mx-auto flex max-w-[1600px] flex-col px-4 pb-10 pt-2 sm:px-8 lg:min-h-[calc(100svh-var(--header-h))] lg:justify-center lg:py-16">
        <div className="max-w-[620px]">
          <motion.h1
            id="hero-h"
            className="font-display text-[clamp(64px,9.5vw,148px)] font-extrabold uppercase leading-[0.84] tracking-[-0.005em] text-chalk"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
          >
            {t("home.title")}
          </motion.h1>
          <motion.p
            className="mt-6 max-w-[46ch] text-[18px] leading-[1.55] text-chalk-dim sm:text-[19px]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
          >
            {t("home.lede")}
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.28, ease: [0.23, 1, 0.32, 1] }}
          >
            <button
              type="button"
              onClick={() => go("story")}
              className="rc-press group inline-flex min-h-[54px] items-center gap-3 rounded-full bg-chalk pl-2 pr-6 text-[16px] font-bold text-ink shadow-[0_10px_30px_-10px_rgb(241_243_236/0.45)] transition-[background-color,box-shadow] duration-200 hover:bg-white"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-chalk">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M4 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5z" fill="currentColor" />
                </svg>
              </span>
              {t("home.watch")}
            </button>
            <button
              type="button"
              onClick={() => go("explore")}
              className="rc-press min-h-[44px] text-[16px] font-semibold text-chalk underline decoration-chalk-faint decoration-1 underline-offset-[6px] transition-[text-decoration-color] duration-150 hover:decoration-chalk"
            >
              {t("home.explore")}
            </button>
          </motion.div>
        </div>

        <NowShowing f={f} />
      </div>
    </section>
  );
}

/** What the pitch behind the headline is showing, so nobody has to guess. */
function NowShowing({ f }: { f: ReturnType<typeof useFeatured> }) {
  const { t } = useTranslation();
  return (
    <motion.div
      className="mt-10 max-w-[420px] rounded-[12px] bg-turf/90 p-4 ring-1 ring-turf-edge lg:absolute lg:bottom-10 lg:right-8 lg:mt-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.6 }}
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold text-chalk-dim">
        <span className="h-1.5 w-1.5 rounded-full bg-chalk rc-blink" aria-hidden="true" />
        {t("home.showing")}
      </div>
      {f ? (
        <>
          <p className="mt-2 text-[15px] leading-relaxed text-chalk">
            {t("home.caption", { scorer: f.scorer.name, club: f.scorer.club?.name ?? "", time: clock(f.ev.goal.second), name: f.culprit.name })}
          </p>
          <div className="mt-3 flex items-center gap-2.5 text-[13px] text-chalk-dim">
            <svg width="34" height="8" viewBox="0 0 34 8" aria-hidden="true">
              <path d="M2 4h26" stroke="rgb(var(--flare))" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="30" cy="4" r="3" fill="rgb(var(--flare))" />
            </svg>
            <span>
              <BugName code={f.root.bug_type} /> · {clock(f.root.second)} · {pct(f.root.blame_percent)}
            </span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[15px] text-chalk-dim">{t("home.loading")}</p>
      )}
    </motion.div>
  );
}

function How({ f }: { f: ReturnType<typeof useFeatured> }) {
  const { t } = useTranslation();
  if (!f) return null;
  const steps: { title: string; body: string; visual: ReactNode }[] = [
    {
      title: t("home.s1Title"),
      body: t("home.s1Body", { scorer: f.scorer.name, club: f.scorer.club?.name ?? "", time: clock(f.ev.goal.second) }),
      visual: <GoalSlab f={f} />,
    },
    {
      title: t("home.s2Title"),
      body: t("home.s2Body", { seconds: f.seconds, count: f.links.length }),
      visual: <MiniTrace f={f} />,
    },
    {
      title: t("home.s3Title"),
      body: t("home.s3Body", { name: f.culprit.name, before: f.before, after: f.after }),
      visual: <Replays f={f} />,
    },
    {
      title: t("home.s4Title"),
      body: `${t("home.s4Body", { blame: pct(f.root.blame_percent) })}${f.found ? ` ${t("home.s4Proof")}` : ""}`,
      visual: <Verdict f={f} />,
    },
  ];
  return (
    <section aria-labelledby="how-h" className="paper">
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-8 sm:py-28">
        <div className="max-w-[640px]">
          <h2 id="how-h" className="font-display text-[clamp(44px,6vw,80px)] font-extrabold uppercase leading-[0.9] text-chalk">
            {t("home.howTitle")}
          </h2>
          <p className="mt-4 max-w-[52ch] text-[18px] leading-relaxed text-chalk-dim">{t("home.howLede")}</p>
        </div>
        <ol className="mt-14 sm:mt-20">
          {steps.map((s, i) => (
            <Step key={i} n={i + 1} title={s.title} body={s.body}>
              {s.visual}
            </Step>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  return (
    <li className="grid gap-6 border-t border-turf-edge py-10 sm:gap-10 sm:py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div className="flex gap-5">
        {/* the steps are a real sequence, so they're numbered */}
        <span className="font-display text-[56px] font-extrabold leading-[0.8] text-chalk-faint tabular-nums" aria-hidden="true">
          {n}
        </span>
        <div>
          <h3 className="font-display text-[34px] font-extrabold uppercase leading-[0.95] text-chalk sm:text-[40px]">{title}</h3>
          <p className="mt-3 max-w-[44ch] text-[17px] leading-relaxed text-chalk-dim">{body}</p>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

type F = NonNullable<ReturnType<typeof useFeatured>>;

function GoalSlab({ f }: { f: F }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const club = f.scorer.side === "home" ? meta?.home : meta?.away;
  return (
    <div className="flex items-center gap-5 rounded-[14px] bg-ink p-6 text-paper sm:p-8">
      <Badge club={club ?? null} size={56} />
      <div className="min-w-0">
        <div className="font-display text-[clamp(48px,7vw,84px)] font-extrabold uppercase leading-[0.85]">{t("goal.word")}</div>
        <div className="mt-2 text-[16px] font-semibold">
          {f.scorer.name} <span className="opacity-60">·</span> <span className="tabular-nums">{clock(f.ev.goal.second)}</span>
        </div>
      </div>
    </div>
  );
}

/** The chain, as the Debugger prints it: the goal on top, the root cause at the bottom. */
function MiniTrace({ f }: { f: F }) {
  const { t } = useTranslation();
  const frames = [...f.links].reverse();
  return (
    <ol className="overflow-hidden rounded-[14px] bg-ink font-trace text-[13px] text-paper sm:text-[14px]" aria-label={t("term.chain")}>
      <li className="flex justify-between gap-4 border-b border-paper/15 px-5 py-3.5">
        <span>
          <span className="opacity-55">goal</span> {f.scorer.name}
        </span>
        <span className="tabular-nums opacity-70">{clock(f.ev.goal.second)}</span>
      </li>
      {frames.map((l) => {
        const root = l.evidence_id === f.ev.root_cause_evidence_id;
        const who = playerInfo(useMatch.getState().meta, l.player_id);
        return (
          <li key={l.evidence_id} className={`flex justify-between gap-4 border-b border-paper/15 px-5 py-3.5 last:border-b-0 ${root ? "bg-[rgb(255_138_61/0.14)]" : ""}`}>
            <span className={root ? "text-[rgb(255_138_61)]" : ""}>
              <span className="opacity-55">at</span> <BugName code={l.bug_type} /> <span className="opacity-70">({who.name})</span>
            </span>
            <span className="shrink-0 tabular-nums opacity-70">
              {pct(l.blame_percent)} · {clock(l.second)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 200 replays as it played, then the same 200 with the mistake fixed. */
function Replays({ f }: { f: F }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-20% 0px" });
  const reduced = useUi((s) => s.reducedMotion);
  const [fixed, setFixed] = useState(false);
  useEffect(() => {
    if (!seen) return;
    const id = setTimeout(() => setFixed(true), reduced ? 0 : 1100);
    return () => clearTimeout(id);
  }, [seen, reduced]);
  const lit = fixed ? f.after : f.before;
  return (
    <div ref={ref} className="rounded-[14px] bg-turf-deep p-5 sm:p-7">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <div className="text-[14px] font-semibold text-chalk-dim">{fixed ? t("whatif.fixed") : t("whatif.happened")}</div>
          <div className="font-display text-[56px] font-extrabold leading-[0.9] text-chalk tabular-nums">
            {lit}
            <span className="text-[28px] text-chalk-faint"> / {f.trials}</span>
          </div>
          <div className="text-[14px] text-chalk-dim">{t("home.goalsIn")}</div>
        </div>
        <button
          type="button"
          onClick={() => setFixed((x) => !x)}
          aria-pressed={fixed}
          className="rc-press min-h-[40px] rounded-full px-4 text-[14px] font-semibold text-chalk ring-1 ring-turf-edge hover:bg-turf-raised"
        >
          {fixed ? t("whatif.happened") : t("whatif.fixed")}
        </button>
      </div>
      <ReplayGrid trials={f.trials} lit={lit} compact />
      <p className="mt-3 text-[13px] text-chalk-dim">{t("whatif.gridCaption", { trials: f.trials, goals: lit })}</p>
    </div>
  );
}

function Verdict({ f }: { f: F }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-5 rounded-[14px] bg-ink p-6 text-paper sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8 sm:p-8">
      <div className="font-display text-[clamp(84px,11vw,132px)] font-extrabold leading-[0.8] text-[rgb(255_138_61)] tabular-nums">{pct(f.root.blame_percent)}</div>
      <div>
        <div className="text-[14px] font-semibold opacity-70">{t("cause.label")}</div>
        <div className="mt-1 font-display text-[36px] font-extrabold uppercase leading-[0.95]">{f.culprit.name}</div>
        <div className="mt-1 text-[16px]">
          <BugName code={f.root.bug_type} /> · <span className="tabular-nums">{clock(f.root.second)}</span>
        </div>
        <div className="mt-1 text-[14px] opacity-70">
          {t("trace.dropLine", { before: Math.round(rate(f.before, f.trials)), after: Math.round(rate(f.after, f.trials)) })}
        </div>
      </div>
    </div>
  );
}

const MODES: Mode[] = ["fan", "analyst", "studio"];

function Modes() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="modes-h" className="bg-turf-deep">
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-8 sm:py-28">
        <h2 id="modes-h" className="font-display text-[clamp(44px,6vw,80px)] font-extrabold uppercase leading-[0.9] text-chalk">
          {t("home.modesTitle")}
        </h2>
        <p className="mt-4 text-[18px] text-chalk-dim">{t("home.modesLede")}</p>
        <ul className="mt-12">
          {MODES.map((m) => (
            <li key={m} className="border-t border-turf-edge last:border-b">
              <button
                type="button"
                onClick={() => {
                  useUi.getState().setMode(m);
                  go("explore");
                }}
                className="group grid w-full gap-2 py-7 text-left transition-colors duration-200 hover:bg-turf sm:grid-cols-[minmax(0,4fr)_minmax(0,6fr)_200px] sm:items-center sm:gap-8 sm:px-4"
              >
                <span className="font-display text-[44px] font-extrabold uppercase leading-none text-chalk sm:text-[56px]">{t(`mode.${m}`)}</span>
                <span className="max-w-[48ch] text-[17px] leading-relaxed text-chalk-dim">{t(`home.${m}Body`)}</span>
                <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-chalk sm:justify-self-end">
                  {t("home.open", { mode: t(`mode.${m}`) })}
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="transition-transform duration-200 ease-out group-hover:translate-x-1">
                    <path d="M3 8h9m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-turf-edge/60 bg-turf-deep">
      <div className="mx-auto max-w-[1280px] px-4 py-8 text-[14px] text-chalk-faint sm:px-8">{t("home.footer")}</div>
    </footer>
  );
}

function useWide() {
  const q = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = (e: MediaQueryListEvent) => setWide(e.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}
