import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAnalysis, type Analysis as Data, type Chance, type Insight, type LineRow, type Option, type PlayerStats, type Shape, type Side, type Unit, type XY } from "../api/analysis";
import { Badge, BugName } from "../components/bits";
import { clock, pitchKit, playerInfo, surname } from "../lib/format";
import { go } from "../lib/nav";
import { Reveal, RiseLines, useSmoothScroll } from "../lib/motion";
import { useMatch } from "../store/matchStore";
import { useUi } from "../store/uiStore";

/**
 * Match analysis: the whole 90 minutes, not just the goal the Debugger traced. Overview,
 * tactics in and out of possession, every chance broken down on a telestrated freeze-frame,
 * and a card per player. All numbers come from analysis.json (web/tools/export_analysis.py).
 */
export function Analysis() {
  const { t } = useTranslation();
  const q = useAnalysis();
  const meta = useMatch((s) => s.meta);
  useSmoothScroll();

  if (!q.data) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8">
        <p className="text-[17px] text-chalk-dim">{q.error ? t("analysis.failed") : t("analysis.loading")}</p>
        {!q.error && (
          <div className="mt-8 grid gap-4 sm:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-turf/70" />
            ))}
          </div>
        )}
      </div>
    );
  }
  const a = q.data;
  return (
    <div className="min-h-[calc(100dvh-var(--header-h))] bg-turf-deep pb-32">
      <section className="mx-auto max-w-[1200px] px-4 pb-6 pt-14 sm:px-8 sm:pt-20">
        <div className="flex flex-wrap items-center gap-3 text-[15px] text-chalk-dim">
          <Badge club={meta?.home ?? null} size={30} />
          <span className="font-display text-[28px] text-chalk tabular-nums">
            {meta?.home.short_name} {a.score[0]}–{a.score[1]} {meta?.away.short_name}
          </span>
          <Badge club={meta?.away ?? null} size={30} />
          <span className="rounded-full px-3 py-1 text-[13px] ring-1 ring-inset ring-turf-edge">{t("analysis.fullMatch")}</span>
        </div>
        <h1 className="mt-8 font-display text-[clamp(52px,10vw,150px)] leading-[0.88] text-chalk">
          <span className="sr-only">{t("analysis.title")}</span>
          <span aria-hidden>
            <RiseLines lines={[t("analysis.titleA"), <span key="b" className="text-chalk-faint">{t("analysis.titleB")}</span>]} />
          </span>
        </h1>
        <p className="mt-8 max-w-[60ch] text-[clamp(17px,1.6vw,20px)] leading-relaxed text-chalk-dim">{t("analysis.lede")}</p>
        <Insights a={a} />
      </section>

      <Section id="overview" n="01" title={t("analysis.overview")} body={t("analysis.overviewBody")}>
        <Overview a={a} />
      </Section>
      <Section id="tactics" n="02" title={t("analysis.tactics")} body={t("analysis.tacticsBody")}>
        <Tactics a={a} />
      </Section>
      <Section id="chances" n="03" title={t("analysis.chances")} body={t("analysis.chancesBody", { n: a.chances.length })}>
        <Chances a={a} />
      </Section>
      <Section id="moments" n="04" title={t("analysis.moments")} body={t("analysis.momentsBody")}>
        <Moments a={a} />
      </Section>
      <Section id="players" n="05" title={t("analysis.players")} body={t("analysis.playersBody")}>
        <Players a={a} />
      </Section>
      <p className="mx-auto mt-16 max-w-[1200px] px-4 text-[13px] leading-relaxed text-chalk-faint sm:px-8">{t("analysis.method")}</p>
    </div>
  );
}

function Section({ id, n, title, body, children }: { id: string; n: string; title: string; body: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mx-auto max-w-[1200px] px-4 pt-20 sm:px-8 sm:pt-28">
      <Reveal>
        <div className="flex items-baseline gap-4 border-t border-turf-edge/70 pt-5">
          <span className="font-mono text-[13px] text-chalk-faint">{n}</span>
          <h2 id={`${id}-h`} className="font-display text-[clamp(34px,5vw,64px)] leading-[0.95] text-chalk">
            {title}
          </h2>
        </div>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-chalk-dim">{body}</p>
      </Reveal>
      <div className="mt-8">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------------- helpers

function useNames() {
  const meta = useMatch((s) => s.meta);
  return useMemo(
    () => ({
      name: (id: string) => surname(playerInfo(meta, id).name),
      full: (id: string) => playerInfo(meta, id).name,
      number: (id: string) => playerInfo(meta, id).number ?? "",
      club: (side: Side | null) => (side ? meta?.[side].short_name ?? side : ""),
      clubName: (side: Side | null) => (side ? meta?.[side].name ?? side : ""),
    }),
    [meta],
  );
}

const idAt = (i: number) => (i < 11 ? `H${i + 1}` : `A${i - 10}`);
const other = (s: Side): Side => (s === "home" ? "away" : "home");
const f2 = (v: number) => v.toFixed(2);
const pc = (v: number) => `${Math.round(v * 100)}%`;
/** Engine coordinates into the attacking side's frame (toward x = 105). */
const fwd = ([x, y]: XY, d: number): XY => (d > 0 ? [x, y] : [105 - x, 68 - y]);
/** Pitch frame (y up the left wing when attacking right) into SVG (y down). */
const sv = ([x, y]: XY): XY => [x, 68 - y];

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: NoInfer<T>; label: string }[]; onChange(v: NoInfer<T>): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-turf p-1 ring-1 ring-inset ring-turf-edge">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`rc-press min-h-[38px] rounded-full px-4 text-[13px] font-semibold transition-colors ${value === o.v ? "bg-chalk text-turf-deep" : "text-chalk-dim hover:text-chalk"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The pitch drawn in chalk, 105 x 68, attacking right. */
function PitchSvg({ children, label, className = "", view = "-2 -2 109 74.6" }: { children: ReactNode; label: string; className?: string; view?: string }) {
  const line = { fill: "none", stroke: "rgb(var(--chalk) / 0.32)", strokeWidth: 0.35 };
  return (
    <svg viewBox={view} role="img" aria-label={label} className={`block w-full rounded-2xl bg-[#0b1a8a] ${className}`}>
      <defs>
        <pattern id="rc-hatch" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.6" stroke="rgb(var(--chalk) / 0.35)" strokeWidth="0.5" />
        </pattern>
        <pattern id="rc-hatch-flare" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.6" stroke="rgb(var(--flare) / 0.75)" strokeWidth="0.55" />
        </pattern>
        <filter id="rc-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
        <marker id="rc-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 6 3 0 6z" fill="rgb(var(--chalk))" />
        </marker>
        <marker id="rc-arrow-flare" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 6 3 0 6z" fill="rgb(var(--flare))" />
        </marker>
      </defs>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x={i * 15} y={0} width={15} height={68} fill={i % 2 ? "#0c1c90" : "#0e1f96"} />
      ))}
      <rect x="0" y="0" width="105" height="68" {...line} />
      <line x1="52.5" y1="0" x2="52.5" y2="68" {...line} />
      <circle cx="52.5" cy="34" r="9.15" {...line} />
      <rect x="0" y="13.84" width="16.5" height="40.32" {...line} />
      <rect x="88.5" y="13.84" width="16.5" height="40.32" {...line} />
      <rect x="0" y="24.84" width="5.5" height="18.32" {...line} />
      <rect x="99.5" y="24.84" width="5.5" height="18.32" {...line} />
      <rect x="-1.2" y="30.34" width="1.2" height="7.32" {...line} />
      <rect x="105" y="30.34" width="1.2" height="7.32" {...line} />
      {children}
    </svg>
  );
}

