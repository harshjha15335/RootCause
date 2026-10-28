import { animate, useInView, useReducedMotion } from "framer-motion";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ClubMeta, Link } from "../api/types";
import { jumpTo } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { useTrace } from "../store/traceStore";
import { PLAYER_TOKEN, pct, pitchKit, playerInfo, surname, tidyNumbers } from "../lib/format";

/** Invented club crest drawn from the club's kit colours (MatchMeta). No real marks. */
export function Badge({ club, size = 28 }: { club: ClubMeta | null; size?: number }) {
  const a = club?.kit_primary ?? "#3b6ea8";
  const b = club?.kit_secondary ?? "#eef0e6";
  const initials = (club?.short_name ?? "??").slice(0, 3);
  const home = club?.code !== "AWAY";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      {home ? (
        <>
          <path d="M16 1.5 29 6v9.5C29 23 23.5 28 16 30.5 8.5 28 3 23 3 15.5V6z" fill={a} stroke={b} strokeWidth="1.5" />
          <path d="M3.6 17h24.8" stroke={b} strokeWidth="1.5" />
          <path d="M9 22.5q3.5 2.5 7 0t7 0" fill="none" stroke={b} strokeWidth="1.3" />
        </>
      ) : (
        <>
          <circle cx="16" cy="16" r="14" fill={a} stroke={b} strokeWidth="1.5" />
          <path d="M6 20 16 11l10 9" fill="none" stroke={b} strokeWidth="2.2" strokeLinejoin="round" />
        </>
      )}
      <text x="16" y={home ? 13.2 : 27.2} textAnchor="middle" fontSize={home ? 6.4 : 5} fontWeight="800" fill={b} fontFamily="Inter Tight Variable, sans-serif">
        {initials}
      </text>
    </svg>
  );
}

/** Kit swatch + number + name; hovering or clicking focuses the player on the pitch. */
export function PlayerChip({ id, evidenceId, full = false }: { id: string; evidenceId?: string | null; full?: boolean }) {
  const meta = useMatch((s) => s.meta);
  const info = playerInfo(meta, id);
  const focused = useTrace((s) => s.focus.playerId === id || (evidenceId != null && s.focus.evidenceId === evidenceId));
  return (
    <button
      type="button"
      translate="no"
      className={`rc-press inline-flex items-baseline gap-1 rounded-[6px] px-1 py-px align-baseline font-semibold text-chalk underline decoration-chalk-faint decoration-1 underline-offset-[3px] transition-colors duration-150 ease-out hover:decoration-flare ${focused ? "bg-turf-raised decoration-flare" : ""}`}
      onPointerEnter={() => useTrace.getState().hover(evidenceId ?? null, id)}
      onPointerLeave={() => useTrace.getState().hover(null, null)}
      onFocus={() => useTrace.getState().hover(evidenceId ?? null, id)}
      onBlur={() => useTrace.getState().hover(null, null)}
      onClick={() => useTrace.getState().pin(evidenceId ?? null, id)}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 translate-y-[1px] self-center rounded-full ring-1 ring-chalk/40"
        style={{ background: pitchKit(info.side).kit }}
      />
      {info.number !== null && <span className="tabular-nums text-chalk-dim">{info.number}</span>}
      <span>{full ? info.name : surname(info.name)}</span>
    </button>
  );
}

/** Sentence text with player IDs turned into chips. */
export function RichText({ text, evidenceId }: { text: string; evidenceId?: string | null }) {
  const parts = tidyNumbers(text).split(PLAYER_TOKEN);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? <PlayerChip key={i} id={p} evidenceId={evidenceId} /> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

/** Animated number for blame and goal rates. Static under reduced motion. */
export function CountUp({ value, format = (v: number) => pct(v), className = "" }: { value: number; format?: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setShown(value);
      return;
    }
    const c = animate(from.current, value, {
      duration: 0.9,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => c.stop();
  }, [value, inView, reduce]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** Blame bar: length and number together, so colour is never the only signal. */
export function BlameBar({ link, root, delay = 0 }: { link: Link; root: boolean; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div ref={ref} className="flex items-center gap-3">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-turf-edge/60">
        <div
          className={`absolute inset-y-0 left-0 origin-left rounded-full transition-transform duration-[900ms] ease-out ${root ? "bg-flare" : "bg-flare/55"}`}
          style={{ width: `${Math.max(1.5, link.blame_percent)}%`, transform: `scaleX(${inView ? 1 : 0})`, transitionDelay: `${delay}ms` }}
        />
      </div>
      <CountUp value={link.blame_percent} className="w-12 text-right font-display text-[15px] font-bold text-chalk" />
    </div>
  );
}

/** Clicking a moment jumps the replay there with the player highlighted. */
export function MomentButton({ second, playerId, evidenceId, children, className = "" }: { second: number; playerId?: string; evidenceId?: string | null; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={`rc-press ${className}`}
      onPointerEnter={() => useTrace.getState().hover(evidenceId ?? null, playerId ?? null)}
      onPointerLeave={() => useTrace.getState().hover(null, null)}
      onClick={() => {
        useTrace.getState().pin(evidenceId ?? null, playerId ?? null);
        jumpTo(second - 1, { play: true });
        useTrace.getState().setSpeed(0.5);
      }}
    >
      {children}
    </button>
  );
}

export function BugName({ code }: { code: string }) {
  const { t } = useTranslation();
  return <>{t(`bug.${code}`, { defaultValue: code })}</>;
}

export function Pill({ children, tone = "chalk" }: { children: ReactNode; tone?: "chalk" | "flare" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
        tone === "flare" ? "bg-flare/15 text-flare ring-1 ring-flare/40" : "bg-turf-raised text-chalk-dim ring-1 ring-turf-edge"
      }`}
    >
      {children}
    </span>
  );
}
