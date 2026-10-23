import * as THREE from "three";
import { PX, PY, type Frame } from "./data";
import { EDGE_S, REACT_S, RUN_MS, SOFT_TAU, teamOf } from "./model";
import { MARGIN } from "./draw";

/**
 * The Lab's floodlit 3D pitch. One shader paints the grass (mown stripes, floodlight falloff) and
 * tints it with pitch control, so the ground itself shows who owns the space. Every lens is drawn
 * onto a canvas laid on the grass; players and the ball are real objects with shadows.
 */
export type View = "broadcast" | "tactical";

const GROUND_VERT = `
varying vec2 vPitch;
void main() {
  vPitch = vec2(position.x, -position.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const GROUND_FRAG = `
precision highp float;
varying vec2 vPitch;
uniform vec2 pos[22];
uniform vec2 vel[22];
uniform float strength;
uniform float focus;
uniform vec3 homeTint;
uniform vec3 awayTint;
void main() {
  vec2 q = vPitch;
  bool inside = q.x > 0.0 && q.x < ${PX.toFixed(1)} && q.y > 0.0 && q.y < ${PY.toFixed(1)};
  // grass: twelve mown bands, a little grain, brighter under the lights at the centre
  float band = mod(floor(q.x / ${(PX / 12).toFixed(3)}), 2.0);
  vec3 grassA = vec3(0.075, 0.235, 0.155);
  vec3 grassB = vec3(0.09, 0.27, 0.175);
  vec3 col = mix(grassA, grassB, band);
  float grain = fract(sin(dot(floor(q * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
  col *= 0.96 + grain * 0.06;
  float lift = 1.0 - smoothstep(20.0, 75.0, length(q - vec2(${(PX / 2).toFixed(1)}, ${(PY / 2).toFixed(1)})));
  col *= 0.78 + 0.32 * lift;
  if (!inside) col *= 0.62;

  if (strength > 0.0 && inside) {
    float mh = 1e9, ma = 1e9, best = 1e9; float who = -1.0;
    for (int i = 0; i < 22; i++) {
      float t = ${REACT_S.toFixed(2)} + length(q - (pos[i] + vel[i] * ${REACT_S.toFixed(2)})) / ${RUN_MS.toFixed(1)};
      if (t < best) { best = t; who = float(i); }
      if (i < 11) mh = min(mh, t); else ma = min(ma, t);
    }
    float sh = 0.0, sa = 0.0;
    for (int i = 0; i < 22; i++) {
      float t = ${REACT_S.toFixed(2)} + length(q - (pos[i] + vel[i] * ${REACT_S.toFixed(2)})) / ${RUN_MS.toFixed(1)};
      if (i < 11) sh += exp(-(t - mh) / ${SOFT_TAU.toFixed(2)}); else sa += exp(-(t - ma) / ${SOFT_TAU.toFixed(2)});
    }
    float th = mh - ${SOFT_TAU.toFixed(2)} * log(sh);
    float ta = ma - ${SOFT_TAU.toFixed(2)} * log(sa);
    float c = 1.0 / (1.0 + exp(-(ta - th) / ${EDGE_S.toFixed(2)}));
    float own = pow(abs(c - 0.5) * 2.0, 0.9);
    float a = own * strength;
    if (focus >= 0.0) a *= (who == focus) ? 1.3 : 0.15;
    col = mix(col, c > 0.5 ? homeTint : awayTint, a);
    // the seam where neither side wins
    float w = max(fwidth(c) * 1.4, 1e-4);
    col = mix(col, vec3(0.02, 0.06, 0.18), (1.0 - smoothstep(0.0, w, abs(c - 0.5))) * 0.65 * strength / 0.55);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function numberTexture(n: number, team: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = team === 0 ? "#f3f5ff" : "#3654ff";
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = team === 0 ? "#1530d6" : "#ffffff";
  g.stroke();
  g.fillStyle = team === 0 ? "#1530d6" : "#ffffff";
  g.font = "800 30px 'Hanken Grotesk Variable', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LabStage {
  readonly overlay: HTMLCanvasElement;
  readonly overlayPx = 14;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 1, 600);
  private ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private overlayTex: THREE.CanvasTexture;
  private players: THREE.Group[] = [];
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private ray = new THREE.Raycaster();
  private look = new THREE.Vector3(PX / 2, 0, PY / 2);
  private camPos = new THREE.Vector3(PX / 2, 60, PY + 60);
  view: View = "broadcast";
  ok = true;

  constructor(private host: HTMLElement, numbers: number[], label: string) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = "absolute inset-0 h-full w-full";
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.setAttribute("aria-label", label);
    host.prepend(this.renderer.domElement);
    this.scene.fog = new THREE.Fog(0x050d4a, 150, 320);

    this.scene.add(new THREE.HemisphereLight(0xe8ecff, 0x0b2a18, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(30, 80, -40);
    this.scene.add(sun);

    const W = PX + 2 * 14, H = PY + 2 * 14;
    const g = new THREE.PlaneGeometry(W, H, 1, 1);
    g.translate(PX / 2, -PY / 2, 0);
    this.ground = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
        uniforms: {
          pos: { value: Array.from({ length: 22 }, () => new THREE.Vector2()) },
          vel: { value: Array.from({ length: 22 }, () => new THREE.Vector2()) },
          strength: { value: 0.55 },
          focus: { value: -1 },
          homeTint: { value: new THREE.Color("#f3f5ff") },
          awayTint: { value: new THREE.Color("#3e5cff") },
        },
      }),
    );
    // the plane lies in x/y; turn it so pitch y runs along world z
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground);

    this.overlay = document.createElement("canvas");
    this.overlay.width = Math.round((PX + 2 * MARGIN) * this.overlayPx);
    this.overlay.height = Math.round((PY + 2 * MARGIN) * this.overlayPx);
    this.overlayTex = new THREE.CanvasTexture(this.overlay);
    this.overlayTex.colorSpace = THREE.SRGBColorSpace;
    this.overlayTex.anisotropy = 8;
    const og = new THREE.PlaneGeometry(PX + 2 * MARGIN, PY + 2 * MARGIN);
    og.translate(PX / 2, -PY / 2, 0);
    const over = new THREE.Mesh(og, new THREE.MeshBasicMaterial({ map: this.overlayTex, transparent: true, depthWrite: false, toneMapped: false }));
    over.rotation.x = -Math.PI / 2;
    over.position.y = 0.03;
    this.scene.add(over);

    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
    const shadowGeo = new THREE.CircleGeometry(0.75, 24).rotateX(-Math.PI / 2);
    for (let i = 0; i < 22; i++) {
      const team = teamOf(i);
      const grp = new THREE.Group();
      const kit = new THREE.MeshStandardMaterial({
        color: team === 0 ? 0xf3f5ff : 0x3d5cff,
        emissive: team === 0 ? 0x9aa6d8 : 0x1a2fb0,
        emissiveIntensity: 0.55,
        roughness: 0.45,
        metalness: 0.05,
      });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.05, 6, 14), kit);
      body.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.7 }));
      head.position.y = 1.95;
      const sh = new THREE.Mesh(shadowGeo, shadowMat);
      sh.position.y = 0.02;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTexture(numbers[i], team), depthTest: false }));
      tag.scale.set(1.5, 1.5, 1);
      tag.position.y = 3.0;
      tag.renderOrder = 5;
      grp.add(body, head, sh, tag);
      this.scene.add(grp);
      this.players.push(grp);
    }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.25 }));
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2), shadowMat);
    this.scene.add(this.ball, this.ballShadow);
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Paint one frame. `overlayDirty` re-uploads the lens canvas. */
  render(f: Frame, o: { strength: number; focus: number | null; dt: number; follow: number | null }) {
    const u = this.ground.material.uniforms;
    for (let i = 0; i < 22; i++) {
      (u.pos.value as THREE.Vector2[])[i].set(f.pos[i][0], f.pos[i][1]);
      (u.vel.value as THREE.Vector2[])[i].set(f.vel[i][0], f.vel[i][1]);
      const g = this.players[i];
      g.position.set(f.pos[i][0], 0, f.pos[i][1]);
      const sp = Math.hypot(f.vel[i][0], f.vel[i][1]);
      // lean into the run
      const body = g.children[0];
      body.rotation.set(0, 0, 0);
      if (sp > 0.6) {
        const ang = Math.atan2(f.vel[i][1], f.vel[i][0]);
        g.rotation.y = -ang;
        body.rotation.z = -Math.min(sp / 40, 0.18);
      }
      g.children[3].rotation.set(0, 0, 0);
      (g.children[3] as THREE.Sprite).material.opacity = o.focus != null && o.focus !== i ? 0.45 : 1;
    }
    u.strength.value += (o.strength - u.strength.value) * Math.min(o.dt * 6, 1);
    u.focus.value = o.focus ?? -1;
    const [bx, by] = f.ball;
    this.ball.position.set(bx, 0.42, by);
    this.ballShadow.position.set(bx + 0.15, 0.025, by + 0.15);
    this.overlayTex.needsUpdate = true;

    // camera: a broadcast gantry that pans with the play, or the coach's view from above
    const target = o.follow != null ? f.pos[o.follow] : f.ball;
    const narrow = this.camera.aspect < 1.2;
    let pos: THREE.Vector3, look: THREE.Vector3;
    if (this.view === "broadcast") {
      // the gantry sits on the halfway side of the far touchline and pans along it with the play
      const fx = Math.min(Math.max(target[0], 30), PX - 30);
      look = new THREE.Vector3(fx, 0, PY * 0.42 + Math.min(Math.max(target[1], 10), PY - 10) * 0.12);
      pos = new THREE.Vector3(PX / 2 + (fx - PX / 2) * 0.6, narrow ? 76 : 56, PY + (narrow ? 88 : 70));
    } else {
      // from above, with the pitch lifted clear of the controls along the bottom
      look = new THREE.Vector3(PX / 2, 0, PY / 2 + 9);
      pos = new THREE.Vector3(PX / 2, narrow ? 230 : 150, PY / 2 + (narrow ? 50 : 36));
    }
    const k = Math.min(o.dt * 2.2, 1);
    this.camPos.lerp(pos, k);
    this.look.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.look);
    this.renderer.render(this.scene, this.camera);
  }

  /** The pitch point under a screen position, or null. */
  pitchAt(clientX: number, clientY: number): [number, number] | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return hit ? [hit.x, hit.z] : null;
  }

  /** Where a pitch point lands on screen, for HTML captions. */
  toScreen(x: number, y: number, h = 0): [number, number] {
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    return [((v.x + 1) / 2) * this.host.clientWidth, ((1 - v.y) / 2) * this.host.clientHeight];
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
