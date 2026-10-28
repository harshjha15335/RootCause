import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clock } from "../lib/format";
import { source } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { useTrace } from "../store/traceStore";
import { useUi, type Screen } from "../store/uiStore";
import type { Lang } from "../api/types";
import { Badge } from "./bits";
import { go } from "../lib/nav";

export function Wordmark() {
  return (
    <a href="#/" onClick={(e) => (e.preventDefault(), go("home"))} className="flex min-h-[44px] shrink-0 items-center gap-2" aria-label="Root Cause, home" translate="no">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <g fill="none" stroke="rgb(var(--chalk))" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M3 15l8 4 8-4" />
          <path d="M3 11l8 4 8-4" opacity=".6" />
          <path d="M3 7l8 4 8-4-8-4z" opacity=".35" />
        </g>
        <circle cx="11" cy="19" r="2" fill="rgb(var(--flare))" />
      </svg>
      <span className="hidden font-display text-[15px] tracking-[0.02em] text-chalk [font-variation-settings:'wdth'_130] min-[400px]:inline">Root Cause</span>
    </a>
  );
}

/** Score with a flip on goals; the clock is the replay's, not the wall's. */
export function Scoreboard({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const goals = useMatch((s) => s.goals);
  const second = useTrace((s) => s.second);
  const phase = useTrace((s) => s.phase);
  // score as of the second on screen, so scrubbing back un-scores later goals
  const home = goals.filter((g) => g.team === "home" && g.second <= second).length;
  const away = goals.filter((g) => g.team === "away" && g.second <= second).length;
  const live = phase === "live";
  return (
    <div className={`flex items-center gap-2.5 rounded-full bg-turf-deep/80 py-1.5 pl-2 pr-4 ring-1 ring-turf-edge backdrop-blur-md ${className}`}>
      <Badge club={meta?.home ?? null} size={24} />
      <span className="hidden text-[13px] font-semibold text-chalk sm:inline">{meta?.home.short_name ?? t("score.home")}</span>
      <span className="flex items-center gap-1 font-display text-[26px] leading-none text-chalk tabular-nums" aria-live="polite" aria-label={`${home}–${away}`}>
        <Flip value={home} />
        <span className="text-chalk-faint">–</span>
        <Flip value={away} />
      </span>
      <span className="hidden text-[13px] font-semibold text-chalk sm:inline">{meta?.away.short_name ?? t("score.away")}</span>
      <Badge club={meta?.away ?? null} size={24} />
      <span className="ml-0.5 h-5 w-px bg-turf-edge" aria-hidden="true" />
      <span className="min-w-[3.2em] text-[14px] font-medium leading-none text-chalk tabular-nums">{clock(second)}</span>
      <span className={`flex items-center gap-1.5 text-[12px] font-medium ${live ? "text-chalk" : "text-chalk-dim"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-chalk rc-blink" : "bg-chalk-faint"}`} aria-hidden="true" />
        <span className="hidden md:inline">{live ? (source.kind === "live" ? t("score.live") : t("score.recorded")) : t("score.replay")}</span>
      </span>
    </div>
  );
}

function Flip({ value }: { value: number }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.5em] overflow-hidden text-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          className="absolute inset-0"
          initial={{ y: "100%" }}
          animate={{ y: "0%" }}
          exit={{ y: "-100%" }}
          transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const NAV: { key: Screen; also: Screen[] }[] = [
  { key: "home", also: [] },
  { key: "story", also: [] },
  { key: "matches", also: ["match", "explore"] },
  { key: "autopsy", also: [] },
  { key: "lab", also: [] },
];

function NavLinks() {
  const { t } = useTranslation();
  const screen = useUi((s) => s.screen);
  return (
    <nav aria-label={t("nav.main")} className="flex items-center">
      {NAV.map(({ key, also }) => {
        const on = screen === key || also.includes(screen);
        return (
          <a
            key={key}
            href={key === "home" ? "#/" : `#/${key}`}
            aria-current={screen === key ? "page" : on ? "true" : undefined}
            onClick={(e) => (e.preventDefault(), go(key))}
            className={`rc-press relative min-h-[44px] shrink-0 items-center px-[6px] text-[14px] transition-colors max-[359px]:px-[2px] max-[359px]:text-[12.5px] duration-300 sm:px-2 lg:px-3 ${
              // on phones the wordmark is the home link, which leaves room for Tactics Lab beside the menus
              key === "home" ? "hidden sm:flex" : "flex"
            } ${
              on ? "text-chalk" : "text-chalk-faint hover:text-chalk"
            }`}
          >
            {key === "lab" ? (
              <>
                <span className="sm:hidden">{t("nav.labShort")}</span>
                <span className="hidden sm:inline">{t("nav.lab")}</span>
              </>
            ) : (
              t(`nav.${key}`)
            )}
            {on && <motion.span layoutId="nav-ink" className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-flare" transition={{ type: "spring", duration: 0.4, bounce: 0.1 }} />}
          </a>
        );
      })}
    </nav>
  );
}

const LANGS: { value: Lang; short: string; name: string; htmlLang: string }[] = [
  { value: "en", short: "EN", name: "English", htmlLang: "en" },
  { value: "hi", short: "HI", name: "हिन्दी", htmlLang: "hi" },
  { value: "es", short: "ES", name: "Español", htmlLang: "es" },
];

/** A small menu, not a row of pills: the current language's code, the list on demand. */
function LanguageMenu() {
  const { t } = useTranslation();
  const lang = useUi((s) => s.lang);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  const cur = LANGS.find((l) => l.value === lang) ?? LANGS[0];
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("controls.language")}: ${cur.name}`}
        onClick={() => setOpen((o) => !o)}
        className="rc-press flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-chalk ring-1 ring-inset ring-turf-edge hover:bg-turf-raised/60"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" className="hidden sm:block">
          <circle cx="8" cy="8" r="6.3" />
          <path d="M1.8 8h12.4M8 1.7c-2.2 2.4-2.2 10.2 0 12.6M8 1.7c2.2 2.4 2.2 10.2 0 12.6" />
        </svg>
        {cur.short}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={t("controls.language")}
            className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[160px] rounded-[12px] bg-turf p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-turf-edge"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
              const i = items.indexOf(document.activeElement as HTMLButtonElement);
              items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
            }}
          >
            {LANGS.map((l) => (
              <button
                key={l.value}
                type="button"
                role="menuitemradio"
                aria-checked={l.value === lang}
                lang={l.htmlLang}
                onClick={() => {
                  useUi.getState().setLang(l.value);
                  setOpen(false);
                }}
                className="flex min-h-[40px] w-full items-center justify-between gap-4 rounded-[8px] px-3 text-left text-[14px] text-chalk hover:bg-turf-raised focus-visible:bg-turf-raised focus-visible:outline-none"
              >
                <span>{l.name}</span>
                <span className={`text-[12px] font-semibold ${l.value === lang ? "text-flare" : "text-chalk-faint"}`}>{l.value === lang ? "●" : l.short}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** My Club & My Player personalization preferences */
function PreferencesMenu() {
  const meta = useMatch((s) => s.meta);
  const favoriteClub = useUi((s) => s.favoriteClub);
  const favoritePlayerId = useUi((s) => s.favoritePlayerId);
  const broadcastOverlay = useUi((s) => s.broadcastOverlay);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const allPlayers = [
    ...(meta?.home.players ?? []),
    ...(meta?.away.players ?? []),
  ];
  const favPlayer = allPlayers.find((p) => p.id === favoritePlayerId);
  const label = favPlayer
    ? favPlayer.name.split(" ").slice(-1)[0]
    : favoriteClub
    ? favoriteClub.toUpperCase()
    : "My Team";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Personalization: My Club and My Player preferences"
        onClick={() => setOpen((o) => !o)}
        className={`rc-press flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ring-1 ring-inset transition-colors ${
          favoriteClub || favoritePlayerId
            ? "bg-flare/10 text-flare ring-flare/40 hover:bg-flare/20"
            : "text-chalk ring-turf-edge hover:bg-turf-raised/60"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1.5l1.9 4.3 4.7.4-3.5 3.2 1 4.6L8 11.6 3.9 14l1-4.6L1.4 6.2l4.7-.4z" />
        </svg>
        <span className="hidden sm:inline">{label}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="My Club and My Player preferences"
            className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[240px] rounded-[16px] bg-turf p-3 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.7)] ring-1 ring-turf-edge"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="mb-2 border-b border-turf-edge pb-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-chalk-faint">My Club</span>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => useUi.getState().setFavoriteClub(favoriteClub === "home" ? null : "home")}
                  className={`rc-press flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-colors ${
                    favoriteClub === "home"
                      ? "bg-flare text-flare-ink"
                      : "bg-turf-raised text-chalk hover:bg-turf-edge"
                  }`}
                >
                  {meta?.home.short_name ?? "WLB"}
                </button>
                <button
                  type="button"
                  onClick={() => useUi.getState().setFavoriteClub(favoriteClub === "away" ? null : "away")}
                  className={`rc-press flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-colors ${
                    favoriteClub === "away"
                      ? "bg-flare text-flare-ink"
                      : "bg-turf-raised text-chalk hover:bg-turf-edge"
                  }`}
                >
                  {meta?.away.short_name ?? "MSB"}
                </button>
                {favoriteClub && (
                  <button
                    type="button"
                    onClick={() => useUi.getState().setFavoriteClub(null)}
                    title="Clear club"
                    className="rounded-lg px-2 text-[12px] text-chalk-faint hover:text-chalk"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="mb-2 border-b border-turf-edge pb-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-chalk-faint">My Player</span>
              <select
                value={favoritePlayerId ?? ""}
                onChange={(e) => useUi.getState().setFavoritePlayerId(e.target.value || null)}
                className="mt-1.5 w-full rounded-lg bg-turf-raised px-2.5 py-1.5 text-[13px] font-semibold text-chalk ring-1 ring-turf-edge focus:outline-none"
              >
                <option value="">None (all players)</option>
                <optgroup label={meta?.home.name ?? "Home Team"}>
                  {(meta?.home.players ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number} {p.name} ({p.position})
                    </option>
                  ))}
                </optgroup>
                <optgroup label={meta?.away.name ?? "Away Team"}>
                  {(meta?.away.players ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number} {p.name} ({p.position})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="flex cursor-pointer items-center justify-between text-[13px] font-medium text-chalk">
                <span>Broadcast Overlays</span>
                <input
                  type="checkbox"
                  checked={broadcastOverlay}
                  onChange={(e) => useUi.getState().setBroadcastOverlay(e.target.checked)}
                  className="rounded accent-[#c6ff4d]"
                />
              </label>
              <p className="mt-0.5 text-[11px] text-chalk-faint">Live cues for goals, sprints, and root causes</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Home · Story · Matches · Autopsy · Tactics Lab, and the language. Match picking lives in the library, depth on each page. */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-turf-edge/60 bg-turf-deep/85 backdrop-blur-md">
      <div className="mx-auto flex h-[var(--header-h)] max-w-[1600px] items-center gap-2 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] sm:gap-4 lg:px-10">
        <Wordmark />
        <div className="ml-auto min-w-0 overflow-x-auto [scrollbar-width:none] sm:ml-6 sm:mr-auto">
          <NavLinks />
        </div>
        <div className="flex items-center gap-2">
          <PreferencesMenu />
          <LanguageMenu />
        </div>
      </div>
    </header>
  );
}
