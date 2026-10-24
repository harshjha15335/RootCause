import * as THREE from "three";
import type { Side, Stacks } from "../../api/analysis";
import { C, PHONE, Stage, X, Z, fade, plate, polyline, ribbon, type Plate } from "./stage";

/**
 * Shape Stack: one team's average shape per 5 minutes, kick-off at the bottom and full time on
 * top. Each outfield player is a ribbon through the layers; each unit is joined by a hairline on
 * every layer. When the line drops or the block narrows, the stack bends, and that layer is
 * marked in yellow. Positions are in the team's own frame, attacking toward x = 105.
 */

const GAP = 3.2;
const HALF_GAP = 2.4; // extra air between the halves

export type Phase = "out" | "in";

export class ShapeStack {
  private stage: Stage;
  private plates: Plate[] = [];
  private group = new THREE.Group();
  private box = new THREE.Box3();
  private bendLayers: number[] = [];
  private side: Side = "home";
  private focus: number | null = null;
  readonly layerY: number[];

  constructor(host: HTMLElement, private data: Stacks, private reduced: boolean, private labels: { minute: (m: number) => string; bend: (side: Side, i: number) => string }) {
    this.stage = new Stage(host, { az: Math.PI / 2 + 0.24, el: 0.3, fov: 28, reduced });
    const W = data.shape_stack.windows;
    const half = W.findIndex((w) => w.from_s >= 2700);
    this.layerY = W.map((_, k) => k * GAP + (half > 0 && k >= half ? HALF_GAP : 0));
    for (const y of this.layerY) {
      const p = plate(y, { fill: 0.045, edgeOp: 0.16, lineOp: 0.045 });
      this.plates.push(p);
      this.stage.scene.add(p);
      this.box.expandByObject(p);
    }
    this.stage.scene.add(this.group);
  }

  private padRight() {
    return PHONE ? 0 : 0.17;
  }

  build(side: Side, phase: Phase) {
    this.side = side;
    const st = this.stage;
    st.scene.remove(this.group);
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.group = new THREE.Group();
    st.scene.add(this.group);
    st.clearTags();
    const W = this.data.shape_stack.windows;
    const team = this.data.shape_stack.teams[side];
    const key = `${side}_${phase}` as const;
    const col = side === "home" ? C.chalk : C.sky;
    const un = team.units;
    const at = (k: number, i: number) => {
      const p = W[k][key][i];
      return p ? new THREE.Vector3(X(p[0]), this.layerY[k] + 0.06, Z(p[1])) : null;
    };
    for (let i = 1; i < 11; i++) {
      const pts = W.map((_, k) => at(k, i)).filter((p): p is THREE.Vector3 => !!p);
      if (pts.length > 1) this.group.add(ribbon(pts, col, un[i] === "def" ? 0.3 : 0.18, un[i] === "def" ? 0.95 : 0.32));
    }
    // the back line as a curtain through time: where it leans, the line dropped or pushed up
    const defs = un.map((u, i) => (u === "def" ? i : -1)).filter((i) => i >= 0);
    const lineX = W.map((w) => {
      const xs = defs.map((i) => w[key][i]?.[0]).filter((x): x is number => x !== undefined);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    });
    const pos: number[] = [];
    const tri: number[] = [];
    let n = 0;
    lineX.forEach((x, k) => {
      if (x === null) return;
      pos.push(X(x), this.layerY[k], Z(4), X(x), this.layerY[k], Z(64));
      if (n > 0) tri.push(2 * n - 2, 2 * n - 1, 2 * n, 2 * n - 1, 2 * n + 1, 2 * n);
      n++;
    });
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    cg.setIndex(tri);
    this.group.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })));
    for (const z of [4, 64]) {
      const edge = lineX.map((x, k) => (x === null ? null : new THREE.Vector3(X(x), this.layerY[k], Z(z)))).filter((p): p is THREE.Vector3 => !!p);
      this.group.add(polyline(edge, col, 0.5));
    }
    W.forEach((_, k) => {
      for (const u of ["def", "mid", "att"] as const) {
        const idx = un.map((x, i) => (x === u ? i : -1)).filter((i) => i >= 0 && W[k][key][i]);
        idx.sort((a, b) => W[k][key][a]![1] - W[k][key][b]![1]);
        if (idx.length > 1) this.group.add(polyline(idx.map((i) => at(k, i)!), col, u === "def" ? 0.85 : 0.35));
      }
    });
    // Bends only belong to the shape without the ball; with it the layers are just drawn.
    const bends = phase === "out" ? team.bends : [];
    this.bendLayers = bends.map((b) => b.w);
    this.plates.forEach((p, k) => {
      const on = this.bendLayers.includes(k);
      const e = p.userData.edge.material as THREE.LineBasicMaterial;
      e.color.set(on ? C.var : C.chalk);
      e.opacity = on ? 0.95 : 0.16;
      (p.userData.fill.material as THREE.MeshBasicMaterial).color.set(on ? C.var : C.plate);
      (p.userData.fill.material as THREE.MeshBasicMaterial).opacity = on ? 0.07 : 0.045;
    });
    bends.forEach((b, i) => {
      const y = this.layerY[b.w];
      st.tag(this.labels.bend(side, i), () => new THREE.Vector3(X(105), y, Z(69)), "rc-stack-tag--var");
    });
    const first = 0, last = W.length - 1;
    st.tag(this.labels.minute(0), () => new THREE.Vector3(X(0), this.layerY[first], Z(69)));
    st.tag(this.labels.minute(Math.round(W[last].to_s / 60)), () => new THREE.Vector3(X(0), this.layerY[last], Z(69)));
    const half = W.findIndex((w) => w.from_s >= 2700);
    if (half > 0) st.tag(this.labels.minute(45), () => new THREE.Vector3(X(0), this.layerY[half] - HALF_GAP / 2, Z(69)), "rc-stack-tag--quiet");
    this.focusBend(null, true);
  }

  /** Fly to one bend's layer, or back out to the whole stack. */
  focusBend(i: number | null, instant = false) {
    this.focus = i;
    const bends = this.data.shape_stack.teams[this.side].bends;
    this.plates.forEach((p, k) => {
      const dim = i !== null && k !== bends[i]?.w;
      fade(p.userData.fill.material as THREE.Material, dim ? 0.02 : this.bendLayers.includes(k) ? 0.07 : 0.045, this.reduced, () => this.stage.poke(), 0.6);
    });
    if (i === null || !bends[i]) {
      this.stage.fitTo(this.box, { instant, padRight: this.padRight(), margin: 1.06 });
      return;
    }
    const y = this.layerY[bends[i].w];
    const b = new THREE.Box3(new THREE.Vector3(-52.5, y - GAP * 2, -34), new THREE.Vector3(52.5, y + GAP * 2, 34));
    this.stage.fitTo(b, { az: Math.PI / 2 + 0.18, el: 0.62, padRight: this.padRight(), margin: 1.04 });
  }

  get focused() {
    return this.focus;
  }

  dispose() {
    this.stage.dispose();
  }
}
