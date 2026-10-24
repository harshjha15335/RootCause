import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAnalysis, useStacks, type Analysis, type TeamStats } from "../../../api/analysis";
import { useLab, type Lab } from "../../../lab/data";
import { pageHref } from "../../../lib/nav";
import { buildChapters, type Chapter, type Lane } from "./story";
import "./storyCopy";

const HOME = "#dfe4ff";
const AWAY = "#ffb547";

/**
 * Below the Tactics Lab: the whole match in numbers (each with what it means), then the match told
 * chapter by chapter, split at every goal and at half-time. "Watch it" sends the pitch to that spell.
 */
export function MatchStory({ matchId, onWatch }: { matchId: string; onWatch(s: number): void }) {
  const lab = useLab(matchId);
  const an = useAnalysis(matchId);
  const stacks = useStacks(matchId);
  if (!lab.data || !an.data) return null;
  return <StoryView lab={lab.data} an={an.data} traced={new Map((stacks.data?.goals ?? []).filter((g) => g.traced).map((g) => [g.s, g.goal_id]))} matchId={matchId} onWatch={onWatch} />;
}

/** "**x**" in a translated line becomes bold */
const rich = (str: string): ReactNode => str.split("**").map((p, i) => (i % 2 ? <b key={i} className="font-semibold text-chalk">{p}</b> : p));

function StoryView({ lab, an, traced, matchId, onWatch }: { lab: Lab; an: Analysis; traced: Map<number, string>; matchId: string; onWatch(s: number): void }) {
  const { t } = useTranslation();
  const chapters = useMemo(() => buildChapters(lab, an), [lab, an]);
  const club = (k: number) => lab.clubs[k].name.replace(/\s+(FC|AFC|CF)$/i, "");
  return (
    <div className="mt-16">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-chalk-faint">{t("tlab.story.eyebrow")}</p>
      <h2 className="mt-2 font-display text-[clamp(28px,4vw,52px)] font-extrabold leading-[0.98] tracking-display text-chalk">{t("tlab.story.title")}</h2>
      <p className="mt-3 max-w-[62ch] text-[16px] leading-relaxed text-chalk-dim">{t("tlab.story.sub")}</p>

      <ol className="mt-8 grid gap-4">
        {chapters.map((c, k) => (
          <ChapterCard key={c.from} c={c} prev={chapters[k - 1] ?? null} lab={lab} club={club} traced={traced} matchId={matchId} onWatch={onWatch} />
        ))}
      </ol>

      <Overall a={an.teams.home} b={an.teams.away} names={[lab.short[0], lab.short[1]]} />
    </div>
  );
}

