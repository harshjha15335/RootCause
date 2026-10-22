import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { Evidence } from "../api/types";
import { BlameBar, BugName, MomentButton, PlayerChip } from "../components/bits";
import { clock, playerInfo, rate } from "../lib/format";
import { useMatch } from "../store/matchStore";
import { useTrace } from "../store/traceStore";
import { useUi } from "../store/uiStore";

/**
 * The goal's causal chain as a stack trace: the goal on top, the root cause at the bottom,
 * like the innermost frame of an exception. Frames are in the order the play happened,
 * read upward from the root.
 */
export function StackTrace({ ev }: { ev: Evidence }) {
  const { t } = useTranslation();
  const mode = useUi((s) => s.mode);
  const meta = useMatch((s) => s.meta);
  const focus = useTrace((s) => s.focus);
  const frames = [...ev.links].sort((a, b) => b.second - a.second); // latest first, earliest last
  const scorer = playerInfo(meta, ev.goal.player_id);
  const analyst = mode === "analyst";

  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-chalk-dim">{t("trace.lede", { count: ev.links.length })}</p>
      <ol className="overflow-hidden rounded-panel bg-turf-deep ring-1 ring-turf-edge" aria-label={t("trace.title")}>
        <motion.li
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="border-b border-turf-edge/70 px-4 py-3"
        >
          <MomentButton second={ev.goal.second} playerId={ev.goal.player_id} className="w-full text-left">
            <div className="flex items-baseline justify-between gap-3 font-trace text-[13px]">
              <span className="text-chalk">
                <span className="text-chalk-faint">{t("trace.goalFrame")}</span> {scorer.club?.short_name ?? ev.goal.team} #{scorer.number}
              </span>
              <span className="tabular-nums text-chalk-dim">{clock(ev.goal.second)}</span>
            </div>
            <div className="mt-1 text-[15px] text-chalk">{t("trace.goalLine", { name: scorer.name })}</div>
          </MomentButton>
        </motion.li>
        {frames.map((l, i) => {
          const root = l.evidence_id === ev.root_cause_evidence_id;
          const on = focus.evidenceId === l.evidence_id;
          return (
            <motion.li
              key={l.evidence_id}
              // frames arrive one by one, walking back from the goal
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.25 + i * 0.32, ease: [0.23, 1, 0.32, 1] }}
              className={`relative border-b border-turf-edge/70 last:border-b-0 ${root ? "bg-flare/[0.07]" : ""} ${on ? "bg-turf-raised" : ""} transition-colors duration-150`}
            >
              {root && <span className="absolute inset-y-0 left-0 w-[3px] bg-flare" aria-hidden="true" />}
              <MomentButton second={l.second} playerId={l.player_id} evidenceId={l.evidence_id} className="block w-full px-4 py-3 text-left">
                <div className="flex items-baseline justify-between gap-3 font-trace text-[13px]">
                  <span className={root ? "text-flare" : "text-chalk"}>
                    <span className="text-chalk-faint">at </span>
                    {analyst ? l.bug_type.toLowerCase() : <BugName code={l.bug_type} />}
                    {analyst && <span className="text-chalk-faint">({l.player_id})</span>}
                  </span>
                  <span className="tabular-nums text-chalk-dim">{clock(l.second)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[15px] text-chalk">
                  <PlayerChip id={l.player_id} evidenceId={l.evidence_id} full />
                  {root && <span className="text-[13px] font-semibold text-flare">{t("trace.rootCause")}</span>}
                </div>
                <div className="mt-2.5">
                  <BlameBar link={l} root={root} delay={400 + i * 320} />
                </div>
                <div className="mt-1.5 text-[13px] text-chalk-dim tabular-nums">
                  {t("trace.dropLine", {
                    before: Math.round(rate(l.baseline_goals, l.trials)),
                    after: Math.round(rate(l.fixed_goals, l.trials)),
                  })}
                  {analyst && (
                    <span className="text-chalk-faint">
                      {" "}
                      ({l.baseline_goals}/{l.trials} → {l.fixed_goals}/{l.trials})
                    </span>
                  )}
                </div>
                {analyst && <div className="mt-1.5 font-trace text-[12px] leading-relaxed text-chalk-faint">{l.evidence_id}</div>}
              </MomentButton>
            </motion.li>
          );
        })}
      </ol>
      <p className="text-[13px] leading-relaxed text-chalk-dim">{t("trace.howBlame")}</p>
    </div>
  );
}
