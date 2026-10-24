import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAnalysis, useStacks, type Analysis, type GoalRow, type Moment, type Side, type StackChance, type Stacks, type XY } from "../api/analysis";
import { useDemos } from "../api/demos";
import { SHOWCASE_MATCH } from "../api/rest";
import type { MatchMeta } from "../api/types";
import { Badge } from "../components/bits";
import { surname } from "../lib/format";
import { DepthSwitch } from "../components/DepthSwitch";
import { mistakeWords } from "../i18n/words";
import { useNearViewport } from "../lib/device";
import { pageHref } from "../lib/nav";
import { useUi, type Depth } from "../store/uiStore";
import "./match/strings";

/**
 * The Match page: the whole match, picked from the library. Every goal with its verdict (or an
 * honest football answer), the shot map (every shot, the better option
 * drawn in yellow) and each player's key moments. Data: stacks.json from
 * web/tools/export_stacks.py; the Expert numbers come from analysis.json.
 */
export function Match() {
  const { t } = useTranslation();
  const q = useStacks();
  const demos = useDemos();
  const demo = demos.find((d) => d.id === SHOWCASE_MATCH);
  const meta = demo?.meta ?? null;
  const depth = useUi((u) => u.depth);
  const [player, setPlayer] = useState<string | null>(null);
  const [chance, setChance] = useState<number | null>(null);
  const chanceRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = meta ? `${meta.home.short_name} ${q.data?.score[0] ?? ""}–${q.data?.score[1] ?? ""} ${meta.away.short_name} · Root Cause` : "Root Cause";
  }, [meta, q.data]);

  if (!q.data) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8">
        <p className="text-[17px] text-chalk-dim">{q.error ? t("match.failed") : t("match.loading")}</p>
        {!q.error && <div className="mt-8 h-[46vh] animate-pulse rounded-[22px] bg-turf/60" aria-hidden="true" />}
      </div>
    );
  }
  const s = q.data;
  const showChance = (seq: number) => {
    setChance(seq);
    chanceRef.current?.scrollIntoView({ behavior: useUi.getState().reducedMotion ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="min-h-[calc(100dvh-var(--header-h))] overflow-x-clip bg-turf-deep pb-28">
      <Top s={s} meta={meta} />
      <Section id="goals" title={t("match.goals.title")} sub={t("match.goals.sub")}>
        <Goals s={s} meta={meta} depth={depth} />
      </Section>
      <Section id="chances" title={t("match.chance.title")} sub={t("match.chance.sub")} innerRef={chanceRef}>
        <ChanceSection s={s} meta={meta} depth={depth} sel={chance} onSel={setChance} player={player} />
      </Section>
      <Section id="players" title={t("match.players.title")} sub={t("match.players.sub")}>
        <Players s={s} meta={meta} depth={depth} player={player} onPlayer={setPlayer} onShow={showChance} />
      </Section>
      <Section id="numbers" title={t("match.numbers.title")}>
        <Numbers meta={meta} />
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------------------------ helpers

const sideOf = (id: string): Side => (id[0] === "H" ? "home" : "away");
// floor(second / 60), the same minute the library and the Autopsy show (3756 s is 62′)
const minute = (s: number) => Math.floor(s / 60);
const f2 = (v: number) => v.toFixed(2);

function useNames(s: Stacks) {
  return useMemo(
    () => ({
      full: (id: string) => s.names[id]?.name ?? id,
      short: (id: string) => surname(s.names[id]?.name ?? id),
      number: (id: string) => s.names[id]?.number ?? "",
    }),
    [s],
  );
}

/** "Harbour Town", "Northgate Rovers": the club's name without the FC. */
function clubName(meta: MatchMeta | null, side: Side) {
  return meta?.[side].name.replace(/\s+(FC|AFC|CF)$/i, "") ?? (side === "home" ? "Home" : "Away");
}

function Section({ id, title, sub, children, innerRef }: { id: string; title: string; sub?: string; children: ReactNode; innerRef?: React.Ref<HTMLElement> }) {
  return (
    <section id={id} ref={innerRef} aria-labelledby={`${id}-h`} className="mx-auto max-w-[1280px] scroll-mt-[calc(var(--header-h)+8px)] px-4 pt-20 sm:px-8 sm:pt-28">
      <h2 id={`${id}-h`} className="font-display text-[clamp(32px,4.6vw,58px)] font-extrabold leading-[0.98] tracking-display text-chalk [text-wrap:balance]">
        {title}
      </h2>
      {sub && <p className="mt-3 max-w-[54ch] text-[16px] leading-relaxed text-chalk-dim sm:text-[17px]">{sub}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange(v: T): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-full bg-turf p-1 ring-1 ring-inset ring-turf-edge">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rc-press min-h-[38px] shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors duration-200 ${value === o.v ? "bg-chalk text-turf-deep" : "text-chalk-dim hover:text-chalk"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const useNear = (ref: React.RefObject<HTMLElement>) => useNearViewport(ref, "600px");


const autopsyHref = (goal: string) => pageHref("autopsy", { demo: SHOWCASE_MATCH, goal });

// ----------------------------------------------------------------------------------------- top

function Top({ s, meta }: { s: Stacks; meta: MatchMeta | null }) {
  const { t } = useTranslation();
  const n = useNames(s);
  const dur = s.duration_s;
  return (
    <section className="mx-auto max-w-[1280px] px-4 pt-10 sm:px-8 sm:pt-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <a href="#/matches" className="rc-press inline-flex min-h-[40px] items-center gap-2 rounded-full px-3 text-[14px] font-semibold text-chalk-dim ring-1 ring-inset ring-turf-edge hover:text-chalk">
          <span aria-hidden>←</span> {t("match.library")}
        </a>
        <DepthSwitch />
      </div>
      <p className="mt-10 text-[14px] font-semibold uppercase tracking-[0.16em] text-chalk-faint">{s.meeting ? t("match.meeting", { n: s.meeting }) : null}</p>
      <h1 className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-display text-[clamp(34px,6.4vw,92px)] font-black leading-[0.92] tracking-display text-chalk">
        <span className="inline-flex items-center gap-4">
          <Badge club={meta?.home ?? null} size={44} />
          {clubName(meta, "home")}
        </span>
        <span className="tabular-nums">
          {s.score[0]}–{s.score[1]}
        </span>
        <span className="inline-flex items-center gap-4">
          {clubName(meta, "away")}
          <Badge club={meta?.away ?? null} size={44} />
        </span>
      </h1>
      {/* the match strip: each goal at its minute, home above the line, away below */}
      <div className="mt-10" role="group" aria-label={t("match.strip")}>
        <div className="relative h-[92px]">
          <div className="absolute inset-x-0 top-1/2 h-px bg-chalk/30" />
          <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-chalk/50" style={{ left: "50%" }} />
          {s.goals.map((g) => {
            const left = `${(g.s / dur) * 100}%`;
            const up = g.side === "home";
            return (
              <a
                key={g.goal_id}
                href={`#goal-${g.n}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`goal-${g.n}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
                }}
                className={`rc-press absolute flex -translate-x-1/2 flex-col items-center gap-1 ${up ? "bottom-1/2 pb-1.5" : "top-1/2 flex-col-reverse pt-1.5"}`}
                style={{ left }}
              >
                <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums ${g.traced ? "bg-flare text-flare-ink" : "bg-chalk/12 text-chalk"}`}>
                  {minute(g.s)}′<span className="hidden sm:inline"> {n.short(g.scorer)}</span>
                </span>
                <span className={`h-3 w-3 rounded-full ${up ? "bg-chalk" : "bg-[#8fa6ff]"} ring-4 ring-turf-deep`} />
              </a>
            );
          })}
        </div>
        <div className="flex justify-between text-[12px] text-chalk-faint tabular-nums">
          <span>0′</span>
          <span>45′</span>
          <span>90′</span>
        </div>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------------------- goals

function Goals({ s, meta, depth }: { s: Stacks; meta: MatchMeta | null; depth: Depth }) {
  return (
    <ol className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8 [scrollbar-width:thin]">
      {s.goals.map((g) => (
        <li key={g.goal_id} id={`goal-${g.n}`} className="w-[min(86vw,360px)] shrink-0 snap-start scroll-mx-4">
          <GoalCard g={g} s={s} meta={meta} depth={depth} />
        </li>
      ))}
    </ol>
  );
}

function GoalCard({ g, s, meta, depth }: { g: GoalRow; s: Stacks; meta: MatchMeta | null; depth: Depth }) {
  const { t } = useTranslation();
  const n = useNames(s);
  const v = g.verdict;
  const h = g.honest;
  return (
    <article className={`flex h-full flex-col rounded-[20px] p-5 ring-1 ring-inset ${v ? "bg-[#0b1a8a] ring-flare/50" : "bg-turf ring-turf-edge"}`}>
      <header className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[34px] font-black leading-none tabular-nums text-chalk">{minute(g.s)}′</span>
        <span className="text-right text-[14px] text-chalk-dim">
          <span className="font-semibold text-chalk">{n.full(g.scorer)}</span> · {clubName(meta, g.side)}
        </span>
      </header>
      {v ? (
        <>
          <p className="mt-5 font-display text-[22px] font-extrabold leading-[1.1] text-chalk">{t("match.goals.culprit", { name: n.full(v.culprit), what: mistakeWords(v.bug, { lower: true }) })}</p>
          <p className="mt-1 text-[15px] font-semibold text-flare">{t("match.goals.blame", { pct: v.blame_pct })}</p>
          <Replays v={v} depth={depth} />
          {depth === "expert" && v.suspects.length > 1 && (
            <p className="mt-3 text-[13px] text-chalk-faint">
              {t("match.goals.also", { names: v.suspects.filter((x) => x.id !== v.culprit).map((x) => `${n.short(x.id)} ${x.blame_pct}%`).join(", ") })}
            </p>
          )}
        </>
      ) : (
        h && (
          <>
            <p className="mt-5 font-display text-[22px] font-extrabold leading-[1.1] text-chalk">{t("match.goals.noFault")}</p>
            <p className="mt-1 text-[15px] text-chalk-dim">{t("match.goals.finish", { xg: f2(h.xg), d: h.d.toFixed(1) })}</p>
            <XgMeter xg={h.xg} />
            <p className="mt-3 text-[14px] text-chalk-faint">
              {h.won_ball
                ? t("match.goals.wonBall", { s: g.s - h.won_ball.second, name: n.short(h.won_ball.player_id) })
                : h.assist
                  ? t("match.goals.setUp", { name: n.full(h.assist) })
                  : h.build_up_s >= 20
                    ? t("match.goals.long", { s: h.build_up_s })
                    : t("match.goals.quick", { s: Math.max(1, h.build_up_s) })}
            </p>
          </>
        )
      )}
      <div className="mt-auto pt-6">
        <a
          href={autopsyHref(g.goal_id)}
          className={`rc-press inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-[14px] font-bold ${v ? "bg-flare text-flare-ink" : "bg-chalk text-turf-deep"}`}
        >
          {v ? t("match.goals.open") : t("match.goals.watch")} <span aria-hidden>→</span>
        </a>
      </div>
    </article>
  );
}

/** Goals in the Debugger's replays, as played against with the culprit's mistake fixed. */
function Replays({ v, depth }: { v: NonNullable<GoalRow["verdict"]>; depth: Depth }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const near = useNear(ref);
  const rows: [string, number, boolean][] = [
    [t("match.goals.asPlayed"), v.baseline_goals, false],
    [t("match.goals.fixed"), v.fixed_goals, true],
  ];
  return (
    <div ref={ref} className="mt-5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-chalk-faint">{t("match.goals.replays", { n: v.trials })}</p>
      <div className="mt-2 grid gap-2">
        {rows.map(([label, n, fixed]) => (
          <div key={label} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-[13px]">
            <span className="text-chalk-dim">{label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-chalk/12">
              <span
                className={`block h-full rounded-full transition-[width] duration-[1600ms] ease-out ${fixed ? "bg-flare" : "bg-chalk"}`}
                style={{ width: near ? `${Math.max(1, (n / v.trials) * 100)}%` : "0%" }}
              />
            </span>
            <span className="w-[4ch] text-right font-semibold tabular-nums text-chalk">{depth === "expert" ? n : `${Math.round((n / v.trials) * 100)}%`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function XgMeter({ xg }: { xg: number }) {
  return (
    <span className="mt-4 block h-2 overflow-hidden rounded-full bg-chalk/12" aria-hidden>
      <span className="block h-full rounded-full bg-chalk" style={{ width: `${Math.max(2, xg * 100)}%` }} />
    </span>
  );
}

// ------------------------------------------------------------------------------------ shot map

type Filter = "all" | "goals" | "better";

function ChanceSection({ s, meta, depth, sel, onSel, player }: { s: Stacks; meta: MatchMeta | null; depth: Depth; sel: number | null; onSel(seq: number | null): void; player: string | null }) {
  const { t } = useTranslation();
  const n = useNames(s);
  const [filter, setFilter] = useState<Filter>("all");
  const list = s.chances;
  const better = list.filter((c) => c.best).length;
  const lit = useMemo(() => {
    const seqs = player ? new Set((s.moments[player] ?? []).map((m) => ("seq" in m ? m.seq : null)).filter((x) => x !== null)) : null;
    return (c: StackChance) => (filter === "goals" ? c.outcome === "goal" : filter === "better" ? !!c.best : true) && (!seqs || seqs.has(c.seq));
  }, [filter, player, s]);
  const gainText = (c: StackChance) => t("match.chance.gain", { gain: f2(c.best!.gain) });

  const k = list.findIndex((c) => c.seq === sel);
  const c = k >= 0 ? list[k] : null;
  const shown = list.filter(lit);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Seg<Filter>
          label={t("match.chance.filter")}
          value={filter}
          onChange={(f) => {
            setFilter(f);
            onSel(null);
          }}
          options={[
            { v: "all", label: t("match.chance.all") },
            { v: "goals", label: t("match.chance.goals") },
            { v: "better", label: t("match.chance.better") },
          ]}
        />
        <p className="text-[14px] text-chalk-dim">{t("match.chance.count", { n: list.length, b: better })}</p>
      </div>
      <div className="relative mt-5 overflow-hidden rounded-[22px] ring-1 ring-inset ring-turf-edge/70 [background:radial-gradient(120%_90%_at_50%_0%,#1d3cf0_0%,#0b1a8a_70%,#06104f_100%)]">
        <ShotMap s={s} c={c} lit={lit} onPick={onSel} name={n.short} />
        <aside aria-live="polite" className="border-t border-turf-edge/60 p-4 sm:absolute sm:right-4 sm:top-4 sm:w-[300px] sm:rounded-2xl sm:border-0 sm:bg-[#06104f]/80 sm:ring-1 sm:ring-inset sm:ring-chalk/10 sm:backdrop-blur-md">
          {c ? (
            <>
              <p className="font-display text-[17px] font-bold text-chalk">
                {t("match.chance.head", { name: n.full(c.shooter), min: minute(c.s), outcome: t(`match.chance.outcome.${c.outcome}`) })}
              </p>
              <p className="mt-1 text-[14px] text-chalk-dim">{t("match.chance.value", { xg: f2(c.xg), d: c.d.toFixed(0) })}</p>
              <XgMeter xg={c.xg} />
              {c.best ? (
                <p className="mt-3 text-[14px] leading-snug text-chalk">
                  <span className="font-semibold text-flare">{gainText(c)}.</span> {t("match.chance.best", { name: n.full(c.best.id), value: f2(c.best.value) })}
                </p>
              ) : (
                <p className="mt-3 text-[14px] leading-snug text-chalk-dim">{t("match.chance.noBetter")}</p>
              )}
              {depth === "expert" && (
                <p className="mt-3 text-[12px] leading-snug text-chalk-faint tabular-nums">
                  {t("match.chance.expert", { blockers: c.blockers, angle: c.angle, s: c.build_up_s, p: c.best ? Math.round(c.best.pass_p * 100) : "–" })}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <SmallBtn disabled={k <= 0} onClick={() => onSel(list[k - 1].seq)}>← {t("match.chance.prev")}</SmallBtn>
                <SmallBtn disabled={k >= list.length - 1} onClick={() => onSel(list[k + 1].seq)}>{t("match.chance.next")} →</SmallBtn>
                <SmallBtn onClick={() => onSel(null)}>{t("match.chance.back")}</SmallBtn>
              </div>
            </>
          ) : (
            <>
              <p className="font-display text-[17px] font-bold text-chalk">{player ? n.full(player) : t("match.chance.all")}</p>
              <p className="mt-2 text-[14px] text-chalk-dim">{t("match.chance.key")}</p>
            </>
          )}
        </aside>
      </div>
      <h3 className="sr-only">{t("match.chance.list")}</h3>
      <ol className="mt-4 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {shown.map((x) => (
          <li key={x.seq} className="shrink-0">
            <button
              type="button"
              aria-pressed={x.seq === sel}
              onClick={() => onSel(x.seq === sel ? null : x.seq)}
              className={`rc-press min-h-[40px] rounded-xl px-3 text-left text-[13px] ring-1 ring-inset transition-colors ${x.seq === sel ? "bg-chalk text-turf-deep ring-chalk" : "bg-turf text-chalk ring-turf-edge hover:ring-chalk/40"}`}
            >
              <span className="tabular-nums">{minute(x.s)}′</span> {n.short(x.shooter)}
              {x.outcome === "goal" && <span className="ml-1 font-semibold">· {t("match.chance.outcome.goal")}</span>}
              {x.best && <span className={`ml-1 font-semibold ${x.seq === sel ? "" : "text-flare"}`}>· {t("match.chance.better")}</span>}
            </button>
          </li>
        ))}
      </ol>
      <span className="sr-only">{clubName(meta, "home")}</span>
    </div>
  );
}

function SmallBtn({ children, onClick, disabled }: { children: ReactNode; onClick(): void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rc-press min-h-[36px] rounded-full px-3 text-[13px] font-semibold text-chalk ring-1 ring-inset ring-chalk/25 hover:ring-chalk/60 disabled:opacity-35">
      {children}
    </button>
  );
}

/** The pitch, every shot where it was struck (size is xG); a picked shot stands its 22 players up,
 *  arrows the shot and, when there was one, the better option in yellow. */
function ShotMap({ s, c, lit, onPick, name }: { s: Stacks; c: StackChance | null; lit(c: StackChance): boolean; onPick(seq: number | null): void; name(id: string): string }) {
  const line = { fill: "none", stroke: "rgb(var(--chalk) / 0.3)", strokeWidth: 0.35 };
  const sv = ([x, y]: XY): XY => [x, 68 - y];
  const idOf = (i: number) => (i < 11 ? `H${i + 1}` : `A${i - 10}`);
  const goalX = c ? (c.frame.ball[0] > 52.5 ? 105 : 0) : 105;
  const tag = (x: number, y: number, text: string, col: string) => (
    <text x={x} y={y - 2.4} textAnchor="middle" fontSize="2.4" fontWeight="700" fill={col} stroke="#06104f" strokeWidth="0.6" paintOrder="stroke">
      {text}
    </text>
  );
  return (
    <svg viewBox="-2 -2 109 72" className="block w-full sm:pr-[320px]" role="img" aria-label="Shots">
      <defs>
        <marker id="shot-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0 L6 3 L0 6 z" fill="#f4f6ff" />
        </marker>
        <marker id="best-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0 L6 3 L0 6 z" fill="rgb(var(--flare))" />
        </marker>
      </defs>
      <rect x="0" y="0" width="105" height="68" {...line} />
      <line x1="52.5" y1="0" x2="52.5" y2="68" {...line} />
      <circle cx="52.5" cy="34" r="9.15" {...line} />
      <rect x="0" y="13.84" width="16.5" height="40.32" {...line} />
      <rect x="88.5" y="13.84" width="16.5" height="40.32" {...line} />
      {c && (
        <g>
          {c.frame.pos.map((p, i) => {
            const [x, y] = sv(p);
            const id = idOf(i);
            return <circle key={i} cx={x} cy={y} r={id === c.shooter ? 1.6 : 1.1} fill={i < 11 ? "#f4f6ff" : "#0b1660"} stroke={i < 11 ? "#f4f6ff" : "#8fa6ff"} strokeWidth={0.45} opacity={id === c.shooter || id === c.best?.id ? 1 : 0.75} />;
          })}
          <line x1={sv(c.frame.ball)[0]} y1={sv(c.frame.ball)[1]} x2={goalX + (goalX ? -0.6 : 0.6)} y2={34} stroke="#f4f6ff" strokeWidth={0.45} markerEnd="url(#shot-arrow)" opacity={0.85} />
          {tag(sv(c.frame.ball)[0], sv(c.frame.ball)[1], name(c.shooter), "#f4f6ff")}
          {c.best && (
            <g>
              <line x1={sv(c.frame.ball)[0]} y1={sv(c.frame.ball)[1]} x2={sv(c.best.at)[0]} y2={sv(c.best.at)[1]} stroke="rgb(var(--flare))" strokeWidth={0.55} strokeDasharray="1.2 0.8" markerEnd="url(#best-arrow)" />
              <circle cx={sv(c.best.at)[0]} cy={sv(c.best.at)[1]} r={2.2} fill="none" stroke="rgb(var(--flare))" strokeWidth={0.5} />
              {tag(sv(c.best.at)[0], sv(c.best.at)[1] - 0.4, name(c.best.id), "rgb(var(--flare))")}
            </g>
          )}
        </g>
      )}
      {!c &&
        s.chances.map((x) => {
          const [cx, cy] = sv(x.frame.ball);
          const r = 0.7 + Math.sqrt(x.xg) * 2.2;
          const col = x.side === "home" ? "#f4f6ff" : "#8fa6ff";
          return (
            <g key={x.seq} opacity={lit(x) ? 1 : 0.15} className="cursor-pointer" onClick={() => onPick(x.seq)}>
              <circle cx={cx} cy={cy} r={Math.max(r, 2.4)} fill="transparent" />
              <circle cx={cx} cy={cy} r={r} fill={x.outcome === "goal" ? col : "none"} stroke={col} strokeWidth={0.4} />
              {x.best && <circle cx={cx} cy={cy} r={r + 0.9} fill="none" stroke="rgb(var(--flare))" strokeWidth={0.3} />}
            </g>
          );
        })}
    </svg>
  );
}

// ------------------------------------------------------------------------------ Player moments

function Players({ s, meta, depth, player, onPlayer, onShow }: { s: Stacks; meta: MatchMeta | null; depth: Depth; player: string | null; onPlayer(id: string | null): void; onShow(seq: number): void }) {
  const { t } = useTranslation();
  const n = useNames(s);
  const a = useAnalysis();
  const ids = (side: Side) => Array.from({ length: 11 }, (_, i) => `${side === "home" ? "H" : "A"}${i + 1}`);
  const count = (id: string) => (s.moments[id] ?? []).length;
  const ms = player ? s.moments[player] ?? [] : [];
  const st = player ? a.data?.players.find((p) => p.id === player) : null;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="grid gap-6">
        {(["home", "away"] as Side[]).map((side) => (
          <div key={side}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-chalk-faint">{clubName(meta, side)}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {ids(side).map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={player === id}
                    onClick={() => onPlayer(player === id ? null : id)}
                    className={`rc-press inline-flex min-h-[40px] items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[14px] ring-1 ring-inset transition-colors ${player === id ? "bg-chalk text-turf-deep ring-chalk" : "bg-turf text-chalk ring-turf-edge hover:ring-chalk/40"} ${count(id) ? "" : "opacity-60"}`}
                  >
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold tabular-nums ${side === "home" ? "bg-chalk text-turf-deep" : "bg-[#8fa6ff] text-turf-deep"} ${player === id ? "ring-2 ring-turf-deep" : ""}`}>{n.number(id)}</span>
                    {n.short(id)}
                    {count(id) > 0 && <span className={`text-[12px] tabular-nums ${player === id ? "text-turf-deep/70" : "text-chalk-faint"}`}>{count(id)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div aria-live="polite">
        {player ? (
          <div className="rounded-[20px] bg-turf p-5 ring-1 ring-inset ring-turf-edge">
            <p className="font-display text-[24px] font-extrabold leading-tight text-chalk">{n.full(player)}</p>
            <p className="text-[14px] text-chalk-dim">
              {s.names[player]?.position} · {clubName(meta, sideOf(player))}
            </p>
            {depth === "expert" && st && (
              <p className="mt-2 text-[13px] text-chalk-faint tabular-nums">{t("match.players.stats", { r: st.rating.toFixed(1), xg: f2(st.xg), passes: st.passes, pct: Math.round(st.pass_pct) })}</p>
            )}
            {ms.length === 0 ? (
              <p className="mt-5 text-[15px] text-chalk-dim">{t("match.players.quiet")}</p>
            ) : (
              <ol className="mt-5 grid gap-3">
                {ms.map((m, i) => (
                  <MomentRow key={i} m={m} s={s} onShow={onShow} />
                ))}
              </ol>
            )}
          </div>
        ) : (
          <div className="grid h-full min-h-[160px] place-items-center rounded-[20px] p-6 text-center ring-1 ring-inset ring-dashed ring-turf-edge">
            <p className="max-w-[30ch] text-[15px] text-chalk-dim">{t("match.players.sub")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MomentRow({ m, s, onShow }: { m: Moment; s: Stacks; onShow(seq: number): void }) {
  const { t } = useTranslation();
  const n = useNames(s);
  let line = "";
  let fix: string | null = null;
  let yellow = false;
  switch (m.kind) {
    case "goal":
      line = t("match.players.goal", { xg: f2(m.xg), d: m.d.toFixed(1) });
      break;
    case "assist":
      line = t("match.players.assist", { name: n.short(m.to) });
      break;
    case "better":
      line = t("match.players.better", { name: n.full(m.to) });
      fix = t("match.players.betterFix", { gain: f2(m.gain) });
      yellow = true;
      break;
    case "big_miss":
      line = t("match.players.big_miss", { xg: f2(m.xg) });
      break;
    case "mistake":
      line = t("match.players.mistake", { what: mistakeWords(m.bug), min: minute(m.goal_s), pct: m.blame_pct });
      fix = t("match.players.mistakeFix", { fixed: m.fixed_goals, n: m.trials });
      yellow = true;
      break;
    case "turnover":
      line = m.goal ? t("match.players.turnoverGoal") : t("match.players.turnover", { xg: f2(m.xg) });
      break;
  }
  const seq = "seq" in m ? m.seq : null;
  return (
    <li className={`grid grid-cols-[52px_1fr] gap-3 rounded-2xl p-3 ring-1 ring-inset ${yellow ? "ring-flare/50" : "ring-chalk/10"}`}>
      <span className="font-display text-[22px] font-black tabular-nums leading-none text-chalk">{minute(m.s)}′</span>
      <div>
        <p className="text-[15px] leading-snug text-chalk">{line}</p>
        {fix && <p className="mt-1 text-[14px] leading-snug text-flare">{fix}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {seq !== null && <SmallBtn onClick={() => onShow(seq)}>{t("match.players.show")}</SmallBtn>}
          {m.kind === "mistake" && (
            <a href={autopsyHref(m.goal_id)} className="rc-press inline-flex min-h-[36px] items-center rounded-full bg-flare px-3 text-[13px] font-bold text-flare-ink">
              {t("match.players.open")} →
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------------------------ numbers

function Numbers({ meta }: { meta: MatchMeta | null }) {
  const { t } = useTranslation();
  const a = useAnalysis();
  if (!a.data) return null;
  const d: Analysis = a.data;
  const h = d.teams.home, w = d.teams.away;
  const rows: [string, string, string, number, number][] = [
    [t("match.numbers.possession"), `${Math.round(h.possession_pct)}%`, `${Math.round(w.possession_pct)}%`, h.possession_pct, w.possession_pct],
    [t("match.numbers.shots"), String(h.shots), String(w.shots), h.shots, w.shots],
    [t("match.numbers.onTarget"), String(h.on_target), String(w.on_target), h.on_target, w.on_target],
    [t("match.numbers.xg"), f2(h.xg), f2(w.xg), h.xg, w.xg],
    [t("match.numbers.passes"), `${Math.round(h.pass_pct)}%`, `${Math.round(w.pass_pct)}%`, h.pass_pct, w.pass_pct],
    [t("match.numbers.tilt"), `${Math.round(h.field_tilt_pct)}%`, `${Math.round(100 - h.field_tilt_pct)}%`, h.field_tilt_pct, 100 - h.field_tilt_pct],
    [t("match.numbers.ppda"), h.ppda.toFixed(1), w.ppda.toFixed(1), h.ppda, w.ppda],
    [t("match.numbers.line"), `${Math.round(d.shapes.home.out.lines.def)} m`, `${Math.round(d.shapes.away.out.lines.def)} m`, d.shapes.home.out.lines.def, d.shapes.away.out.lines.def],
  ];
  return (
    <table className="w-full max-w-[760px] text-[15px]">
      <thead>
        <tr className="text-[13px] text-chalk-faint">
          <th className="pb-2 text-left font-semibold">{clubName(meta, "home")}</th>
          <th />
          <th className="pb-2 text-right font-semibold">{clubName(meta, "away")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, a1, b1, av, bv]) => (
          <tr key={k} className="border-t border-turf-edge/50">
            <td className="py-3 font-semibold tabular-nums text-chalk">{a1}</td>
            <td className="px-3 py-3 text-center text-[13px] text-chalk-dim">
              {k}
              <span className="mx-auto mt-1.5 flex h-1.5 max-w-[220px] overflow-hidden rounded-full bg-chalk/10" aria-hidden>
                <span className="bg-chalk" style={{ width: `${(av / (av + bv || 1)) * 100}%` }} />
                <span className="bg-[#8fa6ff]" style={{ width: `${(bv / (av + bv || 1)) * 100}%` }} />
              </span>
            </td>
            <td className="py-3 text-right font-semibold tabular-nums text-chalk">{b1}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
