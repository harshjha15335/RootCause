import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLibrary } from "../api/library";
import type { LibraryMatch } from "../api/types";
import { pageHref } from "../lib/nav";

/**
 * The demo matches as a series of meetings between the same two clubs. Each card carries a tiny
 * Timestack of its match: six 15-minute layers, kick-off at the bottom, a dot per goal on its layer,
 * yellow when Root Cause traced the mistake behind it.
 */
export function MatchLibrary({ heading = true, compact = false }: { heading?: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const { data, isError } = useLibrary();
  return (
    <section aria-labelledby={heading ? "library-h" : undefined} aria-label={heading ? undefined : t("library.title")}>
      {heading && (
        <h2 id="library-h" className="font-display text-[clamp(28px,4vw,44px)] font-extrabold leading-[1.02] text-chalk [font-variation-settings:'wdth'_125]">
          {t("library.title")}
        </h2>
      )}
      {isError ? (
        <p role="alert" className="mt-6 text-[16px] text-chalk-dim">{t("library.failed")}</p>
      ) : (
        <ul className={`grid gap-3 sm:gap-4 ${heading ? "mt-6" : ""} ${compact ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
          {(data ?? Array.from({ length: 4 }, () => null)).map((m, i) => (
            <li key={m?.id ?? i} className="min-w-0">{m ? <Card m={m} compact={compact} /> : <Skeleton compact={compact} />}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Card({ m, compact }: { m: LibraryMatch; compact: boolean }) {
  const { t } = useTranslation();
  const first = m.goals.find((g) => g.traced);
  const label = t("library.cardLabel", { n: m.n, home: m.home.name, away: m.away.name, h: m.score[0], a: m.score[1], count: m.goals.length, traced: m.traced });
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: (m.n - 1) * 0.06, ease: [0.23, 1, 0.32, 1] }}
      className="group relative flex h-full min-w-0 flex-col rounded-[14px] bg-turf/70 ring-1 ring-inset ring-turf-edge/70 transition-colors duration-300 hover:bg-turf"
    >
      <a href={pageHref("match", { demo: m.id })} aria-label={label} className="absolute inset-0 z-0 rounded-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare" />
      <MiniStack m={m} className={`pointer-events-none mx-auto ${compact ? "h-[96px]" : "h-[132px]"}`} />
      <div className={`flex flex-1 flex-col ${compact ? "px-3 pb-3" : "px-4 pb-4"}`}>
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-chalk-faint">{t("library.meeting", { n: m.n })}</div>
        <dl className={`mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 font-display text-chalk [font-variation-settings:'wdth'_112] ${compact ? "text-[14px]" : "text-[17px]"}`} translate="no">
          {([["home", 0], ["away", 1]] as const).map(([side, i]) => (
            <div key={side} className="contents">
              <dt className="truncate">{compact ? m[side].short_name : m[side].name}</dt>
              <dd className="text-right tabular-nums">{m.score[i]}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 text-[13px] text-chalk-dim">
          {t("library.traced", { count: m.goals.length, traced: m.traced })}
        </div>
        {!compact && first && (
          <a
            href={pageHref("autopsy", { demo: m.id, goal: first.id })}
            className="rc-press relative z-10 mt-4 inline-flex min-h-[40px] w-fit items-center gap-2 rounded-full bg-flare px-4 text-[13px] font-semibold text-flare-ink"
          >
            {t("library.autopsy", { minute: Math.floor(first.second / 60) })}
          </a>
        )}
      </div>
    </motion.article>
  );
}

const LAYERS = 6;

/** Six 15-minute glass layers seen from above at an angle, with a dot for each goal on its layer. */
export function MiniStack({ m, className = "" }: { m: LibraryMatch; className?: string }) {
  const W = 240, H = 140, pw = 150, ph = 34, skew = 34, gap = 17;
  const x0 = (W - pw - skew) / 2;
  const yOf = (layer: number) => H - 12 - ph - layer * gap;
  const span = m.duration_s / LAYERS;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${className}`} aria-hidden="true">
      {Array.from({ length: LAYERS }, (_, k) => {
        const y = yOf(k);
        const has = m.goals.some((g) => Math.min(LAYERS - 1, Math.floor(g.second / span)) === k);
        return (
          <polygon
            key={k}
            points={`${x0 + skew},${y} ${x0 + skew + pw},${y} ${x0 + pw},${y + ph} ${x0},${y + ph}`}
            fill="rgb(var(--chalk) / 0.05)"
            stroke="rgb(var(--chalk))"
            strokeOpacity={has ? 0.5 : 0.22}
            strokeWidth="1"
          />
        );
      })}
      {m.goals.map((g) => {
        const k = Math.min(LAYERS - 1, Math.floor(g.second / span));
        const f = (g.second - k * span) / span;
        const depth = g.side === "home" ? 0.62 : 0.38;
        const y = yOf(k) + ph * depth;
        const x = x0 + skew * (1 - depth) + 12 + f * (pw - 24);
        return g.traced ? (
          <g key={g.id}>
            <circle cx={x} cy={y} r="8" fill="rgb(var(--flare))" opacity="0.22" />
            <circle cx={x} cy={y} r="4" fill="rgb(var(--flare))" />
          </g>
        ) : (
          <circle key={g.id} cx={x} cy={y} r="3" fill="rgb(var(--chalk))" opacity="0.85" />
        );
      })}
    </svg>
  );
}

function Skeleton({ compact }: { compact: boolean }) {
  return <div className={`rounded-[14px] bg-turf/50 ring-1 ring-inset ring-turf-edge/50 ${compact ? "h-[170px]" : "h-[268px]"}`} aria-hidden="true" />;
}
