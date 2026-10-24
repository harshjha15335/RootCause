import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MatchLibrary } from "../components/MatchLibrary";
import i18n from "../i18n";
import { Reveal, useSmoothScroll } from "../lib/motion";
import { go } from "../lib/nav";
import { useSelectedEvidence } from "../store/selectors";
import { useUi } from "../store/uiStore";
import "./landingCopy";
import "./heroCopy";
import { TimestackStory } from "./HeroTimestack";

/** Home sells the product: the Timestack hero, three beats, then the match library. No match data in the copy. */
export function Home() {
  useSmoothScroll();
  const ev = useSelectedEvidence();
  return (
    <>
      <TimestackStory ev={ev} />
      <Beats />
      <Library />
      <Footer />
    </>
  );
}

function Beats() {
  const { t } = useTranslation();
  const beats = [
    { k: "trace", art: <TraceArt /> },
    { k: "prove", art: <ProveArt /> },
    { k: "explain", art: <ExplainArt /> },
  ];
  return (
    <section aria-labelledby="how-h" className="bg-turf-deep">
      <div className="mx-auto max-w-[1440px] px-5 pb-28 pt-24 sm:px-10">
        <Reveal>
          <h2 id="how-h" className="font-display text-[clamp(40px,5.4vw,88px)] leading-[0.95] text-chalk [text-wrap:balance]">
            {t("landing.howTitle")}
          </h2>
        </Reveal>
        <ol className="mt-14 grid gap-5 lg:grid-cols-3">
          {beats.map(({ k, art }, i) => (
            <Reveal as="li" key={k} delay={i * 3} className="flex flex-col rounded-[24px] bg-turf p-5 ring-1 ring-inset ring-turf-edge sm:p-6">
              <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-[radial-gradient(120%_90%_at_50%_0%,#2242ea_0%,#0f22a8_60%,#0a1880_100%)]">{art}</div>
              <div className="mt-6 flex items-baseline gap-3">
                <span className="font-trace text-[12px] text-chalk-faint">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="font-display text-[28px] leading-none text-chalk [font-variation-settings:'wdth'_120]">{t(`landing.${k}Title`)}</h3>
              </div>
              <p className="mt-3 text-[16px] leading-relaxed text-chalk-dim">{t(`landing.${k}Body`)}</p>
            </Reveal>
          ))}
        </ol>
        <a
          href="#/story"
          onClick={(e) => (e.preventDefault(), go("story"))}
          className="rc-press mt-10 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-chalk px-6 text-[15px] font-bold text-turf hover:opacity-90"
        >
          {t("landing.storyCta")}
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h9m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </section>
  );
}

const CHALK = "rgb(var(--chalk))";
const FAINT = "rgb(var(--chalk) / 0.3)";
const VAR = "#ffd60a";

/** Trace: a small Timestack; a scan sheet walks down from the goal and stops on the mistake layer. */
function TraceArt() {
  const { t } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion);
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { amount: 0.5 });
  const layers = 6;
  const hit = 2; // counted from the bottom
  const gap = 24;
  const layer = (i: number) => `M60 ${190 - i * gap} L160 ${215 - i * gap} L260 ${190 - i * gap} L160 ${165 - i * gap}Z`;
  const run = seen || reduced;
  return (
    <svg ref={ref} viewBox="0 0 320 240" className="block h-full w-full" role="img" aria-label={t("landing.traceTitle")}>
      {Array.from({ length: layers }, (_, i) => (
        <motion.path
          key={i}
          d={layer(i)}
          fill={i === hit ? "rgb(255 214 10 / 0.14)" : "rgb(243 245 255 / 0.03)"}
          stroke={i === hit ? VAR : FAINT}
          strokeWidth={i === hit ? 1.6 : 1}
          initial={false}
          animate={{ opacity: i === hit ? (run ? 1 : 0.3) : 1 }}
          transition={{ delay: reduced ? 0 : 1.9, duration: 0.6 }}
        />
      ))}
      {/* two ribbons: an attacker reaching the goal, the defender who fell behind */}
      <path d="M120 200 C126 168 112 140 132 114 S158 76 150 60" fill="none" stroke={CHALK} strokeWidth="3" strokeLinecap="round" />
      <path d="M196 196 C192 172 202 150 190 128 S176 96 186 74" fill="none" stroke="#8fa6ff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="150" cy="60" r="5" fill={CHALK} />
      <text x="150" y="44" textAnchor="middle" fontSize="12" fontWeight="600" fill={CHALK}>
        {t("landing.traceGoal")}
      </text>
      <motion.path
        d={layer(layers - 1)}
        fill="rgb(243 245 255 / 0.12)"
        stroke={CHALK}
        strokeWidth="1.4"
        initial={false}
        animate={{ y: run ? (layers - 1 - hit) * gap : 0 }}
        transition={{ duration: reduced ? 0 : 1.8, ease: [0.45, 0, 0.2, 1] }}
      />
      <motion.g initial={false} animate={{ opacity: run ? 1 : 0 }} transition={{ delay: reduced ? 0 : 1.9, duration: 0.5 }}>
        <rect x="214" y={176 - hit * gap - 9} width="62" height="18" rx="4" fill={VAR} />
        <text x="245" y={176 - hit * gap + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#06104f">
          {t("landing.traceMistake")}
        </text>
      </motion.g>
    </svg>
  );
}

/** Prove: 200 replays as it happened, then 200 with the mistake fixed. A pattern, not one match's tally. */
function ProveArt() {
  const { t } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion);
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { amount: 0.5 });
  const fixed = seen || reduced;
  // a fixed scatter: most replays score as it happened; with the fix they don't
  const scored = (i: number) => ((i * 37) % 100) < 72;
  const Grid = ({ fix }: { fix: boolean }) => (
    <div className="grid grid-cols-[repeat(40,minmax(0,1fr))] gap-[2px]">
      {Array.from({ length: 200 }, (_, i) => {
        const goal = scored(i) && !(fix && fixed);
        return (
          <i
            key={i}
            className="block aspect-square rounded-full transition-colors"
            style={{
              background: goal ? CHALK : "transparent",
              boxShadow: goal ? "none" : `inset 0 0 0 1px ${fix && scored(i) ? VAR : "rgb(243 245 255 / 0.22)"}`,
              transitionDuration: "400ms",
              transitionDelay: fix && !reduced ? `${600 + (i % 40) * 22 + Math.floor(i / 40) * 40}ms` : "0ms",
            }}
          />
        );
      })}
    </div>
  );
  return (
    <div ref={ref} className="flex h-full flex-col justify-center gap-4 px-6 py-5 text-[12px] font-semibold text-chalk-dim">
      <div>
        <div className="mb-2">{t("landing.proveReal")}</div>
        <Grid fix={false} />
      </div>
      <div>
        <div className="mb-2 text-flare">{t("landing.proveFixed")}</div>
        <Grid fix />
      </div>
      <div className="flex gap-4 text-[11px]" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <i className="block h-2 w-2 rounded-full bg-chalk" />
          {t("landing.proveGoal")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="block h-2 w-2 rounded-full ring-1 ring-inset ring-chalk-faint" />
          {t("landing.proveNoGoal")}
        </span>
      </div>
    </div>
  );
}

