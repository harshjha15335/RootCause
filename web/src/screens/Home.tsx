import { useInView } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Evidence, Mode } from "../api/types";
import { Badge, BugName } from "../components/bits";
import { StageView } from "../components/StageView";
import { clock, pct, playerInfo } from "../lib/format";
import { chronological, rootLink } from "../lib/geometry";
import { Reveal, RiseLines, ScrollBar, ScrollWords, useSmoothScroll } from "../lib/motion";
import { go } from "../lib/nav";
import { breakdown } from "../lib/sample";
import { useMatch } from "../store/matchStore";
import { useSelectedEvidence, useTruth } from "../store/selectors";
import { useUi } from "../store/uiStore";
import { ReplayGrid } from "./Counterfactual";

/** Everything the home page says about the featured goal, from the trace itself. */
function useFeatured(ev: Evidence | null) {
  const meta = useMatch((s) => s.meta);
  const goals = useMatch((s) => s.goals);
  useMatch((s) => s.replays);
  const truth = useTruth();
  if (!ev) return null;
  const root = rootLink(ev)!;
  const links = chronological(ev);
  return {
    ev,
    root,
    links,
    scorer: playerInfo(meta, ev.goal.player_id),
    culprit: playerInfo(meta, root.player_id),
    seconds: ev.goal.second - links[0].second,
    score: { home: goals.filter((g) => g.team === "home").length, away: goals.filter((g) => g.team === "away").length },
    brk: breakdown(root.evidence_id),
    found: truth ? truth.root_cause_player_id === root.player_id && truth.bug === root.bug_type : null,
  };
}
type F = NonNullable<ReturnType<typeof useFeatured>>;

export function Home() {
  useSmoothScroll();
  const f = useFeatured(useSelectedEvidence());
  return (
    <>
      <Hero f={f} />
      {f && (
        <>
          <Ticker f={f} />
          <Statement f={f} />
          <Numbers f={f} />
          <How f={f} />
          <VerdictCard f={f} />
        </>
      )}
      <Modes />
      <Footer />
    </>
  );
}

function Hero({ f }: { f: F | null }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const wide = useWide();

  useEffect(() => {
    useUi.getState().setStageInset(wide ? 0.44 : 0);
    return () => useUi.getState().setStageInset(0);
  }, [wide]);

  return (
    <section aria-labelledby="hero-h" className="relative isolate overflow-hidden bg-turf-deep">
      <div className="rc-fade-in relative h-[44svh] min-h-[280px] lg:absolute lg:inset-0 lg:h-auto" style={{ animationDelay: "0.5s" }} aria-hidden="true">
        <StageView />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_90%_at_74%_42%,transparent_30%,rgb(var(--turf-deep))_95%)]" />
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[60%] bg-gradient-to-r from-turf-deep via-turf-deep/85 to-transparent lg:block" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-turf-deep to-transparent" />
      </div>

      <div className="relative mx-auto flex max-w-[1440px] flex-col px-5 pb-14 sm:px-10 lg:min-h-[calc(100svh-var(--header-h))] lg:justify-center lg:py-20">
        <div className="max-w-[720px]">
          {meta && f && (
            <div className="rc-eyebrow rc-fade-in" style={{ animationDelay: "0.05s" }}>
              {t("home.eyebrow", { home: meta.home.name, away: meta.away.name, h: f.score.home, a: f.score.away })}
            </div>
          )}
          <h1 id="hero-h" className="mt-8 font-display text-[clamp(68px,9.6vw,148px)] leading-[0.9] text-chalk">
            <RiseLines
              lines={[
                t("home.titleA"),
                <>
                  {t("home.titleB")} <em className="text-flare">{t("home.titleBug")}</em>
                </>,
              ]}
            />
            <span className="sr-only">{t("home.title")}</span>
          </h1>
          <p className="rc-fade-in mt-9 max-w-[30rem] text-[19px] leading-[1.6] text-chalk-dim" style={{ animationDelay: "0.55s" }}>
            {t("home.lede")}
          </p>
          <div className="rc-fade-in mt-11 flex flex-wrap items-center gap-3.5" style={{ animationDelay: "0.75s" }}>
            <button
              type="button"
              onClick={() => go("story")}
              className="rc-press inline-flex h-[56px] items-center gap-3 rounded-full bg-chalk pl-2 pr-7 text-[15px] font-semibold text-turf-deep transition-[background-color] duration-300 hover:bg-white"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-turf-deep text-chalk">
                <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M4 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5z" fill="currentColor" />
                </svg>
              </span>
              {t("home.watch")}
            </button>
            <button
              type="button"
              onClick={() => go("explore")}
              className="rc-press inline-flex h-[56px] items-center rounded-full px-7 text-[15px] font-medium text-chalk ring-1 ring-inset ring-turf-edge transition-[box-shadow] duration-300 hover:ring-chalk/60"
            >
              {t("home.explore")}
            </button>
          </div>
        </div>
        <NowShowing f={f} />
      </div>
    </section>
  );
}

