/**
 * 200 Futures: the Story's one picture. A made-up attack on a pitch seen from the stand, the
 * mistakes the rewind flags, and 200 replays forking out from the first of them. Fixing a mistake
 * re-runs the fan with fewer goals; the goals that vanish are that mistake's share of the blame.
 * Everything here is invented and illustrative, never a demo match's numbers.
 */

export type Pt = [number, number, number?];

export interface StoryMistake {
  /** Goals out of 200 when only this mistake is fixed. */
  fixedGoals: number;
  pos: Pt;
  /** Where the plan had that player. */
  to: Pt;
}

export const TRIALS = 200;
export const BASE_GOALS = 146;
export const MISTAKES: StoryMistake[] = [
  { fixedGoals: 21, pos: [74, 30], to: [80.5, 30] },
  { fixedGoals: 118, pos: [62, 42], to: [60, 47] },
  { fixedGoals: 129, pos: [79, 47], to: [76, 42] },
];
const drops = MISTAKES.map((m) => BASE_GOALS - m.fixedGoals);
const dropSum = drops.reduce((a, b) => a + b, 0);
/** Each mistake's share of the blame: its drop in goals over all the drops. */
export const BLAME = drops.map((d) => d / dropSum);

const ATTACK: Pt[] = [[44, 18], [55, 26], [62, 40], [70, 33], [84, 35], [95, 33], [105, 34, 0.8]];
const ATTACKERS: Pt[] = [[55, 26], [62, 40], [84, 35], [95, 33], [70, 18]];
const LINE_X = 80.5;
const DEFENDERS: { at: Pt; mistake?: number }[] = [
  { at: [80.5, 16] },
  { at: [80.5, 24] },
  { at: MISTAKES[0].pos, mistake: 0 },
  { at: MISTAKES[2].pos, mistake: 2 },
  { at: MISTAKES[1].pos, mistake: 1 },
  { at: [66, 22] },
  { at: [101, 34] },
];

const CHALK = "#f3f5ff";
const DEF = "#7f93ff";
const FLARE = "#ffd60a";
const PANEL = "#0e22a6";

export interface Labels {
  goal: string;
  start: string;
  fixed: string;
  mistakes: string[];
}

interface Future {
  pts: Pt[];
  goal: boolean;
  offside: boolean;
  delay: number;
  speed: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** 200 ball paths out of the mistake, `goals` of them ending in the net. Seeded, so a fix always draws the same fan. */
function futures(goals: number, seed: number): Future[] {
  const r = rng(seed);
  const scoring = new Set<number>();
  while (scoring.size < goals) scoring.add(Math.floor(r() * TRIALS));
  const out: Future[] = [];
  for (let i = 0; i < TRIALS; i++) {
    const goal = scoring.has(i);
    const start: Pt = [70 + r() * 2 - 1, 33 + r() * 2 - 1, 0];
    const mid: Pt = [80 + r() * 10, 22 + r() * 24, 1 + r() * 5];
    let end: Pt;
    let offside = false;
    if (goal) end = [105, 30.8 + r() * 6.4, 0.3 + r() * 2];
    else {
      const k = r();
      if (k < 0.45) end = [83 + r() * 10, 18 + r() * 32, 0]; // a defender wins it
      else if (k < 0.7) (end = [mid[0] + 2, mid[1], 0]), (offside = true); // the flag goes up
      else end = [105, r() < 0.5 ? 22 + r() * 7 : 39 + r() * 8, r() * 3]; // wide
    }
    const bend: Pt = [lerp(mid[0], end[0], 0.6), lerp(mid[1], end[1], 0.6) + (r() - 0.5) * 4, lerp(mid[2]!, end[2] ?? 0, 0.6)];
    out.push({ pts: [start, mid, bend, end], goal, offside, delay: r() * 0.55, speed: 0.55 + r() * 0.4 });
  }
  return out;
}

function along(pts: Pt[], u: number): Pt {
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(d);
    total += d;
  }
  let want = u * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i]) {
      const f = want / segs[i];
      return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f), lerp(pts[i][2] ?? 0, pts[i + 1][2] ?? 0, f)];
    }
    want -= segs[i];
  }
  return pts[pts.length - 1];
}

