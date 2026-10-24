import { useTranslation } from "react-i18next";
import type { Evidence } from "../api/types";
import { MomentButton, Pill, RichText } from "../components/bits";
import { clock, pct, playerInfo } from "../lib/format";
import { rootLink } from "../lib/geometry";
import { useMatch } from "../store/matchStore";
import { useExplanation } from "../store/selectors";

/**
 * Studio mode: a broadcast segment. Timing cues come from the explanation's highlights
 * (start/end seconds) and the lower-third fields from the evidence, ready for graphics.
 */
export function StudioScript({ ev }: { ev: Evidence }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const exp = useExplanation(ev.goal_id).data;
  const root = rootLink(ev)!;
  const info = playerInfo(meta, root.player_id);
  const scorer = playerInfo(meta, ev.goal.player_id);
  const cues = [...(exp?.highlights ?? [])].sort((a, b) => a.start_second - b.start_second);

  return (
    <div className="space-y-5">
      <section aria-labelledby="lt-h" className="rounded-panel bg-turf-deep p-4 ring-1 ring-turf-edge">
        <h3 id="lt-h" className="text-[13px] font-semibold text-chalk-dim">{t("studio.lowerThird")}</h3>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
          <dt className="text-chalk-dim">{t("studio.line1")}</dt>
          <dd className="font-semibold text-chalk">{info.name} ({info.number}), {info.club?.short_name}</dd>
          <dt className="text-chalk-dim">{t("studio.line2")}</dt>
          <dd className="text-chalk">{t(`bug.${root.bug_type}`)} · {clock(root.second)} · {t("studio.blame", { blame: pct(root.blame_percent) })}</dd>
          <dt className="text-chalk-dim">{t("studio.goal")}</dt>
          <dd className="text-chalk">{scorer.name} · {clock(ev.goal.second)}</dd>
        </dl>
      </section>

      <section aria-labelledby="cues-h">
        <div className="flex items-center gap-2">
          <h3 id="cues-h" className="font-display text-[17px] font-bold text-chalk">{t("studio.cues")}</h3>
          {exp?.source === "evidence-only" && <Pill>{t("explain.evidenceOnly")}</Pill>}
        </div>
        <ol className="mt-3 space-y-2">
          <Cue at={ev.goal.second - 6} to={ev.goal.second} label={t("studio.cueGoal")} />
          {cues.map((c) => (
            <Cue key={c.evidence_id + c.start_second} at={c.start_second} to={c.end_second} evidenceId={c.evidence_id} playerId={ev.links.find((l) => l.evidence_id === c.evidence_id)?.player_id}>
              <RichText text={c.caption.text} evidenceId={c.evidence_id} />
            </Cue>
          ))}
        </ol>
      </section>

      <section aria-labelledby="vo-h">
        <h3 id="vo-h" className="font-display text-[17px] font-bold text-chalk">{t("studio.voiceover")}</h3>
        {exp ? (
          <ol className="mt-3 space-y-2 text-[16px] leading-relaxed text-chalk" lang={exp.lang}>
            {exp.recaps.studio.map((s, i) => (
              <li key={i}>
                <RichText text={s.text} evidenceId={s.evidence_ids[0]} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-[15px] text-chalk-dim">{t("explain.waiting")}</p>
        )}
      </section>
    </div>
  );
}

function Cue({ at, to, label, children, evidenceId, playerId }: { at: number; to: number; label?: string; children?: React.ReactNode; evidenceId?: string; playerId?: string }) {
  return (
    <li className="flex gap-3 rounded-lg bg-turf-deep px-3 py-2.5 ring-1 ring-turf-edge">
      <MomentButton second={at} playerId={playerId} evidenceId={evidenceId} className="shrink-0 text-left font-trace text-[13px] text-chalk tabular-nums underline decoration-chalk-faint underline-offset-4 hover:decoration-flare">
        {clock(at)}–{clock(to + 1)}
      </MomentButton>
      <div className="min-w-0 text-[14px] leading-relaxed text-chalk">{label ?? children}</div>
    </li>
  );
}
