import type { Frame } from "./data";
import { EDGE_S, REACT_S, RUN_MS, SOFT_TAU } from "./model";

/**
 * Pitch control drawn per pixel on the GPU: the grass takes the colour of the side that would win
 * a ball played there. Same model as homeControl() in model.ts. The canvas covers the pitch plus
 * `margin` metres on each side, y = 0 at the top.
 */
const VERT = `attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 uv;
uniform vec2 pos[22];
uniform vec2 vel[22];
uniform vec4 box;      // x0, y0, width, height in metres
uniform vec3 home;
uniform vec3 away;
uniform float strength;
uniform vec2 focus;    // focused player index (x), or -1; y = 1 to show only that player's ground
void main(){
  vec2 q = vec2(box.x + uv.x * box.z, box.y + (1.0 - uv.y) * box.w);
  if (q.x < 0.0 || q.x > 105.0 || q.y < 0.0 || q.y > 68.0) { gl_FragColor = vec4(0.0); return; }
  // soft minimum of arrival times per side, taken relative to the quickest so exp() never underflows
  float mh = 1e9, ma = 1e9, best = 1e9; int who = -1;
  for (int i = 0; i < 22; i++) {
    // GLSL ES 1.0 only allows the loop index inside the uniform arrays, so this stays inline
    float t = ${REACT_S.toFixed(2)} + length(q - (pos[i] + vel[i] * ${REACT_S.toFixed(2)})) / ${RUN_MS.toFixed(1)};
    if (t < best) { best = t; who = i; }
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
  float own = abs(c - 0.5) * 2.0;
  vec3 col = c > 0.5 ? home : away;
  float a = pow(own, 0.8) * strength;
  if (focus.x >= 0.0) {
    bool mine = float(who) == focus.x;
    a *= mine ? 1.25 : (focus.y > 0.5 ? 0.12 : 0.45);
  }
  // the seam: where neither side wins, drawn as a dark contour
  float w = max(fwidth(c) * 1.2, 1e-4); // smoothstep needs edge0 < edge1
  float seam = 1.0 - smoothstep(0.0, w, abs(c - 0.5));
  vec3 outc = mix(col, vec3(0.02, 0.05, 0.29), seam);
  float outa = max(a, seam * 0.85);
  gl_FragColor = vec4(outc * outa, outa);
}`;

export class ControlLayer {
  private gl: WebGLRenderingContext;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  readonly ok: boolean;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    this.ok = !!gl && !!gl.getExtension("OES_standard_derivatives");
    this.gl = gl as WebGLRenderingContext;
    if (!this.ok) return;
    const sh = (type: number, src: string) => {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const p = gl!.createProgram()!;
    gl!.attachShader(p, sh(gl!.VERTEX_SHADER, VERT));
    gl!.attachShader(p, sh(gl!.FRAGMENT_SHADER, FRAG));
    gl!.linkProgram(p);
    gl!.useProgram(p);
    const buf = gl!.createBuffer();
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
    gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl!.STATIC_DRAW);
    const a = gl!.getAttribLocation(p, "p");
    gl!.enableVertexAttribArray(a);
    gl!.vertexAttribPointer(a, 2, gl!.FLOAT, false, 0, 0);
    for (const k of ["pos", "vel", "box", "home", "away", "strength", "focus"]) this.loc[k] = gl!.getUniformLocation(p, k);
  }

  draw(f: Frame, box: [number, number, number, number], opts: { strength: number; focus: number; only: boolean }) {
    if (!this.ok) return;
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2fv(this.loc.pos, f.pos.flat());
    gl.uniform2fv(this.loc.vel, f.vel.flat());
    gl.uniform4f(this.loc.box, ...box);
    gl.uniform3f(this.loc.home, 0.953, 0.961, 1.0);
    gl.uniform3f(this.loc.away, 0.353, 0.47, 1.0);
    gl.uniform1f(this.loc.strength, opts.strength);
    gl.uniform2f(this.loc.focus, opts.focus, opts.only ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