/** Explain: the same verdict line, turning through the three languages. */
function ExplainArt() {
  const reduced = useUi((s) => s.reducedMotion);
  const langs = ["en", "hi", "es"] as const;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setI((x) => (x + 1) % langs.length), 3200);
    return () => clearInterval(id);
  }, [reduced, langs.length]);
  const lng = langs[i];
  return (
    <div className="flex h-full flex-col justify-center gap-5 px-6 py-6">
      <div className="flex gap-1.5" aria-hidden="true">
        {langs.map((l, j) => (
          <span key={l} className={`rounded-full px-2.5 py-1 font-trace text-[11px] uppercase ${j === i ? "bg-chalk text-turf" : "text-chalk-faint ring-1 ring-inset ring-turf-edge"}`}>
            {l}
          </span>
        ))}
      </div>
      <motion.p
        key={lng}
        lang={lng}
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="font-display text-[clamp(20px,2vw,26px)] leading-[1.2] text-chalk [font-variation-settings:'wdth'_100]"
      >
        <span className="mr-2 inline-block h-3 w-3 rounded-full bg-flare align-middle" aria-hidden="true" />
        {i18n.getFixedT(lng)("landing.verdict")}
      </motion.p>
    </div>
  );
}

/** The match library, the shell's cards under this page's own heading. */
function Library() {
  const { t } = useTranslation();
  return (
    <section id="library" aria-labelledby="library-h" className="scroll-mt-[var(--header-h)] bg-turf-deep">
      <div className="mx-auto max-w-[1440px] px-5 pb-32 sm:px-10">
        <Reveal>
          <h2 id="library-h" className="font-display text-[clamp(40px,5vw,80px)] leading-[0.95] text-chalk">
            {t("landing.libraryTitle")}
          </h2>
          <p className="mt-4 max-w-[46rem] text-[18px] leading-relaxed text-chalk-dim">{t("landing.libraryLede")}</p>
        </Reveal>
        <div className="mt-12">
          <MatchLibrary heading={false} />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-turf-edge bg-turf-deep">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-6 px-5 py-14 sm:px-10">
        <div className="font-display text-[clamp(40px,5vw,72px)] leading-none text-chalk">
          {t("landing.titleA")} {t("landing.titleB")} <em className="text-flare">{t("landing.titleBug")}</em>
        </div>
        <p className="max-w-[26rem] text-[14px] leading-relaxed text-chalk-faint">{t("landing.footer")}</p>
      </div>
    </footer>
  );
}
