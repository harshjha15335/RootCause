import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { clock } from "../lib/format";
import { source } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { useTrace } from "../store/traceStore";
import { useUi, type Screen } from "../store/uiStore";
import { Badge } from "./bits";
import { LanguageSelect, ModeSwitch, VoiceButton } from "./Controls";
import { go } from "../lib/nav";

export function Wordmark() {
  return (
    <a href="#/" onClick={(e) => (e.preventDefault(), go("home"))} className="flex items-center gap-2" aria-label="Root Cause, home" translate="no">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <g fill="none" stroke="rgb(var(--chalk))" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M3 15l8 4 8-4" />
          <path d="M3 11l8 4 8-4" opacity=".6" />
          <path d="M3 7l8 4 8-4-8-4z" opacity=".35" />
        </g>
        <circle cx="11" cy="19" r="2" fill="rgb(var(--flare))" />
      </svg>
      <span className="font-display text-[15px] tracking-[0.02em] text-chalk [font-variation-settings:'wdth'_130]">Root Cause</span>
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

const NAV: Screen[] = ["home", "story", "explore", "analysis", "report"];

function NavLinks() {
  const { t } = useTranslation();
  const screen = useUi((s) => s.screen);
  return (
    <nav aria-label={t("nav.main")} className="flex items-center gap-1">
      {NAV.map((k) => {
        const on = screen === k;
        return (
          <a
            key={k}
            href={k === "home" ? "#/" : `#/${k}`}
            aria-current={on ? "page" : undefined}
            onClick={(e) => (e.preventDefault(), go(k))}
            className={`rc-press relative flex min-h-[40px] shrink-0 items-center px-3 text-[14px] transition-colors duration-300 ${
              on ? "text-chalk" : "text-chalk-faint hover:text-chalk"
            }`}
          >
            {t(`nav.${k}`)}
            {on && <motion.span layoutId="nav-ink" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-flare" transition={{ type: "spring", duration: 0.4, bounce: 0.1 }} />}
          </a>
        );
      })}
    </nav>
  );
}

export function Header() {
  const { t } = useTranslation();
  const mode = useUi((s) => s.mode);
  const lang = useUi((s) => s.lang);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-turf-edge/60 bg-turf-deep/85 backdrop-blur-md">
      <div className="mx-auto flex h-[var(--header-h)] max-w-[1600px] items-center gap-4 px-5 lg:px-10">
        <Wordmark />
        <div className="ml-4 hidden md:block">
          <NavLinks />
        </div>
        <div className="ml-auto hidden items-center gap-2 xl:flex">
          <span className="text-[13px] text-chalk-faint">{t("controls.mode")}</span>
          <ModeSwitch />
          <LanguageSelect />
          <VoiceButton />
        </div>
        {/* below xl the same controls live in a sheet, labelled with their current values */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="view-options"
          onClick={() => setOpen((o) => !o)}
          className="rc-press ml-auto flex min-h-[42px] items-center gap-2 rounded-full px-4 text-[13px] font-medium text-chalk ring-1 ring-inset ring-turf-edge xl:hidden"
        >
          <span>{t(`mode.${mode}`)}</span>
          <span className="text-chalk-faint" aria-hidden="true">/</span>
          <span className="uppercase">{lang}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
            <path d="m2.5 4.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="sr-only">{t("controls.settings")}</span>
        </button>
      </div>
      <div className="overflow-x-auto border-t border-turf-edge/60 px-2 md:hidden [scrollbar-width:none]">
        <NavLinks />
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            id="view-options"
            className="absolute inset-x-0 top-full z-50 border-b border-turf-edge/60 bg-turf-deep px-4 pb-4 pt-3 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)] xl:hidden"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <div className="mb-1.5 text-[13px] text-chalk-dim">{t("controls.mode")}</div>
                <ModeSwitch />
              </div>
              <div>
                <div className="mb-1.5 text-[13px] text-chalk-dim">{t("controls.language")}</div>
                <LanguageSelect />
              </div>
              <VoiceButton />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
