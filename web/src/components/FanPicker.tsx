import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDemos } from "../api/demos";
import { surname } from "../lib/format";
import { useFan } from "../store/fanStore";
import { Badge } from "./bits";
import "./fanStrings";

/**
 * The header's "Your team" button: pick a club and a player from the match that's loaded. The
 * lists come from the match's own meta.json, so any match brings its own clubs and squads.
 */
export function FanPicker() {
  const { t } = useTranslation();
  const meta = useDemos().find((d) => d.current)?.meta ?? null;
  const { club, player, setClub, setPlayer } = useFan();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  const clubs = meta ? [meta.home, meta.away] : [];
  const mine = clubs.find((c) => c.name === club) ?? null;
  const label = player ? surname(player) : mine ? mine.short_name : t("fan.pick");
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("fan.pickLabel")}
        onClick={() => setOpen((o) => !o)}
        className="rc-press flex min-h-[40px] max-w-[150px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-chalk ring-1 ring-inset ring-turf-edge hover:bg-turf-raised/60"
      >
        {mine ? <Badge club={mine} size={18} /> : <Star filled={false} />}
        <span className="truncate">{label}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={t("fan.title")}
            className="fixed inset-x-3 top-[calc(var(--header-h)+6px)] z-50 max-h-[calc(100dvh-var(--header-h)-24px)] overflow-y-auto rounded-[14px] bg-turf p-4 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-turf-edge sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[360px]"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
          >
            <p className="text-[15px] font-semibold text-chalk">{t("fan.title")}</p>
            <p className="mt-1 text-[13px] leading-snug text-chalk-dim">{t("fan.intro")}</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-chalk-faint">{t("fan.club")}</p>
            <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("fan.club")}>
              {clubs.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={club === c.name}
                  onClick={() => setClub(club === c.name ? null : c.name)}
                  className={`rc-press flex min-h-[48px] items-center gap-2 rounded-[10px] px-3 text-left text-[13px] font-semibold ${club === c.name ? "bg-chalk text-turf-deep" : "bg-turf-deep text-chalk ring-1 ring-inset ring-turf-edge hover:bg-turf-raised"}`}
                >
                  <Badge club={c} size={22} />
                  <span className="leading-tight">{c.name}</span>
                </button>
              ))}
            </div>
            {mine && (
              <>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-chalk-faint">{t("fan.player")}</p>
                <ul className="mt-2 grid max-h-[300px] gap-0.5 overflow-y-auto pr-1" role="radiogroup" aria-label={t("fan.anyPlayer")}>
                  {mine.players.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={player === p.name}
                        onClick={() => setPlayer(player === p.name ? null : p.name, mine.name)}
                        className={`flex min-h-[40px] w-full items-center gap-3 rounded-[8px] px-3 text-left text-[14px] ${player === p.name ? "bg-chalk/12 text-chalk ring-1 ring-inset ring-flare" : "text-chalk hover:bg-turf-raised"}`}
                      >
                        <span className="w-6 text-right tabular-nums text-chalk-faint">{p.number}</span>
                        <span className="flex-1">{p.name}</span>
                        <span className="text-[12px] text-chalk-faint">{p.position}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-4 flex justify-between gap-2">
              <button type="button" onClick={() => setPlayer(null, null)} className="min-h-[40px] rounded-full px-3 text-[13px] font-semibold text-chalk-dim hover:text-chalk">
                {t("fan.clear")}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rc-press min-h-[40px] rounded-full bg-chalk px-5 text-[13px] font-semibold text-turf-deep">
                {t("fan.done")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.6l1.9 4.1 4.5.5-3.3 3.1.9 4.4L8 11.5l-4 2.2.9-4.4L1.6 6.2l4.5-.5z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
