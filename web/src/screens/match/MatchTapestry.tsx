import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAnalysis, type Stacks } from "../../api/analysis";
import { useLab } from "../../lab/data";
import { quality } from "../../lib/device";
import { useUi } from "../../store/uiStore";
import { TAP_AWAY, TAP_GOLD, TAP_HOME, type TapStage } from "./tapestry";
import { buildTapestry, type Tapestry } from "./tapestryModel";
import "./tapestry.css";

/**
 * The Match Tapestry: the whole match as one woven cloth. The stage (tapestry.ts) draws it and
 * reports the minute under the needle or the goal that was cut open; this card reads it in words.
 */
export function MatchTapestry({ s, matchId, autopsyHref }: { s: Stacks; matchId: string; autopsyHref(goal: string): string }) {
  const { t } = useTranslation();
  const lab = useLab(matchId);
  const an = useAnalysis(matchId);
  const data = useMemo(() => (lab.data && !an.isLoading ? buildTapestry(lab.data, an.data ?? null, s) : null), [lab.data, an.data, an.isLoading, s]);
  const [minute, setMinute] = useState(45);
  const [goal, setGoal] = useState<number | null>(null);
  const [intro, setIntro] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const stage = useRef<TapStage | null>(null);
  const lang = useUi((u) => u.lang);
  const reduced = useUi((u) => u.reducedMotion) || quality.reducedMotion;

  const club = (team: number) => (lab.data ? lab.data.clubs[team].name.replace(/\s+(FC|AFC|CF)$/i, "") : "");
  const name = (id: string) => s.names[id]?.name ?? id;
  const sur = (id: string) => name(id).split(" ").slice(-1)[0];

  const fit = () => {
    const el = host.current;
    if (!el || !stage.current) return;
    const phone = el.clientWidth < 700;
    stage.current.resize(el.clientWidth, el.clientHeight, phone, phone ? 0 : (card.current?.offsetWidth ?? 0) + 32, phone ? (card.current?.offsetHeight ?? 0) : 0);
  };

  useEffect(() => {
    if (!data || !canvas.current || !overlay.current || !host.current) return;
    let dead = false;
    const D = data;
    void import("./tapestry").then(({ createTapestry }) => {
      if (dead || !canvas.current || !overlay.current || !host.current) return;
      const phone = host.current.clientWidth < 700;
      stage.current = createTapestry(canvas.current, D, {
        reduced,
        dpr: Math.min(devicePixelRatio, phone ? 1.5 : 2),
        overlay: overlay.current,
        bands: t("match.tap.bands", { returnObjects: true }) as [string, string, string],
        halfTime: t("match.tap.halfTime"),
        goalTag: (gi) => t("match.tap.tag", { name: sur(D.goals[gi].scorer), min: Math.floor(D.goals[gi].s / 60) }),
        scorerTag: (gi) => t("match.tap.scorer", { name: sur(D.goals[gi].scorer) }),
        culpritTag: (gi) => {
          const v = D.goals[gi].verdict;
          if (!v) return null;
          return v.behind ? t("match.tap.culprit", { name: sur(v.culprit), m: v.behind.toFixed(0) }) : t("match.tap.culpritPlain", { name: sur(v.culprit) });
        },
        onMinute: (m) => { setMinute(m); setIntro(false); },
        onGoal: setGoal,
      });
      fit();
    });
    return () => {
      dead = true;
      stage.current?.dispose();
      stage.current = null;
    };
    // the stage is built once per match and language; minute and goal flow through its callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, lang, reduced]);

  useEffect(() => {
    const ro = new ResizeObserver(fit);
    if (host.current) ro.observe(host.current);
    if (card.current) ro.observe(card.current);
    return () => ro.disconnect();
  });

  return (
    <div ref={host} className="relative h-[min(92svh,820px)] overflow-hidden rounded-[22px] bg-[#0d0b12] sm:h-[min(76svh,620px)]">
      <canvas ref={canvas} className="absolute inset-0 block h-full w-full cursor-crosshair [touch-action:pan-y]" aria-label={t("match.tap.title")} />
      <div ref={overlay} className="tap-overlay" aria-hidden="true" />
      {!data && <p className="absolute inset-0 grid place-items-center text-[15px] text-[#b9b0c4]">{lab.error ? t("match.failed") : t("match.tap.loading")}</p>}
      {data && (
        <div
          ref={card}
          aria-live="polite"
          className="absolute inset-x-0 bottom-0 max-h-[50%] overflow-y-auto border-t border-white/10 bg-[#13101a]/90 p-4 text-[#f6f1e7] backdrop-blur-xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:max-h-[calc(100%-32px)] sm:w-[340px] sm:rounded-[18px] sm:border sm:p-5"
        >
          {goal !== null ? (
            <GoalCard D={data} gi={goal} club={club} name={name} autopsyHref={autopsyHref} onSew={() => stage.current?.openGoal(null)} />
          ) : intro ? (
            <Intro club={club} />
          ) : (
            <MinuteCard D={data} m={minute} club={club} onHow={() => setIntro(true)} />
          )}
          {goal === null && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <label className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#b9b0c4]">
                <span className="w-[54px] shrink-0">{t("match.tap.scrub")}</span>
                <input
                  type="range"
                  min={0}
                  max={89}
                  step={1}
                  value={Math.min(89, Math.floor(minute))}
                  onChange={(e) => stage.current?.setMinute(Number(e.target.value) + 0.5)}
                  className="h-8 w-full accent-[#f6f1e7]"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="w-[54px] shrink-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#b9b0c4]">{t("match.tap.goals")}</span>
                {data.goals.map((g, gi) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => stage.current?.openGoal(gi)}
                    className="rc-press min-h-[32px] rounded-full px-3 text-[12px] font-bold"
                    style={{ background: TAP_GOLD, color: "#15111c" }}
                  >
                    {t("match.tap.tag", { name: sur(g.scorer), min: Math.floor(g.s / 60) })}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** "**x**" in a translated string becomes bold */
function rich(str: string): ReactNode {
  return str.split("**").map((p, i) => (i % 2 ? <b key={i} className="font-semibold text-[#f6f1e7]">{p}</b> : p));
}

const eyebrow = "font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#ffd75e]";
const head = "mt-2 font-display text-[22px] font-extrabold uppercase leading-[1.02] sm:text-[26px]";
const body = "mt-2 text-[14.5px] leading-snug text-[#b9b0c4]";

function Intro({ club }: { club(t: number): string }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    ["linear-gradient(90deg,#3a3446,#f6f1e7)", t("match.tap.legend.time")],
    [TAP_HOME, t("match.tap.legend.home", { team: club(0) })],
    [TAP_AWAY, t("match.tap.legend.away", { team: club(1) })],
    ["linear-gradient(180deg,#f6f1e7 0 30%,transparent 30% 70%,#f6f1e7 70%)", t("match.tap.legend.bands")],
    [TAP_GOLD, t("match.tap.legend.gold")],
  ];
  return (
    <div>
      <p className={eyebrow}>{t("match.tap.how")}</p>
      <h3 className={head}>{t("match.tap.title")}</h3>
      <ul className="mt-3 grid gap-2">
        {rows.map(([bg, text]) => (
          <li key={text} className="grid grid-cols-[26px_1fr] items-center gap-2.5 text-[14px] leading-snug text-[#b9b0c4]">
            <span className="h-3 rounded-[3px]" style={{ background: bg }} />
            <span>{rich(text)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-snug text-[#8c8398]">{t("match.tap.note")}</p>
    </div>
  );
}

function MinuteCard({ D, m, club, onHow }: { D: Tapestry; m: number; club(t: number): string; onHow(): void }) {
  const { t } = useTranslation();
  const mi = Math.max(0, Math.min(89, Math.floor(m)));
  const sofar = D.goals.filter((g) => g.s / 60 <= m);
  const a = sofar.filter((g) => g.side === "home").length, b = sofar.length - a;
  const win = <T,>(arr: T[], f: (r: T) => number) => arr.slice(Math.max(0, mi - 4), mi + 1).reduce((s, r) => s + f(r), 0);
  const ctrl = [0, 1, 2].map((l) => win(D.ctrl, (r) => r[l]) / Math.min(5, mi + 1));
  const ph = win(D.press, (p) => p[0]), pa = win(D.press, (p) => p[1]);
  const lanes = [0, 1, 2].map((l) => win(D.att, (r) => r[0][l] + r[1][l]));
  const best = Math.max(...lanes);
  const bands = t("match.tap.bands", { returnObjects: true }) as string[];
  const lower = t("match.tap.bandsLower", { returnObjects: true }) as string[];
  return (
    <div>
      <p className={eyebrow}>{t("match.tap.minute", { m: mi, home: club(0), away: club(1), a, b })}</p>
      <h3 className={head}>{t("match.tap.readH")}</h3>
      <div className="mt-3 grid gap-2">
        {ctrl.map((v, l) => {
          const w = Math.min(50, (Math.abs(v) / 0.2) * 50);
          return (
            <div key={l} className="grid grid-cols-[96px_1fr] items-center gap-2.5 text-[13px] text-[#b9b0c4]">
              <span>{bands[l]}</span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.08]">
                <i className="absolute inset-y-0 rounded-full" style={v > 0 ? { left: "50%", width: `${w}%`, background: TAP_HOME } : { right: "50%", width: `${w}%`, background: TAP_AWAY }} />
                <span className="absolute inset-y-[-2px] left-1/2 w-px bg-white/35" />
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[12.5px] text-[#8c8398]">{t("match.tap.barNote", { home: club(0), away: club(1) })}</p>
      <p className={body}>{rich(ph === pa ? t("match.tap.pressEven", { n: ph }) : t("match.tap.press", { team: club(ph > pa ? 0 : 1), n: Math.max(ph, pa), m: Math.min(ph, pa) }))}</p>
      <p className={body}>{rich(best ? t("match.tap.way", { lane: lower[lanes.indexOf(best)] }) : t("match.tap.wayNone"))}</p>
      <button type="button" onClick={onHow} className="rc-press mt-3 min-h-[36px] rounded-full px-4 text-[13px] font-semibold ring-1 ring-inset ring-white/30">
        {t("match.tap.how")}
      </button>
    </div>
  );
}

function GoalCard({ D, gi, club, name, autopsyHref, onSew }: { D: Tapestry; gi: number; club(t: number): string; name(id: string): string; autopsyHref(g: string): string; onSew(): void }) {
  const { t } = useTranslation();
  const g = D.goals[gi], v = g.verdict;
  return (
    <div>
      <p className={eyebrow}>{t("match.tap.goalEyebrow", { min: Math.floor(g.s / 60), team: club(g.side === "home" ? 0 : 1) })}</p>
      <h3 className={head}>{t("match.tap.goalH", { name: name(g.scorer) })}</h3>
      <p className={body}>{rich(t("match.tap.goalBody", { home: club(0), away: club(1) }))}</p>
      <p className={body}>{rich(v ? t("match.tap.traced", { name: name(v.culprit), blame: v.blame, base: v.base, fixed: v.fixed }) : t("match.tap.honest", { xg: g.xg.toFixed(2) }))}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {v && (
          <a href={autopsyHref(g.id)} className="rc-press inline-flex min-h-[40px] items-center rounded-full px-4 text-[13px] font-bold text-[#15111c]" style={{ background: TAP_GOLD }}>
            {t("match.tap.autopsy")} →
          </a>
        )}
        <button type="button" onClick={onSew} className="rc-press min-h-[40px] rounded-full px-4 text-[13px] font-semibold ring-1 ring-inset ring-white/30">
          {t("match.tap.sew")}
        </button>
      </div>
    </div>
  );
}
