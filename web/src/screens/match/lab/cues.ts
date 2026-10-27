import type { TFunction } from "i18next";
import i18n from "../../../i18n";
import type { Analysis } from "../../../api/analysis";
import { periodAt, type Lab } from "../../../lab/data";
import { mistakeWords } from "../../../i18n/words";

/**
 * Broadcast graphics for any match: kick-off, every goal with the score, every traced mistake,
 * half-time and full-time, timed in match seconds (in_s..out_s) so they can sit over the feed.
 * Built from the tracking and analysis.json; an exported overlays.json only adds the blame share.
 * Words come from ovl.* in the viewer's language, never from the export.
 */
export type CueKind = "milestone" | "goal" | "root_cause";
export type Cue = { in_s: number; out_s: number; kind: CueKind; data: Record<string, unknown> };

const pidIndex = (pid: string) => (pid[0] === "H" ? Number(pid.slice(1)) - 1 : 10 + Number(pid.slice(1)));

export function buildCues(lab: Lab, an: Analysis, exported: Cue[]): Cue[] {
  const end = Math.floor(lab.raw.length / 49);
  const cues: Cue[] = [{ in_s: 0, out_s: 12, kind: "milestone", data: { type: "kickoff" } }];
  const score: [number, number] = [0, 0];
  let half = 0;
  for (let s = 1; s < end; s++) if (periodAt(lab, s) === 2) { half = s; break; }
  const goals = lab.actions.filter((a) => a.type === "shot" && a.outcome === "goal").sort((a, b) => a.s - b.s);
  for (const g of goals) {
    if (half && g.s >= half && !cues.some((c) => c.data.type === "halftime")) cues.push({ in_s: half - 14, out_s: half - 1, kind: "milestone", data: { type: "halftime", h: score[0], a: score[1] } });
    score[g.team]++;
    cues.push({ in_s: g.s, out_s: g.s + 12, kind: "goal", data: { player: g.player, team: g.team, s: g.s, h: score[0], a: score[1] } });
  }
  if (half && !cues.some((c) => c.data.type === "halftime")) cues.push({ in_s: half - 14, out_s: half - 1, kind: "milestone", data: { type: "halftime", h: score[0], a: score[1] } });
  for (const m of an.mistakes ?? []) {
    if (!m.player_id) continue;
    const blame = exported.find((c) => c.kind === "root_cause" && c.data?.goal_id === m.goal_id)?.data?.blame_percent;
    const at = Math.max(0, m.goal_second - 10);
    cues.push({ in_s: at, out_s: at + 9, kind: "root_cause", data: { player: pidIndex(m.player_id), bug: m.bug, blame: typeof blame === "number" ? blame : null } });
  }
  cues.push({ in_s: end - 15, out_s: end, kind: "milestone", data: { type: "fulltime", h: score[0], a: score[1] } });
  // a goal's own graphic wins over a mistake shown in the same seconds
  const rank: Record<CueKind, number> = { goal: 0, root_cause: 1, milestone: 2 };
  return cues.sort((a, b) => a.in_s - b.in_s || rank[a.kind] - rank[b.kind]);
}

export function cueText(c: Cue, t: TFunction, lab: Lab): string {
  const d = c.data as Record<string, number | string | null>;
  const home = lab.clubs[0].name, away = lab.clubs[1].name;
  if (c.kind === "goal") {
    const i = d.player as number;
    return t("ovl.goal", { name: lab.names[i], team: lab.short[d.team as number], m: Math.floor((d.s as number) / 60) + 1, home: lab.short[0], away: lab.short[1], h: d.h, a: d.a });
  }
  if (c.kind === "root_cause") {
    const name = lab.names[d.player as number] ?? "";
    const bug = mistakeWords(String(d.bug), { lower: true });
    return d.blame != null ? t("ovl.causeBlame", { name, bug, p: Math.round(d.blame as number) }) : t("ovl.cause", { name, bug });
  }
  if (d.type === "kickoff") return t("ovl.kickoff", { home, away });
  if (d.type === "halftime") return t("ovl.half", { home: lab.short[0], away: lab.short[1], h: d.h, a: d.a });
  return t("ovl.full", { home: lab.short[0], away: lab.short[1], h: d.h, a: d.a });
}

const strings = {
  en: {
    kind: { goal: "Goal", root_cause: "Root cause", milestone: "Live" },
    goal: "{{name}} scores for {{team}} ({{m}}′). {{home}} {{h}}–{{a}} {{away}}",
    cause: "{{name}}: {{bug}}",
    causeBlame: "{{name}}: {{bug}}, {{p}}% of the blame",
    kickoff: "Kick-off: {{home}} v {{away}}",
    half: "Half-time: {{home}} {{h}}–{{a}} {{away}}",
    full: "Full-time: {{home}} {{h}}–{{a}} {{away}}",
    toggle: "Broadcast graphics",
    toggleOn: "Broadcast graphics on",
  },
  hi: {
    kind: { goal: "गोल", root_cause: "असली वजह", milestone: "लाइव" },
    goal: "{{name}} ने {{team}} के लिए गोल किया ({{m}}′)। {{home}} {{h}}–{{a}} {{away}}",
    cause: "{{name}}: {{bug}}",
    causeBlame: "{{name}}: {{bug}}, {{p}}% ज़िम्मेदारी",
    kickoff: "किक-ऑफ़: {{home}} बनाम {{away}}",
    half: "हाफ़-टाइम: {{home}} {{h}}–{{a}} {{away}}",
    full: "फ़ुल-टाइम: {{home}} {{h}}–{{a}} {{away}}",
    toggle: "ब्रॉडकास्ट ग्राफ़िक्स",
    toggleOn: "ब्रॉडकास्ट ग्राफ़िक्स चालू",
  },
  es: {
    kind: { goal: "Gol", root_cause: "Causa raíz", milestone: "En directo" },
    goal: "Gol de {{name}} para {{team}} ({{m}}′). {{home}} {{h}}–{{a}} {{away}}",
    cause: "{{name}}: {{bug}}",
    causeBlame: "{{name}}: {{bug}}, {{p}}% de la culpa",
    kickoff: "Saque inicial: {{home}} vs {{away}}",
    half: "Descanso: {{home}} {{h}}–{{a}} {{away}}",
    full: "Final: {{home}} {{h}}–{{a}} {{away}}",
    toggle: "Gráficos de emisión",
    toggleOn: "Gráficos de emisión activados",
  },
};
for (const [lng, b] of Object.entries(strings)) i18n.addResourceBundle(lng, "translation", { ovl: b }, true, false);
