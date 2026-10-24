import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Analysis, Bend, Side, Stacks, XY } from "../../api/analysis";
import type { Depth } from "../../store/uiStore";

/**
 * The Tactics Board: both teams from above, five minutes at a time, drawn like chalk on a coach's
 * board. Home attacks right. Each unit (back line, midfield, attack) is joined up; without the
 * ball each back line is drawn solid where it is now and dashed where it usually sits in the
 * clubs' other meetings. A bend (a move of 5 m or more, held 10 minutes) is marked on the scrubber
 * and judged by the next 15 minutes. Only measured positions: it never claims a manager's plan.
 */
export type Phase = "out" | "in";
const HOME = "#f4f6ff", AWAY = "#8fa6ff", VAR = "#ffd60a";
const SIDES: Side[] = ["home", "away"];
const f2 = (v: number) => v.toFixed(2);

/** a window's 22 positions in one frame (home attacking right), the away side turned round */
function framed(s: Stacks, w: number, phase: Phase): (XY | null)[] {
  const win = s.shape_stack.windows[w];
  // stacks.json is y-up; the board, like the shot map, draws y down
  const h = win[`home_${phase}`].map((p) => (p ? ([p[0], 68 - p[1]] as XY) : null));
  const a = win[`away_${phase}`].map((p) => (p ? ([105 - p[0], p[1]] as XY) : null));
  return [...h, ...a];
}

/** tween the drawn positions toward the target so shapes glide from one window to the next */
function useGlide(target: (XY | null)[], reduced: boolean) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reduced) {
      cur.current = target;
      setShown(target);
      return;
    }
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / 650), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      const next = target.map((p, i) => {
        const q = from.current[i];
        return p && q ? ([q[0] + (p[0] - q[0]) * e, q[1] + (p[1] - q[1]) * e] as XY) : p;
      });
      cur.current = next;
      setShown(next);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return shown;
}

