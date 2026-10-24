import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Evidence, Link } from "../api/types";
import { BugName, CountUp, MomentButton, PlayerChip } from "../components/bits";
import { clock, rate } from "../lib/format";
import { rootLink } from "../lib/geometry";
import { breakdown } from "../lib/sample";
import { chainBounds, fixedTracks, jumpTo } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { useTrace } from "../store/traceStore";

/**
 * What happened vs. the same play with one mistake fixed. The pitch morphs between the
 * recorded match and one recorded fixed replay; the grid shows all 200 replays as counts.
 */
export function Counterfactual({ ev }: { ev: Evidence }) {
  const { t } = useTranslation();
  const morph = useTrace((s) => s.morphTarget);
  const morphId = useTrace((s) => s.morphEvidenceId);
  const replays = useMatch((s) => s.replays[ev.goal_id]);
  const [linkId, setLinkId] = useState(() => rootLink(ev)?.evidence_id ?? ev.links[0]?.evidence_id);
  const link = ev.links.find((l) => l.evidence_id === linkId) ?? ev.links[0];
  const fixed = morph === 1 && morphId === link.evidence_id;
  const hasReplay = fixedTracks.has(link.evidence_id);
  const brk = breakdown(link.evidence_id);
  const before = rate(link.baseline_goals, link.trials);
  const after = rate(link.fixed_goals, link.trials);

  useEffect(() => () => useTrace.getState().setMorph(0), []);

  const show = (on: boolean) => {
    const tr = useTrace.getState();
    tr.setMorph(on ? 1 : 0, link.evidence_id);
    tr.pin(link.evidence_id, link.player_id);
    const b = chainBounds(ev.goal_id);
    if (b) {
      tr.setWindow(b);
      jumpTo(Math.max(b[0], link.second - 2), { play: true });
      tr.setSpeed(0.5);
    }
  };

  return (
    <div className="space-y-5">
      {ev.links.length > 1 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("whatif.pick")}>
          {ev.links.map((l) => (
            <button
              key={l.evidence_id}
              type="button"
              role="radio"
              aria-checked={l.evidence_id === link.evidence_id}
              onClick={() => {
                setLinkId(l.evidence_id);
                if (fixed) useTrace.getState().setMorph(1, l.evidence_id);
              }}
              className={`rc-press min-h-[38px] rounded-full px-3 text-[13px] font-semibold ring-1 transition-colors duration-150 ${
                l.evidence_id === link.evidence_id ? "bg-turf-raised text-chalk ring-chalk/60" : "text-chalk-dim ring-turf-edge hover:text-chalk"
              }`}
            >
              <LinkLabel l={l} />
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-full bg-turf-deep p-1 ring-1 ring-turf-edge">
        {[false, true].map((on) => (
          <button
            key={String(on)}
            type="button"
            aria-pressed={fixed === on}
            disabled={on && !hasReplay}
            onClick={() => show(on)}
            className={`rc-press min-h-[42px] rounded-full text-[14px] font-semibold transition-colors duration-200 ease-out disabled:opacity-50 ${
              fixed === on ? "bg-chalk text-turf-deep" : "text-chalk-dim hover:text-chalk"
            }`}
          >
            {on ? t("whatif.fixed") : t("whatif.happened")}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-4">
        <Rate label={t("whatif.withMistake")} value={before} goals={link.baseline_goals} trials={link.trials} dim={fixed} />
        <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true" className="mb-6 shrink-0 text-chalk-faint">
          <path d="M2 10h22m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Rate label={t("whatif.withFix")} value={after} goals={link.fixed_goals} trials={link.trials} dim={!fixed} />
      </div>

      <ReplayGrid trials={link.trials} lit={fixed ? link.fixed_goals : link.baseline_goals} />
      <p className="text-[13px] leading-relaxed text-chalk-dim">
        {t("whatif.gridCaption", { trials: link.trials, goals: fixed ? link.fixed_goals : link.baseline_goals })}
      </p>

      <div className="rounded-panel bg-turf-deep p-4 ring-1 ring-turf-edge">
        <p className="text-[15px] leading-relaxed text-chalk">
          {t("whatif.same")} <PlayerChip id={link.player_id} evidenceId={link.evidence_id} /> {t(`fix.${link.bug_type}`, { defaultValue: t("fix.generic") })}
        </p>
        {brk && replays?.[link.evidence_id] && (
          <p className="mt-2 text-[15px] leading-relaxed text-chalk-dim">
            {t("whatif.oneReplay")}{" "}
            <MomentButton second={brk.second} playerId={link.player_id} evidenceId={link.evidence_id} className="font-semibold text-chalk underline decoration-flare decoration-2 underline-offset-4">
              {t(`note.${brk.note}`, { time: clock(brk.second) })}
            </MomentButton>
          </p>
        )}
        {!hasReplay && <p className="mt-2 text-[13px] text-chalk-dim">{t("whatif.noReplay")}</p>}
      </div>
    </div>
  );
}

function LinkLabel({ l }: { l: Link }) {
  return (
    <>
      <span className="tabular-nums">{clock(l.second)}</span> <BugName code={l.bug_type} />
    </>
  );
}

function Rate({ label, value, goals, trials, dim }: { label: string; value: number; goals: number; trials: number; dim: boolean }) {
  return (
    <div className={`min-w-0 flex-1 transition-opacity duration-300 ease-out ${dim ? "opacity-55" : ""}`}>
      <div className="text-[13px] text-chalk-dim">{label}</div>
      <CountUp value={value} className="block font-display text-[clamp(40px,7vw,64px)] font-extrabold leading-none tracking-[-0.03em] text-chalk [font-stretch:110%]" />
      <div className="mt-1 text-[13px] text-chalk-dim tabular-nums">
        {goals} / {trials}
      </div>
    </div>
  );
}

/** 200 replays as 200 cells; filled cells are replays that still ended in the goal. */
export function ReplayGrid({ trials, lit, compact = false }: { trials: number; lit: number; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-[repeat(20,minmax(0,1fr))] ${compact ? "gap-[3px]" : "gap-1"}`} role="img" aria-label={`${lit} of ${trials}`}>
      {Array.from({ length: trials }, (_, i) => {
        const on = i < lit;
        return (
          <span
            key={i}
            className={`aspect-square rounded-[2px] transition-[background-color,transform] duration-300 ease-out ${on ? "bg-chalk" : "scale-[0.55] bg-turf-edge"}`}
            style={{ transitionDelay: `${(i % 20) * 12 + Math.floor(i / 20) * 18}ms` }}
          />
        );
      })}
    </div>
  );
}
