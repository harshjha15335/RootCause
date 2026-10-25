import { PX, PY, fwdX, type Action, type Frame, type Lab } from "../../../lab/data";
import { lanes, pressure, race, shape, teamOf, type Lane, type Unit } from "./model";
import { css as tone } from "../../../theme/palette";
import { LOOK } from "../../../theme/looks";

/** Everything drawn over the grass, on a 2D canvas in pitch metres (y = 0 at the top). */
export const MARGIN = 3;
export const BOX: [number, number, number, number] = [-MARGIN, -MARGIN, PX + 2 * MARGIN, PY + 2 * MARGIN];

export type LensId = "space" | "options" | "shape" | "pressure" | "runs" | "chain";

export const INK = {
  home: tone.chalk,
  homeInk: tone.cobalt,
  away: "#ffb547",
  awayInk: "#1a1206",
  night: tone.ink,
  flare: tone.var,
  chalk: (a: number) => `rgba(243,245,255,${a})`,
  blue: (a: number) => `rgba(255,181,71,${a})`,
  dark: (a: number) => `rgba(8,9,14,${a})`,
};
const teamCol = (team: number, a = 1) => (team === 0 ? INK.chalk(a) : INK.blue(a));

export type Scene = {
  lab: Lab;
  t: number;
  f: Frame;
  lenses: Set<LensId>;
  unitOf: (i: number) => Unit;
  grid?: number[][];
  focus: number | null;
  hover: number | null;
  probe: [number, number] | null;
  faults: { s: number; player: number }[];
  /** players and ball are 3D objects; draw only their rings and tags */
  solid?: boolean;
};

export function drawScene(g: CanvasRenderingContext2D, k: number, sc: Scene) {
  const { f, lenses } = sc;
  g.save();
  g.translate(MARGIN * k, MARGIN * k);
  g.scale(k, k);
  g.lineJoin = g.lineCap = "round";
  markings(g, k);

  const sHome = shape(f, 0, sc.unitOf), sAway = shape(f, 1, sc.unitOf);
  if (lenses.has("shape")) drawShape(g, k, f, [sHome, sAway]);
  if (lenses.has("chain")) drawChain(g, k, sc);
  if (lenses.has("pressure")) drawPressure(g, k, f);
  if (lenses.has("runs")) drawRuns(g, k, sc, [sHome, sAway]);
  if (lenses.has("options")) drawOptions(g, k, sc);
  drawShots(g, k, sc);
  if (sc.probe) drawProbe(g, k, f, sc.probe);
  drawPlayers(g, k, sc);
  g.restore();
}

function label(g: CanvasRenderingContext2D, k: number, text: string, x: number, y: number, o: { bg?: string; fg?: string; size?: number; align?: CanvasTextAlign } = {}) {
  const size = (o.size ?? 11.5) / k;
  g.save();
  g.font = `600 ${size}px ${LOOK.type.body}, system-ui, sans-serif`;
  const w = g.measureText(text).width, padX = 5 / k, h = size * 1.55;
  const align = o.align ?? "center";
  const x0 = align === "center" ? x - w / 2 - padX : align === "left" ? x : x - w - 2 * padX;
  const bx = Math.min(Math.max(x0, -MARGIN + 0.3), PX + MARGIN - w - 2 * padX - 0.3);
  const by = Math.min(Math.max(y - h / 2, -MARGIN + 0.3), PY + MARGIN - h - 0.3);
  g.fillStyle = o.bg ?? INK.dark(0.82);
  g.beginPath();
  g.roundRect(bx, by, w + 2 * padX, h, 4 / k);
  g.fill();
  g.fillStyle = o.fg ?? INK.home;
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText(text, bx + padX, by + h / 2 + 0.5 / k);
  g.restore();
}

function markings(g: CanvasRenderingContext2D, k: number) {
  g.strokeStyle = INK.chalk(0.42);
  g.lineWidth = 1.4 / k;
  g.strokeRect(0, 0, PX, PY);
  g.beginPath();
  g.moveTo(PX / 2, 0);
  g.lineTo(PX / 2, PY);
  g.stroke();
  g.beginPath();
  g.arc(PX / 2, PY / 2, 9.15, 0, Math.PI * 2);
  g.stroke();
  for (const side of [0, 1]) {
    const x = side ? PX - 16.5 : 0;
    g.strokeRect(x, 13.84, 16.5, 40.32);
    g.strokeRect(side ? PX - 5.5 : 0, 24.84, 5.5, 18.32);
    g.strokeRect(side ? PX : -1.6, 30.34, 1.6, 7.32);
  }
  // thirds, faint: where build-up ends and the final third starts
  g.setLineDash([0.6, 1.2]);
  g.strokeStyle = INK.chalk(0.16);
  for (const x of [35, 70]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, PY);
    g.stroke();
  }
  g.setLineDash([]);
}

