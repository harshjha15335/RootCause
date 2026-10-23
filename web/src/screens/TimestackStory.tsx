import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Evidence } from "../api/types";
import { clock, pct, playerInfo, surname } from "../lib/format";
import { chronological, rootLink } from "../lib/geometry";
import { loadGsap } from "../lib/motion";
import { go } from "../lib/nav";
import { useMatch } from "../store/matchStore";
import { useUi } from "../store/uiStore";
import { LAYER, Timestack, stackPoint, type StackData, type StackLabel, type StackState } from "../three/timestack";

const WINDOW = 20; // seconds of build-up stacked under the goal

/** The goal as layers of seconds, read from the match track and the recorded counterfactual. */
function useStackData(ev: Evidence | null): StackData | null {
  const track = useMatch((s) => s.track);
  const version = useMatch((s) => s.trackVersion);
  const replays = useMatch((s) => s.replays);
  const meta = useMatch((s) => s.meta);
  return useMemo(() => {
    if (!ev) return null;
    const root = rootLink(ev);
    if (!root) return null;
    const end = ev.goal.second;
    const seconds: number[] = [];
    for (let s = end - WINDOW; s <= end; s++) if (track.frame(s)) seconds.push(s);
    if (seconds.length < 6 || seconds[seconds.length - 1] - seconds[0] !== seconds.length - 1) return null;
    const ids = track.order;
    const pos = seconds.map((s) => {
      const f = track.frame(s)!;
      return ids.map((_, i) => [f.pos[i * 2], f.pos[i * 2 + 1]] as [number, number]);
    });
    const ball = seconds.map((s) => track.frame(s)!.ball);
    const rep = replays[ev.goal_id]?.[root.evidence_id];
    const fix = (rep?.frames ?? [])
      .filter((f) => f.clock_s >= seconds[0] && f.clock_s <= end)
      .map((f) => {
        const p = f.players.find((x) => x.id === root.player_id);
        return { second: f.clock_s, culprit: (p ? [p.x, p.y] : [0, 0]) as [number, number], ball: f.ball };
      });
    const side = playerInfo(meta, root.player_id).side;
    // back line from the squad sheet: full-backs and centre-backs (positions ending in B)
    const lineIds = (meta?.[side].players ?? []).filter((p) => /B$/.test(p.position) && p.id !== root.player_id).map((p) => p.id);
    return {
      seconds,
      ids,
      pos,
      ball,
      culprit: root.player_id,
      faultSecond: Math.max(seconds[0], Math.min(end, root.second)),
      fix,
      lineIds,
      scorer: ev.goal.player_id,
      defendsLeft: ball[ball.length - 1][0] < 52.5,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev, version, replays, meta]);
}

export function TimestackStory({ ev }: { ev: Evidence | null }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const reduced = useUi((s) => s.reducedMotion);
  const data = useStackData(ev);
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [second, setSecond] = useState<number | null>(null);
  const [chapter, setChapter] = useState(0);
  const root = ev ? rootLink(ev) : null;
  const links = ev ? chronological(ev) : [];
  const culprit = root ? playerInfo(meta, root.player_id) : null;
  const scorer = ev ? playerInfo(meta, ev.goal.player_id) : null;
  const other = links.filter((l) => l.evidence_id !== root?.evidence_id).sort((a, b) => b.blame_percent - a.blame_percent)[0];
  const fixEnd = data?.fix.length ? data.fix[data.fix.length - 1].second : null;

  // The touches in the window, newest first: the goal read back like a stack trace.
  const trace = useMemo(() => {
    if (!data || !ev) return [];
    const track = useMatch.getState().track;
    const rows: { text: string; second: number; bug?: boolean }[] = [];
    const name = (id: string | null) => (id ? surname(playerInfo(meta, id).name) : "");
    for (let i = data.seconds.length - 2; i >= 0; i--) {
      const f = track.frame(data.seconds[i]);
      if (f?.kind !== "pass") continue;
      const to = data.seconds.slice(i + 1).map((s) => track.frame(s)?.carrier).find((c) => c && c !== f.carrier) ?? null;
      rows.push({ text: t("stack.tracePass", { from: name(f.carrier), to: name(to) }), second: f.second });
    }
    for (const l of links) rows.push({ text: t("stack.traceBug", { bug: t(`bug.${l.bug_type}`).toLowerCase(), name: name(l.player_id) }), second: l.second, bug: l.evidence_id === root?.evidence_id });
    rows.sort((a, b) => b.second - a.second);
    return [{ text: t("stack.traceGoal", { name: name(ev.goal.player_id) }), second: ev.goal.second }, ...rows].slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ev, meta, t]);

  useEffect(() => {
    if (!data || !canvas.current || !labels.current || !section.current || !culprit || !root || !ev) return;
    const N = data.seconds.length;
    const iFault = data.seconds.indexOf(data.faultSecond);
    const cj = data.ids.indexOf(data.culprit);
    const K = [
      { cx: -6, cy: 165, cz: 0.1, tx: -6, ty: 0, tz: 0 },
      { cx: 92, cy: 92, cz: 112, tx: -8, ty: 30, tz: 0 },
      { cx: 56, cy: 70, cz: 96, tx: -22, ty: 26, tz: 2 },
      { cx: 22, cy: 30, cz: 52, tx: -40, ty: iFault * LAYER, tz: 2 },
      { cx: 58, cy: 52, cz: 84, tx: -26, ty: 18, tz: 0 },
      { cx: 96, cy: 96, cz: 116, tx: -10, ty: 28, tz: 0 },
    ];
    const state: StackState = reduced
      ? { ...K[1], height: 1, draw: 1, scan: iFault, focus: 0.3, fault: 1, patch: 1, line: 1 }
      : { ...K[0], height: 0, draw: 0, scan: N - 1, focus: 0, fault: 0, patch: 0, line: 0 };
    const last = data.fix[data.fix.length - 1];
    const defs: StackLabel[] = [
      { text: t("stack.tagGoal", { time: clock(ev.goal.second), name: surname(scorer!.name) }), at: (s) => stackPoint(data.ball[N - 1][0], data.ball[N - 1][1], N - 1, s.height), show: (s) => s.height > 0.6 && s.patch < 0.5 },
      { text: t("stack.tagFault", { time: clock(data.faultSecond), name: surname(culprit.name), bug: t(`bug.${root.bug_type}`) }), bug: true, at: (s) => stackPoint(data.pos[iFault][cj][0], data.pos[iFault][cj][1], iFault, s.height), show: (s) => s.fault > 0.4 },
      ...(last ? [{ text: t("stack.tagFix", { time: clock(last.second) }), bug: true, at: (s: StackState) => stackPoint(last.ball[0], last.ball[1], last.second - data.seconds[0], s.height), show: (s: StackState) => s.patch > 0.7 }] : []),
      { text: clock(data.seconds[0]), at: () => [52.5, 0, -34], show: (s) => s.height > 0.6 && s.focus < 0.5 },
    ];
    const engine = new Timestack(canvas.current, labels.current, data, state, defs);
    let lastSecond = -1;
    engine.onSecond = (s) => {
      if (s !== lastSecond) setSecond((lastSecond = s));
    };

    const onResize = () => engine.resize();
    addEventListener("resize", onResize);
    let dragging = false;
    let lastX = 0;
    const el = section.current;
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("a,button")) return;
      dragging = true;
      lastX = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      engine.yawTarget += (e.clientX - lastX) * 0.006;
      lastX = e.clientX;
    };
    const up = () => (dragging = false);
    el.addEventListener("pointerdown", down);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);

    let ctx: { revert(): void } | null = null;
    let off = false;
    if (!reduced) {
      loadGsap().then(({ gsap }) => {
        if (off) return;
        ctx = gsap.context(() => {
          gsap
            .timeline({ defaults: { ease: "power2.inOut" }, scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: 1 } })
            .to(state, { ...K[1], height: 1, duration: 1 })
            .to(state, { draw: 1, duration: 0.8, ease: "none" }, 0.25)
            .to(state, { ...K[2], duration: 1 })
            .to(state, { scan: iFault, duration: 1, ease: "none" }, "<")
            .to(state, { ...K[3], focus: 1, fault: 1, line: 1, duration: 1 })
            .to(state, { ...K[4], patch: 1, focus: 0.55, line: 0.35, duration: 1 })
            .to(state, { ...K[5], focus: 0, scan: N - 1, duration: 1 });
          gsap.to("[data-squeeze]", { fontVariationSettings: '"wdth" 62', ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "15% top", scrub: 0.6 } });
        }, el);
      });
    }

    const obs = [...el.querySelectorAll("[data-ch]")].map((c, i) => {
      const o = new IntersectionObserver(([e]) => e.isIntersecting && setChapter(i), { threshold: 0.5 });
      o.observe(c);
      return o;
    });

    return () => {
      off = true;
      ctx?.revert();
      obs.forEach((o) => o.disconnect());
      removeEventListener("resize", onResize);
      el.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, reduced]);

  if (!ev || !root || !culprit || !scorer) return <Hero second={null} />;
  const trials = root.trials;

  return (
    <section ref={section} aria-label={t("stack.aria")} className="relative">
      <div className="sticky top-[var(--header-h)] h-[calc(100svh-var(--header-h))] overflow-hidden">
        <canvas ref={canvas} className="block h-full w-full cursor-grab touch-pan-y active:cursor-grabbing" role="img" aria-label={t("stack.canvas", { from: data ? clock(data.seconds[0]) : "", to: clock(ev.goal.second) })} />
        <div ref={labels} className="pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_70%_45%,transparent_40%,rgb(var(--turf-deep)/0.7)_100%)]" />
        <div className="absolute right-5 top-5 rounded-full border border-turf-edge bg-turf/70 px-3 py-1.5 font-trace text-[12px] tabular-nums text-chalk sm:right-8">
          <span className="text-flare">{clock(second ?? ev.goal.second)}</span>
        </div>
        <nav className="absolute right-6 top-1/2 hidden -translate-y-1/2 gap-2.5 md:grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`block h-[2px] transition-all duration-300 ${chapter === i ? "w-8 bg-flare" : "w-[18px] bg-turf-edge"}`} />
          ))}
        </nav>
        <div className="absolute bottom-5 right-6 hidden font-trace text-[11px] uppercase tracking-[0.12em] text-chalk-faint md:block">{t("stack.drag")}</div>
      </div>

      <div className="relative -mt-[calc(100svh-var(--header-h))]">
        <Chapter i={0}>
          <Hero second={second} />
        </Chapter>
        <Chapter i={1}>
          <Eyebrow>{t("stack.ch1Eyebrow")}</Eyebrow>
          <H2>
            {t("stack.ch1Title", { seconds: data ? data.seconds.length : WINDOW + 1 })} <span className="text-flare">{t("stack.ch1TitleY")}</span>
          </H2>
          <P>{t("stack.ch1Body", { from: data ? clock(data.seconds[0]) : "", to: clock(ev.goal.second), home: meta?.home.name ?? "", away: meta?.away.name ?? "" })}</P>
        </Chapter>
        <Chapter i={2}>
          <Eyebrow>{t("stack.ch2Eyebrow")}</Eyebrow>
          <H2>{t("stack.ch2Title")}</H2>
          <P>{t("stack.ch2Body")}</P>
          <ol className="mt-6 space-y-1 border-l border-turf-edge pl-4 font-trace text-[13px] leading-[1.8] text-chalk-dim" aria-label={t("stack.traceLabel")}>
            {trace.map((r, i) => (
              <li key={i} className={r.bug ? "font-semibold text-flare" : ""}>
                {r.text} <span className={r.bug ? "" : "text-chalk-faint"}>{clock(r.second)}</span>
              </li>
            ))}
          </ol>
        </Chapter>
        <Chapter i={3}>
          <Eyebrow>{t("stack.ch3Eyebrow")}</Eyebrow>
          <H2>
            {surname(culprit.name)} <span className="text-flare">{t(`bug.${root.bug_type}`).toLowerCase()}.</span>
          </H2>
          <P>{t("stack.ch3Body", { time: clock(root.second), name: culprit.name, club: culprit.club?.name ?? "" })}</P>
          <div className="mt-5 font-display text-[clamp(84px,11vw,168px)] leading-[0.8] text-flare tabular-nums [font-variation-settings:'wdth'_62]">{pct(root.blame_percent)}</div>
          <P>
            {t("stack.ch3Rest")} {other && t("stack.ch3Other", { name: playerInfo(meta, other.player_id).name, time: clock(other.second), blame: pct(other.blame_percent) })}
          </P>
          <P>{t("stack.ch3Space", { scorer: surname(scorer.name) })}</P>
        </Chapter>
        <Chapter i={4}>
          <Eyebrow>{t("stack.ch4Eyebrow")}</Eyebrow>
          <H2>
            {t("stack.ch4Title")} <span className="text-flare">{t("stack.ch4TitleY")}</span>
          </H2>
          <P>{t("stack.ch4Body", { name: culprit.name, trials, before: root.baseline_goals, after: root.fixed_goals, time: fixEnd ? clock(fixEnd) : "" })}</P>
          <div className="mt-6 grid grid-cols-2 gap-px border border-turf-edge bg-turf-edge">
            <div className="bg-turf-deep px-4 py-3.5">
              <div className="font-trace text-[11px] uppercase tracking-[0.1em] text-chalk-faint">{t("home.asPlayed")}</div>
              <div className="mt-2 font-display text-[40px] leading-none tabular-nums [font-variation-settings:'wdth'_80]">
                {root.baseline_goals}/{trials}
              </div>
            </div>
            <div className="bg-turf-deep px-4 py-3.5">
              <div className="font-trace text-[11px] uppercase tracking-[0.1em] text-chalk-faint">{t("home.withFix", { name: surname(culprit.name) })}</div>
              <div className="mt-2 font-display text-[40px] leading-none text-flare tabular-nums [font-variation-settings:'wdth'_80]">
                {root.fixed_goals}/{trials}
              </div>
            </div>
          </div>
        </Chapter>
        <Chapter i={5}>
          <Eyebrow>{t("stack.ch5Eyebrow")}</Eyebrow>
          <H2>{t("stack.ch5Title")}</H2>
          <P>{t("stack.ch5Body")}</P>
          <Ctas />
        </Chapter>
      </div>
    </section>
  );
}

