import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Evidence } from "../api/types";
import { Badge, BugName, Pill, RichText } from "../components/bits";
import { Pitch } from "../components/Pitch";
import { clock, pct, playerInfo, rate } from "../lib/format";
import { chronological, rootLink } from "../lib/geometry";
import { source } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { useExplanation, useFullTime, useReport } from "../store/selectors";
import { useUi } from "../store/uiStore";
import { ReplayGrid } from "./Counterfactual";
import { Sentences } from "./RootCause";
import type { GroundTruth } from "../api/types";

/**
 * Full-time Bug Report as one scroll story: the goal, the trace, the counterfactual, the root
 * cause, and whether the Debugger was right, then the match-wide summary.
 * Sticky chapters; GSAP ScrollTrigger turns scroll position into each chapter's progress.
 */
export function BugReport() {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const reduced = useUi((s) => s.reducedMotion);
  const report = useReport();
  const full = useFullTime();
  const featured: Evidence | undefined = [...full.traces].sort((a, b) => b.goal.second - a.goal.second)[0];
  const truth = useTruth();
  const finalHome = full.match?.score.home ?? 0;
  const finalAway = full.match?.score.away ?? 0;
  const total = finalHome + finalAway;

  useEffect(() => {
    if (reduced) return;
    let lenis: { destroy(): void; raf(t: number): void } | null = null;
    let raf = 0;
    let off = false;
    import("lenis").then(({ default: Lenis }) => {
      if (off) return;
      lenis = new Lenis({ duration: 1.1, easing: (x: number) => 1 - Math.pow(1 - x, 3) });
      const loop = (time: number) => {
        lenis!.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      off = true;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, [reduced]);

  return (
    <div className="pb-24">
      <section className="mx-auto max-w-[1200px] px-4 pb-10 pt-14 sm:px-8 sm:pt-20">
        <div className="flex items-center gap-3 text-[15px] text-chalk-dim">
          <Badge club={meta?.home ?? null} size={30} />
          <span className="font-display text-[22px] font-extrabold text-chalk tabular-nums">
            {meta?.home.short_name} {finalHome}–{finalAway} {meta?.away.short_name}
          </span>
          <Badge club={meta?.away ?? null} size={30} />
          {full.match && <Pill>{full.match.status === "finished" && !report.data?.provisional ? t("report.fullTime") : t("report.provisional")}</Pill>}
        </div>
        <h1 className="mt-6 max-w-[14ch] font-display text-[clamp(48px,9vw,120px)] font-black leading-[0.9] tracking-[-0.045em] text-chalk [font-stretch:115%]">
          {t("report.title")}
        </h1>
        <p className="mt-6 max-w-[56ch] text-[clamp(17px,1.6vw,20px)] leading-relaxed text-chalk-dim">
          {full.loading ? t("report.loading") : t("report.lede", { goals: total, traced: full.traces.length, home: meta?.home.name ?? "", away: meta?.away.name ?? "" })}
        </p>
      </section>

      {featured ? <Story ev={featured} truth={truth} /> : full.loading ? null : <EmptyStory />}

      <Summary traces={full.traces} total={total} />
    </div>
  );
}

function useTruth(): GroundTruth | null {
  const [truth, setTruth] = useState<GroundTruth | null>(null);
  useEffect(() => {
    if (source.kind !== "showcase") return;
    fetch(`${import.meta.env.BASE_URL}showcase/${source.matchId}/ground_truth.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setTruth)
      .catch(() => setTruth(null));
  }, []);
  return truth;
}

/** Turns a tall section's scroll position into 0..1 (GSAP ScrollTrigger, scrubbed). */
function useProgress(ref: React.RefObject<HTMLElement>, reduced: boolean): number {
  const [p, setP] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced || !ref.current) return;
    let kill = () => {};
    let off = false;
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (off || !ref.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const st = ScrollTrigger.create({
        trigger: ref.current,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (s) => setP(Math.round(s.progress * 200) / 200),
      });
      kill = () => st.kill();
    });
    return () => {
      off = true;
      kill();
    };
  }, [ref, reduced]);
  return p;
}

function Chapter({ title, children, visual, tall = true }: { n?: number; title: string; children: (p: number) => ReactNode; visual: (p: number) => ReactNode; tall?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useUi((s) => s.reducedMotion);
  const p = useProgress(ref, reduced);
  return (
    <section ref={ref} className={reduced || !tall ? "" : "h-[240svh]"} aria-label={title}>
      <div className={`${reduced || !tall ? "" : "sticky top-[var(--header-h)] h-[calc(100svh-var(--header-h))]"} mx-auto grid max-w-[1200px] content-center gap-6 px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12`}>
        <div className="order-2 lg:order-1">
          <h2 className="font-display text-[clamp(32px,4.4vw,56px)] font-extrabold leading-[0.98] tracking-[-0.03em] text-chalk [font-stretch:110%]">{title}</h2>
          <div className="mt-4 text-[17px] leading-relaxed text-chalk-dim">{children(p)}</div>
        </div>
        <div className="order-1 lg:order-2">{visual(p)}</div>
      </div>
    </section>
  );
}

function Story({ ev, truth }: { ev: Evidence; truth: GroundTruth | null }) {
  const { t } = useTranslation();
  const meta = useMatch((s) => s.meta);
  const explanation = useExplanation(ev.goal_id, true).data;
  const links = chronological(ev);
  const root = rootLink(ev)!;
  const scorer = playerInfo(meta, ev.goal.player_id);
  const culprit = playerInfo(meta, root.player_id);
  const first = Math.min(...links.map((l) => l.second)) - 2;
  const truthPlayer = truth ? playerInfo(meta, truth.root_cause_player_id) : null;
  const right = truth ? truth.root_cause_player_id === root.player_id && truth.bug === root.bug_type : null;

  return (
    <>
      <Chapter
        n={1}
        title={t("report.ch1", { name: scorer.name, time: clock(ev.goal.second) })}
        tall={false}
        visual={() => (
          <Frame caption={clock(ev.goal.second)}>
            <Pitch at={ev.goal.second} evidence={null} label={t("report.ch1", { name: scorer.name, time: clock(ev.goal.second) })} />
          </Frame>
        )}
      >
        {() => <p>{t("report.ch1Body", { club: scorer.club?.name ?? "", seconds: ev.goal.second - first })}</p>}
      </Chapter>

      <Chapter
        n={2}
        title={t("report.ch2")}
        visual={(p) => {
          const at = ev.goal.second - (ev.goal.second - first) * Math.min(1, p * 1.25);
          return (
            <Frame caption={clock(at)}>
              <Pitch at={Math.round(at * 4) / 4} evidence={p > 0.8 ? ev : null} focusEvidenceId={p > 0.8 ? root.evidence_id : null} label={t("report.ch2")} />
            </Frame>
          );
        }}
      >
        {(p) => (
          <>
            <p>{t("report.ch2Body")}</p>
            <ol className="mt-5 space-y-2">
              {[...links].reverse().map((l, i) => {
                const shown = p > 0.15 + i * (0.6 / links.length);
                const isRoot = l.evidence_id === ev.root_cause_evidence_id;
                return (
                  <li
                    key={l.evidence_id}
                    className={`rounded-lg px-3 py-2 font-trace text-[13px] ring-1 transition-[opacity,transform] duration-500 ease-out ${isRoot ? "text-flare ring-flare/50" : "text-chalk ring-turf-edge"} ${shown ? "opacity-100" : "translate-y-2 opacity-0"}`}
                  >
                    <span className="text-chalk-faint">at </span>
                    {l.bug_type.toLowerCase()} <span className="text-chalk-dim">#{playerInfo(meta, l.player_id).number} {clock(l.second)}</span>
                    <span className="float-right tabular-nums">{pct(l.blame_percent)}</span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Chapter>

      <Chapter
        n={3}
        title={t("report.ch3")}
        visual={(p) => {
          const k = Math.min(1, Math.max(0, (p - 0.15) / 0.6));
          const lit = Math.round(root.baseline_goals + (root.fixed_goals - root.baseline_goals) * k);
          return (
            <div className="rounded-panel bg-turf p-5 ring-1 ring-turf-edge sm:p-7">
              <div className="flex items-end justify-between gap-4">
                <div className="font-display text-[clamp(56px,9vw,112px)] font-black leading-[0.85] tracking-[-0.04em] text-chalk tabular-nums [font-stretch:112%]">
                  {pct(rate(lit, root.trials))}
                </div>
                <div className="pb-2 text-right text-[14px] text-chalk-dim tabular-nums">
                  {lit} / {root.trials}
                  <br />
                  {k < 0.5 ? t("whatif.withMistake") : t("whatif.withFix")}
                </div>
              </div>
              <div className="mt-6">
                <ReplayGrid trials={root.trials} lit={lit} compact />
              </div>
            </div>
          );
        }}
      >
        {() => (
          <p>
            {t("report.ch3Body", {
              name: culprit.name,
              before: pct(rate(root.baseline_goals, root.trials)),
              after: pct(rate(root.fixed_goals, root.trials)),
            })}
          </p>
        )}
      </Chapter>

      <Chapter
        n={4}
        title={t("report.ch4")}
        tall={false}
        visual={() => (
          <Frame caption={clock(root.second)}>
            <Pitch at={root.second} evidence={ev} focusEvidenceId={root.evidence_id} label={t("report.ch4")} />
          </Frame>
        )}
      >
        {() => (
          <div>
            <p className="font-display text-[clamp(22px,2.4vw,28px)] font-bold leading-snug text-chalk">
              {culprit.name}, <BugName code={root.bug_type} />, {clock(root.second)}. {t("studio.blame", { blame: pct(root.blame_percent) })}.
            </p>
            {explanation && (
              <div className="mt-4">
                <Sentences sentences={explanation.sentences} ev={ev} lang={explanation.lang} />
              </div>
            )}
          </div>
        )}
      </Chapter>

      <Chapter
        n={5}
        title={t("report.ch5")}
        tall={false}
        visual={() => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Verdict label={t("report.planted")} name={truthPlayer?.name ?? "—"} detail={truth ? `${t(`bug.${truth.bug}`)} · ${clock(truth.root_cause_clock_s)}` : t("report.noTruth")} />
            <Verdict label={t("report.found")} name={culprit.name} detail={`${t(`bug.${root.bug_type}`)} · ${clock(root.second)}`} flare />
            <div className="rounded-panel bg-turf p-5 ring-1 ring-turf-edge sm:col-span-2">
              <div className="text-[14px] text-chalk-dim">{t("report.accuracy")}</div>
              <div className="mt-1 font-display text-[28px] font-extrabold text-chalk">{t("report.notMeasured")}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-chalk-dim">{t("report.accuracyHow")}</p>
            </div>
          </div>
        )}
      >
        {() => <p>{right === null ? t("report.ch5Unknown") : right ? t("report.ch5Right") : t("report.ch5Wrong")}</p>}
      </Chapter>
    </>
  );
}

function Verdict({ label, name, detail, flare }: { label: string; name: string; detail: string; flare?: boolean }) {
  return (
    <div className={`rounded-panel bg-turf p-5 ring-1 ${flare ? "ring-flare/50" : "ring-turf-edge"}`}>
      <div className="text-[14px] text-chalk-dim">{label}</div>
      <div className={`mt-1 font-display text-[24px] font-extrabold leading-tight ${flare ? "text-flare" : "text-chalk"}`}>{name}</div>
      <div className="mt-1 text-[14px] text-chalk-dim">{detail}</div>
    </div>
  );
}

function Frame({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <figure className="overflow-hidden rounded-panel bg-turf ring-1 ring-turf-edge">
      <div className="aspect-[111/74]">{children}</div>
      <figcaption className="flex justify-end px-4 py-2 text-[13px] text-chalk-dim tabular-nums">{caption}</figcaption>
    </figure>
  );
}

function EmptyStory() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8">
      <p className="max-w-[56ch] text-[17px] leading-relaxed text-chalk-dim">{t("report.noTrace")}</p>
    </section>
  );
}

/** Match-wide: top root causes, recurring patterns, highlights running order. From GET /report. */
function Summary({ traces, total }: { traces: Evidence[]; total: number }) {
  const { t } = useTranslation();
  const report = useReport();
  const meta = useMatch((s) => s.meta);
  const r = report.data;
  const goalById = (id: string) => traces.find((e) => e.goal_id === id);

  return (
    <section className="mx-auto mt-10 max-w-[1200px] px-4 sm:px-8" aria-labelledby="summary-h">
      <h2 id="summary-h" className="font-display text-[clamp(32px,4.4vw,56px)] font-extrabold leading-[0.98] tracking-[-0.03em] text-chalk [font-stretch:110%]">
        {t("report.summary")}
      </h2>
      {report.isPending ? (
        <p className="mt-4 text-[17px] text-chalk-dim">{t("report.loading")}</p>
      ) : report.isError ? (
        <p className="mt-4 text-[17px] text-chalk-dim">{t("report.notYet")}</p>
      ) : r ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <Card title={t("report.topCauses")}>
            {r.top_causes.length ? (
              <ol className="space-y-2">
                {r.top_causes.map((c, i) => (
                  <li key={c} className="flex items-baseline justify-between gap-3 text-[16px] text-chalk">
                    <span>
                      <span className="mr-2 text-chalk-faint tabular-nums">{i + 1}</span>
                      <BugName code={c} />
                    </span>
                    <span className="text-chalk-dim tabular-nums">{t("report.times", { count: r.patterns[c] })}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-chalk-dim">{t("report.none")}</p>
            )}
          </Card>
          <Card title={t("report.highlights")}>
            <ol className="space-y-2">
              {r.highlight_order.map((id, i) => {
                const ev = goalById(id);
                const sc = ev ? playerInfo(meta, ev.goal.player_id) : null;
                return (
                  <li key={id} className="flex items-baseline gap-3 text-[16px] text-chalk">
                    <span className="text-chalk-faint tabular-nums">{i + 1}</span>
                    <span>
                      {sc?.name ?? id} <span className="text-chalk-dim tabular-nums">{ev ? clock(ev.goal.second) : ""}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
          <Card title={t("report.patterns")}>
            <p className="text-[16px] leading-relaxed text-chalk">
              {t("report.patternsBody", { traced: traces.length, total, untraced: total - traces.length })}
            </p>
            {r.report_warning && <p className="mt-2 text-[14px] text-chalk-dim">{r.report_warning}</p>}
          </Card>
          <div className="lg:col-span-3">
            <Card title={t("report.story")}>
              {r.goals.map((g) => (
                <div key={g.goal_id} lang={g.lang} className="max-w-[70ch] space-y-1.5 text-[17px] leading-relaxed text-chalk">
                  {g.translation_warning && <Pill tone="flare">{t("explain.translationFallback")}</Pill>}
                  {g.sentences.map((s, i) => (
                    <p key={i}>
                      <RichText text={s.text} evidenceId={s.evidence_ids[0]} />
                    </p>
                  ))}
                </div>
              ))}
            </Card>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-panel bg-turf p-5 ring-1 ring-turf-edge">
      <h3 className="mb-3 text-[14px] font-semibold text-chalk-dim">{title}</h3>
      {children}
    </div>
  );
}