export class FuturesStage {
  private cx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private raf = 0;
  private ro: ResizeObserver;
  private beat = 0;
  private beatAt = performance.now();
  private fixed = -1;
  private fixAt = performance.now();
  private fan = futures(BASE_GOALS, 7);
  private landed = -1;

  constructor(
    private canvas: HTMLCanvasElement,
    private labels: Labels,
    private onTally: (goals: number) => void,
    private still = false,
  ) {
    this.cx = canvas.getContext("2d")!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
  }

  setLabels(l: Labels) {
    this.labels = l;
  }

  setBeat(b: number) {
    if (b === this.beat) return;
    this.beat = b;
    this.beatAt = performance.now();
    if (b === 2) this.setFix(-1);
  }

  setFix(i: number) {
    this.fixed = i;
    this.fixAt = performance.now();
    this.fan = futures(i < 0 ? BASE_GOALS : MISTAKES[i].fixedGoals, 7 + (i + 1) * 13);
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Camera in the stand, looking down the pitch at the goal on the right. */
  private P(x: number, y: number, z = 0): [number, number, number] {
    const { w, h } = this;
    const narrow = w < 600;
    const yaw = narrow ? -0.32 : -0.42;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const X = (x - 72) * c - (y - 34) * s;
    const Y = (x - 72) * s + (y - 34) * c;
    const ct = Math.cos(0.95), st = Math.sin(0.95);
    const Yc = Y * ct - z * st, Zc = Y * st + z * ct;
    const k = ((narrow ? 1.5 : 1.25) * w) / ((narrow ? 80 : 86) + Zc);
    return [w * 0.47 + X * k * 0.62, h * 0.56 + Yc * k * 0.62, k];
  }

  private path(pts: Pt[], close = false) {
    const cx = this.cx;
    cx.beginPath();
    pts.forEach((p, i) => {
      const [sx, sy] = this.P(p[0], p[1], p[2]);
      if (i) cx.lineTo(sx, sy);
      else cx.moveTo(sx, sy);
    });
    if (close) cx.closePath();
  }

  private thread(pts: Pt[], u0: number, u1: number, color: string, width: number, glow = 0) {
    const out: Pt[] = [];
    for (let i = 0; i <= 40; i++) out.push(along(pts, lerp(u0, u1, i / 40)));
    const cx = this.cx;
    cx.save();
    if (glow) (cx.shadowColor = color), (cx.shadowBlur = glow);
    this.path(out);
    cx.strokeStyle = color;
    cx.lineWidth = width;
    cx.lineCap = "round";
    cx.lineJoin = "round";
    cx.stroke();
    cx.restore();
  }

  private pitch() {
    const cx = this.cx;
    this.path([[30, 0], [105, 0], [105, 68], [30, 68]], true);
    const a = this.P(30, 34), b = this.P(105, 34);
    const g = cx.createLinearGradient(a[0], a[1], b[0], b[1]);
    g.addColorStop(0, "rgba(10,26,140,0)");
    g.addColorStop(0.25, "rgba(12,30,160,.75)");
    g.addColorStop(1, "rgba(14,34,166,.95)");
    cx.fillStyle = g;
    cx.fill();
    for (let i = 0; i < 15; i += 2) {
      this.path([[30 + i * 5, 0], [35 + i * 5, 0], [35 + i * 5, 68], [30 + i * 5, 68]], true);
      cx.fillStyle = "rgba(255,255,255,.025)";
      cx.fill();
    }
    cx.strokeStyle = "rgba(214,220,255,.45)";
    cx.lineWidth = 1.2;
    this.path([[52.5, 0], [105, 0], [105, 68], [52.5, 68], [52.5, 0]]);
    cx.stroke();
    this.path([[88.5, 13.8], [105, 13.8], [105, 54.2], [88.5, 54.2]], true);
    cx.stroke();
    this.path([[99.5, 24.8], [105, 24.8], [105, 43.2], [99.5, 43.2]], true);
    cx.stroke();
    const arc: Pt[] = [];
    for (let t = -0.93; t <= 0.93; t += 0.08) arc.push([94 - 9.15 * Math.cos(t), 34 + 9.15 * Math.sin(t)]);
    this.path(arc.filter((p) => p[0] < 88.5));
    cx.stroke();
    cx.strokeStyle = "rgba(243,245,255,.9)";
    cx.lineWidth = 2;
    this.path([[105, 30.3, 0], [105, 30.3, 2.4], [105, 37.7, 2.4], [105, 37.7, 0]]);
    cx.stroke();
    cx.strokeStyle = "rgba(243,245,255,.25)";
    cx.lineWidth = 1;
    this.path([[105, 30.3, 2.4], [107.5, 30.3, 0.6], [107.5, 37.7, 0.6], [105, 37.7, 2.4]]);
    cx.stroke();
  }

  private player(x: number, y: number, fill: string, ring?: string): [number, number, number] {
    const cx = this.cx;
    const [sx, sy, k] = this.P(x, y);
    const rr = (k * 0.012 * this.w) / 100 + 2.5;
    cx.beginPath();
    cx.ellipse(sx, sy + rr * 0.5, rr * 1.1, rr * 0.4, 0, 0, 7);
    cx.fillStyle = "rgba(0,0,40,.35)";
    cx.fill();
    cx.beginPath();
    cx.arc(sx, sy - rr * 0.4, rr, 0, 7);
    cx.fillStyle = fill;
    cx.fill();
    if (ring) (cx.lineWidth = 2), (cx.strokeStyle = ring), cx.stroke();
    return [sx, sy - rr * 0.4, rr];
  }

  private tag(x: number, y: number, text: string, bg: string, fg: string) {
    const cx = this.cx;
    cx.font = "700 12px 'Hanken Grotesk Variable', system-ui, sans-serif";
    const w = cx.measureText(text).width + 14;
    const lx = Math.max(4, Math.min(this.w - w - 4, x - w / 2));
    cx.fillStyle = bg;
    cx.beginPath();
    cx.roundRect(lx, y - 11, w, 22, 11);
    cx.fill();
    cx.fillStyle = fg;
    cx.textBaseline = "middle";
    cx.fillText(text, lx + 7, y);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const { cx, beat } = this;
    // reduced motion: every animation is shown at its end state
    const T = this.still ? 99 : (now - this.beatAt) / 1000;
    cx.clearRect(0, 0, this.w, this.h);
    this.pitch();

    if (beat >= 1) {
      cx.save();
      cx.globalAlpha = 0.5;
      this.path([[LINE_X, 8, 0], [LINE_X, 60, 0], [LINE_X, 60, 2.2], [LINE_X, 8, 2.2]], true);
      cx.fillStyle = "rgba(243,245,255,.06)";
      cx.fill();
      cx.strokeStyle = "rgba(243,245,255,.35)";
      cx.stroke();
      cx.restore();
    }

    if (beat === 0) {
      const u = ease(T / 2.6);
      this.thread(ATTACK, 0, u, "rgba(243,245,255,.95)", 3, 12);
      const b = along(ATTACK, u);
      this.player(b[0], b[1], CHALK);
      if (u >= 1) {
        const t = Math.min(T - 2.6, 1.4);
        const [sx, sy] = this.P(105, 34, 1);
        cx.beginPath();
        cx.arc(sx, sy, 10 + t * 50, 0, 7);
        cx.strokeStyle = `rgba(243,245,255,${Math.max(0, 1 - t / 1.4)})`;
        cx.lineWidth = 3;
        cx.stroke();
        this.tag(sx - 30, sy - 30, this.labels.goal, CHALK, PANEL);
      }
    } else if (beat === 1) {
      this.thread(ATTACK, 0, 1, "rgba(243,245,255,.18)", 2);
      this.thread(ATTACK, 0, 1 - ease(T / 2.2) * 0.62, "rgba(243,245,255,.9)", 3, 10);
    } else {
      this.thread(ATTACK, 0, 1, "rgba(243,245,255,.14)", 2);
    }

    let landed = 0;
    if (beat >= 2) {
      const ft = this.still ? 99 : (now - Math.max(this.fixAt, this.beatAt)) / 1000;
      cx.save();
      cx.globalCompositeOperation = "lighter";
      for (const f of this.fan) {
        const u = ease(((ft - f.delay * 2) * f.speed) / 1.4);
        if (u <= 0) continue;
        this.thread(f.pts, 0, u, f.goal ? "rgba(243,245,255,.30)" : "rgba(127,147,255,.16)", f.goal ? 1.4 : 1);
        if (u < 1) continue;
        if (f.goal) landed++;
        const e = f.pts[3];
        const [sx, sy] = this.P(e[0], e[1], e[2]);
        cx.beginPath();
        cx.arc(sx, sy, f.goal ? 2.4 : 1.6, 0, 7);
        cx.fillStyle = f.goal ? "rgba(243,245,255,.9)" : f.offside ? "rgba(255,214,10,.8)" : "rgba(127,147,255,.6)";
        cx.fill();
      }
      cx.restore();
    }
    if (landed !== this.landed) this.onTally((this.landed = landed));

    for (const a of ATTACKERS) this.player(a[0], a[1], CHALK);
    for (const d of DEFENDERS) {
      const m = d.mistake;
      let [x, y] = d.at;
      const isFixed = m !== undefined && this.fixed === m && beat >= 3;
      if (isFixed) {
        const k = this.still ? 1 : ease((now - this.fixAt) / 900);
        x = lerp(d.at[0], MISTAKES[m].to[0], k);
        y = lerp(d.at[1], MISTAKES[m].to[1], k);
      }
      const flagged = m !== undefined && beat >= 1 && !(beat === 1 && T < 0.6 + m * 0.5);
      const [sx, sy, rr] = this.player(x, y, isFixed ? CHALK : DEF, flagged && !isFixed ? FLARE : undefined);
      if (flagged && !isFixed) {
        const pulse = this.still ? 0.3 : (((now / 1000 + m * 0.4) % 1.6) / 1.6);
        cx.beginPath();
        cx.arc(sx, sy, rr + 4 + pulse * 14, 0, 7);
        cx.strokeStyle = `rgba(255,214,10,${0.7 * (1 - pulse)})`;
        cx.lineWidth = 2;
        cx.stroke();
        if (beat === 1 || (beat >= 3 && this.fixed < 0)) this.tag(sx, sy - rr - 12, this.labels.mistakes[m], FLARE, "#14123a");
      }
      if (isFixed) {
        const [ox, oy] = this.P(d.at[0], d.at[1]);
        cx.setLineDash([3, 4]);
        cx.beginPath();
        cx.moveTo(ox, oy);
        cx.lineTo(sx, sy + rr * 0.4);
        cx.strokeStyle = "rgba(255,214,10,.8)";
        cx.lineWidth = 1.5;
        cx.stroke();
        cx.setLineDash([]);
        this.tag(sx, sy - rr - 12, this.labels.fixed, CHALK, PANEL);
      }
    }
    if (beat === 2) {
      const [sx, sy] = this.P(70, 33);
      this.tag(sx, sy - 26, this.labels.start, "rgba(14,34,166,.9)", CHALK);
    }
  };
}