function Hero({ second }: { second: number | null }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const goals = useMatch((s) => s.goals);
  void second;
  return (
    <>
      {meta && (
        <Eyebrow>
          {t("home.eyebrow", { home: meta.home.name, away: meta.away.name, h: goals.filter((g) => g.team === "home").length, a: goals.filter((g) => g.team === "away").length })}
        </Eyebrow>
      )}
      <h1 id="hero-h" data-squeeze className="rc-fade-in mt-6 max-w-[9ch] font-display text-[clamp(46px,6.2vw,104px)] leading-[0.86] text-chalk [font-variation-settings:'wdth'_150]">
        {t("home.titleA")} {t("home.titleB")} <span className="text-flare">{t("home.titleBug")}</span>
      </h1>
      <p className="rc-fade-in mt-7 max-w-[40ch] text-[clamp(17px,1.5vw,20px)] leading-[1.55] text-chalk" style={{ animationDelay: "0.3s" }}>
        {t("home.lede")}
      </p>
      <Ctas />
      <div className="mt-8 flex items-center gap-3 font-trace text-[12px] uppercase tracking-[0.12em] text-chalk-faint">
        <i className="rc-drip block h-8 w-px bg-chalk-faint" aria-hidden="true" />
        {t("stack.scroll")}
      </div>
    </>
  );
}