/** What the pitch behind the headline is showing, so nobody has to guess. */
function NowShowing({ f }: { f: F | null }) {
  const { t } = useTranslation();
  return (
    <div
      className="rc-fade-in mt-12 max-w-[380px] border-t border-turf-edge pt-4 lg:absolute lg:bottom-12 lg:right-10 lg:mt-0"
      style={{ animationDelay: "1.4s" }}
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-[13px] text-chalk-faint">
        <span className="h-1.5 w-1.5 rounded-full bg-flare rc-blink" aria-hidden="true" />
        {t("home.showing")}
      </div>
      {f ? (
        <p className="mt-2 text-[15px] leading-relaxed text-chalk-dim">
          {t("home.caption", { scorer: f.scorer.name, club: f.scorer.club?.name ?? "", time: clock(f.ev.goal.second), name: f.culprit.name })}
        </p>
      ) : (
        <p className="mt-2 text-[15px] text-chalk-dim">{t("home.loading")}</p>
      )}
    </div>
  );
}

/** The chain as a slow ticker under the hero. */
function Ticker({ f }: { f: F }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const items: { text: string; bug: boolean }[] = [
    { text: `${clock(f.ev.goal.second)}  ${t("home.tickGoal", { name: f.scorer.name })}`, bug: false },
    ...[...f.links].reverse().map((l) => ({
      text: `${clock(l.second)}  ${playerInfo(meta, l.player_id).name}: ${t(`bug.${l.bug_type}`, { defaultValue: l.bug_type }).toLowerCase()}`,
      bug: l.evidence_id === f.ev.root_cause_evidence_id,
    })),
    { text: t("home.tickBefore", { n: f.root.baseline_goals, trials: f.root.trials }), bug: false },
    { text: t("home.tickAfter", { n: f.root.fixed_goals, trials: f.root.trials }), bug: false },
  ];
  const row = (k: string) => (
    <div key={k} className="flex shrink-0 gap-16 pr-16" aria-hidden={k === "b"}>
      {items.map((it, i) => (
        <span key={i} className={it.bug ? "text-flare" : ""}>
          {it.text}
        </span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden border-y border-turf-edge/70 bg-turf-deep py-6">
      <div className="rc-marquee whitespace-nowrap font-display text-[30px] text-chalk-faint">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

function Statement({ f }: { f: F }) {
  const { t } = useTranslation();
  const a = t("home.statementA", { seconds: f.seconds });
  const b = t("home.statementB");
  return (
    <section className="bg-turf-deep">
      <div className="mx-auto max-w-[1180px] px-5 py-[22vh] sm:px-10">
        <ScrollWords text={`${a} ${b}`} italicFrom={a.split(/\s+/).length} className="font-display text-[clamp(38px,5.2vw,72px)] leading-[1.1]" />
      </div>
    </section>
  );
}

function Numbers({ f }: { f: F }) {
  const { t } = useTranslation();
  const before = Math.round((f.root.baseline_goals / f.root.trials) * 100);
  const after = Math.round((f.root.fixed_goals / f.root.trials) * 100);
  return (
    <section className="bg-turf-deep">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 pb-32 sm:px-10 md:grid-cols-2">
        <Reveal className="border-t border-turf-edge pt-7">
          <div className="text-[14px] text-chalk-faint">{t("home.asPlayed")}</div>
          <div className="mt-4 font-display text-[clamp(120px,15vw,200px)] leading-[0.85] text-chalk tabular-nums">{before}%</div>
          <p className="mt-5 max-w-[26rem] text-[17px] text-chalk-dim">{t("home.asPlayedBody", { n: f.root.baseline_goals, trials: f.root.trials })}</p>
        </Reveal>
        <Reveal className="border-t border-flare pt-7" delay={8}>
          <div className="text-[14px] text-flare">{t("home.withFix", { name: f.culprit.name })}</div>
          <div className="mt-4 font-display text-[clamp(120px,15vw,200px)] leading-[0.85] text-flare tabular-nums">{after}%</div>
          <p className="mt-5 max-w-[26rem] text-[17px] text-chalk-dim">
            {f.brk ? `${capital(t(`note.${f.brk.note}`, { time: clock(f.brk.second) }))}. ` : ""}
            {t("home.withFixBody", { n: f.root.fixed_goals, trials: f.root.trials })}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function How({ f }: { f: F }) {
  const { t } = useTranslation();
  const steps: { title: string; body: string; visual: ReactNode }[] = [
    {
      title: t("home.s1Title"),
      body: t("home.s1Body", { scorer: f.scorer.name, club: f.scorer.club?.name ?? "", time: clock(f.ev.goal.second) }),
      visual: <GoalSlab f={f} />,
    },
    { title: t("home.s2Title"), body: t("home.s2Body", { seconds: f.seconds, count: f.links.length }), visual: <MiniTrace f={f} /> },
    { title: t("home.s3Title"), body: t("home.s3Body", { name: f.culprit.name, before: f.root.baseline_goals, after: f.root.fixed_goals }), visual: <Replays f={f} /> },
    {
      title: t("home.s4Title"),
      body: `${t("home.s4Body", { blame: pct(f.root.blame_percent) })}${f.found ? ` ${t("home.s4Proof")}` : ""}`,
      visual: <BlameSplit f={f} />,
    },
  ];
  return (
    <section aria-labelledby="how-h" className="bg-turf-deep">
      <div className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-10">
        <Reveal>
          <h2 id="how-h" className="max-w-[14ch] font-display text-[clamp(52px,6.4vw,104px)] leading-[0.95] text-chalk">
            {t("home.howTitle")}
          </h2>
          <p className="mt-6 max-w-[34rem] text-[18px] leading-relaxed text-chalk-dim">{t("home.howLede")}</p>
        </Reveal>
        <ol className="mt-20">
          {steps.map((s, i) => (
            <li key={i} className="grid gap-8 border-t border-turf-edge py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20 lg:py-20">
              <Reveal className="flex gap-6">
                {/* the steps are a real sequence, so they're numbered */}
                <span className="font-display text-[22px] italic text-chalk-faint tabular-nums" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-display text-[clamp(38px,3.6vw,54px)] leading-[1] text-chalk">{s.title}</h3>
                  <p className="mt-5 max-w-[28rem] text-[17px] leading-[1.65] text-chalk-dim">{s.body}</p>
                </div>
              </Reveal>
              <Reveal className="min-w-0" delay={6}>
                {s.visual}
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function GoalSlab({ f }: { f: F }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const club = f.scorer.side === "home" ? meta?.home : meta?.away;
  return (
    <div className="flex items-center gap-6 rounded-[20px] bg-turf p-8 ring-1 ring-turf-edge sm:p-10">
      <Badge club={club ?? null} size={60} />
      <div className="min-w-0">
        <div className="font-display text-[clamp(64px,8vw,104px)] italic leading-[0.85] text-chalk">{t("goal.word")}</div>
        <div className="mt-3 text-[16px] text-chalk-dim">
          {f.scorer.name} · <span className="tabular-nums">{clock(f.ev.goal.second)}</span>
        </div>
      </div>
    </div>
  );
}

/** The chain as the Debugger prints it: the goal on top, the root cause at the bottom. */
function MiniTrace({ f }: { f: F }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  return (
    <ol className="overflow-hidden rounded-[20px] bg-turf font-trace text-[13px] ring-1 ring-turf-edge sm:text-[14px]" aria-label={t("term.chain")}>
      <li className="flex justify-between gap-4 border-b border-turf-edge px-6 py-4 text-chalk">
        <span>
          <span className="text-chalk-faint">goal</span> {f.scorer.name}
        </span>
        <span className="tabular-nums text-chalk-faint">{clock(f.ev.goal.second)}</span>
      </li>
      {[...f.links].reverse().map((l) => {
        const root = l.evidence_id === f.ev.root_cause_evidence_id;
        return (
          <li key={l.evidence_id} className={`flex justify-between gap-4 border-b border-turf-edge px-6 py-4 last:border-b-0 ${root ? "bg-flare/[0.08] text-flare" : "text-chalk"}`}>
            <span>
              <span className={root ? "" : "text-chalk-faint"}>at</span> <BugName code={l.bug_type} />{" "}
              <span className={root ? "" : "text-chalk-dim"}>({playerInfo(meta, l.player_id).name})</span>
            </span>
            <span className="shrink-0 tabular-nums opacity-80">
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
  const seen = useInView(ref, { once: true, margin: "-25% 0px" });
  const reduced = useUi((s) => s.reducedMotion);
  const [fixed, setFixed] = useState(false);
  useEffect(() => {
    if (!seen) return;
    const id = setTimeout(() => setFixed(true), reduced ? 0 : 1200);
    return () => clearTimeout(id);
  }, [seen, reduced]);
  const lit = fixed ? f.root.fixed_goals : f.root.baseline_goals;
  return (
    <div ref={ref} className="rounded-[20px] bg-turf p-7 ring-1 ring-turf-edge sm:p-9">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className={`text-[14px] ${fixed ? "text-flare" : "text-chalk-faint"}`}>{fixed ? t("whatif.fixed") : t("whatif.happened")}</div>
          <div className="mt-1 font-display text-[64px] leading-[0.9] text-chalk tabular-nums">
            {lit}
            <span className="text-[30px] text-chalk-faint"> / {f.root.trials}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFixed((x) => !x)}
          aria-pressed={fixed}
          className="rc-press min-h-[44px] rounded-full px-5 text-[14px] font-medium text-chalk ring-1 ring-inset ring-turf-edge transition-[box-shadow] duration-300 hover:ring-chalk/60"
        >
          {fixed ? t("whatif.happened") : t("whatif.fixed")}
        </button>
      </div>
      <ReplayGrid trials={f.root.trials} lit={lit} compact />
      <p className="mt-4 text-[13px] text-chalk-faint">{t("whatif.gridCaption", { trials: f.root.trials, goals: lit })}</p>
    </div>
  );
}

function BlameSplit({ f }: { f: F }) {
  const meta = useMatch((s) => s.meta);
  return (
    <div className="space-y-7 rounded-[20px] bg-turf p-7 ring-1 ring-turf-edge sm:p-9">
      {[...f.links]
        .sort((a, b) => b.blame_percent - a.blame_percent)
        .map((l) => {
          const root = l.evidence_id === f.ev.root_cause_evidence_id;
          return (
            <div key={l.evidence_id}>
              <div className="flex items-baseline justify-between gap-4">
                <span className={`font-display text-[30px] leading-none ${root ? "text-flare" : "text-chalk"}`}>{playerInfo(meta, l.player_id).name}</span>
                <span className={`font-display text-[30px] leading-none tabular-nums ${root ? "text-flare" : "text-chalk-dim"}`}>{pct(l.blame_percent)}</span>
              </div>
              <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-turf-edge">
                <ScrollBar to={l.blame_percent / 100} className={`h-[3px] rounded-full ${root ? "bg-flare" : "bg-chalk-faint"}`} />
              </div>
            </div>
          );
        })}
    </div>
  );
}

/** The verdict, on bone card stock. */
function VerdictCard({ f }: { f: F }) {
  const { t } = useTranslation();
  return (
    <section className="bg-turf-deep">
      <div className="mx-auto max-w-[1440px] px-5 pb-32 sm:px-10">
        <Reveal y={110}>
          <div className="paper grid gap-10 rounded-[32px] p-9 sm:p-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
            <div>
              <div className="text-[14px] font-medium text-chalk-dim">{t("cause.label")}</div>
              <div className="mt-5 font-display text-[clamp(64px,8vw,120px)] leading-[0.92] text-chalk">{f.culprit.name}</div>
              <p className="mt-5 text-[18px] text-chalk-dim">
                {f.culprit.club?.name} · {t(`pos.${f.culprit.position}`, { defaultValue: f.culprit.position ?? "" })} · <BugName code={f.root.bug_type} /> ·{" "}
                <span className="tabular-nums">{clock(f.root.second)}</span>
              </p>
            </div>
            <div>
              <div className="font-display text-[clamp(110px,12vw,180px)] leading-[0.8] text-flare tabular-nums">{pct(f.root.blame_percent)}</div>
              <div className="mt-4 text-[15px] text-chalk-dim">{t("cause.blame")}</div>
              <button
                type="button"
                onClick={() => go("explore")}
                className="rc-press mt-8 inline-flex h-[52px] items-center rounded-full bg-chalk px-7 text-[15px] font-semibold text-turf transition-opacity duration-200 hover:opacity-90"
              >
                {t("story.exploreCta")}
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const MODES: Mode[] = ["fan", "analyst", "studio"];

function Modes() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="modes-h" className="bg-turf-deep">
      <div className="mx-auto max-w-[1440px] px-5 pb-32 sm:px-10">
        <Reveal>
          <h2 id="modes-h" className="font-display text-[clamp(52px,6.4vw,104px)] leading-[0.95] text-chalk">
            {t("home.modesTitle")}
          </h2>
          <p className="mt-5 text-[18px] text-chalk-dim">{t("home.modesLede")}</p>
        </Reveal>
        <ul className="mt-14">
          {MODES.map((m, i) => (
            <Reveal as="li" key={m} delay={i * 4} className="border-t border-turf-edge last:border-b">
              <button
                type="button"
                onClick={() => {
                  useUi.getState().setMode(m);
                  go("explore");
                }}
                className="group grid w-full gap-3 py-9 text-left sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)_180px] sm:items-center sm:gap-10"
              >
                <span className="font-display text-[clamp(48px,5vw,76px)] leading-none text-chalk transition-[font-style,color] duration-300 group-hover:italic group-hover:text-flare">
                  {t(`mode.${m}`)}
                </span>
                <span className="max-w-[30rem] text-[17px] leading-relaxed text-chalk-dim">{t(`home.${m}Body`)}</span>
                <span className="inline-flex items-center gap-2 text-[15px] font-medium text-chalk sm:justify-self-end">
                  {t("home.open", { mode: t(`mode.${m}`) })}
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="transition-transform duration-300 ease-out group-hover:translate-x-1">
                    <path d="M3 8h9m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-turf-edge bg-turf-deep">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-6 px-5 py-14 sm:px-10">
        <div className="font-display text-[clamp(44px,5vw,72px)] leading-none text-chalk">
          {t("home.titleA")} {t("home.titleB")} <em className="text-flare">{t("home.titleBug")}</em>
        </div>
        <p className="max-w-[26rem] text-[14px] leading-relaxed text-chalk-faint">{t("home.footer")}</p>
      </div>
    </footer>
  );
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
