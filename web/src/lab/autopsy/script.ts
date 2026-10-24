import type { TFunction } from "i18next";
import { prevented, type Autopsy } from "./model";
import { clock, stepsOf, trialRows, type Step } from "./stadium";

/**
 * The "Broadcast script" export: the autopsy as timed segments a studio can read over the
 * pictures, in the page's language, with the same words and numbers the page shows.
 */
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function broadcastScript(a: Autopsy, t: TFunction): string {
  const { lab } = a;
  const sur = (i: number) => lab.names[i].split(" ").slice(-1)[0];
  const [home, away] = [lab.clubs[0].name, lab.clubs[1].name];
  const steps = stepsOf(a);
  let at = 0;
  const out: string[] = [
    t("autopsy.script.head"),
    t("autopsy.script.match", { home, away, n: a.dossier.meeting, clock: clock(a.goalS) }),
    "",
  ];
  const seg = (st: Step, key: string, lines: string[]) => {
    out.push(`[${mmss(at)}–${mmss(at + st.dur)}] ${t(`autopsy.script.seg.${key}`)}`, ...lines.filter(Boolean), "");
    at += st.dur;
  };
  for (const st of steps) {
    if (st.beat === "plans") {
      const facts = [a.def, a.att].map((k) => {
        const f = a.dossier.facts[k][0];
        return t(`autopsy.pre.${f.key}`, { team: lab.clubs[k].name, ...f.params });
      });
      const prev = a.dossier.prev ? t("autopsy.pre.prev", { home, away, h: a.dossier.prev[0], a: a.dossier.prev[1] }) : t("autopsy.pre.first");
      out.push(`[${mmss(at)}–${mmss(at + st.dur)}] ${t("autopsy.pre.k").toUpperCase()}`, prev, ...facts, "");
      at += st.dur;
    } else if (st.beat === "goal") {
      seg(st, "goal", [
        t("autopsy.script.goal", { clock: clock(a.goalS), scorer: lab.names[a.scorer], team: lab.clubs[a.att].name, score: t("autopsy.goal.score", { home, away, h: a.score[0], a: a.score[1] }) }),
        t("autopsy.script.replay"),
      ]);
    } else if (st.beat === "mistake" && a.kind === "traced") {
      const m = a.mistakes[st.k];
      seg(st, "mistake", [t("autopsy.mistake.title", { name: lab.names[m.x.player], m: m.x.behind.toFixed(1) }), betterLine(a, st.k, t), t("autopsy.mistake.x", { base: m.x.base, fixed: m.x.fixed })]);
    } else if (st.beat === "trial" && a.kind === "traced") {
      const c = a.j.culprit;
      seg(st, "trial", [
        t("autopsy.trial.title"),
        `${t("autopsy.trial.asPlayed")}: ${t("autopsy.trial.count", { g: c.base, n: c.trials })}`,
        ...trialRows(a).map((x) => `${t("autopsy.trial.fixed", { name: sur(x.player) })}: ${t("autopsy.trial.count", { g: x.fixed, n: x.trials })}`),
        t("autopsy.trial.line"),
      ]);
    } else if (st.beat === "verdict" && a.kind === "traced") {
      const c = a.j.culprit, v = verdictVars(a);
      seg(st, "verdict", [
        t("autopsy.verdict.title", v),
        t("autopsy.verdict.why1", v),
        t(c.offside ? "autopsy.verdict.why2" : "autopsy.verdict.why2Count", v),
        `${t("autopsy.verdict.formula")}: ${t("autopsy.verdict.formulaX", v)}`,
      ]);
    } else if (st.beat === "fix" && a.kind === "traced") {
      const v = verdictVars(a);
      seg(st, "fix", [a.j.culprit.offside ? t("autopsy.verdict.fix", v) : t("autopsy.verdict.fixOpen")]);
    } else if (st.beat === "honest") {
      seg(st, "verdict", honestLines(a, t));
    } else at += st.dur;
  }
  return out.join("\n");
}

export function verdictVars(a: Autopsy & { kind: "traced" }) {
  const c = a.j.culprit, sur = (i: number) => a.lab.names[i].split(" ").slice(-1)[0];
  return {
    name: sur(c.player), p: Math.round(c.blame), m: c.behind.toFixed(1), clock: clock(c.second),
    receiver: c.offside ? sur(c.offside.player) : sur(a.scorer), base: c.base, fixed: c.fixed,
    mine: prevented(c), total: a.total,
    by: c.offside ? c.offside.by.toFixed(1) : "",
  };
}

/** what holding the line does at mistake k, from the 200-run counts (and the recorded run when it ends offside) */
export function betterLine(a: Autopsy & { kind: "traced" }, k: number, t: TFunction) {
  const x = a.mistakes[k].x, sur = (i: number) => a.lab.names[i].split(" ").slice(-1)[0];
  if (x === a.j.culprit && x.offside && x.fixed === 0) return t("autopsy.mistake.offside", { receiver: sur(x.offside.player) });
  const p = prevented(x);
  return p > 0 ? t("autopsy.mistake.stops", { p, base: x.base }) : t("autopsy.mistake.nothing");
}

export function honestLines(a: Autopsy, t: TFunction) {
  const c = a.chance;
  if (!c) return [t("autopsy.honest.title"), t("autopsy.honest.lineNoChance")];
  return [
    t("autopsy.honest.title"),
    t("autopsy.honest.line", { xg: c.xg.toFixed(2), d: c.distance_m.toFixed(1) }),
    t("autopsy.honest.x", { n: c.nearest_m.toFixed(1), b: c.blockers }),
  ];
}
