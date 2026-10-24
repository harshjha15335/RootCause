import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Evidence, MatchMeta, RecordedReplay } from "../api/types";
import type { Track } from "../lib/frames";
import { playerInfo } from "../lib/format";
import { rootLink } from "../lib/geometry";
import { loadGsap } from "../lib/motion";
import { go } from "../lib/nav";
import { useMatch } from "../store/matchStore";
import { useUi } from "../store/uiStore";
import type { FreeArea, Shot, StackData, StackLabel, StackState } from "../three/timestack";
import "./landingCopy";

const WINDOW = 20; // seconds of build-up stacked under the goal

/** The goal as layers of seconds, read from a match track and its recorded counterfactual. */
export function buildStack(track: Track, ev: Evidence, replays: Record<string, Record<string, RecordedReplay>>, meta: MatchMeta | null, window = WINDOW): StackData | null {
  const root = rootLink(ev);
  if (!root) return null;
  const end = ev.goal.second;
  const seconds: number[] = [];
  for (let s = end - window; s <= end; s++) if (track.frame(s)) seconds.push(s);
  if (seconds.length < 6 || seconds[seconds.length - 1] - seconds[0] !== seconds.length - 1) return null;
  const ids = track.order;
  // Every stack is drawn toward the x=0 goal, so goals at the far end are turned 180° on the pitch.
  // Read the ball a second before the goal: at the goal second it is already back on the centre spot.
  const flip = track.frame(seconds[seconds.length - 2])!.ball[0] > 52.5;
  const P = (x: number, y: number): [number, number] => (flip ? [105 - x, 68 - y] : [x, y]);
  const pos = seconds.map((s) => {
    const f = track.frame(s)!;
    return ids.map((_, i) => P(f.pos[i * 2], f.pos[i * 2 + 1]));
  });
  const ball = seconds.map((s) => P(...track.frame(s)!.ball));
  const rep = replays[ev.goal_id]?.[root.evidence_id];
  const fix = (rep?.frames ?? [])
    .filter((f) => f.clock_s >= seconds[0] && f.clock_s <= end)
    .map((f) => {
      const p = f.players.find((x) => x.id === root.player_id);
      return { second: f.clock_s, culprit: p ? P(p.x, p.y) : P(0, 0), ball: P(...f.ball) };
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
    defendsLeft: true,
  };
}

export function useStackData(ev: Evidence | null): StackData | null {
  const track = useMatch((s) => s.track);
  const version = useMatch((s) => s.trackVersion);
  const replays = useMatch((s) => s.replays);
  const meta = useMatch((s) => s.meta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (ev ? buildStack(track, ev, replays, meta) : null), [ev, version, replays, meta]);
}

/** On wide screens the copy holds the left column; on phones it rides over the bottom of the frame. */
const heroFree: FreeArea = (w) =>
  w >= 720 ? { x0: (Math.min(600, w * 0.46) / w) * 2 - 1, x1: 0.95, y0: -0.86, y1: 0.84 } : { x0: -0.94, x1: 0.94, y0: -0.12, y1: 0.86 };

// One shot per chapter. Angles only: distance and aim are solved from each match's own positions.
const SHOTS: Shot[] = [
  // on phones the opening copy fills the lower screen, so the flat pitch takes the band above it
  { frame: "flat", az: Math.PI / 2, el: 1.5, height: 0, margin: 1.04, free: (w, h) => (w >= 720 ? heroFree(w, h) : { x0: -0.94, x1: 0.94, y0: 1 - 480 / h, y1: 1 - 24 / h }) },
  { frame: "all", az: 0.84, el: 0.4, height: 1 },
  { frame: "all", az: 0.7, el: 0.3, height: 1 },
  { frame: "fault", az: 0.62, el: 0.36, height: 1, margin: 1.1 },
  { frame: "fix", az: 0.8, el: 0.3, height: 1, margin: 1.1 },
  { frame: "all", az: 0.92, el: 0.42, height: 1 },
];

/**
 * The home hero: a goal from the open demo match as a Timestack, told in product terms only.
 * Scroll tilts the flat pitch up into layers, scans down, lights the mistake and plays the fix.
 */
export function TimestackStory({ ev }: { ev: Evidence | null }) {
  const { t } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion);
  const data = useStackData(ev);
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const [chapter, setChapter] = useState(0);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    if (!data || !canvas.current || !labels.current || !section.current) return;
    const N = data.seconds.length;
    const iFault = data.seconds.indexOf(data.faultSecond);
    const cj = data.ids.indexOf(data.culprit);
    const state: StackState = reduced
      ? { shot: 1, height: 1, draw: 1, scan: iFault, focus: 0.3, fault: 1, patch: 1, gone: 1, line: 1 }
      : { shot: 0, height: 0, draw: 0, scan: N - 1, focus: 0, fault: 0, patch: 0, gone: 0, line: 0 };
    const el = section.current;
    let off = false;
    let cleanup = () => {};
    // three.js arrives after the copy has painted; the poster holds the frame until then
    import("../three/timestack").then(({ Timestack, stackPoint }) => {
      if (off || !canvas.current || !labels.current) return;
      const last = data.fix[data.fix.length - 1];
      const defs: StackLabel[] = [
        { text: t("landing.tagGoal"), at: (s) => stackPoint(data.ball[N - 1][0], data.ball[N - 1][1], N - 1, s.height), show: (s) => s.height > 0.6 && s.gone < 0.5 },
        { text: t("landing.tagFault"), bug: true, at: (s) => stackPoint(data.pos[iFault][cj][0], data.pos[iFault][cj][1], iFault, s.height), show: (s) => s.fault > 0.4 },
        ...(last ? [{ text: t("landing.tagFix"), bug: true, at: (s: StackState) => stackPoint(last.culprit[0], last.culprit[1], last.second - data.seconds[0], s.height), show: (s: StackState) => s.patch > 0.7 }] : []),
      ];
      const engine = new Timestack(canvas.current, labels.current, data, state, defs, SHOTS, heroFree);
      requestAnimationFrame(() => !off && setPainted(true));

      const onResize = () => engine.resize();
      addEventListener("resize", onResize);
      let dragging = false;
      let lastX = 0;
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
      if (!reduced) {
        loadGsap().then(({ gsap }) => {
          if (off) return;
          ctx = gsap.context(() => {
            gsap
              .timeline({ defaults: { ease: "power2.inOut" }, scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: 1 } })
              .to(state, { shot: 1, height: 1, duration: 1 })
              .to(state, { draw: 1, duration: 0.8, ease: "none" }, 0.25)
              .to(state, { shot: 2, duration: 1 })
              .to(state, { scan: iFault, duration: 1, ease: "none" }, "<")
              .to(state, { shot: 3, focus: 1, fault: 1, line: 1, duration: 1 })
              .to(state, { shot: 4, patch: 1, gone: 1, focus: 0.55, line: 0.35, duration: 1 })
              .to(state, { shot: 5, focus: 0, scan: N - 1, duration: 1 });
            gsap.to("[data-squeeze]", { fontVariationSettings: '"wdth" 62', ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "15% top", scrub: 0.6 } });
          }, el);
        });
      }
      cleanup = () => {
        ctx?.revert();
        removeEventListener("resize", onResize);
        el.removeEventListener("pointerdown", down);
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        engine.dispose();
      };
    });

    const obs = [...el.querySelectorAll("[data-ch]")].map((c, i) => {
      const o = new IntersectionObserver(([e]) => e.isIntersecting && setChapter(i), { threshold: 0.5 });
      o.observe(c);
      return o;
    });

    return () => {
      off = true;
      obs.forEach((o) => o.disconnect());
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, reduced]);

  const chapters: ReactNode[] = [1, 2, 3, 4].map((i) => (
    <>
      <Eyebrow n={i}>{t(`landing.ch${i}Eyebrow`)}</Eyebrow>
      <H2>{t(`landing.ch${i}Title`)}</H2>
      <P>{t(`landing.ch${i}Body`)}</P>
      {i === 2 && chapter === 2 && (
        <ol className="mt-5 space-y-0.5 border-l border-turf-edge pl-4 font-trace text-[13px] leading-[1.8] text-chalk-dim" aria-label={t("landing.trace.label")}>
          {(["goal", "shot", "pass", "run", "bug", "pass2"] as const).map((k, n) => (
            <li key={k} className={`rc-fade-in ${k === "bug" ? "font-semibold text-flare" : ""}`} style={{ animationDelay: `${0.15 + n * 0.18}s` }}>
              {t(`landing.trace.${k}`)}
            </li>
          ))}
        </ol>
      )}
    </>
  ));
  const copy: ReactNode[] = [
    <Hero key="hero" />,
    ...chapters,
    <>
      <Eyebrow n={5}>{t("landing.ch5Eyebrow")}</Eyebrow>
      <H2>{t("landing.ch5Title")}</H2>
      <P>{t("landing.ch5Body")}</P>
      <Ctas />
    </>,
  ];

  return (
    <section ref={section} aria-labelledby="hero-h" className="relative">
      <div className="sticky top-[var(--header-h)] h-[calc(100svh-var(--header-h))] overflow-hidden">
        <Poster hidden={painted} />
        <canvas ref={canvas} className={`block h-full w-full cursor-grab touch-pan-y transition-opacity duration-700 active:cursor-grabbing ${painted ? "opacity-100" : "opacity-0"}`} role="img" aria-label={t("landing.canvas")} />
        <div ref={labels} className="pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_70%_45%,transparent_45%,rgb(var(--turf-deep)/0.6)_100%)]" />
        <nav className="absolute right-6 top-1/2 hidden -translate-y-1/2 gap-2.5 md:grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={`block h-[2px] transition-all duration-300 ${chapter === i ? "w-8 bg-flare" : "w-[18px] bg-turf-edge"}`} />
          ))}
        </nav>
        <div className="absolute bottom-5 right-6 hidden font-trace text-[11px] uppercase tracking-[0.12em] text-chalk-faint md:block">{t("landing.drag")}</div>
        {/* the copy stays in frame beside the stack: one chapter at a time, crossfading as you scroll */}
        <div className="pointer-events-none absolute inset-0 grid items-end px-5 pb-6 sm:px-10 md:items-center md:pb-0">
          {copy.map((c, i) => (
            <div
              key={i}
              aria-hidden={i !== chapter}
              {...{ inert: i !== chapter ? "" : undefined }}
              className={`[grid-area:1/1] max-w-[480px] self-end bg-gradient-to-b from-turf-deep/0 via-turf-deep/85 to-turf-deep/85 pt-10 transition-[opacity,transform] duration-500 md:self-center md:bg-none md:pt-0 ${
                i === chapter ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-4 opacity-0"
              }`}
            >
              {c}
            </div>
          ))}
        </div>
      </div>

      {/* scroll room: one spacer per chapter drives the camera and picks the copy */}
      <div className="relative -mt-[calc(100svh-var(--header-h))]" aria-hidden="true">
        {copy.map((_, i) => (
          <div key={i} data-ch={i} className={i === 0 ? "h-[calc(100svh-var(--header-h))]" : "h-[120svh] md:h-[105svh]"} />
        ))}
      </div>
    </section>
  );
}

