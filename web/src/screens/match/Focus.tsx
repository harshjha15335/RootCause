import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../components/bits";
import "../../components/fanStrings";
import { useLab, type Lab } from "../../lab/data";
import { matchStats, playerMoments, rhythmAt } from "../../lab/stats";
import { go } from "../../lib/nav";
import { fanIndex, fanSide, useFan } from "../../store/fanStore";
import { MomentText } from "./lab/MatchLab";
import { PlayerReel } from "./PlayerReel";

const minute = (s: number) => Math.floor(s / 60);
const watch = (s: number) => {
  useFan.getState().watchInLab(Math.max(0, s - 4));
  go("lab");
};

/**
 * Player focus on the Match page: the viewer's player through the whole match. Totals with their
 * tags, a 90-minute strip of every moment, and the moments worth watching, each opening the
 * Tactics Lab on that second. Without a pick, a prompt to choose from this match's squads.
 */
export function FocusSection({ matchId }: { matchId: string }) {
  const { t } = useTranslation();
  const q = useLab(matchId);
  const player = useFan((u) => u.player);
  const club = useFan((u) => u.club);
  if (!q.data) return <div className="h-[220px] animate-pulse rounded-[22px] bg-turf/60" aria-hidden="true" />;
  const lab = q.data;
  const i = fanIndex(lab, player);
  if (i == null) {
    const side = fanSide(lab.clubs, club);
    return (
      <div className="rounded-[22px] bg-turf p-5 ring-1 ring-inset ring-turf-edge sm:p-6">
        <p className="max-w-[60ch] text-[16px] leading-relaxed text-chalk-dim">
          {player ? t("fan.focus.notHere", { name: player, home: lab.clubs[0].name, away: lab.clubs[1].name }) : t("fan.focus.subNone")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(side != null ? [side] : [0, 1]).flatMap((k) =>
            lab.clubs[k].players.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => useFan.getState().setPlayer(p.name, lab.clubs[k].name)}
                className="rc-press flex min-h-[40px] items-center gap-2 rounded-full bg-turf-deep px-3 text-[13px] font-semibold text-chalk ring-1 ring-inset ring-turf-edge hover:bg-turf-raised"
              >
                <Badge club={lab.clubs[k]} size={16} />
                <span className="tabular-nums text-chalk-faint">{p.number}</span> {p.name}
              </button>
            )),
          )}
        </div>
      </div>
    );
  }
  return <Focused lab={lab} i={i} />;
}

function Focused({ lab, i }: { lab: Lab; i: number }) {
  const { t } = useTranslation();
  const st = matchStats(lab);
  const p = st.players[i];
  const moments = useMemo(() => playerMoments(lab, i), [lab, i]);
  const team = i < 11 ? 0 : 1;
  const key = moments.filter(
    (m) =>
      m.kind === "goal" ||
      m.kind === "shot" ||
      m.kind === "run" ||
      (m.kind === "pass" && m.pass && (m.pass.grade === "hard" || m.pass.grade === "elite" || m.pass.tags.includes("lineBreaking"))),
  );
  const [all, setAll] = useState(false);
  const shown = all ? key : key.slice(0, 8);
  return (
    <div className="rounded-[22px] bg-turf p-5 ring-1 ring-inset ring-turf-edge sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge club={lab.clubs[team]} size={34} />
        <div>
          <p className="font-display text-[22px] font-extrabold leading-tight text-chalk">
            #{lab.numbers[i]} {lab.names[i]}
          </p>
          <p className="text-[14px] text-chalk-dim">
            {lab.clubs[team].name} · {lab.roles[i]}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          {p.tags.map((g) => (
            <span key={g} className="rounded-full bg-flare px-3 py-1 text-[12px] font-bold text-flare-ink">
              {t(`fan.tag.${g}`)}
            </span>
          ))}
        </div>
      </div>
      <PlayerReel lab={lab} i={i} />
      <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-chalk-faint">{t("fan.focus.key")}</p>
      <ul className="mt-2 divide-y divide-turf-edge">
        {shown.map((m) => (
          <li key={m.kind + m.s} className="flex items-start gap-3 py-2.5">
            <span className="w-10 shrink-0 pt-0.5 text-right text-[13px] font-semibold tabular-nums text-chalk-faint">{minute(m.s)}′</span>
            <span className="min-w-0 flex-1 text-[14.5px] leading-snug text-chalk">
              <MomentText lab={lab} m={m} />
              <RhythmNote lab={lab} s={m.s} team={team} />
            </span>
            <button type="button" onClick={() => watch(m.s)} className="rc-press min-h-[34px] shrink-0 rounded-full px-3 text-[12px] font-semibold text-chalk ring-1 ring-inset ring-turf-edge hover:bg-turf-raised">
              {t("fan.focus.watch")} ▸
            </button>
          </li>
        ))}
      </ul>
      {key.length > 8 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 min-h-[36px] text-[13px] font-semibold text-chalk-dim underline underline-offset-4 hover:text-chalk">
          {all ? "−" : `+${key.length - 8}`}
        </button>
      )}
    </div>
  );
}