function drawShape(g: CanvasRenderingContext2D, k: number, f: Frame, shapes: ReturnType<typeof shape>[]) {
  const defending = 1 - f.team;
  for (const s of shapes) {
    g.fillStyle = teamCol(s.team, 0.07);
    g.strokeStyle = teamCol(s.team, 0.5);
    g.lineWidth = 1.2 / k;
    g.setLineDash([4 / k, 4 / k]);
    g.beginPath();
    s.hull.forEach(([x, y], n) => (n ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.stroke();
    g.setLineDash([]);
    // the three lines of the team, as strings joining the unit left to right
    for (const u of ["def", "mid", "att"] as const) {
      const ids = s.units[u];
      if (ids.length < 2) continue;
      g.strokeStyle = teamCol(s.team, 0.85);
      g.lineWidth = 2.4 / k;
      g.beginPath();
      ids.forEach((i, n) => (n ? g.lineTo(...f.pos[i]) : g.moveTo(...f.pos[i])));
      g.stroke();
    }
    // line height marker on the touchline
    const toX = (d: number) => (s.team === 0 ? d : PX - d);
    const lx = toX(s.line.def);
    g.strokeStyle = teamCol(s.team, 0.9);
    g.lineWidth = 2 / k;
    g.beginPath();
    g.moveTo(lx, s.team === 0 ? PY : 0);
    g.lineTo(lx, s.team === 0 ? PY - 3 : 3);
    g.stroke();
    label(g, k, `${Math.round(s.line.def)} m`, lx, s.team === 0 ? PY + 1.6 : -1.6, { bg: s.team === 0 ? INK.home : INK.away, fg: s.team === 0 ? INK.homeInk : INK.awayInk, size: 10.5 });
  }
  // between the lines of the side without the ball: the pocket attackers want to receive in
  const d = shapes[defending];
  const a = d.team === 0 ? d.line.def : PX - d.line.def;
  const b = d.team === 0 ? d.line.mid : PX - d.line.mid;
  const x0 = Math.min(a, b), x1 = Math.max(a, b);
  if (x1 - x0 > 3) {
    g.fillStyle = INK.chalk(0.07);
    g.fillRect(x0, 0, x1 - x0, PY);
    for (let i = f.team * 11; i < f.team * 11 + 11; i++) {
      const [x, y] = f.pos[i];
      if (x > x0 && x < x1) {
        g.strokeStyle = INK.home;
        g.lineWidth = 1.6 / k;
        g.setLineDash([2 / k, 2 / k]);
        g.beginPath();
        g.arc(x, y, 2.6, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
    }
  }
}

function drawPressure(g: CanvasRenderingContext2D, k: number, f: Frame) {
  const p = pressure(f);
  if (!p) return;
  const [cx, cy] = f.pos[p.carrier];
  for (const s of p.shadows) {
    const grad = g.createLinearGradient(s.a[0], s.a[1], (s.b[0] + s.c[0]) / 2, (s.b[1] + s.c[1]) / 2);
    grad.addColorStop(0, INK.dark(0.55));
    grad.addColorStop(1, INK.dark(0));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(...s.a);
    g.lineTo(...s.b);
    g.lineTo(...s.c);
    g.closePath();
    g.fill();
  }
  // closing-down lines and the squeeze ring
  for (const { i, d } of p.pressers) {
    const [ox, oy] = f.pos[i];
    g.strokeStyle = teamCol(teamOf(i), Math.max(0.25, 1 - d / 12));
    g.lineWidth = (3.2 - d / 5) / k;
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(cx, cy);
    g.stroke();
  }
  const r = Math.min(p.nearest, 12);
  g.strokeStyle = r < 3 ? INK.chalk(0.95) : INK.chalk(0.5);
  g.lineWidth = 1.6 / k;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  label(g, k, `${p.pressers.length} pressing · ${p.nearest < 50 ? p.nearest.toFixed(1) + " m" : "free"}`, cx, cy - r - 2.2);
}

function drawRuns(g: CanvasRenderingContext2D, k: number, sc: Scene, shapes: ReturnType<typeof shape>[]) {
  const { lab, t, f } = sc;
  const s0 = Math.floor(t);
  // the last line of the side without the ball (its deepest outfielder)
  const def = 1 - f.team;
  let last = def === 0 ? PX : 0;
  for (let i = def * 11 + 1; i < def * 11 + 11; i++) last = def === 0 ? Math.min(last, f.pos[i][0]) : Math.max(last, f.pos[i][0]);
  g.strokeStyle = teamCol(def, 0.75);
  g.lineWidth = 1.3 / k;
  g.setLineDash([3 / k, 3 / k]);
  g.beginPath();
  g.moveTo(last, 0);
  g.lineTo(last, PY);
  g.stroke();
  g.setLineDash([]);
  label(g, k, "last line", last, 1.4, { size: 10 });
  void shapes;
  for (let i = 0; i < 22; i++) {
    const pts: [number, number][] = [];
    for (let s = Math.max(s0 - 6, 0); s <= s0; s++) pts.push(posAtSafe(lab, s, i));
    pts.push(f.pos[i]);
    const team = teamOf(i);
    for (let n = 1; n < pts.length; n++) {
      g.strokeStyle = teamCol(team, (n / pts.length) * 0.7);
      g.lineWidth = 1.8 / k;
      g.beginPath();
      g.moveTo(...pts[n - 1]);
      g.lineTo(...pts[n]);
      g.stroke();
    }
    const [vx, vy] = f.vel[i];
    const sp = Math.hypot(vx, vy);
    if (sp > 4.5) {
      const [x, y] = f.pos[i];
      const beyond = team === f.team && (team === 0 ? x > last : x < last);
      const ex = x + vx * 1.6, ey = y + vy * 1.6;
      g.strokeStyle = beyond ? INK.home : teamCol(team, 0.9);
      g.fillStyle = g.strokeStyle;
      g.lineWidth = (beyond ? 2.8 : 1.8) / k;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(ex, ey);
      g.stroke();
      const a = Math.atan2(vy, vx);
      g.beginPath();
      g.moveTo(ex + Math.cos(a) * 1.4, ey + Math.sin(a) * 1.4);
      g.lineTo(ex + Math.cos(a + 2.4) * 1.1, ey + Math.sin(a + 2.4) * 1.1);
      g.lineTo(ex + Math.cos(a - 2.4) * 1.1, ey + Math.sin(a - 2.4) * 1.1);
      g.fill();
      if (beyond) label(g, k, "in behind", ex, ey - 2.4, { bg: INK.home, fg: INK.homeInk, size: 10 });
    }
  }
}

function posAtSafe(lab: Lab, s: number, i: number): [number, number] {
  const STRIDE = 49;
  const kk = Math.min(Math.max(s, 0), 5399) * STRIDE;
  const p = lab.raw[kk + 48] || 1;
  const x = lab.raw[kk + 2 + i * 2] / 10, y = lab.raw[kk + 3 + i * 2] / 10;
  return p === 1 ? [x, y] : [PX - x, PY - y];
}

/** The pass actually played from this carrier in the next few seconds, if any. */
export function nextPass(lab: Lab, t: number, carrier: number): Action | undefined {
  return lab.actions.find((a) => a.s >= Math.floor(t) && a.s <= t + 3 && a.player === carrier && a.type === "pass");
}

function drawOptions(g: CanvasRenderingContext2D, k: number, sc: Scene) {
  const { f } = sc;
  const ls = lanes(f, sc.grid);
  if (!ls.length) return;
  const c = f.carrier;
  const [cx, cy] = f.pos[c];
  const played = nextPass(sc.lab, sc.t, c);
  const best = ls[0];
  const chosen = played?.receiver != null ? ls.find((l) => l.j === played.receiver) : undefined;
  // only call it better when it is both safer and more dangerous than the pass that was played
  const better = !!chosen && chosen.j !== best.j && best.open >= chosen.open && best.value > chosen.value * 1.3;
  const draw = (l: Lane, color: string, w: number, dash: number[] = []) => {
    const [rx, ry] = f.pos[l.j];
    g.strokeStyle = color;
    g.lineWidth = w / k;
    g.setLineDash(dash.map((d) => d / k));
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(rx, ry);
    g.stroke();
    g.setLineDash([]);
  };
  for (const l of [...ls].reverse()) {
    const open = l.open;
    if (open < 0.35) {
      draw(l, INK.chalk(0.22), 1.2, [2, 3]);
      if (l.cutBy != null) {
        const [ox, oy] = f.pos[l.cutBy];
        g.strokeStyle = INK.chalk(0.7);
        g.lineWidth = 1.6 / k;
        g.beginPath();
        g.moveTo(ox - 0.9, oy - 0.9 - 2.4);
        g.lineTo(ox + 0.9, oy + 0.9 - 2.4);
        g.moveTo(ox + 0.9, oy - 0.9 - 2.4);
        g.lineTo(ox - 0.9, oy + 0.9 - 2.4);
        g.stroke();
      }
    } else draw(l, teamCol(f.team, 0.3 + open * 0.55), 1.2 + open * 4.2);
  }
  if (better) {
    draw(best, INK.flare, 4, [5, 4]);
    const [rx, ry] = f.pos[best.j];
    label(g, k, `Better: ${Math.round(best.open * 100)}% safe`, rx, ry - 3.4, { bg: INK.flare, fg: INK.night });
  }
  for (const l of ls.slice(0, 4)) {
    if (l.open < 0.35 || (better && l.j === best.j)) continue;
    const [rx, ry] = f.pos[l.j];
    label(g, k, `${Math.round(l.open * 100)}%`, rx, ry - 3, { size: 10.5 });
  }
  if (played) {
    // the pass that was played, drawn as it travels
    const u = Math.min(Math.max((sc.t - played.s) / 1.2, 0), 1);
    const [ax, ay] = played.from, [bx, by] = played.to;
    g.strokeStyle = INK.home;
    g.lineWidth = 2.2 / k;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(ax + (bx - ax) * Math.max(u, 0.02), ay + (by - ay) * Math.max(u, 0.02));
    g.stroke();
  }
}

function drawChain(g: CanvasRenderingContext2D, k: number, sc: Scene) {
  const { lab, t } = sc;
  const s = Math.min(Math.floor(t), 5399);
  const start = lab.possStart[s], team = lab.poss[s];
  const acts = lab.actions.filter((a) => a.s >= start && a.s <= t && a.team === team && (a.type === "pass" || a.type === "carry" || a.type === "shot"));
  let n = 0;
  for (const a of acts) {
    const [ax, ay] = a.from, [bx, by] = a.to;
    if (a.type === "carry") {
      g.strokeStyle = teamCol(team, 0.8);
      g.lineWidth = 1.8 / k;
      g.setLineDash([1.2 / k * 3, 1.6 / k * 3]);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      g.setLineDash([]);
      continue;
    }
    n++;
    // passes arc, so a chain reads as a route
    const mx = (ax + bx) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
    g.strokeStyle = a.outcome === "complete" || a.type === "shot" ? teamCol(team, 0.95) : INK.chalk(0.35);
    g.lineWidth = 2.4 / k;
    g.beginPath();
    g.moveTo(ax, ay);
    g.quadraticCurveTo(mx + nx * len * 0.15, my + ny * len * 0.15, bx, by);
    g.stroke();
    g.fillStyle = team === 0 ? INK.home : INK.away;
    g.beginPath();
    g.arc(ax, ay, 1.15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = team === 0 ? INK.homeInk : INK.awayInk;
    g.font = `700 ${1.3}px ${LOOK.type.body}, system-ui`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), ax, ay + 0.05);
  }
  if (acts.length) {
    const passes = acts.filter((a) => a.type === "pass").length;
    const first = acts[0].from;
    label(g, k, `${lab.short[team]} move · ${passes} pass${passes === 1 ? "" : "es"} · ${Math.max(1, Math.round(t - start))} s`, first[0], first[1] + 3.2, { bg: team === 0 ? INK.home : INK.away, fg: team === 0 ? INK.homeInk : INK.awayInk });
  }
}

function drawShots(g: CanvasRenderingContext2D, k: number, sc: Scene) {
  for (const a of sc.lab.actions) {
    if (a.type !== "shot" || sc.t < a.s || sc.t > a.s + 4) continue;
    const u = Math.min((sc.t - a.s) / 0.8, 1);
    const gx = a.team === 0 ? PX : 0;
    const [ax, ay] = a.from;
    const ty = a.outcome === "goal" ? 34 : a.to[1];
    g.strokeStyle = a.outcome === "goal" ? INK.home : INK.chalk(0.7);
    g.lineWidth = 2.6 / k;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(ax + (gx - ax) * u, ay + (ty - ay) * u);
    g.stroke();
    const word = a.outcome === "goal" ? "GOAL" : a.outcome === "saved" ? "Saved" : a.outcome === "blocked" ? "Blocked" : "Wide";
    label(g, k, `${word} · xG ${(a.xg ?? 0).toFixed(2)}`, ax, ay - 3.4, a.outcome === "goal" ? { bg: a.team === 0 ? INK.home : INK.away, fg: a.team === 0 ? INK.homeInk : INK.awayInk, size: 13 } : {});
  }
}

function drawProbe(g: CanvasRenderingContext2D, k: number, f: Frame, p: [number, number]) {
  const r = race(f, p[0], p[1]);
  for (const a of [...r.home, ...r.away]) {
    const [x, y] = f.pos[a.i];
    const first = a.i === r.first.i;
    g.strokeStyle = teamCol(teamOf(a.i), first ? 1 : 0.45);
    g.lineWidth = (first ? 2.4 : 1.2) / k;
    g.setLineDash(first ? [] : [2 / k, 2 / k]);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(p[0], p[1]);
    g.stroke();
    g.setLineDash([]);
    label(g, k, `${a.t.toFixed(1)} s`, (x + p[0]) / 2, (y + p[1]) / 2, { size: 10.5, bg: first ? (teamOf(a.i) === 0 ? INK.home : INK.away) : undefined, fg: first ? (teamOf(a.i) === 0 ? INK.homeInk : INK.awayInk) : undefined });
  }
  g.fillStyle = INK.home;
  g.strokeStyle = INK.night;
  g.lineWidth = 1.5 / k;
  g.beginPath();
  g.moveTo(p[0], p[1] - 1.2);
  g.lineTo(p[0] + 1.2, p[1]);
  g.lineTo(p[0], p[1] + 1.2);
  g.lineTo(p[0] - 1.2, p[1]);
  g.closePath();
  g.fill();
  g.stroke();
}

function drawPlayers(g: CanvasRenderingContext2D, k: number, sc: Scene) {
  const { f, lab } = sc;
  const R = 1.35;
  const fault = sc.faults.find((m) => sc.t >= m.s - 3 && sc.t <= m.s + 5);
  for (let i = 0; i < 22; i++) {
    const [x, y] = f.pos[i];
    const team = teamOf(i);
    const dim = sc.focus != null && sc.focus !== i ? 0.45 : 1;
    g.globalAlpha = dim;
    if (fault && fault.player === i) {
      const pulse = (sc.t * 1.4) % 1;
      g.strokeStyle = INK.flare;
      g.lineWidth = 2.2 / k;
      g.beginPath();
      g.arc(x, y, R + 1 + pulse * 3, 0, Math.PI * 2);
      g.stroke();
      label(g, k, `The fault · ${lab.names[i]}`, x, y + 4.2, { bg: INK.flare, fg: INK.night });
    }
    if (i === f.carrier) {
      g.strokeStyle = INK.home;
      g.lineWidth = 2 / k;
      g.beginPath();
      g.arc(x, y, R + 0.9, 0, Math.PI * 2);
      g.stroke();
    }
    if (i === sc.focus || i === sc.hover) {
      g.strokeStyle = i === sc.focus ? INK.home : INK.chalk(0.6);
      g.lineWidth = 2.4 / k;
      g.beginPath();
      g.arc(x, y, R + 1.8, 0, Math.PI * 2);
      g.stroke();
    }
    if (sc.solid) {
      g.globalAlpha = 1;
      continue;
    }
    g.fillStyle = INK.dark(0.4);
    g.beginPath();
    g.ellipse(x + 0.25, y + 0.45, R, R * 0.9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = team === 0 ? INK.home : INK.away;
    g.strokeStyle = team === 0 ? INK.homeInk : INK.awayInk;
    g.lineWidth = 1.8 / k;
    g.beginPath();
    g.arc(x, y, R, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = team === 0 ? INK.homeInk : INK.awayInk;
    g.font = `800 ${1.45}px ${LOOK.type.body}, system-ui`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(lab.numbers[i]), x, y + 0.08);
    g.globalAlpha = 1;
  }
  if (sc.solid) return;
  let [bx, by] = f.ball;
  // keep the ball off the carrier's shirt number: at their feet, toward the goal they attack
  if (f.carrier >= 0 && f.carrier < 22 && Math.hypot(f.pos[f.carrier][0] - bx, f.pos[f.carrier][1] - by) < 1.2) {
    bx = f.pos[f.carrier][0] + (teamOf(f.carrier) === 0 ? 1.5 : -1.5);
    by = f.pos[f.carrier][1] + 1;
  }
  g.fillStyle = INK.dark(0.5);
  g.beginPath();
  g.arc(bx + 0.2, by + 0.35, 0.62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.strokeStyle = INK.night;
  g.lineWidth = 1 / k;
  g.beginPath();
  g.arc(bx, by, 0.62, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

/** Nearest player to a pitch point, within reach. */
export function pick(f: Frame, x: number, y: number, reach = 2.6) {
  let best: number | null = null, d = reach;
  for (let i = 0; i < 22; i++) {
    const dd = Math.hypot(f.pos[i][0] - x, f.pos[i][1] - y);
    if (dd < d) {
      d = dd;
      best = i;
    }
  }
  return best;
}

export { fwdX };
