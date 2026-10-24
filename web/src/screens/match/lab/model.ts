import { PX, PY, fwdX, type Frame } from "../../../lab/data";

/**
 * The football models behind the Tactics Lab. All run in the browser on one frame of tracking.
 *
 * Pitch control is a simplified time-to-intercept model (after Spearman 2017): every player is
 * projected 0.7 s along their current velocity (reaction time), then runs at 7 m/s. For any point,
 * each team's arrival time is a soft minimum over its players, and the side that gets there first
 * owns it, with a 0.4 s logistic edge. The GLSL in ControlLayer.ts is the same formula.
 */
export const REACT_S = 0.7;
export const RUN_MS = 7;
export const SOFT_TAU = 0.35;
export const EDGE_S = 0.4;

export const teamOf = (i: number) => (i < 11 ? 0 : 1);

export function arrival(f: Frame, i: number, x: number, y: number) {
  const px = f.pos[i][0] + f.vel[i][0] * REACT_S;
  const py = f.pos[i][1] + f.vel[i][1] * REACT_S;
  return REACT_S + Math.hypot(x - px, y - py) / RUN_MS;
}

function teamTime(f: Frame, team: number, x: number, y: number) {
  let s = 0;
  for (let i = team * 11; i < team * 11 + 11; i++) s += Math.exp(-arrival(f, i, x, y) / SOFT_TAU);
  return -SOFT_TAU * Math.log(s + 1e-12);
}

/** Probability the home side controls (x, y). */
export function homeControl(f: Frame, x: number, y: number) {
  return 1 / (1 + Math.exp(-(teamTime(f, 1, x, y) - teamTime(f, 0, x, y)) / EDGE_S));
}

/** Share of the pitch each side owns, and the share of the opponent's half. */
export function spaceShare(f: Frame) {
  let all = 0, n = 0, homeIn = 0, awayIn = 0, half = 0;
  for (let gx = 0; gx < 21; gx++)
    for (let gy = 0; gy < 14; gy++) {
      const x = (gx + 0.5) * 5, y = (gy + 0.5) * (PY / 14);
      const c = homeControl(f, x, y);
      all += c;
      n++;
      if (x > PX / 2) homeIn += c;
      else awayIn += 1 - c;
      half++;
    }
  return { home: all / n, homeInAway: homeIn / (half / 2), awayInHome: awayIn / (half / 2) };
}

/** Who reaches a point first: the two quickest of each side. */
export function race(f: Frame, x: number, y: number) {
  const all = Array.from({ length: 22 }, (_, i) => ({ i, t: arrival(f, i, x, y) })).sort((a, b) => a.t - b.t);
  return { first: all[0], home: all.filter((a) => a.i < 11).slice(0, 2), away: all.filter((a) => a.i >= 11).slice(0, 2), control: homeControl(f, x, y) };
}

// ------------------------------------------------------------------ expected threat

/** xT of a point for a team (socceraction 16 x 12 grid, rows from the far touchline). */
export function xtAt(grid: number[][] | undefined, x: number, y: number, team: number) {
  if (!grid?.length) return 0;
  const W = grid.length, L = grid[0].length;
  const fx = fwdX(x, team), fy = team === 0 ? y : PY - y;
  const xi = Math.min(Math.max(Math.floor((fx / PX) * L), 0), L - 1);
  const yj = Math.min(Math.max(Math.floor((fy / PY) * W), 0), W - 1);
  return grid[W - 1 - yj][xi];
}

// ------------------------------------------------------------------ passing options

export type Lane = { j: number; open: number; value: number; score: number; cutBy: number | null; forward: number };

/**
 * Every pass the carrier could play right now. A lane is cut when a defender can reach the line of
 * the ball before it gets past him: the ball travels at 18 m/s, the defender closes at 3 m/s after
 * 0.4 s of reaction, and his reach is compared with his distance from the line.
 */
