import type { EngineMatchEvent, MatchEvent, ReplayFrame } from "../api/types";

/**
 * Positions over time. Every source (engine ticks, team-contract events, recorded
 * counterfactual replays) is reduced to one frame per second: ball + 22 players in a fixed
 * order. The pitch interpolates between seconds, so 1 Hz data plays smoothly at 60 fps.
 */
export type Frame = {
  second: number;
  ball: [number, number];
  pos: Float32Array; // [x0, y0, x1, y1, ...] in `order`
  carrier: string | null;
  kind: string | null;
};

export class Track {
  order: string[] = [];
  private index = new Map<string, number>();
  private frames = new Map<number, Frame>();
  private seconds: number[] = [];
  private dirty = false;

  constructor(order?: string[]) {
    if (order) this.setOrder(order);
  }

  setOrder(order: string[]) {
    this.order = order;
    this.index = new Map(order.map((id, i) => [id, i]));
  }

  slot(id: string): number {
    return this.index.get(id) ?? -1;
  }

  get size() {
    return this.frames.size;
  }

  has(second: number) {
    return this.frames.has(second);
  }

  /** The first frame in each second wins (the engine's action-time positions). */
  put(second: number, ball: [number, number], players: { id: string; x: number; y: number }[], carrier: string | null, kind: string | null, overwrite = false) {
    if (!overwrite && this.frames.has(second)) return;
    if (!this.order.length) this.setOrder(players.map((p) => p.id));
    const pos = new Float32Array(this.order.length * 2);
    for (const p of players) {
      const i = this.index.get(p.id);
      if (i === undefined) continue;
      pos[i * 2] = p.x;
      pos[i * 2 + 1] = p.y;
    }
    this.frames.set(second, { second, ball, pos, carrier, kind });
    this.dirty = true;
  }

  addEngine(e: EngineMatchEvent) {
    this.put(e.clock_s, [e.ball.x, e.ball.y], e.players, e.player_id, e.type);
  }

  addTeam(e: MatchEvent) {
    this.put(
      e.second,
      [e.ball.x, e.ball.y],
      e.players.map((p) => ({ id: p.player_id, x: p.position.x, y: p.position.y })),
      e.player_id,
      e.type,
    );
  }

  addReplay(f: ReplayFrame) {
    this.put(f.clock_s, f.ball, f.players, f.carrier, f.note ?? null, true);
  }

  private sorted() {
    if (this.dirty) {
      this.seconds = [...this.frames.keys()].sort((a, b) => a - b);
      this.dirty = false;
    }
    return this.seconds;
  }

  first() {
    return this.sorted()[0] ?? 0;
  }

  last() {
    const s = this.sorted();
    return s[s.length - 1] ?? 0;
  }

  frame(second: number) {
    return this.frames.get(second) ?? null;
  }

  /** Bracketing frames for time t (seconds, fractional). */
  bracket(t: number): [Frame, Frame, number] | null {
    const s = this.sorted();
    if (!s.length) return null;
    if (t <= s[0]) {
      const f = this.frames.get(s[0])!;
      return [f, f, 0];
    }
    if (t >= s[s.length - 1]) {
      const f = this.frames.get(s[s.length - 1])!;
      return [f, f, 0];
    }
    let lo = 0;
    let hi = s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid] <= t) lo = mid;
      else hi = mid;
    }
    const a = this.frames.get(s[lo])!;
    const b = this.frames.get(s[hi])!;
    const span = b.second - a.second;
    // A long gap means no data (outside a recorded window): hold the last frame.
    const k = span > 4 ? 0 : (t - a.second) / span;
    return [a, b, k];
  }

  /** Writes interpolated positions into `out` (length order*2) and returns the ball. */
  sample(t: number, out: Float32Array, ball: Float32Array): boolean {
    const br = this.bracket(t);
    if (!br) return false;
    const [a, b, k0] = br;
    const k = smooth(k0);
    for (let i = 0; i < out.length; i++) out[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * k;
    ball[0] = a.ball[0] + (b.ball[0] - a.ball[0]) * k0;
    ball[1] = a.ball[1] + (b.ball[1] - a.ball[1]) * k0;
    return true;
  }

  positionOf(id: string, second: number): [number, number] | null {
    const i = this.slot(id);
    const br = this.bracket(second);
    if (i < 0 || !br) return null;
    const [a] = br;
    return [a.pos[i * 2], a.pos[i * 2 + 1]];
  }
}

// Players accelerate and settle within a second; a gentle ease reads more human than linear.
function smooth(k: number) {
  return k * k * (3 - 2 * k);
}