/** Match-wide speed and pass leaders, then each team in one line. */
export function SpeedSection({ matchId }: { matchId: string }) {
  const { t } = useTranslation();
  const q = useLab(matchId);
  if (!q.data) return <div className="h-[220px] animate-pulse rounded-[22px] bg-turf/60" aria-hidden="true" />;
  const lab = q.data;
  const st = matchStats(lab);
  const best = <T,>(xs: T[], k: (x: T) => number) => xs.reduce<T | null>((b, x) => (!b || k(x) > k(b) ? x : b), null);
  const shot = best(st.shots, (x) => x.kmh);
  const fast = best(st.players, (p) => p.topKmh);
  const far = best(st.players.filter((p) => lab.roles[p.i] !== "GK"), (p) => p.km);
  const hard = best(st.passes.filter((x) => x.ok), (x) => x.difficulty);
  const lbBy = st.players.map((p) => ({ i: p.i, n: st.passes.filter((x) => x.player === p.i && x.tags.includes("lineBreaking")).length }));
  const lb = best(lbBy, (x) => x.n);
  const rows: { k: string; i: number; v: string; s?: number }[] = [];
  if (shot) rows.push({ k: t("fan.speed.fastestShot"), i: shot.player, v: `${shot.kmh} km/h · ${t(`fan.stag.${shot.tag}`)} · ${minute(shot.s)}′`, s: shot.s });
  if (fast) rows.push({ k: t("fan.speed.fastestPlayer"), i: fast.i, v: `${fast.topKmh.toFixed(1)} km/h` });
  if (far) rows.push({ k: t("fan.speed.distance"), i: far.i, v: `${far.km.toFixed(1)} km` });
  if (hard) rows.push({ k: t("fan.speed.hardestPass"), i: hard.player, v: `${t(`fan.grade.${hard.grade}`)} ${hard.difficulty}/100 · ${Math.round(hard.dist)} m · ${minute(hard.s)}′`, s: hard.s });
  if (lb && lb.n) rows.push({ k: t("fan.speed.lineBreaker"), i: lb.i, v: t("fan.speed.nLb", { n: lb.n }) });
  const fan = fanIndex(lab, useFan.getState().player);
  return (
    <div>
      <ul className="divide-y divide-turf-edge rounded-[22px] bg-turf px-5 ring-1 ring-inset ring-turf-edge">
        {rows.map((r) => (
          <li key={r.k} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
            <span className="w-full text-[12px] font-semibold uppercase tracking-[0.1em] text-chalk-faint sm:w-[230px]">{r.k}</span>
            <span className={`flex items-center gap-2 text-[15px] font-semibold ${r.i === fan ? "text-flare" : "text-chalk"}`}>
              <Badge club={lab.clubs[r.i < 11 ? 0 : 1]} size={18} />#{lab.numbers[r.i]} {lab.names[r.i]}
            </span>
            <span className="text-[14px] tabular-nums text-chalk-dim">{r.v}</span>
            {r.s != null && (
              <button type="button" onClick={() => watch(r.s!)} className="rc-press ml-auto min-h-[34px] rounded-full px-3 text-[12px] font-semibold text-chalk ring-1 ring-inset ring-turf-edge hover:bg-turf-raised">
                {t("fan.focus.watch")} ▸
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-1.5">
        {[0, 1].map((k) => {
          const ps = st.passes.filter((x) => x.team === k);
          const avg = (f: (x: (typeof ps)[number]) => number) => Math.round(ps.reduce((s, x) => s + f(x), 0) / Math.max(1, ps.length));
          return (
            <p key={k} className="text-[14px] text-chalk-dim">
              {t("fan.speed.team", { team: lab.clubs[k].name, acc: Math.round((ps.filter((x) => x.ok).length / Math.max(1, ps.length)) * 100), d: avg((x) => x.difficulty), v: avg((x) => x.ballKmh) })}
            </p>
          );
        })}
      </div>
      <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-chalk-faint">{t("fan.speed.how")}</p>
    </div>
  );
}

/** Under each key moment: was the game settled or broken, and which way it was flowing, and why it matters. */
function RhythmNote({ lab, s, team }: { lab: Lab; s: number; team: 0 | 1 }) {
  const { t } = useTranslation();
  const r = rhythmAt(lab, s, team);
  const tone = r.kind === "chaos" ? "bg-flare text-flare-ink" : r.kind === "control" ? "bg-chalk text-turf-deep" : "bg-chalk/15 text-chalk";
  return (
    <span
      title={`${t("fan.rhythm.line", { n: r.held, swaps: r.swaps, team: lab.clubs[team].name, p: Math.round(r.share * 100), trend: t(`fan.rhythm.${r.trend}`) })} ${t(`fan.rhythm.why.${r.kind}`)}`}
      className={`ml-1.5 inline-block rounded-full px-2 py-px text-[11px] font-bold uppercase tracking-[0.08em] ${tone}`}
    >
      {t(`fan.rhythm.${r.kind}`)}
    </span>
  );
}