function Ctas() {
  const { t } = useTranslation();
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <button type="button" onClick={() => go("story")} className="rc-press inline-flex h-[52px] items-center gap-2.5 rounded-[4px] bg-flare px-6 font-display text-[14px] tracking-[0.04em] text-flare-ink [font-variation-settings:'wdth'_120] hover:brightness-105">
        <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M4 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5z" fill="currentColor" />
        </svg>
        {t("home.watch")}
      </button>
      <button type="button" onClick={() => go("explore")} className="rc-press inline-flex h-[52px] items-center rounded-[4px] px-6 font-display text-[14px] tracking-[0.04em] text-chalk ring-1 ring-inset ring-chalk [font-variation-settings:'wdth'_120] hover:bg-chalk/10">
        {t("home.explore")}
      </button>
    </div>
  );
}

function Chapter({ i, children }: { i: number; children: ReactNode }) {
  // on phones the copy sits under the stack; the opening chapter fits the first screen
  const size = i === 0 ? "min-h-[calc(100svh-var(--header-h))] pb-8" : "min-h-[150svh] pb-[14svh]";
  return (
    <div data-ch={i} className={`pointer-events-none flex items-end px-5 sm:px-10 md:min-h-[115svh] md:items-center md:pb-0 ${size}`}>
      <div className="pointer-events-auto max-w-[480px] bg-gradient-to-b from-turf-deep/0 via-turf-deep/90 to-turf-deep/90 pt-10 md:bg-none md:pt-0">{children}</div>
    </div>
  );
}

const Eyebrow = ({ children }: { children: ReactNode }) => <div className="rc-eyebrow font-trace text-[12px] uppercase tracking-[0.14em]">{children}</div>;
const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-5 font-display text-[clamp(36px,5.6vw,84px)] leading-[0.88] text-chalk">{children}</h2>;
const P = ({ children }: { children: ReactNode }) => <p className="mt-5 max-w-[42ch] text-[16px] leading-[1.6] text-chalk-dim md:text-[17px]">{children}</p>;