function Disc({ at, side, label, r = 1.9, dim = false }: { at: XY; side: Side; label?: string | number; r?: number; dim?: boolean }) {
  const k = pitchKit(side);
  const [x, y] = sv(at);
  return (
    <g opacity={dim ? 0.45 : 1}>
      <circle cx={x} cy={y} r={r} fill={k.kit} stroke={k.trim} strokeWidth={0.35} />
      {label !== undefined && (
        <text x={x} y={y + r * 0.36} textAnchor="middle" fontSize={r * 1.02} fontWeight={800} fill={k.trim} className="font-body">
          {label}
        </text>
      )}
    </g>
  );
}

function Tag({ at, children, flare = false, dy = -3.4 }: { at: XY; children: string; flare?: boolean; dy?: number }) {
  const w = children.length * 1.05 + 2;
  const x = Math.min(Math.max(sv(at)[0], 44 + w / 2), 106.5 - w / 2);
  const y = Math.min(Math.max(sv(at)[1] + dy, 0), 69);
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-1.6} width={w} height={2.9} rx={1.45} fill={flare ? "rgb(var(--flare))" : "rgb(var(--chalk))"} />
      <text y={0.55} textAnchor="middle" fontSize={1.8} fontWeight={700} fill={flare ? "rgb(var(--flare-ink))" : "#14123a"} className="font-body">
        {children}
      </text>
    </g>
  );
}

/** Players of one unit joined left wing to right wing, the way analysts draw a line. */
function UnitLine({ pts, flare = false }: { pts: XY[]; flare?: boolean }) {
  if (pts.length < 2) return null;
  const s = [...pts].sort((p, q) => q[1] - p[1]).map(sv);
  return (
    <polyline
      points={s.map((p) => p.join(",")).join(" ")}
      fill="none"
      stroke={flare ? "rgb(var(--flare))" : "rgb(var(--chalk) / 0.75)"}
      strokeWidth={0.45}
      strokeDasharray="1.2 0.9"
      strokeLinecap="round"
    />
  );
}

// ---------------------------------------------------------------------------------- insights

function insightText(i: Insight, t: (k: string, o?: Record<string, unknown>) => string, n: ReturnType<typeof useNames>): string {
  const p = i.params;
  const club = n.club(i.side);
  switch (i.key) {
    case "press":
      if (Math.abs(Number(p.height) - Number(p.other)) < 3) return t("analysis.in.pressEven", { height: Math.round(Number(p.height)) });
      return t("analysis.in.press", { club, height: Math.round(Number(p.height)), other: Math.round(Number(p.other)) });
    case "block":
      return t("analysis.in.block", { club, line: Math.round(Number(p.line)), depth: Math.round(Number(p.depth)) });
    case "lane":
      return t("analysis.in.lane", { club, pct: p.pct, lane: t(`analysis.lane.${p.lane}`) });
    case "finishing": {
      const goals = Number(p.goals);
      const xg = Number(p.xg);
      return t(goals > xg + 0.4 ? "analysis.in.finishingHot" : goals < xg - 0.4 ? "analysis.in.finishingCold" : "analysis.in.finishing", { club, goals, xg: xg.toFixed(2), shots: p.shots });
    }
    case "line_drift":
      return t(Number(p.to) > Number(p.from) ? "analysis.in.lineUp" : "analysis.in.lineDown", { club, from: Math.round(Number(p.from)), to: Math.round(Number(p.to)) });
    case "better_options":
      return t("analysis.in.better", { count: Number(p.n) });
    case "big_missed":
      return t("analysis.in.bigMissed", { club, count: Number(p.n), xg: Number(p.xg).toFixed(2) });
    case "turnover":
      return t("analysis.in.turnover", { name: n.full(String(p.player_id)), time: clock(Number(p.second)), xg: Number(p.xg).toFixed(2) });
    default:
      return "";
  }
}