export function TacticsBoard({ s, names, clubs, depth, reduced }: { s: Stacks; names: (id: string) => string; clubs: Record<Side, string>; depth: Depth; reduced: boolean }) {
  const { t } = useTranslation();
  const n = s.shape_stack.windows.length;
  const allBends = SIDES.flatMap((side) => s.shape_stack.teams[side].bends.map((b) => ({ side, b })));
  const [w, setW] = useState(() => allBends[0]?.b.w ?? Math.min(12, n - 1));
  const [phase, setPhase] = useState<Phase>("out");
  const [playing, setPlaying] = useState(false);
  const target = useRef<(XY | null)[]>([]);
  const key = `${w}-${phase}`;
  const memo = useRef<{ key: string; v: (XY | null)[] }>({ key: "", v: [] });
  if (memo.current.key !== key) memo.current = { key, v: framed(s, w, phase) };
  target.current = memo.current.v;
  const pos = useGlide(memo.current.v, reduced);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setW((x) => (x + 1 >= n ? (setPlaying(false), x) : x + 1)), 1100);
    return () => clearInterval(id);
  }, [playing, n]);

  const ids = [...Array(11)].map((_, i) => `H${i + 1}`).concat([...Array(11)].map((_, i) => `A${i + 1}`));
  const unitOf = (i: number) => s.shape_stack.teams[i < 11 ? "home" : "away"].units[i % 11];
  const here = allBends.filter((x) => x.b.w === w);
  const lines = SIDES.map((side) => {
    const m = s.shape_stack.teams[side].metrics[w]?.line_m ?? null, u = s.dossier[side].line_usual_m;
    const X = (v: number) => (side === "home" ? v : 105 - v);
    return { side, now: m, usual: u, x: m === null ? null : X(m), ux: u === null ? null : X(u) };
  });
  const bendLine = (side: Side, b: Bend) => t("match.board.bend", { team: clubs[side], what: t(`match.shape.kind.${b.kind}`, { m: Math.round(b.m) }) });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 rounded-[22px] bg-[#071048] p-3 ring-1 ring-inset ring-turf-edge/70 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("match.board.phase")} className="inline-flex rounded-full p-1 ring-1 ring-inset ring-chalk/20">
            {(["out", "in"] as const).map((p) => (
              <button key={p} type="button" aria-pressed={phase === p} onClick={() => setPhase(p)} className="rc-press min-h-[34px] rounded-full px-3 text-[13px] font-semibold text-chalk-dim aria-pressed:bg-chalk aria-pressed:text-turf-deep">
                {t(p === "out" ? "match.shape.out" : "match.shape.in")}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <span className="flex items-center gap-3 text-[12.5px] text-chalk-dim">
            <span className="inline-flex items-center gap-1.5"><i aria-hidden className="block h-2.5 w-2.5 rounded-full" style={{ background: HOME }} />{clubs.home}</span>
            <span className="inline-flex items-center gap-1.5"><i aria-hidden className="block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: AWAY }} />{clubs.away}</span>
          </span>
        </div>

        <svg viewBox="-3 -3 111 74" className="mt-3 block w-full" role="img" aria-label={t("match.board.aria", { a: w * 5, b: w * 5 + 5 })}>
          <defs>
            <pattern id="mow" width="21" height="68" patternUnits="userSpaceOnUse">
              <rect width="10.5" height="68" fill="#0c1a6e" />
              <rect x="10.5" width="10.5" height="68" fill="#0e1e7a" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="105" height="68" fill="url(#mow)" />
          <g fill="none" stroke="rgba(244,246,255,.42)" strokeWidth="0.28">
            <rect x="0" y="0" width="105" height="68" />
            <line x1="52.5" y1="0" x2="52.5" y2="68" />
            <circle cx="52.5" cy="34" r="9.15" />
            <rect x="0" y="13.84" width="16.5" height="40.32" />
            <rect x="88.5" y="13.84" width="16.5" height="40.32" />
            <rect x="0" y="24.84" width="5.5" height="18.32" />
            <rect x="99.5" y="24.84" width="5.5" height="18.32" />
          </g>
          {phase === "out" &&
            lines.map((l) => {
              const col = l.side === "home" ? HOME : AWAY, bent = here.some((x) => x.side === l.side);
              return (
                <g key={l.side}>
                  {l.ux !== null && <line x1={l.ux} y1="1" x2={l.ux} y2="67" stroke={col} strokeWidth="0.35" strokeDasharray="1.2 1.2" opacity="0.55" />}
                  {l.x !== null && <line x1={l.x} y1="1" x2={l.x} y2="67" stroke={bent ? VAR : col} strokeWidth={bent ? 0.7 : 0.5} opacity="0.95" />}
                  {l.x !== null && l.now !== null && (
                    <text x={l.x + (l.side === "home" ? 1 : -1)} y={l.side === "home" ? 3.6 : 66} textAnchor={l.side === "home" ? "start" : "end"} fontSize="1.9" fill={bent ? VAR : col} fontFamily="JetBrains Mono, ui-monospace, monospace">
                      {t("match.board.line", { m: l.now.toFixed(0) })}
                      {l.usual !== null ? ` · ${t("match.board.usual", { m: l.usual.toFixed(0) })}` : ""}
                    </text>
                  )}
                </g>
              );
            })}
          {[0, 1].map((team) =>
            (["def", "mid", "att"] as const).map((u) => {
              const pts = pos
                .map((p, i) => ({ p, i }))
                .filter(({ p, i }) => p && (i < 11) === (team === 0) && unitOf(i) === u)
                .map(({ p }) => p!)
                .sort((a, b) => a[1] - b[1]);
              return pts.length > 1 ? <polyline key={`${team}${u}`} points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={team ? AWAY : HOME} strokeWidth="0.45" strokeLinejoin="round" opacity="0.7" /> : null;
            }),
          )}
          {pos.map((p, i) =>
            p ? (
              <g key={ids[i]}>
                <title>{names(ids[i])}</title>
                <circle cx={p[0]} cy={p[1]} r={unitOf(i) === "gk" ? 1.1 : 1.4} fill={i < 11 ? HOME : "#0b1660"} stroke={i < 11 ? HOME : AWAY} strokeWidth="0.55" />
                {depth === "expert" && (
                  <text x={p[0]} y={p[1] + 0.75} textAnchor="middle" fontSize="1.7" fontWeight="700" fill={i < 11 ? "#0b1660" : AWAY}>
                    {s.names[ids[i]]?.number ?? ""}
                  </text>
                )}
              </g>
            ) : null,
          )}
          <text x="52.5" y="-0.8" textAnchor="middle" fontSize="2.2" fill="rgba(244,246,255,.55)" fontFamily="JetBrains Mono, ui-monospace, monospace">
            {t("match.board.attack", { team: clubs.home })} →
          </text>
        </svg>

        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={() => (w >= n - 1 && setW(0), setPlaying((p) => !p))} className="rc-press min-h-[38px] shrink-0 rounded-full bg-chalk px-4 text-[13px] font-bold text-turf-deep">
            {playing ? t("match.board.pause") : t("match.board.play")}
          </button>
          <span className="w-[70px] shrink-0 font-trace text-[13px] tabular-nums text-chalk">{t("match.board.window", { a: w * 5, b: w * 5 + 5 })}</span>
          <div className="relative min-w-0 flex-1">
            <input id="board-w" type="range" min={0} max={n - 1} value={w} onChange={(e) => (setPlaying(false), setW(Number(e.target.value)))} aria-label={t("match.board.scrub")} className="w-full accent-[#ffd60a]" />
            <div aria-hidden className="pointer-events-none absolute inset-x-[8px] -bottom-1 h-2">
              {allBends.map(({ side, b }) => (
                <i key={side + b.w + b.kind} className="absolute h-2 w-[3px] -translate-x-1/2 rounded-sm bg-[#ffd60a]" style={{ left: `${(b.w / (n - 1)) * 100}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <aside aria-live="polite" className="rounded-[22px] bg-[#071048] p-4 ring-1 ring-inset ring-turf-edge/70">
        <p className="font-display text-[17px] font-bold text-chalk">{t("match.board.window", { a: w * 5, b: w * 5 + 5 })}</p>
        {here.length ? (
          <ul className="mt-2 grid gap-3">
            {here.map(({ side, b }) => (
              <li key={side + b.kind}>
                <p className="text-[14px] font-semibold text-flare">{bendLine(side, b)}</p>
                <p className="mt-1 text-[13px] leading-snug text-chalk-dim">
                  <b className="text-chalk">{t(`match.shape.verdict.${b.next.verdict}`)}.</b> {t(`match.shape.why.${b.next.verdict}`, { before: f2(b.next.before.xg_against), after: f2(b.next.after.xg_against) })}
                </p>
                {depth === "expert" && (
                  <p className="mt-1 text-[12px] leading-snug text-chalk-faint tabular-nums">
                    {t("match.shape.shots", { sf: b.next.after.shots_for, bsf: b.next.before.shots_for, sa: b.next.after.shots_against, bsa: b.next.before.shots_against })} · {b.from.toFixed(0)} → {b.to.toFixed(0)} m
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] leading-snug text-chalk-dim">{phase === "out" ? t("match.board.steady") : t("match.board.withBall")}</p>
        )}
        {allBends.length > 0 && (
          <div className="mt-4 border-t border-turf-edge/60 pt-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-chalk-faint">{t("match.board.bends")}</p>
            <ul className="mt-2 grid gap-1.5">
              {allBends.map(({ side, b }) => (
                <li key={side + b.w + b.kind}>
                  <button type="button" onClick={() => (setPlaying(false), setPhase("out"), setW(b.w))} className="rc-press min-h-[32px] text-left text-[13px] text-chalk-dim underline decoration-chalk/25 underline-offset-4 hover:text-chalk">
                    {Math.round(b.from_s / 60)}′ · {bendLine(side, b)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-[12px] leading-snug text-chalk-faint">{t("match.shape.rule")}</p>
      </aside>
    </div>
  );
}

/** Back-line height for both sides across the 90 minutes, usual lines dashed, bends marked. */
export function LinesChart({ s, clubs }: { s: Stacks; clubs: Record<Side, string> }) {
  const { t } = useTranslation();
  const W = 600, H = 220, pl = 34, pr = 12, pt = 16, pb = 28;
  const n = s.shape_stack.windows.length;
  const series = SIDES.map((side) => s.shape_stack.teams[side].metrics.map((m) => m?.line_m ?? null));
  const vals = series.flat().filter((v): v is number => v !== null).concat(SIDES.map((x) => s.dossier[x].line_usual_m ?? 30));
  const lo = Math.floor(Math.min(...vals) / 5) * 5 - 2, hi = Math.ceil(Math.max(...vals) / 5) * 5 + 2;
  const x = (k: number) => pl + ((k + 0.5) / n) * (W - pl - pr);
  const y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  return (
    <figure className="min-w-0 rounded-[18px] bg-[#071048] p-4 ring-1 ring-inset ring-turf-edge/70">
      <figcaption className="text-[14px] font-semibold text-chalk">{t("match.board.lines")}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block w-full" role="img" aria-label={t("match.board.lines")}>
        {[lo + 2, Math.round((lo + hi) / 2), hi - 2].map((v) => (
          <g key={v}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="rgba(244,246,255,.1)" />
            <text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="rgba(244,246,255,.5)">{v}</text>
          </g>
        ))}
        {SIDES.flatMap((side) => s.shape_stack.teams[side].bends).map((b, i) => (
          <rect key={i} x={x(b.w) - 8} y={pt} width={16} height={H - pt - pb} rx={3} fill="rgba(255,214,10,.16)" />
        ))}
        {SIDES.map((side, k) => {
          const col = k ? AWAY : HOME, u = s.dossier[side].line_usual_m;
          const d = series[k].map((v, i) => (v === null ? "" : `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(" ");
          return (
            <g key={side}>
              {u !== null && <line x1={pl} x2={W - pr} y1={y(u)} y2={y(u)} stroke={col} strokeDasharray="4 4" opacity={0.45} />}
              <path d={d} fill="none" stroke={col} strokeWidth={2.2} strokeLinejoin="round" />
            </g>
          );
        })}
        {[0, 45, 90].map((m) => (
          <text key={m} x={pl + (m / 90) * (W - pl - pr)} y={H - 8} textAnchor="middle" fontSize={11} fill="rgba(244,246,255,.5)">{m}′</text>
        ))}
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-chalk-faint">
        <span style={{ color: HOME }}>— {clubs.home}</span>
        <span style={{ color: AWAY }}>— {clubs.away}</span>
        <span>{t("match.board.dashed")}</span>
      </p>
    </figure>
  );
}

/** Who carried the threat: expected threat per five minutes, home above the line, away below, goals marked. */
export function MomentumChart({ a, clubs }: { a: Analysis; clubs: Record<Side, string> }) {
  const { t } = useTranslation();
  const W = 600, H = 220, pl = 12, pr = 12, mid = H / 2;
  const B = a.momentum, n = B.length;
  const max = Math.max(0.01, ...B.map((b) => Math.max(b.home_xt, b.away_xt)));
  const bw = (W - pl - pr) / n;
  const h = (v: number) => (v / max) * (mid - 22);
  return (
    <figure className="min-w-0 rounded-[18px] bg-[#071048] p-4 ring-1 ring-inset ring-turf-edge/70">
      <figcaption className="text-[14px] font-semibold text-chalk">{t("match.board.momentum")}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block w-full" role="img" aria-label={t("match.board.momentum")}>
        <line x1={pl} x2={W - pr} y1={mid} y2={mid} stroke="rgba(244,246,255,.25)" />
        {B.map((b, i) => (
          <g key={i}>
            <rect x={pl + i * bw + 2} y={mid - h(b.home_xt)} width={bw - 4} height={h(b.home_xt)} rx={2} fill={HOME} opacity={0.85} />
            <rect x={pl + i * bw + 2} y={mid} width={bw - 4} height={h(b.away_xt)} rx={2} fill={AWAY} opacity={0.85} />
            {b.goals.map((g, k) => (
              <circle key={k} cx={pl + i * bw + bw / 2} cy={g.side === "home" ? mid - h(b.home_xt) - 8 - k * 9 : mid + h(b.away_xt) + 8 + k * 9} r={3.6} fill={VAR} />
            ))}
          </g>
        ))}
        <text x={pl} y={14} fontSize={11} fill={HOME}>{clubs.home}</text>
        <text x={pl} y={H - 6} fontSize={11} fill={AWAY}>{clubs.away}</text>
        <text x={W - pr} y={H - 6} textAnchor="end" fontSize={11} fill="rgba(244,246,255,.5)">90′</text>
      </svg>
      <p className="mt-1 text-[12px] text-chalk-faint">{t("match.board.momentumKey")}</p>
    </figure>
  );
}