/** The first frame, drawn flat before three.js loads: the same top-down pitch the scroll starts from. */
function Poster({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="-8 -8 121 84" preserveAspectRatio="xMidYMid meet" aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-[30%] w-full px-4 pt-3 transition-opacity duration-700 md:inset-0 md:m-auto md:h-full md:p-[6%] md:pl-[46%] ${hidden ? "opacity-0" : "opacity-60"}`}>
      <g fill="none" stroke="rgb(var(--chalk))" strokeWidth="0.25">
        <rect width="105" height="68" />
        <line x1="52.5" x2="52.5" y2="68" />
        <circle cx="52.5" cy="34" r="9.15" />
        <rect y="13.84" width="16.5" height="40.32" />
        <rect x="88.5" y="13.84" width="16.5" height="40.32" />
        <rect y="24.84" width="5.5" height="18.32" />
        <rect x="99.5" y="24.84" width="5.5" height="18.32" />
      </g>
    </svg>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <>
      <div className="rc-eyebrow font-trace text-[12px] uppercase tracking-[0.14em]">{t("landing.eyebrow")}</div>
      <h1 id="hero-h" data-squeeze className="rc-fade-in mt-6 max-w-[9ch] font-display text-[clamp(46px,6.2vw,104px)] leading-[0.86] text-chalk [font-variation-settings:'wdth'_150]">
        {t("landing.titleA")} {t("landing.titleB")} <span className="text-flare">{t("landing.titleBug")}</span>
      </h1>
      <p className="rc-fade-in mt-7 max-w-[40ch] text-[clamp(17px,1.5vw,20px)] leading-[1.55] text-chalk" style={{ animationDelay: "0.3s" }}>
        {t("landing.lede")}
      </p>
      <Ctas />
      <div className="mt-8 flex items-center gap-3 font-trace text-[12px] uppercase tracking-[0.12em] text-chalk-faint">
        <i className="rc-drip block h-8 w-px bg-chalk-faint" aria-hidden="true" />
        {t("landing.scroll")}
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
        {t("landing.ctaStory")}
      </button>
      <a href="#library" onClick={(e) => (e.preventDefault(), document.getElementById("library")?.scrollIntoView({ behavior: "smooth" }))} className="rc-press inline-flex h-[52px] items-center rounded-[4px] px-6 font-display text-[14px] tracking-[0.04em] text-chalk ring-1 ring-inset ring-chalk [font-variation-settings:'wdth'_120] hover:bg-chalk/10">
        {t("landing.ctaLibrary")}
      </a>
    </div>
  );
}

const Eyebrow = ({ n, children }: { n: number; children: ReactNode }) => (
  <div className="rc-eyebrow font-trace text-[12px] uppercase tracking-[0.14em]">
    {String(n).padStart(2, "0")} · {children}
  </div>
);
const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-5 font-display text-[clamp(36px,5.2vw,80px)] leading-[0.9] text-chalk [text-wrap:balance]">{children}</h2>;
const P = ({ children }: { children: ReactNode }) => <p className="mt-5 max-w-[38ch] text-[16px] leading-[1.6] text-chalk-dim md:text-[17px]">{children}</p>;
