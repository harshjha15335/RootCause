import { useTranslation } from "react-i18next";
import type { Evidence, Mode } from "../api/types";
import { BugName } from "../components/bits";
import { clock, pct, playerInfo } from "../lib/format";
import { chronological, rootLink } from "../lib/geometry";
import { Reveal, useSmoothScroll } from "../lib/motion";
import { go } from "../lib/nav";
import { breakdown } from "../lib/sample";
import { useMatch } from "../store/matchStore";
import { useSelectedEvidence, useTruth } from "../store/selectors";
import { useUi } from "../store/uiStore";
import { TimestackStory } from "./TimestackStory";

/** Everything the home page says about the featured goal, from the trace itself. */
function useFeatured(ev: Evidence | null) {
  const meta = useMatch((s) => s.meta);
  const goals = useMatch((s) => s.goals);
  useMatch((s) => s.replays);
  const truth = useTruth();
  if (!ev) return null;
  const root = rootLink(ev)!;
  const links = chronological(ev);
  return {
    ev,
    root,
    links,
    scorer: playerInfo(meta, ev.goal.player_id),
    culprit: playerInfo(meta, root.player_id),
    seconds: ev.goal.second - links[0].second,
    score: { home: goals.filter((g) => g.team === "home").length, away: goals.filter((g) => g.team === "away").length },
    brk: breakdown(root.evidence_id),
    found: truth ? truth.root_cause_player_id === root.player_id && truth.bug === root.bug_type : null,
  };
}
type F = NonNullable<ReturnType<typeof useFeatured>>;

export function Home() {
  useSmoothScroll();
  const f = useFeatured(useSelectedEvidence());
  return (
    <>
      <TimestackStory ev={f?.ev ?? null} />
      {f && <VerdictCard f={f} />}
      <Modes />
      <Footer />
    </>
  );
}

/** The verdict, on bone card stock. */
function VerdictCard({ f }: { f: F }) {
  const { t } = useTranslation();
  return (
    <section className="bg-turf-deep">
      <div className="mx-auto max-w-[1440px] px-5 pb-32 sm:px-10">
        <Reveal y={110}>
          <div className="paper grid gap-10 rounded-[32px] p-9 sm:p-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
            <div>
              <div className="text-[14px] font-medium text-chalk-dim">{t("cause.label")}</div>
              <div className="mt-5 font-display text-[clamp(64px,8vw,120px)] leading-[0.92] text-chalk">{f.culprit.name}</div>
              <p className="mt-5 text-[18px] text-chalk-dim">
                {f.culprit.club?.name} · {t(`pos.${f.culprit.position}`, { defaultValue: f.culprit.position ?? "" })} · <BugName code={f.root.bug_type} /> ·{" "}
                <span className="tabular-nums">{clock(f.root.second)}</span>
              </p>
            </div>
            <div>
              <div className="font-display text-[clamp(110px,12vw,180px)] leading-[0.8] text-flare tabular-nums">{pct(f.root.blame_percent)}</div>
              <div className="mt-4 text-[15px] text-chalk-dim">{t("cause.blame")}</div>
              <button
                type="button"
                onClick={() => go("explore")}
                className="rc-press mt-8 inline-flex h-[52px] items-center rounded-full bg-chalk px-7 text-[15px] font-semibold text-turf transition-opacity duration-200 hover:opacity-90"
              >
                {t("story.exploreCta")}
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const MODES: Mode[] = ["fan", "analyst", "studio"];

function Modes() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="modes-h" className="bg-turf-deep">
      <div className="mx-auto max-w-[1440px] px-5 pb-32 sm:px-10">
        <Reveal>
          <h2 id="modes-h" className="font-display text-[clamp(52px,6.4vw,104px)] leading-[0.95] text-chalk">
            {t("home.modesTitle")}
          </h2>
          <p className="mt-5 text-[18px] text-chalk-dim">{t("home.modesLede")}</p>
        </Reveal>
        <ul className="mt-14">
          {MODES.map((m, i) => (
            <Reveal as="li" key={m} delay={i * 4} className="border-t border-turf-edge last:border-b">
              <button
                type="button"
                onClick={() => {
                  useUi.getState().setMode(m);
                  go("explore");
                }}
                className="group grid w-full gap-3 py-9 text-left sm:grid-cols-[minmax(0,5fr)_minmax(0,6fr)_180px] sm:items-center sm:gap-10"
              >
                <span className="min-w-0 font-display text-[clamp(38px,4vw,64px)] leading-none text-chalk transition-[font-variation-settings] duration-500 [font-variation-settings:'wdth'_100] group-hover:[font-variation-settings:'wdth'_150]">
                  {t(`mode.${m}`)}
                </span>
                <span className="max-w-[30rem] text-[17px] leading-relaxed text-chalk-dim">{t(`home.${m}Body`)}</span>
                <span className="inline-flex items-center gap-2 text-[15px] font-medium text-chalk sm:justify-self-end">
                  {t("home.open", { mode: t(`mode.${m}`) })}
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="transition-transform duration-300 ease-out group-hover:translate-x-1">
                    <path d="M3 8h9m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-turf-edge bg-turf-deep">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-6 px-5 py-14 sm:px-10">
        <div className="font-display text-[clamp(44px,5vw,72px)] leading-none text-chalk">
          {t("home.titleA")} {t("home.titleB")} <em className="text-flare">{t("home.titleBug")}</em>
        </div>
        <p className="max-w-[26rem] text-[14px] leading-relaxed text-chalk-faint">{t("home.footer")}</p>
      </div>
    </footer>
  );
}