function ChapterCard({ c, prev, lab, club, traced, matchId, onWatch }: { c: Chapter; prev: Chapter | null; lab: Lab; club(k: number): string; traced: Map<number, string>; matchId: string; onWatch(s: number): void }) {
  const { t } = useTranslation();
  const [h, a] = c.teams;
  const last = c.goals[c.goals.length - 1];
  const sur = (i: number) => lab.names[i].split(" ").slice(-1)[0];
  const title = last
    ? t("tlab.story.titleGoal", { name: lab.names[last.player], team: club(last.team) })
    : c.top !== null
      ? t("tlab.story.titleTop", { team: club(c.top) })
      : t("tlab.story.titleEven");
  const ball = h.possession >= a.possession ? 0 : 1;
  const T = c.teams[ball], O = c.teams[1 - ball];
  const lanes = t("tlab.story.lanes", { returnObjects: true }) as Record<Lane, string>;
  const way = (k: 0 | 1) => {
    const e = c.teams[k].entries, total = e.left + e.centre + e.right;
    if (!total) return t("tlab.story.noWay", { team: club(k) });
    const best = (Object.keys(e) as Lane[]).sort((x, y) => e[y] - e[x])[0];
    return t("tlab.story.way", { team: club(k), lane: lanes[best], n: e[best], total });
  };
  const presser = h.won === a.won ? null : h.won > a.won ? 0 : 1;
  const sentences = [
    t("tlab.story.ball", { team: club(ball), p: Math.round(T.possession), t: Math.round(T.tilt), opp: club(1 - ball) }),
    h.shots + a.shots
      ? t("tlab.story.chances", { team: club(ball), n: T.shots, xg: T.xg.toFixed(2), opp: club(1 - ball), m: O.shots, xg2: O.xg.toFixed(2) })
      : t("tlab.story.noChances"),
    presser === null ? t("tlab.story.pressEven", { n: h.won }) : t("tlab.story.press", { team: club(presser), opp: club(1 - presser), n: c.teams[presser].won, m: c.teams[1 - presser].won }),
    way(ball),
  ];
  // the back line that moved most since the chapter before
  if (prev) {
    const moves = ([0, 1] as const).map((k) => ({ k, d: c.teams[k].line - prev.teams[k].line }));
    const m = moves.sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
    if (Math.abs(m.d) >= 2) sentences.push(t("tlab.story.lineMove", { team: club(m.k), m: Math.round(c.teams[m.k].line), d: Math.abs(m.d).toFixed(0), dir: t(m.d > 0 ? "tlab.story.higher" : "tlab.story.deeper") }));
  }
  if (T.star !== null) sentences.push(t("tlab.story.star", { name: lab.names[T.star], team: lab.short[ball] }));

  const bars: [string, number, number, (v: number) => string][] = [
    [t("tlab.story.s.possession"), h.possession, a.possession, (v) => `${Math.round(v)}%`],
    [t("tlab.story.s.tilt"), h.tilt, a.tilt, (v) => `${Math.round(v)}%`],
    [t("tlab.story.s.xt"), h.xt, a.xt, (v) => v.toFixed(2)],
    [t("tlab.story.s.shots"), h.shots, a.shots, (v) => String(v)],
    [t("tlab.story.s.xg"), h.xg, a.xg, (v) => v.toFixed(2)],
    [t("tlab.story.s.won"), h.won, a.won, (v) => String(v)],
    [t("tlab.story.s.line"), h.line, a.line, (v) => `${Math.round(v)} m`],
  ];
  return (
    <li className="rounded-[22px] bg-turf p-5 ring-1 ring-inset ring-turf-edge sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-trace text-[12px] font-bold uppercase tracking-[0.14em] text-chalk-faint">
            {t("tlab.story.min", { a: Math.floor(c.from / 60), b: Math.ceil(c.to / 60) })}
            {c.to === 2700 ? ` · ${t("tlab.story.half")}` : ""}
          </p>
          <h3 className="mt-1 font-display text-[clamp(22px,2.6vw,32px)] font-extrabold leading-tight text-chalk [text-wrap:balance]">{title}</h3>
        </div>
        <button type="button" onClick={() => onWatch(c.from)} className="rc-press inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-full bg-chalk px-4 text-[14px] font-bold text-turf-deep">
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.6v10.8a.8.8 0 0 0 1.2.7l8.6-5.4a.8.8 0 0 0 0-1.4L4.2.9A.8.8 0 0 0 3 1.6z" fill="currentColor" /></svg>
          {t("tlab.story.watch")}
        </button>
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-2 text-[15.5px] leading-relaxed text-chalk-dim">
          {sentences.map((x, i) => (
            <p key={i}>{rich(x)}</p>
          ))}
          {c.goals.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {c.goals.map((g) => (
                <span key={g.s} className="inline-flex items-center gap-1.5">
                  <button type="button" onClick={() => onWatch(g.s - 12)} className="rc-press min-h-[36px] rounded-full px-3.5 text-[13px] font-bold text-[#0b0c12]" style={{ background: g.team === 0 ? HOME : AWAY }}>
                    ⚽ {sur(g.player)} {Math.floor(g.s / 60)}′ · xG {g.xg.toFixed(2)}
                  </button>
                  {traced.has(g.s) && (
                    <a href={pageHref("autopsy", { demo: matchId, goal: traced.get(g.s)! })} className="rc-press min-h-[36px] content-center rounded-full bg-flare px-3.5 text-[13px] font-bold text-flare-ink">
                      {t("tlab.story.autopsy")} →
                    </a>
                  )}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1 text-[13px] text-chalk-faint">{t("tlab.story.score", { home: lab.short[0], away: lab.short[1], a: c.score[0], b: c.score[1] })}</p>
        </div>
        <dl className="grid content-start gap-2.5">
          <div className="flex justify-between text-[12px] font-bold">
            <span style={{ color: HOME }}>{lab.short[0]}</span>
            <span style={{ color: AWAY }}>{lab.short[1]}</span>
          </div>
          {bars.map(([k, x, y, fmt]) => (
            <Pair key={k} label={k} a={x} b={y} fmt={fmt} />
          ))}
        </dl>
      </div>
    </li>
  );
}

/** two values on one line: home grows from the middle to the left, away to the right */
function Pair({ label, a, b, fmt, lowerBetter }: { label: string; a: number; b: number; fmt(v: number, side: 0 | 1): string; lowerBetter?: boolean }) {
  const max = Math.max(a, b, 1e-6);
  const wa = (a / max) * 50, wb = (b / max) * 50;
  const lead = a === b ? null : (a > b) !== !!lowerBetter ? 0 : 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className={`tabular-nums ${lead === 0 ? "font-bold text-chalk" : "text-chalk-dim"}`}>{fmt(a, 0)}</span>
        <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-chalk-faint">{label}</dt>
        <span className={`tabular-nums ${lead === 1 ? "font-bold text-chalk" : "text-chalk-dim"}`}>{fmt(b, 1)}</span>
      </div>
      <dd className="relative mt-1 h-2 overflow-hidden rounded-full bg-chalk/10">
        <i className="absolute inset-y-0 right-1/2 rounded-l-full" style={{ width: `${wa}%`, background: HOME, opacity: lead === 1 ? 0.55 : 1 }} />
        <i className="absolute inset-y-0 left-1/2 rounded-r-full" style={{ width: `${wb}%`, background: AWAY, opacity: lead === 0 ? 0.55 : 1 }} />
      </dd>
    </div>
  );
}

function Overall({ a, b, names }: { a: TeamStats; b: TeamStats; names: [string, string] }) {
  const { t } = useTranslation();
  const k = (key: string) => t(`tlab.story.k.${key}`, { returnObjects: true }) as [string, string];
  const rows: { key: string; a: number; b: number; fmt(v: number): string; low?: boolean; extra?: [string, string] }[] = [
    { key: "possession", a: a.possession_pct, b: b.possession_pct, fmt: (v) => `${Math.round(v)}%` },
    { key: "tilt", a: a.field_tilt_pct, b: b.field_tilt_pct, fmt: (v) => `${Math.round(v)}%` },
    { key: "passes", a: a.passes, b: b.passes, fmt: (v) => String(v), extra: [`${Math.round(a.pass_pct)}%`, `${Math.round(b.pass_pct)}%`] },
    { key: "progressive", a: a.progressive_passes, b: b.progressive_passes, fmt: (v) => String(v) },
    { key: "ppda", a: a.ppda, b: b.ppda, fmt: (v) => v.toFixed(2), low: true },
    { key: "regain", a: a.regain_height_m ?? 0, b: b.regain_height_m ?? 0, fmt: (v) => `${Math.round(v)} m` },
    { key: "shots", a: a.shots, b: b.shots, fmt: (v) => String(v), extra: [String(a.on_target), String(b.on_target)] },
    { key: "xg", a: a.xg, b: b.xg, fmt: (v) => v.toFixed(2) },
    { key: "xt", a: a.xt, b: b.xt, fmt: (v) => v.toFixed(2) },
    { key: "duels", a: a.duels_won_pct, b: b.duels_won_pct, fmt: (v) => `${Math.round(v)}%` },
    { key: "offsides", a: a.offsides, b: b.offsides, fmt: (v) => String(v), low: true },
  ];
  const e = (s: TeamStats) => s.final_third_entries;
  return (
    <section className="mt-12">
      <h3 className="font-display text-[clamp(24px,3vw,38px)] font-extrabold text-chalk">{t("tlab.story.overall")}</h3>
      <p className="mt-2 text-[15px] text-chalk-dim">{t("tlab.story.overallSub")}</p>
      <div className="mt-6 grid gap-x-10 gap-y-5 md:grid-cols-2">
        {rows.map((r) => {
          const [label, what] = k(r.key);
          return (
            <div key={r.key}>
              <Pair label={label} a={r.a} b={r.b} fmt={(v, i) => (r.extra ? `${r.fmt(v)} (${r.extra[i]})` : r.fmt(v))} lowerBetter={r.low} />
              <p className="mt-1.5 text-[13.5px] leading-snug text-chalk-faint">{what}</p>
            </div>
          );
        })}
        <div>
          {(["left", "centre", "right"] as const).map((l) => (
            <Pair key={l} label={`${k("entries")[0]} · ${(t("tlab.story.lanes", { returnObjects: true }) as Record<Lane, string>)[l]}`} a={e(a)[l]} b={e(b)[l]} fmt={(v) => String(v)} />
          ))}
          <p className="mt-1.5 text-[13.5px] leading-snug text-chalk-faint">{k("entries")[1]}</p>
        </div>
      </div>
      <p className="mt-4 text-[12px] text-chalk-faint">
        <span style={{ color: HOME }}>■</span> {names[0]} · <span style={{ color: AWAY }}>■</span> {names[1]}
      </p>
    </section>
  );
}
