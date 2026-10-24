import * as THREE from "three";
import type { StackChance, Stacks } from "../../api/analysis";
import { C, PHONE, Stage, X, Z, dashed, figure, glow, plate, polyline, type Plate } from "./stage";

/**
 * Chance Stack: every shot of the match as a layer, oldest at the bottom. A filled, glowing dot is
 * a goal; a ring is a miss; a bigger mark is a bigger chance. Selecting a shot flies to its layer,
 * stands the 22 players where they were, and draws the better option in yellow when there was one.
 * Raw engine coordinates, so both teams' shots share one pitch.
 */

const GAP = 1.8;

type Layer = { c: StackChance; y: number; plate: Plate; mark: THREE.Object3D; mat: THREE.MeshBasicMaterial; halo: THREE.Sprite | null; line: THREE.Line; at: THREE.Vector3 };

export class ChanceStack {
  private stage: Stage;
  private layers: Layer[] = [];
  private box = new THREE.Box3();
  private moment = new THREE.Group();
  private sel: number | null = null;
  private lit: ((c: StackChance) => boolean) | null = null;
  private hoverTag;
  private hoverAt: THREE.Vector3 | null = null;
  onPick: ((seq: number | null) => void) | null = null;

  constructor(host: HTMLElement, data: Stacks, reduced: boolean, private labels: { name: (id: string) => string; gain: (c: StackChance) => string }) {
    this.stage = new Stage(host, { az: Math.PI / 2 + 0.3, el: 0.36, fov: 28, reduced });
    const st = this.stage;
    data.chances.forEach((c, k) => {
      const y = k * GAP;
      const p = plate(y, { fill: 0.03, edgeOp: 0.1, lines: false });
      st.scene.add(p);
      this.box.expandByObject(p);
      const b = c.frame.ball;
      const at = new THREE.Vector3(X(b[0]), y + 0.08, Z(b[1]));
      const r = 1.6 + Math.sqrt(c.xg) * 3.2;
      const col = c.side === "home" ? C.chalk : C.sky;
      const goal = c.outcome === "goal";
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false });
      const mark = goal ? new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 20, 14), mat) : new THREE.Mesh(new THREE.RingGeometry(r * 0.42, r * 0.58, 36), mat);
      if (!goal) mark.rotation.x = -Math.PI / 2;
      mark.position.copy(at);
      mark.userData.seq = c.seq;
      st.scene.add(mark);
      let halo: THREE.Sprite | null = null;
      if (goal) {
        halo = glow(at, 0xffffff, r * 3, 0.75);
        st.scene.add(halo);
      }
      const mouth = new THREE.Vector3(X(c.dir > 0 ? 105 : 0), y + 0.08, 0);
      const line = polyline([at, mouth], col, 0.22);
      st.scene.add(line);
      this.layers.push({ c, y, plate: p, mark, mat, halo, line, at });
    });
    st.scene.add(this.moment);
    st.pickables = this.layers.map((l) => l.mark);
    st.onTap = (o) => {
      if (!o) return;
      const seq = o.userData.seq as number | undefined;
      if (seq !== undefined) this.onPick?.(seq === this.sel ? null : seq);
    };
    this.hoverTag = st.tag("", () => this.hoverAt);
    this.hoverTag.on = false;
    st.onHover = (o) => {
      const id = o?.userData.player as string | undefined;
      this.hoverTag.on = !!id;
      if (id) {
        this.hoverTag.el.textContent = this.labels.name(id);
        this.hoverAt = o!.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 3.2, 0));
      }
      this.stage.canvas.style.cursor = o ? "pointer" : "grab";
      st.poke();
    };
    this.paint();
    st.fitTo(this.box, { instant: true, padRight: this.pad(), margin: 1.06 });
  }

  private pad() {
    return PHONE ? 0 : 0.17;
  }

  /** Keep only some layers lit (a player's moments, goals only, ...); null lights them all. */
  setLit(f: ((c: StackChance) => boolean) | null) {
    this.lit = f;
    this.paint();
  }

  private paint() {
    for (const l of this.layers) {
      const chosen = this.sel === l.c.seq;
      const on = this.sel !== null ? chosen : !this.lit || this.lit(l.c);
      const off = this.sel !== null ? 0.05 : 0.14;
      l.mat.opacity = on ? 1 : off;
      if (l.halo) (l.halo.material as THREE.SpriteMaterial).opacity = on ? 0.75 : this.sel !== null ? 0 : 0.06;
      (l.line.material as THREE.LineBasicMaterial).opacity = chosen ? 0.8 : on ? 0.22 : 0.04;
      (l.plate.userData.edge.material as THREE.LineBasicMaterial).opacity = chosen ? 0.75 : on ? 0.12 : 0.03;
      (l.plate.userData.fill.material as THREE.MeshBasicMaterial).opacity = chosen ? 0.14 : on ? 0.03 : 0.006;
    }
    this.stage.poke();
  }

  select(seq: number | null) {
    this.sel = seq;
    const st = this.stage;
    this.moment.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    st.scene.remove(this.moment);
    this.moment = new THREE.Group();
    st.scene.add(this.moment);
    st.clearTags();
    this.hoverTag = st.tag("", () => this.hoverAt);
    this.hoverTag.on = false;
    st.pickables = this.layers.map((l) => l.mark);
    this.paint();
    const l = this.layers.find((x) => x.c.seq === seq);
    if (!l) {
      st.fitTo(this.box, { padRight: this.pad(), margin: 1.06 });
      return;
    }
    const c = l.c;
    // the 22 players where they stood when the shot was struck
    const figs: THREE.Object3D[] = [];
    c.frame.pos.forEach((p, i) => {
      const id = i < 11 ? `H${i + 1}` : `A${i - 10}`;
      const shooter = id === c.shooter;
      const f = figure(new THREE.Vector3(X(p[0]), l.y, Z(p[1])), i < 11 ? C.chalk : C.sky, shooter ? 1 : 0.9, shooter ? 1.25 : 1);
      f.userData.player = id;
      this.moment.add(f);
      figs.push(f);
    });
    this.moment.add(glow(l.at.clone().setY(l.y + 0.7), 0xffffff, 3.2, 0.9));
    const shooterAt = new THREE.Vector3(X(c.frame.pos[idx(c.shooter)][0]), l.y + 4.2, Z(c.frame.pos[idx(c.shooter)][1]));
    st.tag(this.labels.name(c.shooter), () => shooterAt, "rc-stack-tag--chalk");
    const box = new THREE.Box3();
    const attackX = c.dir > 0 ? 105 : 0;
    box.expandByPoint(new THREE.Vector3(X(attackX), l.y, Z(14)));
    box.expandByPoint(new THREE.Vector3(X(attackX), l.y + 3, Z(54)));
    box.expandByPoint(l.at.clone().add(new THREE.Vector3(c.dir > 0 ? -12 : 12, 0, 0)));
    if (c.best) {
      const to = new THREE.Vector3(X(c.best.at[0]), l.y + 0.12, Z(c.best.at[1]));
      this.moment.add(dashed([l.at, to], C.var, 1));
      this.moment.add(polyline([to, new THREE.Vector3(X(attackX), l.y + 0.12, 0)], C.var, 0.55));
      const ghost = figure(to.clone().setY(l.y), C.var, 0.6, 1.25);
      this.moment.add(ghost, glow(to.clone().setY(l.y + 1.4), C.var, 5, 0.6));
      const tagAt = to.clone().setY(l.y + 4.2);
      st.tag(this.labels.gain(c), () => tagAt, "rc-stack-tag--var");
      box.expandByPoint(to);
    }
    st.pickables = [...this.layers.map((x) => x.mark), ...figs];
    box.expandByScalar(4);
    st.fitTo(box, { az: c.dir > 0 ? Math.PI / 2 + 0.3 : Math.PI / 2 - 0.3, el: 0.72, padRight: this.pad(), margin: 1.02 });
  }

  dispose() {
    this.stage.dispose();
  }
}

const idx = (id: string) => (id[0] === "H" ? 0 : 11) + Number(id.slice(1)) - 1;
