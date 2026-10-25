import type { Pt, Snap } from "../journey/model";
import type { Play } from "./motion";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const smooth = (v: number) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
const mix = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const playerIndex = (id: string) => (id.startsWith("H") ? 0 : 11) + Number(id.slice(1)) - 1;

/** Illustrative corner setup, with recorded taker/scorer identities and finish location.
 * The source provides 2D events, not a measured set-piece simulation or ball height.
 * Keep this entirely separate from evidence geometry, attribution and player statistics.
 */
export function cornerMotion(a: Play): (s: number) => Snap {
  const shot = a.lab.actions.find((e) => e.s === a.goalS && e.type === "shot");
  if (!shot) return a.frame;
  const M = (p: Pt): Pt => a.att ? [105 - p[0], 68 - p[1]] : p;
  const contact = M(shot.from);
  const pass = a.lab.actions.filter((e) => e.type === "pass" && e.team === a.att && e.s < a.goalS && e.s >= a.goalS - 6).slice(-1)[0];
  const knownTaker = a.chance?.assist?.id;
  const taker = knownTaker ? playerIndex(knownTaker) : pass?.player;
  if (taker == null || taker === a.scorer || Math.floor(taker / 11) !== a.att) return a.frame;
  const from = pass ? M(pass.from) : a.frame(a.goalS - 3).ball;
  const bottom = from[1] > 34;
  const Y = (v: number) => bottom ? 68 - v : v;
  const flag: Pt = [104.5, bottom ? 67.5 : 0.5];
  const attGK = a.att * 11, defGK = (1 - a.att) * 11;
  const boxPriority = (i: number) => {
    const role = a.lab.roles[i] ?? "";
    return /ST|CF/.test(role) ? 0 : /CB/.test(role) ? 1 : /AM|RW|LW/.test(role) ? 2 : /CM/.test(role) ? 3 : 4;
  };
  const attackers = Array.from({ length: 11 }, (_, i) => a.att * 11 + i)
    .filter((i) => i !== attGK && i !== taker && i !== a.scorer)
    .sort((i, j) => boxPriority(i) - boxPriority(j));
  const box = [a.scorer, ...attackers.slice(0, 5)];
  const edge = attackers.slice(5);
  const defenders = Array.from({ length: 10 }, (_, i) => defGK + i + 1);
  const kick = a.goalS - 2.2, header = a.goalS - 0.4;
  const start = a.moveFrom;
  return (s) => {
    const elapsed = Math.max(0, s - start), run = smooth((s - (kick - 2)) / (header - kick + 2));
    const pos: Pt[] = Array.from({ length: 22 }, () => [0, 0]);
    pos[attGK] = [7 + 0.35 * Math.sin(elapsed), 34 + 0.8 * Math.sin(elapsed * 0.7)];
    pos[defGK] = [103.5, 34 + clamp((s < header ? flag[1] : contact[1]) - 34, -8, 8) * 0.15 + 0.45 * Math.sin(elapsed * 1.3)];
    box.forEach((player, n) => {
      const end: Pt = n === 0 ? contact : [93 + (n % 3) * 2.5, Y(19 + n * 5.6)];
      const begin: Pt = [clamp(end[0] - 4.8, 89, 97), clamp(end[1] + (n % 2 ? 2.5 : -2.5), 18, 50)];
      const p = mix(begin, end, run), shuffle = n === 0 ? 1 - run : 0.65;
      pos[player] = [p[0] + 0.8 * Math.sin(elapsed * 1.2 + n) * shuffle,
        p[1] + 0.8 * Math.sin(elapsed * 0.95 + n * 1.7) * shuffle];
      // Goal-side marking: defenders move with their assigned runners, not in isolation.
      pos[defenders[n]] = [clamp(pos[player][0] + 1.2, 89, 103.5), clamp(pos[player][1] + (n % 2 ? -1 : 1), 18, 50)];
    });
    // Two post/near-post defenders and two players covering the edge of the area.
    defenders.slice(6).forEach((player, n) => {
      pos[player] = n < 2 ? [102.5 + 0.45 * Math.sin(elapsed + n), 30.2 + n * 7.6 + 0.5 * Math.sin(elapsed * 1.4 + n)]
        : [86 + Math.sin(elapsed + n), 22 + (n - 2) * 24 + Math.sin(elapsed * 1.2 + n)];
    });
    edge.forEach((player, n) => { pos[player] = [82 + Math.sin(elapsed + n), 15 + n * 18 + Math.sin(elapsed * 1.1 + n)]; });
    const approach: Pt = [102.5, bottom ? 65 : 3];
    pos[taker] = s < kick ? mix(approach, flag, smooth((s - (kick - 0.9)) / 0.9))
      : mix(flag, [101.5, bottom ? 64.5 : 3.5], smooth((s - kick) / 2));
    let ball: Pt = flag, ballHeight = 0.5;
    if (s >= kick && s < header) {
      const t = clamp((s - kick) / (header - kick), 0, 1);
      ball = mix(flag, contact, t); ballHeight = 0.5 + 1.3 * t + 5 * Math.sin(Math.PI * t);
    } else if (s >= header) {
      const t = clamp((s - header) / (a.goalS - header), 0, 1);
      ball = mix(contact, [105.8, clamp(contact[1], 31, 37)], t); ballHeight = 1.8 - 1.05 * t;
    }
    return { pos, ball, ballHeight };
  };
}