export function lanes(f: Frame, grid?: number[][]): Lane[] {
  const c = f.carrier;
  if (c < 0 || c > 21) return [];
  const team = teamOf(c);
  const [cx, cy] = f.pos[c];
  const out: Lane[] = [];
  for (let j = team * 11; j < team * 11 + 11; j++) {
    if (j === c) continue;
    const [rx, ry] = f.pos[j];
    const dx = rx - cx, dy = ry - cy, L = Math.hypot(dx, dy);
    if (L < 2 || L > 55) continue;
    let keep = 1, worst = 0, cutBy: number | null = null;
    for (let o = (1 - team) * 11; o < (1 - team) * 11 + 11; o++) {
      const [ox, oy] = f.pos[o];
      const u = Math.min(Math.max(((ox - cx) * dx + (oy - cy) * dy) / (L * L), 0), 1);
      const perp = Math.hypot(cx + dx * u - ox, cy + dy * u - oy);
      const reach = 0.9 + 3 * Math.max(0, (L * u) / 18 - 0.4);
      const p = 1 / (1 + Math.exp((perp - reach) / 0.5));
      keep *= 1 - p;
      if (p > worst) {
        worst = p;
        cutBy = o;
      }
    }
    // a receiver with a defender on his back keeps it less often
    let near = 99;
    for (let o = (1 - team) * 11; o < (1 - team) * 11 + 11; o++) near = Math.min(near, Math.hypot(f.pos[o][0] - rx, f.pos[o][1] - ry));
    const open = keep * (near < 1.5 ? 0.6 : near < 3 ? 0.85 : 1);
    const value = xtAt(grid, rx, ry, team);
    out.push({ j, open, value, score: open * value, cutBy: worst > 0.5 ? cutBy : null, forward: fwdX(rx, team) - fwdX(cx, team) });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------------ shape

export type Unit = "gk" | "def" | "mid" | "att";
export type Shape = {
  team: number;
  /** distance of each line from the team's own goal line */
  line: { def: number; mid: number; att: number };
  depth: number;
  width: number;
  hull: [number, number][];
  units: Record<Exclude<Unit, "gk">, number[]>;
  block: "high" | "mid" | "low";
};

function hull(pts: [number, number][]) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], hi: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of [...p].reverse()) {
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

export function shape(f: Frame, team: number, unitOf: (i: number) => Unit): Shape {
  const units: Shape["units"] = { def: [], mid: [], att: [] };
  for (let i = team * 11; i < team * 11 + 11; i++) {
    const u = unitOf(i);
    if (u !== "gk") units[u].push(i);
  }
  const fx = (i: number) => fwdX(f.pos[i][0], team);
  const mean = (ids: number[]) => (ids.length ? ids.reduce((s, i) => s + fx(i), 0) / ids.length : 0);
  const out = [...units.def, ...units.mid, ...units.att];
  const xs = out.map(fx), ys = out.map((i) => f.pos[i][1]);
  for (const k of ["def", "mid", "att"] as const) units[k].sort((a, b) => f.pos[a][1] - f.pos[b][1]);
  const def = mean(units.def);
  return {
    team,
    line: { def, mid: mean(units.mid), att: mean(units.att) },
    depth: Math.max(...xs) - Math.min(...xs),
    width: Math.max(...ys) - Math.min(...ys),
    hull: hull(out.map((i) => f.pos[i])),
    units,
    block: def >= 40 ? "high" : def >= 27 ? "mid" : "low",
  };
}

// ------------------------------------------------------------------ pressure

export type Pressure = {
  carrier: number;
  nearest: number;
  pressers: { i: number; d: number }[];
  behind: number;
  /** cone behind each presser where a pass is blocked: apex at presser */
  shadows: { i: number; a: [number, number]; b: [number, number]; c: [number, number] }[];
};

export function pressure(f: Frame): Pressure | null {
  const c = f.carrier;
  if (c < 0 || c > 21) return null;
  const team = teamOf(c), opp = 1 - team;
  const [cx, cy] = f.pos[c];
  const pressers: Pressure["pressers"] = [];
  let behind = 0;
  for (let o = opp * 11; o < opp * 11 + 11; o++) {
    const d = Math.hypot(f.pos[o][0] - cx, f.pos[o][1] - cy);
    if (d < 12) pressers.push({ i: o, d });
    if (o !== opp * 11 && fwdX(f.pos[o][0], opp) < fwdX(f.ball[0], opp)) behind++;
  }
  pressers.sort((a, b) => a.d - b.d);
  const shadows = pressers.slice(0, 3).map(({ i }) => {
    const [ox, oy] = f.pos[i];
    const ang = Math.atan2(oy - cy, ox - cx), len = 13, half = 0.26;
    const tip = (s: number): [number, number] => [ox + Math.cos(ang + s * half) * len, oy + Math.sin(ang + s * half) * len];
    return { i, a: [ox, oy] as [number, number], b: tip(-1), c: tip(1) };
  });
  return { carrier: c, nearest: pressers[0]?.d ?? 99, pressers, behind, shadows };
}
