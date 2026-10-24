import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDemos } from "../api/demos";
import { SHOWCASE_MATCH } from "../api/rest";
import { useUi } from "../store/uiStore";
import { MatchLab } from "./match/lab/MatchLab";
import { MatchStory } from "./match/lab/MatchStory";

/**
 * The Tactics Lab tab: the whole match replayed on a live pitch with a coach and one feature at a
 * time (Space raises the ground under whoever owns it), the numbers of this moment beside it, and
 * below, the match told chapter by chapter with every stat in plain words.
 */
export function TacticsLab() {
  const { t } = useTranslation();
  const meta = useDemos().find((d) => d.id === SHOWCASE_MATCH)?.meta ?? null;
  const seek = useRef<((s: number) => void) | null>(null);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = `${t("nav.lab")} · Root Cause`;
  }, [t]);
  const watch = (s: number) => {
    seek.current?.(s);
    top.current?.scrollIntoView({ behavior: useUi.getState().reducedMotion ? "auto" : "smooth", block: "start" });
  };
  return (
    <div className="min-h-[calc(100dvh-var(--header-h))] bg-turf-deep pb-24">
      <section className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-8 sm:pt-12">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-chalk-faint">
          {t("nav.lab")}
          {meta ? ` · ${meta.home.name} v ${meta.away.name}` : ""}
        </p>
        <h1 className="mt-2 font-display text-[clamp(30px,4.6vw,60px)] font-extrabold leading-[0.98] tracking-display text-chalk [text-wrap:balance]">{t("tlab.topo.title")}</h1>
        <p className="mt-3 max-w-[62ch] text-[16px] leading-relaxed text-chalk-dim">{t("tlab.topo.sub")}</p>
        <div ref={top} className="mt-6 scroll-mt-[calc(var(--header-h)+12px)]">
          <MatchLab matchId={SHOWCASE_MATCH} control={seek} />
        </div>
        <MatchStory matchId={SHOWCASE_MATCH} onWatch={watch} />
      </section>
    </div>
  );
}
