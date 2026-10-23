import { useTranslation } from "react-i18next";
import { demoHref, useDemos } from "../api/demos";
import type { Mode } from "../api/types";
import { Badge } from "../components/bits";
import { Reveal, useSmoothScroll } from "../lib/motion";
import { go } from "../lib/nav";
import { useSelectedEvidence } from "../store/selectors";
import { useUi } from "../store/uiStore";
import { TimestackStory } from "./TimestackStory";

export function Home() {
  useSmoothScroll();
  const ev = useSelectedEvidence();
  return (
    <>
      <TimestackStory ev={ev} />
      <Features />
      <HowItWorks />
      <DemoPicker />
      <Modes />
      <Footer />
    </>
  );
}

const FEATURES = ["trace", "prove", "timestack", "analysis", "chances", "voices"] as const;
type Feature = (typeof FEATURES)[number];

function Features() {
  const { t } = useTranslation();
  return (
    <section id="features" aria-labelledby="features-h" className="bg-turf-deep">
      <div className="mx-auto max-w-[1440px] px-5 pb-28 pt-24 sm:px-10">
        <Reveal>
          <h2 id="features-h" className="font-display text-[clamp(44px,6vw,96px)] leading-[0.95] text-chalk">{t("product.featuresTitle")}</h2>
          <p className="mt-5 max-w-[46rem] text-[18px] leading-relaxed text-chalk-dim">{t("product.featuresLede")}</p>
        </Reveal>
        <ul className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((k, i) => (
            <Reveal as="li" key={k} delay={i * 3} className="flex flex-col rounded-[28px] bg-turf p-6 ring-1 ring-inset ring-turf-edge sm:p-7">
              <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-[#0b1a8a]">
                <FeatureArt k={k} />
              </div>
              <div className="mt-6 font-mono text-[12px] text-chalk-faint">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="mt-2 text-[22px] font-semibold leading-tight text-chalk">{t(`product.f.${k}`)}</h3>
              <p className="mt-3 flex-1 text-[15px] leading-relaxed text-chalk-dim">{t(`product.f.${k}Body`)}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Small diagrams of each feature. Illustrations, not match data. */
function FeatureArt({ k }: { k: Feature }) {
  const chalk = "rgb(var(--chalk))";
  const faint = "rgb(var(--chalk) / 0.35)";
  const flare = "rgb(var(--flare))";
  const common = { viewBox: "0 0 320 180", className: "block h-full w-full", "aria-hidden": true } as const;
  if (k === "trace")
    return (
      <svg {...common}>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} transform={`translate(28 ${26 + i * 28})`}>
            <rect width={i === 3 ? 230 : 190 - i * 18} height="16" rx="8" fill={i === 3 ? flare : faint} opacity={i === 3 ? 1 : 0.6 - i * 0.06} />
            <circle cx="-12" cy="8" r="4" fill={i === 3 ? flare : chalk} />
          </g>
        ))}
        <line x1="16" y1="34" x2="16" y2="142" stroke={faint} strokeWidth="2" />
      </svg>
    );
  if (k === "prove")
    return (
      <svg {...common}>
        {[0, 1].map((side) =>
          Array.from({ length: 40 }, (_, i) => (
            <circle key={`${side}-${i}`} cx={24 + side * 150 + (i % 8) * 16} cy={36 + Math.floor(i / 8) * 26} r="5.5" fill={side === 0 ? (i < 30 ? chalk : "none") : i < 4 ? chalk : "none"} stroke={side === 1 && i >= 4 ? flare : chalk} strokeWidth="1.5" opacity={side === 1 && i >= 4 ? 0.8 : 1} />
          )),
        )}
        <line x1="160" y1="20" x2="160" y2="160" stroke={faint} strokeDasharray="4 4" />
      </svg>
    );
  if (k === "timestack")
    return (
      <svg {...common}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M60 ${140 - i * 18} L160 ${160 - i * 18} L260 ${140 - i * 18} L160 ${120 - i * 18}Z`} fill="none" stroke={i === 2 ? flare : faint} strokeWidth={i === 2 ? 2 : 1.2} />
        ))}
        <path d="M120 150 C130 120 110 95 140 70 S170 40 175 30" fill="none" stroke={chalk} strokeWidth="3" strokeLinecap="round" />
        <path d="M200 148 C190 118 205 92 190 66" fill="none" stroke={flare} strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  if (k === "analysis")
    return (
      <svg {...common}>
        <rect x="14" y="12" width="292" height="156" rx="6" fill="none" stroke={faint} />
        <line x1="160" y1="12" x2="160" y2="168" stroke={faint} />
        <rect x="70" y="34" width="140" height="112" rx="6" fill="none" stroke={faint} strokeDasharray="3 3" />
        {[
          [[78, 44], [70, 76], [72, 108], [80, 138]],
          [[130, 54], [120, 90], [132, 126]],
          [[200, 40], [208, 90], [198, 140]],
        ].map((line, j) => (
          <g key={j}>
            <polyline points={line.map((p) => p.join(",")).join(" ")} fill="none" stroke={chalk} strokeWidth="1.5" strokeDasharray="5 4" />
            {line.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="7" fill={chalk} />
            ))}
          </g>
        ))}
        <circle cx="34" cy="90" r="7" fill={chalk} />
      </svg>
    );
  if (k === "chances")
    return (
      <svg {...common}>
        <rect x="190" y="30" width="116" height="120" fill="none" stroke={faint} />
        <rect x="270" y="62" width="36" height="56" fill="none" stroke={faint} />
        <defs>
          <pattern id="fa-h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line y2="6" stroke={flare} strokeWidth="1.5" />
          </pattern>
        </defs>
        <polygon points="220,104 306,78 306,102" fill="url(#fa-h)" stroke={flare} />
        <circle cx="220" cy="104" r="14" fill="none" stroke={chalk} strokeWidth="2" />
        <circle cx="220" cy="104" r="7" fill={chalk} />
        <line x1="220" y1="104" x2="236" y2="52" stroke={flare} strokeWidth="2" strokeDasharray="6 4" />
        <circle cx="238" cy="46" r="7" fill={chalk} />
        <circle cx="262" cy="92" r="7" fill="#5a78ff" stroke={chalk} />
        <circle cx="250" cy="120" r="7" fill="#5a78ff" stroke={chalk} />
        <rect x="244" y="128" width="40" height="18" rx="9" fill={chalk} />
        <text x="264" y="141" textAnchor="middle" fontSize="11" fontWeight="700" fill="#14123a">0.4s</text>
        <rect x="40" y="70" width="120" height="16" rx="8" fill={faint} />
        <rect x="40" y="96" width="90" height="16" rx="8" fill={faint} opacity="0.6" />
      </svg>
    );
  return (
    <svg {...common}>
      {["Fan", "Analyst", "Broadcaster"].map((m, i) => (
        <g key={m} transform={`translate(24 ${30 + i * 44})`}>
          <rect width={i === 0 ? 120 : i === 1 ? 160 : 200} height="30" rx="15" fill={i === 0 ? chalk : "none"} stroke={chalk} strokeOpacity={i === 0 ? 1 : 0.4} />
        </g>
      ))}
      {["EN", "हिं", "ES"].map((l, i) => (
        <g key={l} transform={`translate(${240 + (i % 2) * 0} ${36 + i * 44})`}>
          <circle r="18" cx="18" cy="9" fill="none" stroke={i === 0 ? flare : faint} strokeWidth="2" />
          <text x="18" y="14" textAnchor="middle" fontSize="13" fontWeight="700" fill={chalk}>{l}</text>
        </g>
      ))}
    </svg>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="how-h" className="bg-turf-deep">
      <div className="mx-auto max-w-[1440px] px-5 pb-28 sm:px-10">
        <Reveal>
          <h2 id="how-h" className="font-display text-[clamp(40px,5vw,80px)] leading-[0.95] text-chalk">{t("product.howTitle")}</h2>
        </Reveal>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-[28px] bg-turf-edge/60 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <li key={i} className="bg-turf p-7">
              <div className="font-display text-[44px] leading-none text-chalk-faint">{i}</div>
              <h3 className="mt-6 text-[19px] font-semibold text-chalk">{t(`product.h${i}`)}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-chalk-dim">{t(`product.h${i}Body`)}</p>
            </li>
          ))}
        </ol>
        <a
          href="#/story"
          onClick={(e) => (e.preventDefault(), go("story"))}
          className="rc-press mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-chalk px-6 text-[15px] font-bold text-turf hover:opacity-90"
        >
          {t("product.howCta")}
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h9m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </section>
  );
}

/** Engine-generated demo matches. Picking one reloads the app on that match. */
function DemoPicker() {
  const { t } = useTranslation();
  const demos = useDemos();
  return (
    <section id="demos" aria-labelledby="demos-h" className="bg-turf-deep">
      <div className="mx-auto max-w-[1440px] px-5 pb-32 sm:px-10">
        <Reveal>
          <h2 id="demos-h" className="font-display text-[clamp(40px,5vw,80px)] leading-[0.95] text-chalk">{t("product.demosTitle")}</h2>
          <p className="mt-5 max-w-[46rem] text-[18px] leading-relaxed text-chalk-dim">{t("product.demosLede")}</p>
        </Reveal>
        <ul className="mt-12 grid gap-5 md:grid-cols-2">
          {demos.map((d) => (
            <li key={d.id} className={`rounded-[28px] p-6 ring-1 ring-inset sm:p-7 ${d.current ? "bg-chalk text-[#14123a] ring-chalk" : "bg-turf text-chalk ring-turf-edge"}`}>
              <div className="flex items-center justify-between gap-3 text-[13px] opacity-70">
                <span>{t("product.demoLabel", { n: d.n })}</span>
                {d.current && <span className="font-semibold">{t("product.demoOpen")}</span>}
              </div>
              {d.meta ? (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Badge club={d.meta.home} size={34} />
                  <span className="font-display text-[clamp(22px,2.4vw,32px)] leading-none">
                    {d.meta.home.short_name} {d.score?.[0] ?? "–"}–{d.score?.[1] ?? "–"} {d.meta.away.short_name}
                  </span>
                  <Badge club={d.meta.away} size={34} />
                </div>
              ) : (
                <div className="mt-5 h-9 w-48 animate-pulse rounded-full bg-current/10" />
              )}
              <p className="mt-3 text-[15px] opacity-80">
                {d.meta ? `${d.meta.home.name} v ${d.meta.away.name}` : t("product.demoLoading")}
                {d.traced !== null && ` · ${t("product.demoTraced", { count: d.goals, traced: d.traced })}`}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {(["lab", "explore", "analysis"] as const).map((s, i) => (
                  <a
                    key={s}
                    href={demoHref(d.id, s)}
                    onClick={(e) => d.current && (e.preventDefault(), go(s))}
                    className={`rc-press inline-flex min-h-[44px] items-center rounded-full px-5 text-[14px] font-semibold ${i === 0 ? (d.current ? "bg-turf-deep text-chalk" : "bg-chalk text-turf") : "ring-1 ring-inset ring-current/30"}`}
                  >
                    {t(`product.open.${s}`)}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[13px] text-chalk-faint">{t("home.footer")}</p>
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
                <span className="min-w-0 font-display text-[clamp(38px,4vw,64px)] leading-none text-chalk transition-[font-variation-settings] duration-500 [font-variation-settings:'wdth'_100] group-hover:[font-variation-settings:'wdth'_150]">
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


