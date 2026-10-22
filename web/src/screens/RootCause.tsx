import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentStep, CitedSentence, Evidence } from "../api/types";
import { BugName, CountUp, MomentButton, Pill, RichText } from "../components/bits";
import { clock, pct, playerInfo, tidyNumbers } from "../lib/format";
import { rootLink } from "../lib/geometry";
import { jumpTo } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { useExplanation } from "../store/selectors";
import { useTrace } from "../store/traceStore";
import { useUi } from "../store/uiStore";

export function RootCause({ ev }: { ev: Evidence }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const mode = useUi((s) => s.mode);
  const root = rootLink(ev)!;
  const info = playerInfo(meta, root.player_id);
  const q = useExplanation(ev.goal_id);
  const exp = q.data;
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const text = t("cause.shareText", {
      name: info.name,
      club: info.club?.name ?? "",
      bug: t(`bug.${root.bug_type}`, { defaultValue: root.bug_type }),
      time: clock(root.second),
      blame: pct(root.blame_percent),
    });
    try {
      if (navigator.share) await navigator.share({ title: "Root Cause", text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      /* the user closed the share sheet */
    }
  };

  return (
    <div className="space-y-5">
      <article className="relative overflow-hidden rounded-panel bg-turf-deep ring-1 ring-flare/50">
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <Pill tone="flare">{t("cause.label")}</Pill>
            <MomentButton second={root.second} playerId={root.player_id} evidenceId={root.evidence_id} className="text-[13px] font-semibold text-chalk-dim tabular-nums hover:text-chalk">
              {clock(root.second)}
            </MomentButton>
          </div>
          <MomentButton second={root.second} playerId={root.player_id} evidenceId={root.evidence_id} className="mt-4 block text-left">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-[44px] font-extrabold leading-[0.9] text-flare tabular-nums [font-stretch:110%]">{info.number}</span>
              <span className="font-display text-[clamp(26px,3.2vw,34px)] font-extrabold leading-[1.02] tracking-[-0.02em] text-chalk [font-stretch:108%]">{info.name}</span>
            </div>
          </MomentButton>
          <div className="mt-2 flex items-center gap-2 text-[14px] text-chalk-dim">
            <span className="h-2.5 w-2.5 rounded-full ring-1 ring-chalk/40" style={{ background: info.club?.kit_primary }} aria-hidden="true" />
            {info.club?.name}
            {info.position && <span>· {t(`pos.${info.position}`, { defaultValue: info.position })}</span>}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-turf-edge/70 pt-4">
            <div>
              <div className="text-[13px] text-chalk-dim">{t("cause.mistake")}</div>
              <div className="mt-0.5 text-[17px] font-semibold text-chalk">
                <BugName code={root.bug_type} />
              </div>
              {mode === "analyst" && <div className="mt-0.5 font-trace text-[12px] text-chalk-faint">{root.bug_type}</div>}
            </div>
            <div>
              <div className="text-[13px] text-chalk-dim">{t("cause.blame")}</div>
              <CountUp value={root.blame_percent} className="mt-0.5 block font-display text-[30px] font-extrabold leading-none text-chalk" />
            </div>
          </div>
        </div>
      </article>

      <section aria-labelledby="explain-h" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="explain-h" className="font-display text-[17px] font-bold text-chalk">
            {t(`explain.title.${mode}`)}
          </h3>
          {exp?.status === "pending" && <Pill>{t("explain.pending")}</Pill>}
          {exp?.source === "evidence-only" && <Pill>{t("explain.evidenceOnly")}</Pill>}
          {exp?.translation_warning && <Pill tone="flare">{t("explain.translationFallback")}</Pill>}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {exp ? (
            <motion.div
              key={`${mode}-${exp.lang}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <Sentences sentences={exp.sentences} ev={ev} lang={exp.lang} />
            </motion.div>
          ) : (
            <motion.p key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[15px] leading-relaxed text-chalk-dim">
              {q.isError ? t("explain.failed") : t("explain.waiting")}
            </motion.p>
          )}
        </AnimatePresence>
      </section>

      <AgentSteps goalId={ev.goal_id} />

      {mode === "fan" && (
        <button type="button" onClick={share} className="rc-press min-h-[44px] w-full rounded-full bg-chalk text-[14px] font-bold text-turf-deep transition-colors duration-150 hover:bg-white">
          {copied ? t("cause.copied") : t("cause.share")}
        </button>
      )}
    </div>
  );
}

/** Every sentence is linked to its evidence: click to replay that moment. */
export function Sentences({ sentences, ev, lang }: { sentences: CitedSentence[]; ev: Evidence; lang?: string }) {
  const focus = useTrace((s) => s.focus.evidenceId);
  return (
    <ol className="space-y-1" lang={lang}>
      {sentences.map((s, i) => {
        const eid = s.evidence_ids[0] ?? null;
        const link = ev.links.find((l) => l.evidence_id === eid);
        const on = eid !== null && focus === eid;
        return (
          <li key={i}>
            <div
              role="button"
              tabIndex={0}
              onPointerEnter={() => useTrace.getState().hover(eid, link?.player_id ?? null)}
              onPointerLeave={() => useTrace.getState().hover(null, null)}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                if (!link) return;
                useTrace.getState().pin(eid, link.player_id);
                jumpTo(link.second - 1, { play: true });
                useTrace.getState().setSpeed(0.5);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && link) {
                  useTrace.getState().pin(eid, link.player_id);
                  jumpTo(link.second - 1, { play: true });
                }
              }}
              className={`-mx-2 cursor-pointer rounded-lg px-2 py-1.5 text-[16px] leading-relaxed transition-colors duration-150 ease-out ${
                on ? "bg-turf-raised text-chalk" : "text-chalk hover:bg-turf-raised/60"
              } ${s.kind === "root" ? "font-semibold" : ""}`}
            >
              <RichText text={s.text} evidenceId={eid} />
              {link && <span className="ml-1.5 text-[12px] text-chalk-faint tabular-nums">{clock(link.second)}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const AGENTS = ["explainer", "highlights", "recap", "persona"] as const;

/** The agents' work, visible as it happens: Explainer, Highlights, Recap, Persona. */
export function AgentSteps({ goalId }: { goalId: string }) {
  const { t } = useTranslation();
  const steps = useMatch((s) => s.steps[goalId] ?? []);
  const ready = useMatch((s) => Boolean(s.explanations[goalId]));
  const latest = (agent: string): AgentStep | undefined => [...steps].reverse().find((s) => s.agent === agent);
  return (
    <section aria-labelledby="agents-h" className="rounded-panel bg-turf-deep p-4 ring-1 ring-turf-edge">
      <h3 id="agents-h" className="text-[13px] font-semibold text-chalk-dim">
        {t("agents.title")}
      </h3>
      <ol className="mt-3 space-y-2.5" aria-live="polite">
        {AGENTS.map((a, i) => {
          const s = latest(a);
          const personas = steps.filter((x) => x.agent === "persona").map((x) => x.mode).filter(Boolean);
          const done = Boolean(s) && s!.status !== "started";
          const running = !s && (i === 0 ? steps.length > 0 : Boolean(latest(AGENTS[i - 1]))) && !ready;
          return (
            <motion.li
              key={a}
              initial={false}
              animate={{ opacity: s || running ? 1 : 0.5 }}
              className="flex items-start gap-3 text-[14px]"
            >
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center" aria-hidden="true">
                {done ? (
                  <svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="#eef0e6" /><path d="m5.5 9.2 2.3 2.3 4.7-4.9" fill="none" stroke="#0f1e19" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : running ? (
                  <span className="h-3 w-3 rounded-full border-2 border-chalk border-t-transparent rc-spin" />
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full ring-1 ring-chalk-faint" />
                )}
              </span>
              <span className="min-w-0">
                <span className="font-semibold text-chalk">{t(`agents.${a}`)}</span>{" "}
                <span className="text-chalk-dim">
                  {s ? t(`agents.status.${s.status}`, { defaultValue: s.status }) : running ? t("agents.working") : t("agents.waiting")}
                  {a === "persona" && personas.length > 0 && ` · ${personas.map((m) => t(`mode.${m}`)).join(", ")}`}
                </span>
              </span>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}

export function tidy(text: string) {
  return tidyNumbers(text);
}