function Insights({ a }: { a: Data }) {
  const { t } = useTranslation();
  const n = useNames();
  const lines = a.insights.map((i) => insightText(i, t, n)).filter(Boolean);
  return (
    <div className="mt-10 rounded-3xl bg-turf p-5 ring-1 ring-inset ring-turf-edge sm:p-7">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-chalk-faint">{t("analysis.readout")}</h2>
      <ol className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
        {lines.map((l, k) => (
          <li key={k} className="flex gap-3 text-[16px] leading-snug text-chalk">
            <span className="mt-1 font-mono text-[12px] text-chalk-faint">{String(k + 1).padStart(2, "0")}</span>
            <span>{l}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------------- overview

function Overview({ a }: { a: Data }) {
  const { t } = useTranslation();
  const n = useNames();
  const h = a.teams.home;
  const w = a.teams.away;
  const rows: [string, number, number, (v: number) => string, boolean?][] = [
    [t("analysis.st.possession"), h.possession_pct, w.possession_pct, (v) => `${Math.round(v)}%`],
    [t("analysis.st.tilt"), h.field_tilt_pct, w.field_tilt_pct, (v) => `${Math.round(v)}%`],
    [t("analysis.st.shots"), h.shots, w.shots, String],
    [t("analysis.st.onTarget"), h.on_target, w.on_target, String],
    [t("analysis.st.xg"), h.xg, w.xg, f2],
    [t("analysis.st.xt"), h.xt, w.xt, f2],
    [t("analysis.st.passes"), h.pass_pct, w.pass_pct, (v) => `${Math.round(v)}%`],
    [t("analysis.st.progressive"), h.progressive_passes, w.progressive_passes, String],
    [t("analysis.st.duels"), h.duels_won_pct, w.duels_won_pct, (v) => `${Math.round(v)}%`],
    [t("analysis.st.regain"), h.regain_height_m ?? 0, w.regain_height_m ?? 0, (v) => `${Math.round(v)} m`],
    [t("analysis.st.offsides"), h.offsides, w.offsides, String],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="rounded-3xl bg-turf p-5 ring-1 ring-inset ring-turf-edge sm:p-6">
        <div className="mb-4 flex items-center justify-between text-[14px] font-semibold text-chalk">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: pitchKit("home").kit }} aria-hidden />
            {n.club("home")}
          </span>
          <span className="flex items-center gap-2">
            {n.club("away")}
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: pitchKit("away").kit }} aria-hidden />
          </span>
        </div>
        <table className="w-full text-[14px]">
          <caption className="sr-only">{t("analysis.overview")}</caption>
          <tbody>
            {rows.map(([label, hv, av, fmt]) => {
              const tot = hv + av || 1;
              return (
                <tr key={label} className="align-middle">
                  <td className="w-14 py-2 text-left font-semibold tabular-nums text-chalk">{fmt(hv)}</td>
                  <td className="py-2">
                    <div className="text-center text-[12px] text-chalk-dim">{label}</div>
                    <div className="mt-1 flex h-1.5 gap-[2px]" aria-hidden>
                      <div className="flex flex-1 justify-end">
                        <div className="h-full rounded-l-full" style={{ width: `${(100 * hv) / tot}%`, background: pitchKit("home").kit }} />
                      </div>
                      <div className="flex flex-1">
                        <div className="h-full rounded-r-full" style={{ width: `${(100 * av) / tot}%`, background: pitchKit("away").kit }} />
                      </div>
                    </div>
                  </td>
                  <th scope="row" className="sr-only">{label}</th>
                  <td className="w-14 py-2 text-right font-semibold tabular-nums text-chalk">{fmt(av)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-6">
        <Momentum a={a} />
        <LineHeight rows={a.lines} />
      </div>
    </div>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <figure className="relative rounded-3xl bg-turf p-5 ring-1 ring-inset ring-turf-edge sm:p-6">
      <figcaption>
        <div className="text-[15px] font-semibold text-chalk">{title}</div>
        <div className="mt-1 text-[13px] leading-snug text-chalk-dim">{sub}</div>
      </figcaption>
      <div className="relative mt-4">{children}</div>
    </figure>
  );
}

function Tip({ x, children }: { x: number; children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 w-max max-w-[220px] -translate-x-1/2 rounded-xl bg-chalk px-3 py-2 text-[12px] leading-snug text-[#14123a] shadow-lg"
      style={{ left: `clamp(70px, ${x}%, calc(100% - 70px))` }}
    >
      {children}
    </div>
  );
}

/** xT created per five minutes: home above the line, away below; goals marked. */
function Momentum({ a }: { a: Data }) {
  const { t } = useTranslation();
  const n = useNames();
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 240;
  const mid = 120;
  const pad = 26;
  const bw = (W - pad) / a.momentum.length;
  const max = Math.max(...a.momentum.flatMap((b) => [b.home_xt, b.away_xt]), 0.01);
  const sc = (v: number) => (v / max) * 84;
  const b = hover !== null ? a.momentum[hover] : null;
  return (
    <ChartCard title={t("analysis.momentum")} sub={t("analysis.momentumSub")}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={t("analysis.momentumSub")} onMouseLeave={() => setHover(null)}>
        <line x1={pad} x2={W} y1={mid} y2={mid} stroke="rgb(var(--chalk) / 0.3)" strokeWidth={1} />
        <line x1={pad + bw * 9} x2={pad + bw * 9} y1={20} y2={H - 20} stroke="rgb(var(--chalk) / 0.25)" strokeDasharray="4 4" />
        <text x={pad + bw * 9 + 6} y={30} fontSize={15} fill="rgb(var(--chalk-faint))">{t("analysis.halfTime")}</text>
        <text x={0} y={mid - 70} fontSize={15} fill="rgb(var(--chalk-dim))">{n.club("home")}</text>
        <text x={0} y={mid + 82} fontSize={15} fill="rgb(var(--chalk-dim))">{n.club("away")}</text>
        {a.momentum.map((m, i) => {
          const x = pad + i * bw + 3;
          const hh = sc(m.home_xt);
          const ah = sc(m.away_xt);
          return (
            <g key={i} opacity={hover === null || hover === i ? 1 : 0.5}>
              <rect x={x} y={mid - 2 - hh} width={bw - 6} height={hh} rx={4} fill={pitchKit("home").kit} />
              <rect x={x} y={mid + 2} width={bw - 6} height={ah} rx={4} fill={pitchKit("away").kit} />
              {m.goals.map((g, k) => (
                <g key={k} transform={`translate(${x + (bw - 6) / 2} ${g.side === "home" ? mid - hh - 16 - k * 22 : mid + ah + 16 + k * 22})`}>
                  <circle r={9} fill="rgb(var(--chalk))" stroke="#0e22a6" strokeWidth={2} />
                  <text y={4.5} textAnchor="middle" fontSize={11} fontWeight={800} fill="#14123a">{n.number(g.player_id)}</text>
                </g>
              ))}
              <rect x={x - 3} y={0} width={bw} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          );
        })}
        {[0, 15, 30, 45, 60, 75, 90].map((m) => (
          <text key={m} x={pad + (m / 5) * bw} y={H - 2} fontSize={14} textAnchor="middle" fill="rgb(var(--chalk-faint))">{m}'</text>
        ))}
      </svg>
      {b && hover !== null && (
        <Tip x={((pad + (hover + 0.5) * bw) / W) * 100}>
          <div className="font-semibold">{`${b.from_s / 60}'–${b.to_s / 60}'`}</div>
          <div>{t("analysis.tipXt", { club: n.club("home"), xt: f2(b.home_xt), shots: b.home_shots })}</div>
          <div>{t("analysis.tipXt", { club: n.club("away"), xt: f2(b.away_xt), shots: b.away_shots })}</div>
          {b.goals.map((g) => (
            <div key={g.second} className="font-semibold">{t("analysis.tipGoal", { time: clock(g.second), name: n.name(g.player_id) })}</div>
          ))}
        </Tip>
      )}
    </ChartCard>
  );
}

/** How far from its own goal each back line held out of possession, per five minutes. */
function LineHeight({ rows }: { rows: LineRow[] }) {
  const { t } = useTranslation();
  const n = useNames();
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 200;
  const pad = 40;
  const vals = rows.flatMap((r) => [r.home_line, r.away_line]).filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(...vals) - 2);
  const hi = Math.ceil(Math.max(...vals) + 2);
  const x = (i: number) => pad + (i / (rows.length - 1)) * (W - pad - 70);
  const y = (v: number) => 14 + (1 - (v - lo) / (hi - lo)) * (H - 44);
  const path = (k: "home_line" | "away_line") =>
    rows.map((r, i) => (r[k] === null ? "" : `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r[k]!).toFixed(1)}`)).join(" ");
  const last = rows[rows.length - 1];
  const r = hover !== null ? rows[hover] : null;
  return (
    <ChartCard title={t("analysis.lineHeight")} sub={t("analysis.lineHeightSub")}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={t("analysis.lineHeightSub")}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          setHover(Math.max(0, Math.min(rows.length - 1, Math.round(((px - pad) / (W - pad - 70)) * (rows.length - 1)))));
        }}
      >
        {[lo, Math.round((lo + hi) / 2), hi].map((v) => (
          <g key={v}>
            <line x1={pad} x2={W - 70} y1={y(v)} y2={y(v)} stroke="rgb(var(--chalk) / 0.12)" />
            <text x={pad - 8} y={y(v) + 5} fontSize={14} textAnchor="end" fill="rgb(var(--chalk-faint))">{v} m</text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={10} y2={H - 30} stroke="rgb(var(--chalk) / 0.4)" />}
        <path d={path("home_line")} fill="none" stroke={pitchKit("home").kit} strokeWidth={2.5} strokeLinejoin="round" />
        <path d={path("away_line")} fill="none" stroke={pitchKit("away").kit} strokeWidth={2.5} strokeLinejoin="round" />
        {last.home_line !== null && <text x={W - 62} y={y(last.home_line) + 5} fontSize={14} fill="rgb(var(--chalk))">{n.club("home")}</text>}
        {last.away_line !== null && <text x={W - 62} y={y(last.away_line) + 5} fontSize={14} fill="rgb(var(--chalk))">{n.club("away")}</text>}
        {[0, 3, 6, 9, 12, 15, 17].map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize={14} textAnchor="middle" fill="rgb(var(--chalk-faint))">{(i * 5).toString()}'</text>
        ))}
      </svg>
      {r && hover !== null && (
        <Tip x={(x(hover) / W) * 100}>
          <div className="font-semibold">{`${r.from_s / 60}'–${r.from_s / 60 + 5}'`}</div>
          <div>{t("analysis.tipLine", { club: n.club("home"), m: r.home_line?.toFixed(1), depth: r.home_depth?.toFixed(0) })}</div>
          <div>{t("analysis.tipLine", { club: n.club("away"), m: r.away_line?.toFixed(1), depth: r.away_depth?.toFixed(0) })}</div>
        </Tip>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------------- tactics

function Tactics({ a }: { a: Data }) {
  const { t } = useTranslation();
  const n = useNames();
  const meta = useMatch((s) => s.meta);
  const [side, setSide] = useState<Side>("home");
  const [view, setView] = useState<"out" | "in" | "network">("out");
  const shape = a.shapes[side][view === "network" ? "in" : view];
  const team = a.teams[side];
  const ent = team.final_third_entries;
  const entTot = ent.left + ent.centre + ent.right || 1;
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <Seg label={t("analysis.team")} value={side} onChange={setSide} options={[{ v: "home", label: n.club("home") }, { v: "away", label: n.club("away") }]} />
        <Seg
          label={t("analysis.phase")}
          value={view}
          onChange={setView}
          options={[
            { v: "out", label: t("analysis.outPoss") },
            { v: "in", label: t("analysis.inPoss") },
            { v: "network", label: t("analysis.network") },
          ]}
        />
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div>
          <PitchSvg label={t(`analysis.board.${view}`, { club: n.clubName(side), formation: meta?.[side].formation ?? "" })}>
            {view === "network" ? <NetworkLayer net={a.networks[side]} side={side} /> : <ShapeLayer shape={shape} side={side} showLanes={view === "in"} lanes={ent} lanesTot={entTot} />}
            <text x={96} y={71.4} fontSize={2} fill="rgb(var(--chalk) / 0.6)" textAnchor="end">{t("analysis.attacking")} →</text>
          </PitchSvg>
        </div>
        <div className="grid content-start gap-3">
          <Fact k={t("analysis.formation")} v={meta?.[side].formation ?? "—"} />
          {view !== "network" ? (
            <>
              <Fact k={t("analysis.backLine")} v={`${Math.round(shape.lines.def)} m`} note={t("analysis.fromGoal")} />
              <Fact k={t("analysis.depth")} v={`${Math.round(shape.depth_m)} m`} note={t("analysis.depthNote")} />
              <Fact k={t("analysis.width")} v={`${Math.round(shape.width_m)} m`} note={t("analysis.widthNote")} />
            </>
          ) : (
            <>
              {a.networks[side].edges.slice(0, 3).map((e) => (
                <Fact key={e.a + e.b} k={`${n.name(e.a)} ↔ ${n.name(e.b)}`} v={String(e.n)} note={t("analysis.passesBetween")} />
              ))}
            </>
          )}
          <Fact k={t("analysis.st.regain")} v={`${Math.round(team.regain_height_m ?? 0)} m`} note={t("analysis.regainNote")} />
          <p className="text-[14px] leading-relaxed text-chalk-dim">{t(`analysis.boardNote.${view}`)}</p>
        </div>
      </div>
    </div>
  );
}

function Fact({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-turf px-4 py-3 ring-1 ring-inset ring-turf-edge">
      <div>
        <div className="text-[14px] text-chalk">{k}</div>
        {note && <div className="text-[12px] text-chalk-faint">{note}</div>}
      </div>
      <div className="font-display text-[22px] text-chalk tabular-nums">{v}</div>
    </div>
  );
}

function ShapeLayer({ shape, side, showLanes, lanes, lanesTot }: { shape: Shape; side: Side; showLanes: boolean; lanes: { left: number; centre: number; right: number }; lanesTot: number }) {
  const n = useNames();
  const by = (u: Unit) => shape.players.filter((p) => p.unit === u).map((p) => [p.x, p.y] as XY);
  const out = shape.players.filter((p) => p.unit !== "gk");
  const x0 = Math.min(...out.map((p) => p.x));
  const x1 = Math.max(...out.map((p) => p.x));
  const y0 = Math.min(...out.map((p) => p.y));
  const y1 = Math.max(...out.map((p) => p.y));
  return (
    <g>
      <rect x={x0} y={68 - y1} width={x1 - x0} height={y1 - y0} fill="url(#rc-hatch)" stroke="rgb(var(--chalk) / 0.35)" strokeWidth={0.3} rx={1.5} />
      {/* depth bracket under the block */}
      <g stroke="rgb(var(--chalk) / 0.8)" strokeWidth={0.3}>
        <line x1={x0} x2={x1} y1={68 - y0 + 3} y2={68 - y0 + 3} />
        <line x1={x0} x2={x0} y1={68 - y0 + 2.2} y2={68 - y0 + 3.8} />
        <line x1={x1} x2={x1} y1={68 - y0 + 2.2} y2={68 - y0 + 3.8} />
      </g>
      <text x={(x0 + x1) / 2} y={Math.min(68 - y0 + 6.2, 71)} fontSize={2} textAnchor="middle" fill="rgb(var(--chalk))">{`${Math.round(x1 - x0)} m`}</text>
      {(["def", "mid", "att"] as const).map((u) => (
        <UnitLine key={u} pts={by(u)} />
      ))}
      {showLanes &&
        ([
          ["left", 57],
          ["centre", 34],
          ["right", 11],
        ] as const).map(([k, y]) => {
          const share = lanes[k] / lanesTot;
          return (
            <g key={k}>
              <line x1={72} x2={84} y1={68 - y} y2={68 - y} stroke="rgb(var(--chalk))" strokeWidth={0.4 + share * 3} markerEnd="url(#rc-arrow)" opacity={0.5 + share / 2} />
              <text x={86} y={68 - y + 0.8} fontSize={2.2} fontWeight={700} fill="rgb(var(--chalk))">{Math.round(share * 100)}%</text>
            </g>
          );
        })}
      {shape.players.map((p) => (
        <g key={p.id}>
          <Disc at={[p.x, p.y]} side={side} label={n.number(p.id)} />
          <text x={p.x} y={68 - p.y + 3.9} fontSize={1.6} textAnchor="middle" fill="rgb(var(--chalk) / 0.85)">{n.name(p.id)}</text>
        </g>
      ))}
    </g>
  );
}

function NetworkLayer({ net, side }: { net: Data["networks"][Side]; side: Side }) {
  const n = useNames();
  const at = Object.fromEntries(net.nodes.map((p) => [p.id, p]));
  const maxN = Math.max(...net.edges.map((e) => e.n), 1);
  const maxP = Math.max(...net.nodes.map((p) => p.passes), 1);
  return (
    <g>
      {net.edges.map((e) => {
        const p = at[e.a];
        const q = at[e.b];
        if (!p || !q) return null;
        return <line key={e.a + e.b} x1={p.x} y1={68 - p.y} x2={q.x} y2={68 - q.y} stroke="rgb(var(--chalk))" strokeOpacity={0.2 + (0.7 * e.n) / maxN} strokeWidth={0.25 + (1.5 * e.n) / maxN} strokeLinecap="round" />;
      })}
      {net.nodes.map((p) => (
        <g key={p.id}>
          <Disc at={[p.x, p.y]} side={side} label={n.number(p.id)} r={1.3 + (1.4 * p.passes) / maxP} />
          <text x={p.x} y={68 - p.y + 4.3} fontSize={1.6} textAnchor="middle" fill="rgb(var(--chalk) / 0.85)">{n.name(p.id)}</text>
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------------- chances

type Filter = "all" | "goals" | "big" | "better";
const BETTER = new Set(["better_pass", "better_assist", "earlier"]);

function Chances({ a }: { a: Data }) {
  const { t } = useTranslation();
  const n = useNames();
  const [filter, setFilter] = useState<Filter>("all");
  const list = a.chances.filter((c) =>
    filter === "goals" ? c.outcome === "goal" : filter === "big" ? c.xg >= 0.2 : filter === "better" ? c.reasons.some((r) => BETTER.has(r)) : true,
  );
  const [sel, setSel] = useState(() => a.chances.find((c) => c.outcome !== "goal" && c.reasons.some((r) => BETTER.has(r)))?.seq ?? a.chances[0].seq);
  const chance = a.chances.find((c) => c.seq === sel) ?? a.chances[0];
  useEffect(() => {
    const pick = (e: Event) => setSel((e as CustomEvent<number>).detail);
    window.addEventListener("rc-chance", pick);
    return () => window.removeEventListener("rc-chance", pick);
  }, []);
  return (
    <div>
      <ChanceStrip a={a} sel={chance.seq} onPick={setSel} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="order-2 lg:order-1">
          <Seg
            label={t("analysis.filter")}
            value={filter}
            onChange={setFilter}
            options={[
              { v: "all", label: t("analysis.f.all") },
              { v: "goals", label: t("analysis.f.goals") },
              { v: "big", label: t("analysis.f.big") },
              { v: "better", label: t("analysis.f.better") },
            ]}
          />
          <ul className="mt-4 grid max-h-[560px] gap-2 overflow-y-auto pr-1" data-lenis-prevent>
            {list.map((c) => (
              <li key={c.seq}>
                <button
                  type="button"
                  aria-pressed={c.seq === chance.seq}
                  onClick={() => setSel(c.seq)}
                  className={`rc-press flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 ring-inset transition-colors ${c.seq === chance.seq ? "bg-chalk text-[#14123a] ring-chalk" : "bg-turf text-chalk ring-turf-edge hover:ring-chalk-faint"}`}
                >
                  <span className="w-12 font-mono text-[13px] tabular-nums opacity-70">{clock(c.second)}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: pitchKit(c.side).kit }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{n.full(c.shooter)}</span>
                    <span className="block text-[12px] opacity-70">
                      {t(`analysis.out.${c.outcome}`)} · xG {f2(c.xg)}
                    </span>
                  </span>
                  {c.reasons.some((r) => BETTER.has(r)) && c.outcome !== "goal" && <span className="rounded-full bg-flare px-2 py-0.5 text-[11px] font-bold text-flare-ink">{t("analysis.f.betterShort")}</span>}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="text-[14px] text-chalk-dim">{t("analysis.noneFilter")}</li>}
          </ul>
        </div>
        <div className="order-1 lg:order-2">
          <ChanceBoard key={chance.seq} c={chance} a={a} />
        </div>
      </div>
    </div>
  );
}

/** All shots on one 90-minute line, sized by xG: home above, away below. */
function ChanceStrip({ a, sel, onPick }: { a: Data; sel: number; onPick(seq: number): void }) {
  const { t } = useTranslation();
  const n = useNames();
  const W = 1000;
  const H = 120;
  const x = (s: number) => 20 + (s / a.duration_s) * (W - 40);
  return (
    <div className="rounded-3xl bg-turf px-3 py-4 ring-1 ring-inset ring-turf-edge sm:px-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="group" aria-label={t("analysis.strip")}>
        <line x1={20} x2={W - 20} y1={60} y2={60} stroke="rgb(var(--chalk) / 0.3)" />
        <line x1={x(2700)} x2={x(2700)} y1={14} y2={106} stroke="rgb(var(--chalk) / 0.2)" strokeDasharray="4 4" />
        <text x={20} y={16} fontSize={14} fill="rgb(var(--chalk-dim))">{n.club("home")}</text>
        <text x={20} y={114} fontSize={14} fill="rgb(var(--chalk-dim))">{n.club("away")}</text>
        <text x={x(2700) + 6} y={16} fontSize={13} fill="rgb(var(--chalk-faint))">45'</text>
        <text x={W - 20} y={16} fontSize={13} textAnchor="end" fill="rgb(var(--chalk-faint))">90'</text>
        {a.chances.map((c) => {
          const r = 5 + Math.sqrt(c.xg) * 22;
          const cy = c.side === "home" ? 60 - 10 - r : 60 + 10 + r;
          const on = c.seq === sel;
          return (
            <g key={c.seq} className="cursor-pointer" onClick={() => onPick(c.seq)} role="button" tabIndex={0} aria-label={`${clock(c.second)} ${n.full(c.shooter)} xG ${f2(c.xg)} ${t(`analysis.out.${c.outcome}`)}`} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onPick(c.seq))}>
              <line x1={x(c.second)} x2={x(c.second)} y1={60} y2={cy} stroke="rgb(var(--chalk) / 0.3)" />
              <circle cx={x(c.second)} cy={cy} r={r} fill={c.outcome === "goal" ? pitchKit(c.side).kit : "transparent"} stroke={pitchKit(c.side).kit} strokeWidth={2} />
              {on && <circle cx={x(c.second)} cy={cy} r={r + 5} fill="none" stroke="rgb(var(--flare))" strokeWidth={2.5} />}
              <circle cx={x(c.second)} cy={cy} r={Math.max(r, 14)} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 px-1 text-[12px] text-chalk-dim">
        <span>{t("analysis.stripKey")}</span>
      </div>
    </div>
  );
}

/** Telestrated freeze-frame: the five seconds before the shot, then the breakdown drawn on. */
function ChanceBoard({ c, a }: { c: Chance; a: Data }) {
  const { t } = useTranslation();
  const n = useNames();
  const reduced = useUi((s) => s.reducedMotion);
  const last = c.frames.length - 1;
  const [k, setK] = useState(reduced ? last : 0);
  const [run, setRun] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (reduced) return setK(last);
    const t0 = performance.now();
    const dur = 3200;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      setK(p * last);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    setK(0);
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [run, reduced, last]);

  const units = useMemo(() => Object.fromEntries(a.players.map((p) => [p.id, p.unit])), [a.players]);
  const d = c.attack_dir;
  const i0 = Math.floor(k);
  const i1 = Math.min(i0 + 1, last);
  const u = k - i0;
  const lerp = (p: XY, q: XY): XY => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  const raw = c.frames[i0].pos.map((p, i) => fwd(lerp(p, c.frames[i1].pos[i]), d));
  const ball = fwd(lerp(c.frames[i0].ball, c.frames[i1].ball), d);
  const done = k >= last - 0.001;
  const att = c.side;
  const def = other(att);
  const isAtt = (i: number) => (att === "home" ? i < 11 : i >= 11);
  const ix = (id: string) => (id.startsWith("H") ? Number(id.slice(1)) - 1 : Number(id.slice(1)) + 10);
  // The engine lets several defenders converge on the ball; spread stacked discs apart for
  // reading only (the shooter stays put), the way a telestrator nudges overlapping players.
  const pos = spread(raw, ix(c.shooter));
  const shooter = pos[ix(c.shooter)];
  const defUnit = (u: Unit) => pos.filter((_, i) => !isAtt(i) && units[idAt(i)] === u);
  const alts = c.alternatives.filter((o) => o.value >= 0.005).slice(0, 2);
  const betterPass = c.reasons.includes("better_pass");
  const crowded = c.reasons.includes("crowded");
  const assistFrom = c.assist ? fwd(c.assist.from, d) : null;
  const assistTo = c.assist ? fwd(c.assist.to, d) : null;
  const reachIds = new Set(c.reach.slice(0, 2).map((r) => r.id));

  return (
    <div>
      <div className="relative">
        <PitchSvg view="44 -2 63 74.6" label={t("analysis.boardAria", { time: clock(c.second), name: n.full(c.shooter) })}>
          <g style={{ opacity: done ? 1 : 0, transition: "opacity 500ms var(--ease-out)" }}>
            {/* the shooting cone: hatched yellow when it's crowded */}
            <polygon points={[sv(ball), sv([105, 37.66]), sv([105, 30.34])].map((p) => p.join(",")).join(" ")} fill={crowded ? "url(#rc-hatch-flare)" : "url(#rc-hatch)"} stroke={crowded ? "rgb(var(--flare))" : "rgb(var(--chalk) / 0.5)"} strokeWidth={0.25} />
            <UnitLine pts={defUnit("def")} />
            <UnitLine pts={defUnit("mid")} />
            {assistFrom && assistTo && (
              <line x1={sv(assistFrom)[0]} y1={sv(assistFrom)[1]} x2={sv(assistTo)[0]} y2={sv(assistTo)[1]} stroke="rgb(var(--chalk) / 0.7)" strokeWidth={0.4} markerEnd="url(#rc-arrow)" />
            )}
            {alts.map((o, j) => {
              const to = pos[ix(o.id)];
              const flare = betterPass && j === 0;
              return (
                <line key={o.id} x1={sv(shooter)[0]} y1={sv(shooter)[1]} x2={sv(to)[0]} y2={sv(to)[1]} stroke={flare ? "rgb(var(--flare))" : "rgb(var(--chalk) / 0.8)"} strokeWidth={flare ? 0.55 : 0.35} strokeDasharray="1.4 0.9" markerEnd={flare ? "url(#rc-arrow-flare)" : "url(#rc-arrow)"} />
              );
            })}
            <circle cx={sv(shooter)[0]} cy={sv(shooter)[1]} r={3.6} fill="none" stroke="rgb(var(--chalk))" strokeWidth={0.9} filter="url(#rc-glow)" />
            <circle cx={sv(shooter)[0]} cy={sv(shooter)[1]} r={3.2} fill="none" stroke="rgb(var(--chalk))" strokeWidth={0.35} />
          </g>
          {pos.map((p, i) => (
            <Disc key={i} at={p} side={isAtt(i) ? att : def} label={n.number(idAt(i))} r={1.7} dim={done && !isAtt(i) && !reachIds.has(idAt(i)) && units[idAt(i)] === "att"} />
          ))}
          <circle cx={sv(ball)[0]} cy={sv(ball)[1]} r={0.85} fill="#fff" stroke="#14123a" strokeWidth={0.3} />
          {done && (
            <g className="rc-fade-in">
              <Tag at={shooter}>{`${n.name(c.shooter)} · xG ${f2(c.xg)}`}</Tag>
              {alts.map((o, j) => (
                <Tag key={o.id} at={pos[ix(o.id)]} flare={betterPass && j === 0}>{`${n.name(o.id)} ${pc(o.pass_p)} · ${f2(o.xg)}`}</Tag>
              ))}
              {c.reach.slice(0, 2).map((r) => (
                <Tag key={r.id} at={pos[ix(r.id)]} dy={3.6}>{`${r.t.toFixed(1)}s`}</Tag>
              ))}
            </g>
          )}
          <text x={46} y={71.4} fontSize={2} fill="rgb(var(--chalk) / 0.7)">{`${clock(c.frames[Math.round(k)].second)}`}</text>
          <text x={96} y={71.4} fontSize={2} fill="rgb(var(--chalk) / 0.6)" textAnchor="end">{t("analysis.attacking")} →</text>
        </PitchSvg>
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className="rc-press absolute right-3 top-3 min-h-[36px] rounded-full bg-turf-deep/80 px-3 text-[12px] font-semibold text-chalk ring-1 ring-inset ring-turf-edge backdrop-blur"
        >
          {t("analysis.replay")}
        </button>
      </div>
      <Breakdown c={c} />
    </div>
  );
}

function spread(pts: XY[], fixed: number, gap = 3.8): XY[] {
  const out = pts.map((p) => [p[0], p[1]] as XY);
  for (let it = 0; it < 12; it++) {
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        let dx = out[j][0] - out[i][0];
        let dy = out[j][1] - out[i][1];
        let dd = Math.hypot(dx, dy);
        if (dd >= gap) continue;
        if (dd < 1e-3) [dx, dy, dd] = [Math.cos(i * 2.4 + j), Math.sin(i * 2.4 + j), 1];
        const push = (gap - dd) / 2;
        const ux = (dx / dd) * push;
        const uy = (dy / dd) * push;
        const wi = i === fixed ? 0 : j === fixed ? 2 : 1;
        const wj = j === fixed ? 0 : i === fixed ? 2 : 1;
        out[i] = [out[i][0] - ux * wi, out[i][1] - uy * wi];
        out[j] = [out[j][0] + ux * wj, out[j][1] + uy * wj];
      }
  }
  return out;
}

function Breakdown({ c }: { c: Chance }) {
  const { t } = useTranslation();
  const n = useNames();
  const best: Option | undefined = c.alternatives[0];
  const chosen = c.assist_options.find((o) => o.chosen);
  const bestAssist = c.assist_options[0];
  const notes: { flare: boolean; text: string }[] = [];
  for (const r of c.reasons) {
    if (r === "better_pass" && best) notes.push({ flare: true, text: t("analysis.why.better_pass", { name: n.name(best.id), p: pc(best.pass_p), xg: f2(best.xg), value: f2(best.value), shot: f2(c.xg) }) });
    else if (r === "better_assist" && c.assist && bestAssist && chosen)
      notes.push({ flare: true, text: t("analysis.why.better_assist", { passer: n.name(c.assist.id), name: n.name(bestAssist.id), value: f2(bestAssist.value), chosen: f2(chosen.value), shooter: n.name(c.shooter) }) });
    else if (r === "earlier") notes.push({ flare: true, text: t("analysis.why.earlier", { before: f2(c.xg_1s_before), xg: f2(c.xg) }) });
    else if (r === "crowded") notes.push({ flare: true, text: t("analysis.why.crowded", { count: c.blockers }) });
    else if (r === "long_range") notes.push({ flare: true, text: t("analysis.why.long_range", { m: Math.round(c.distance_m) }) });
    else if (r === "tight_angle") notes.push({ flare: true, text: t("analysis.why.tight_angle", { deg: Math.round(c.angle_deg) }) });
    else if (r === "pressured") notes.push({ flare: false, text: t("analysis.why.pressured", { m: c.nearest_m.toFixed(1) }) });
    else if (r === "big_chance") notes.push({ flare: false, text: t("analysis.why.big_chance", { xg: f2(c.xg) }) });
  }
  const anyBetter = c.reasons.some((r) => r !== "pressured" && r !== "big_chance");
  if (!anyBetter) notes.push({ flare: false, text: c.outcome === "goal" ? t("analysis.why.rightGoal") : t("analysis.why.right") });
  const reach = c.reach.slice(0, 2);
  return (
    <div className="mt-4 rounded-3xl bg-turf p-5 ring-1 ring-inset ring-turf-edge sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[clamp(24px,3vw,34px)] leading-none text-chalk">
          {clock(c.second)} · {n.full(c.shooter)}
        </h3>
        <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${c.outcome === "goal" ? "bg-chalk text-[#14123a]" : "ring-1 ring-inset ring-turf-edge text-chalk"}`}>{t(`analysis.out.${c.outcome}`)}</span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Num k="xG" v={f2(c.xg)} />
        <Num k={t("analysis.distance")} v={`${Math.round(c.distance_m)} m`} />
        <Num k={t("analysis.angle")} v={`${Math.round(c.angle_deg)}°`} />
        <Num k={t("analysis.inCone")} v={String(c.blockers)} />
      </dl>
      <p className="mt-5 text-[15px] leading-relaxed text-chalk-dim">
        {c.assist ? t("analysis.buildAssist", { s: c.build_up_s, name: n.name(c.assist.id) }) : t("analysis.build", { s: c.build_up_s })}{" "}
        {reach.length === 2 && t("analysis.reach", { a: n.name(reach[0].id), at: reach[0].t.toFixed(1), b: n.name(reach[1].id), bt: reach[1].t.toFixed(1) })}
      </p>
      <h4 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.14em] text-chalk-faint">{t("analysis.couldBe")}</h4>
      <ul className="mt-3 grid gap-2">
        {notes.map((x, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-snug text-chalk">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${x.flare ? "bg-flare" : "bg-chalk-faint"}`} aria-hidden />
            <span>{x.text}</span>
          </li>
        ))}
      </ul>
      {c.alternatives.length > 0 && (
        <table className="mt-6 w-full text-[13px]">
          <caption className="mb-2 text-left text-[13px] text-chalk-faint">{t("analysis.optionsCap")}</caption>
          <thead>
            <tr className="text-left text-chalk-faint">
              <th className="py-1 font-medium">{t("analysis.option")}</th>
              <th className="py-1 text-right font-medium">{t("analysis.passP")}</th>
              <th className="py-1 text-right font-medium">xG</th>
              <th className="py-1 text-right font-medium">{t("analysis.worth")}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums text-chalk">
            <tr className="border-t border-turf-edge/60">
              <td className="py-1.5 font-semibold">{t("analysis.shotItself", { name: n.name(c.shooter) })}</td>
              <td className="py-1.5 text-right">—</td>
              <td className="py-1.5 text-right">{f2(c.xg)}</td>
              <td className="py-1.5 text-right font-semibold">{f2(c.xg)}</td>
            </tr>
            {c.alternatives.map((o) => (
              <tr key={o.id} className="border-t border-turf-edge/60">
                <td className="py-1.5">{t("analysis.passTo", { name: n.name(o.id) })}</td>
                <td className="py-1.5 text-right">{pc(o.pass_p)}</td>
                <td className="py-1.5 text-right">{f2(o.xg)}</td>
                <td className="py-1.5 text-right">{f2(o.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Num({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-turf-deep/60 px-3 py-2.5">
      <dt className="text-[12px] text-chalk-faint">{k}</dt>
      <dd className="font-display text-[24px] leading-tight text-chalk tabular-nums">{v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------------- moments

function Moments({ a }: { a: Data }) {
  const { t } = useTranslation();
  const n = useNames();
  const pick = (seq: number) => {
    window.dispatchEvent(new CustomEvent("rc-chance", { detail: seq }));
    document.getElementById("chances")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl bg-turf p-5 ring-1 ring-inset ring-turf-edge sm:p-6">
        <h3 className="text-[15px] font-semibold text-chalk">{t("analysis.turnovers")}</h3>
        <p className="mt-1 text-[13px] text-chalk-dim">{t("analysis.turnoversSub")}</p>
        <ul className="mt-4 grid gap-2">
          {a.turnovers.slice(0, 6).map((x) => (
            <li key={x.second + x.player_id}>
              <button type="button" onClick={() => pick(x.shot_seq)} className="rc-press flex w-full items-center gap-3 rounded-2xl bg-turf-deep/60 px-4 py-3 text-left hover:ring-1 hover:ring-chalk-faint">
                <span className="w-12 font-mono text-[13px] tabular-nums text-chalk-faint">{clock(x.second)}</span>
                <span className="min-w-0 flex-1 text-[14px] leading-snug text-chalk">
                  {t(x.kind === "pass" ? "analysis.lostPass" : "analysis.lostDuel", { name: n.full(x.player_id), m: Math.round(x.own_x), s: x.shot_second - x.second })}
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-chalk">xG {f2(x.xg_conceded)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-3xl bg-turf p-5 ring-1 ring-inset ring-turf-edge sm:p-6">
        <h3 className="text-[15px] font-semibold text-chalk">{t("analysis.bug")}</h3>
        <p className="mt-1 text-[13px] text-chalk-dim">{t("analysis.bugSub")}</p>
        {a.mistakes.map((m) => (
          <div key={m.goal_id} className="mt-4 rounded-2xl bg-flare/10 p-4 ring-1 ring-inset ring-flare/60">
            <div className="font-mono text-[13px] text-flare">{clock(m.second)}</div>
            <div className="mt-1 text-[17px] font-semibold text-chalk">
              {n.full(m.player_id)} · <BugName code={m.bug} />
            </div>
            <p className="mt-2 text-[14px] leading-snug text-chalk-dim">{t("analysis.bugBody", { time: clock(m.goal_second), m: m.params.metres_behind_line ?? "" })}</p>
            <a href="#/report" onClick={(e) => (e.preventDefault(), go("report"))} className="rc-press mt-4 inline-flex min-h-[40px] items-center rounded-full bg-flare px-4 text-[14px] font-semibold text-flare-ink">
              {t("analysis.readReport")}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------- players

function Players({ a }: { a: Data }) {
  const { t } = useTranslation();
  const n = useNames();
  const [side, setSide] = useState<Side>("home");
  const list = a.players.filter((p) => p.side === side).sort((p, q) => q.rating - p.rating);
  return (
    <div>
      <Seg label={t("analysis.team")} value={side} onChange={setSide} options={[{ v: "home", label: n.club("home") }, { v: "away", label: n.club("away") }]} />
      <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p, i) => (
          <li key={p.id}>
            <PlayerCard p={p} top={i === 0} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerCard({ p, top }: { p: PlayerStats; top: boolean }) {
  const { t } = useTranslation();
  const n = useNames();
  const stats: [string, string][] =
    p.unit === "gk"
      ? [
          [t("analysis.ps.touches"), String(p.touches)],
          [t("analysis.ps.passes"), `${p.passes} · ${Math.round(p.pass_pct)}%`],
          [t("analysis.ps.duels"), `${p.duels_won}–${p.duels_lost}`],
        ]
      : [
          [t("analysis.ps.touches"), String(p.touches)],
          [t("analysis.ps.passes"), `${p.passes} · ${Math.round(p.pass_pct)}%`],
          [t("analysis.ps.progressive"), String(p.progressive)],
          [t("analysis.ps.xt"), f2(p.xt)],
          [t("analysis.ps.keyPasses"), String(p.key_passes)],
          [t("analysis.ps.shots"), `${p.shots} · xG ${f2(p.xg)}`],
          [t("analysis.ps.duels"), `${p.duels_won}–${p.duels_lost}`],
          [t("analysis.ps.losses"), String(p.losses)],
        ];
  return (
    <article className={`h-full rounded-3xl p-5 ring-1 ring-inset ${top ? "bg-chalk text-[#14123a] ring-chalk" : "bg-turf text-chalk ring-turf-edge"}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[16px]" style={{ background: pitchKit(p.side).kit, color: pitchKit(p.side).trim }}>
          {n.number(p.id)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-semibold">{n.full(p.id)}</h3>
          <div className="text-[13px] opacity-70">
            {p.position}
            {p.goals > 0 && ` · ${t("analysis.ps.goals", { count: p.goals })}`}
            {p.assists > 0 && ` · ${t("analysis.ps.assists", { count: p.assists })}`}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-[30px] leading-none tabular-nums">{p.rating.toFixed(1)}</div>
          <div className="text-[11px] opacity-60">{t("analysis.ps.rating")}</div>
        </div>
      </div>
      <Heat grid={p.heat} dark={top} label={t("analysis.ps.heat", { name: n.full(p.id) })} />
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        {stats.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-current/10 pb-1">
            <dt className="opacity-70">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/** Where the player spent the match (sampled every 3 s), attacking right. One hue, light to dark. */
function Heat({ grid, dark, label }: { grid: number[][]; dark: boolean; label: string }) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 1;
  const cw = 105 / cols;
  const ch = 68 / rows;
  return (
    <svg viewBox="0 0 105 68" role="img" aria-label={label} className={`mt-4 block w-full rounded-xl ${dark ? "bg-[#1530d6]" : "bg-[#0b1a8a]"}`}>
      {grid.map((row, j) =>
        row.map((v, i) => (v > 0.04 ? <rect key={`${i}-${j}`} x={i * cw + 0.5} y={68 - (j + 1) * ch + 0.5} width={cw - 1} height={ch - 1} rx={1.5} fill={`rgb(243 245 255 / ${(0.1 + 0.85 * v).toFixed(2)})`} /> : null)),
      )}
      <g fill="none" stroke="rgb(243 245 255 / 0.35)" strokeWidth={0.5}>
        <rect x={0.25} y={0.25} width={104.5} height={67.5} rx={2} />
        <line x1={52.5} y1={0} x2={52.5} y2={68} />
        <rect x={0} y={13.84} width={16.5} height={40.32} />
        <rect x={88.5} y={13.84} width={16.5} height={40.32} />
      </g>
    </svg>
  );
}
