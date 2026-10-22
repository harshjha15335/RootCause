import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { clock } from "../lib/format";
import { source } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { useTrace } from "../store/traceStore";
import { useUi } from "../store/uiStore";
import { Badge } from "./bits";
import { LanguageSelect, ModeSwitch, VoiceButton } from "./Controls";

export function Wordmark() {
  return (
    <a href="#/" onClick={(e) => (e.preventDefault(), useUi.getState().setScreen("match"))} className="flex items-center gap-2" aria-label="Root Cause" translate="no">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="9.5" fill="none" stroke="#eef0e6" strokeWidth="1.5" />
        <circle cx="11" cy="11" r="4" fill="#ff8a3d" />
      </svg>
      <span className="font-display text-[19px] font-extrabold tracking-[-0.02em] text-chalk [font-stretch:112%]">Root Cause</span>
    </a>
  );
}

/** Score with a flip on goals; clock is the replay's, not the wall's. */
export function Scoreboard() {
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
    <div className="flex items-center gap-2.5 rounded-full bg-turf-deep py-1 pl-1.5 pr-3 ring-1 ring-turf-edge sm:gap-3">
      <Badge club={meta?.home ?? null} size={26} />
      <span className="hidden font-display text-[15px] font-bold text-chalk md:inline">{meta?.home.short_name ?? t("score.home")}</span>
      <span className="flex items-center gap-1 font-display text-[22px] font-extrabold leading-none text-chalk tabular-nums" aria-live="polite" aria-label={`${home}–${away}`}>
        <Flip value={home} />
        <span className="text-chalk-faint">–</span>
        <Flip value={away} />
      </span>
      <span className="hidden font-display text-[15px] font-bold text-chalk md:inline">{meta?.away.short_name ?? t("score.away")}</span>
      <Badge club={meta?.away ?? null} size={26} />
      <span className="ml-1 h-5 w-px bg-turf-edge" aria-hidden="true" />
      <span className="min-w-[3.4em] font-display text-[15px] font-semibold text-chalk tabular-nums">{clock(second)}</span>
      <span className={`flex items-center gap-1.5 text-[12px] font-medium ${live ? "text-chalk" : "text-chalk-dim"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-chalk rc-blink" : "bg-chalk-faint"}`} aria-hidden="true" />
        <span className="hidden sm:inline">{live ? (source.kind === "live" ? t("score.live") : t("score.recorded")) : t("score.replay")}</span>
      </span>
    </div>
  );
}

function Flip({ value }: { value: number }) {
  return (
    <span className="relative inline-block h-[1em] w-[0.62em] overflow-hidden text-center">
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

export function Header() {
  const { t } = useTranslation();
  const screen = useUi((s) => s.screen);
  return (
    <header className="sticky top-0 z-40 border-b border-turf-edge/70 bg-turf-deep">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 lg:px-6">
        <Wordmark />
        <div className="order-3 w-full sm:order-none sm:w-auto">
          <Scoreboard />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => useUi.getState().setScreen(screen === "report" ? "match" : "report")}
            className="rc-press min-h-[42px] rounded-full bg-chalk px-4 text-[13px] font-bold text-turf-deep transition-[background-color] duration-150 ease-out hover:bg-white"
          >
            {screen === "report" ? t("nav.backToMatch") : t("nav.bugReport")}
          </button>
        </div>
        <div className="order-4 flex w-full items-center gap-2 overflow-x-auto pb-0.5 lg:order-none lg:w-auto [scrollbar-width:none]">
          <ModeSwitch />
          <LanguageSelect />
          <VoiceButton />
        </div>
      </div>
    </header>
  );
}
