import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { BugName, MomentButton, PlayerChip } from "../components/bits";
import { clock, playerInfo } from "../lib/format";
import { chainBounds, jumpTo } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { useTrace } from "../store/traceStore";
import { useUi } from "../store/uiStore";

/** The live feed: goals so far, then the event ticker. */
export function LiveMatch() {
  const { t } = useTranslation();
  const events = useMatch((s) => s.events);
  const goals = useMatch((s) => s.goals);
  const evidence = useMatch((s) => s.evidence);
  const untraced = useMatch((s) => s.untraced);
  const meta = useMatch((s) => s.meta);
  const second = useTrace((s) => s.second);
  const status = useMatch((s) => s.status);
  const shown = events.filter((e) => e.second <= second).slice(-14).reverse();

  return (
    <div className="space-y-6">
      <section aria-labelledby="goals-h">
        <h3 id="goals-h" className="font-display text-[17px] font-bold text-chalk">
          {t("live.goals")}
        </h3>
        {goals.length === 0 ? (
          <p className="mt-2 text-[15px] text-chalk-dim">{status === "connecting" ? t("live.connecting") : t("live.noGoals")}</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {goals.map((g) => {
              const ev = g.goalId ? evidence[g.goalId] : null;
              const root = ev?.links.find((l) => l.evidence_id === ev.root_cause_evidence_id);
              const club = playerInfo(meta, g.playerId).club;
              return (
                <li key={g.eventId} className="rounded-panel bg-turf-deep p-3 ring-1 ring-turf-edge">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] text-chalk">
                      <span className="font-semibold">{club?.short_name ?? g.team}</span> <PlayerChip id={g.playerId} />
                    </span>
                    <MomentButton second={g.second - 3} playerId={g.playerId} className="text-[13px] font-semibold text-chalk-dim tabular-nums hover:text-chalk">
                      {clock(g.second)}
                    </MomentButton>
                  </div>
                  {root ? (
                    <button
                      type="button"
                      className="rc-press mt-2 flex w-full items-center justify-between gap-2 rounded-lg bg-flare/10 px-3 py-2 text-left text-[14px] text-chalk ring-1 ring-flare/30 transition-colors duration-150 hover:bg-flare/15"
                      onClick={() => {
                        const tr = useTrace.getState();
                        tr.selectGoal(ev!.goal_id);
                        const b = chainBounds(ev!.goal_id)!;
                        tr.setWindow(b);
                        tr.setPhase("traced");
                        jumpTo(b[0], { play: true });
                        tr.setSpeed(0.5);
                        useUi.getState().setTab(useUi.getState().mode === "fan" ? "cause" : "trace");
                      }}
                    >
                      <span>
                        <span className="text-flare">{t("live.rootIs")}</span> <BugName code={root.bug_type} />, {playerInfo(meta, root.player_id).name}
                      </span>
                      <span aria-hidden="true" className="text-chalk-dim">
                        <svg width="14" height="14" viewBox="0 0 14 14"><path d="m5 3 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                      </span>
                    </button>
                  ) : untraced[g.eventId] ? (
                    <p className="mt-2 text-[13px] leading-relaxed text-chalk-dim">{t("live.untracedShort")}</p>
                  ) : (
                    <p className="mt-2 text-[13px] text-chalk-dim">{t("live.tracing")}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="ticker-h">
        <h3 id="ticker-h" className="font-display text-[17px] font-bold text-chalk">
          {t("live.ticker")}
        </h3>
        {shown.length === 0 ? (
          <p className="mt-2 text-[15px] text-chalk-dim">{t("live.waitingEvents")}</p>
        ) : (
          <ol className="mt-2" aria-live="off">
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((e) => (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                  className="flex items-baseline gap-3 border-b border-turf-edge/50 py-2 text-[14px] last:border-b-0"
                >
                  <span className="w-11 shrink-0 text-chalk-dim tabular-nums">{clock(e.second)}</span>
                  <span className={e.type === "goal" ? "font-semibold text-chalk" : "text-chalk-dim"}>{t(`event.${e.type}`)}</span>
                  <PlayerChip id={e.player_id} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </section>
    </div>
  );
}
