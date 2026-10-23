import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { useLab, type Lab as LabData } from "../lab/data";
import { buildCase, type GoalCase } from "../lab/goal";
import { forks } from "../lab/views/forks";
import { clock, surname, type Ctx, type LabView } from "../lab/views/kit";
import { theirEyes } from "../lab/views/theirEyes";
import { timeColumn } from "../lab/views/timeColumn";
import { useFullTime } from "../store/selectors";
import { useUi } from "../store/uiStore";

const VIEWS = [
  { id: "column", make: timeColumn },
  { id: "forks", make: forks },
  { id: "eyes", make: theirEyes },
] as const;
const SPEEDS = [1, 0.5, 2];

/**
 * Tactics Lab: the goal Root Cause traced, three ways. Time Column (the move through time),
 * Forks (every choice it had) and Their Eyes (what a player saw). Each one shows the mistake and,
 * with Show the fix, what should have happened instead.
 */
export function Lab() {
  const { t } = useTranslation();
  const lab = useLab();
  const full = useFullTime();
  const cases = useMemo(
    () =>
      lab.data
        ? full.traces
            .map((e) => buildCase(lab.data!, e))
            .filter((c): c is GoalCase => c !== null)
            .sort((a, b) => a.goalS - b.goalS)
        : [],
    [lab.data, full.traces],
  );
  const [pick, setPick] = useState(0);
  const c = cases[Math.min(pick, cases.length - 1)];

  return (
    <section className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-8 sm:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="max-w-[640px]">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-flare">{t("lab.eyebrow")}</p>
          <h1 className="mt-1 text-balance font-display text-[34px] font-black leading-[0.95] tracking-display [font-stretch:125%] sm:text-[48px]">{t("lab.title")}</h1>
          <p className="mt-3 text-[16px] text-chalk-dim">{t("lab.lede")}</p>
        </div>
        {lab.data && cases.length > 1 && (
          <div role="group" aria-label={t("lab.goalsLabel")} className="flex flex-wrap gap-2">
            {cases.map((g, i) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={g === c}
                onClick={() => setPick(i)}
                className="rc-press rounded-full border border-turf-edge px-4 py-2 text-[14px] font-semibold text-chalk-dim aria-pressed:border-chalk aria-pressed:bg-chalk aria-pressed:text-ink"
              >
                {t("lab.goalChip", { clock: clock(g.goalS), name: surname(lab.data!, g.scorer) })}
              </button>
            ))}
          </div>
        )}
      </div>
      {lab.error ? (
        <p className="rounded-panel bg-turf px-6 py-16 text-center text-[17px] text-chalk-dim">{t("lab.failed")}</p>
      ) : !lab.data || full.loading ? (
        <div className="relative h-[min(76vh,720px)] min-h-[460px] animate-pulse rounded-panel bg-[#0a1240]">
          <p className="absolute left-6 top-6 text-[15px] text-chalk-dim">{t("lab.loading")}</p>
        </div>
      ) : !c ? (
        <p className="rounded-panel bg-turf px-6 py-16 text-center text-[17px] text-chalk-dim">{t("lab.noTrace")}</p>
      ) : (
        <Theatre key={c.id} lab={lab.data} c={c} />
      )}
    </section>
  );
}

function Theatre({ lab, c }: { lab: LabData; c: GoalCase }) {
  const { t } = useTranslation();
  const reduced = useUi((s) => s.reducedMotion);
  const [view, setView] = useState(() => {
    try {
      return Math.min(Number(localStorage.getItem("rc.labView") ?? 0) || 0, 2);
    } catch {
      return 0;
    }
  });
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [playing, setPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(1);
  const [fix, setFix] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const state = useRef({ t: c.t0, fix: false, playing: !reduced, speed: 1 });
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const gl = useRef<{ renderer: THREE.WebGLRenderer; composer: EffectComposer | null; view: LabView | null } | null>(null);

  state.current.playing = playing;
  state.current.speed = speed;
  state.current.fix = fix;

  // one renderer for the life of the Lab; the views swap their scenes into it
  useEffect(() => {
    const canvas = canvasRef.current!, stage = stageRef.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch {
      setGlFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    gl.current = { renderer, composer: null, view: null };
    const size = () => {
      const r = stage.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      const g = gl.current;
      if (g?.view) {
        g.view.camera.aspect = r.width / Math.max(r.height, 1);
        g.view.camera.updateProjectionMatrix();
      }
      g?.composer?.setSize(r.width, r.height);
    };
    const ro = new ResizeObserver(size);
    ro.observe(stage);
    let raf = 0, last = performance.now(), key = "";
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const g = gl.current;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!g?.view || !g.composer) return;
      const s = state.current;
      if (s.playing) {
        s.t += dt * s.speed;
        if (s.t > c.t1) s.t = g.view.start;
      }
      const call = g.view.frame(s.t, dt);
      g.view.controls?.update();
      g.composer.render();
      const k = call.kind + call.k + call.html;
      if (k !== key && calloutRef.current) {
        key = k;
        calloutRef.current.dataset.kind = call.kind;
        calloutRef.current.innerHTML = `<span class="lab-k">${call.k}</span>${call.html}`;
      }
      const u = (s.t - c.t0) / (c.t1 - c.t0);
      if (fillRef.current) fillRef.current.style.width = `${u * 100}%`;
      if (knobRef.current) knobRef.current.style.left = `${u * 100}%`;
      if (scrubRef.current && document.activeElement !== scrubRef.current) scrubRef.current.value = String(s.t);
      if (clockRef.current) clockRef.current.textContent = clock(s.t);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      gl.current = null;
    };
  }, [c]);

  // build the chosen view and hand it the renderer
  useEffect(() => {
    const g = gl.current;
    if (!g) return;
    const ctx: Ctx = {
      lab, c, canvas: canvasRef.current!, mini: miniRef.current!, t, state: state.current,
      tag: (x, y, html) => {
        const el = tagRef.current;
        if (!el) return;
        el.hidden = false;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.innerHTML = html;
      },
      untag: () => {
        if (tagRef.current) tagRef.current.hidden = true;
      },
      seek: (to) => {
        state.current.t = Math.min(Math.max(to, c.t0), c.t1);
        setPlaying(false);
      },
      refresh: bump,
    };
    const v = VIEWS[view].make(ctx);
    const r = stageRef.current!.getBoundingClientRect();
    v.camera.aspect = r.width / Math.max(r.height, 1);
    v.camera.updateProjectionMatrix();
    const composer = new EffectComposer(g.renderer);
    composer.addPass(new RenderPass(v.scene, v.camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(r.width, r.height), ...v.bloom));
    composer.addPass(new OutputPass());
    composer.setSize(r.width, r.height);
    state.current.t = v.start;
    g.view = v;
    g.composer = composer;
    v.on();
    bump();
    try {
      localStorage.setItem("rc.labView", String(view));
    } catch {
      /* private mode: the Lab simply opens on the first view next time */
    }
    return () => {
      v.off();
      v.dispose();
      composer.dispose();
      if (gl.current) {
        gl.current.view = null;
        gl.current.composer = null;
      }
      if (tagRef.current) tagRef.current.hidden = true;
    };
  }, [view, c, lab, t]);

  const tools = gl.current?.view?.tools() ?? [];
  const pivot = c.decisions[c.pivot];
  const pct = (s: number) => `${((s - c.t0) / (c.t1 - c.t0)) * 100}%`;
  const marks = [
    { s: c.dropS, cls: "text-flare", text: t("lab.marks.drop", { name: surname(lab, c.culprit) }) },
    ...(pivot ? [{ s: pivot.s, cls: "text-flare", text: t("lab.marks.pass") }] : []),
    { s: c.goalS, cls: "text-chalk", text: t("lab.marks.goal") },
  ];
  const id = VIEWS[view].id;
  const p = {
    name: surname(lab, c.culprit),
    receiver: surname(lab, c.receiver),
    team: lab.clubs[c.culprit < 11 ? 0 : 1].name,
    at: clock(c.dropS),
    pass: pivot ? clock(pivot.s) : clock(c.goalS),
    m: (pivot ? c.gapAtPass : c.maxGap).toFixed(1),
  };
  const open = pivot ? "" : "Open";

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label={t("lab.viewsLabel")} className="flex flex-wrap gap-2">
        {VIEWS.map((v, i) => (
          <button
            key={v.id}
            role="tab"
            type="button"
            aria-selected={i === view}
            onClick={() => setView(i)}
            className="rc-press flex items-center gap-2 rounded-full border border-turf-edge px-4 py-2.5 text-[15px] font-semibold text-chalk-dim aria-selected:border-[#060918] aria-selected:bg-[#060918] aria-selected:text-chalk"
          >
            <span className={`font-display text-[12px] font-black [font-stretch:140%] ${i === view ? "text-flare" : "text-chalk-faint"}`}>{"ABC"[i]}</span>
            {t(`lab.views.${v.id}`)}
          </button>
        ))}
      </div>

      <div
        ref={stageRef}
        className="relative h-[min(76vh,720px)] min-h-[520px] touch-none select-none overflow-hidden rounded-panel border border-[#222b5c] bg-[radial-gradient(120%_90%_at_50%_0%,#10194a_0%,#060918_62%)]"
      >
        <canvas ref={canvasRef} role="img" aria-label={t("lab.stageLabel")} className="absolute inset-0 block h-full w-full cursor-grab active:cursor-grabbing" />
        {glFailed && <p className="absolute inset-0 grid place-items-center px-6 text-center text-[16px] text-chalk-dim">{t("lab.noGl")}</p>}
        <div className="pointer-events-none absolute left-4 top-4 grid max-w-[min(440px,60%)] gap-1 sm:left-5">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-flare">{t(`lab.kicker.${id}`)}</span>
          <h2 className="font-display text-[30px] font-black leading-[0.92] tracking-display [font-stretch:135%] sm:text-[48px]">{t(`lab.views.${id}`)}</h2>
          <p className="mt-1 hidden max-w-[34ch] text-[14px] text-[#8f97c8] sm:block">{t(`lab.viewLine.${id}`)}</p>
        </div>
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5 sm:right-4 sm:top-4">
          <button
            type="button"
            aria-pressed={fix}
            onClick={() => setFix(!fix)}
            className="rc-press rounded-full border border-flare/60 bg-[#0d1330]/80 px-3.5 py-2 text-[13px] font-semibold text-flare backdrop-blur aria-pressed:border-flare aria-pressed:bg-flare aria-pressed:text-flare-ink"
          >
            {t("lab.showFix")}
          </button>
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              aria-pressed={tool.pressed}
              onClick={() => {
                tool.on();
                bump();
              }}
              className="rc-press rounded-full border border-[#222b5c] bg-[#0d1330]/80 px-3.5 py-2 text-[13px] font-semibold text-chalk backdrop-blur aria-pressed:border-chalk aria-pressed:bg-chalk aria-pressed:text-ink"
            >
              {tool.label}
            </button>
          ))}
        </div>
        <div
          ref={calloutRef}
          aria-live="polite"
          className="lab-callout pointer-events-none absolute bottom-[74px] left-4 max-w-[min(460px,calc(100%-32px))] rounded-[10px] border border-l-[3px] border-[#222b5c] bg-[#060918]/85 px-3.5 py-2.5 text-[14.5px] backdrop-blur sm:left-5"
        />
        <canvas
          ref={miniRef}
          width={420}
          height={272}
          hidden
          aria-label={t("lab.miniLabel")}
          className="absolute bottom-[172px] right-3 h-[91px] w-[140px] cursor-pointer rounded-lg border border-[#222b5c] bg-[#060918]/85 sm:bottom-[74px] sm:right-4 sm:h-[136px] sm:w-[210px]"
        />
        <div ref={tagRef} hidden className="lab-tag pointer-events-none absolute translate-x-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-chalk px-2.5 py-1.5 text-[13px] font-semibold leading-snug text-ink" />
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-b from-transparent to-[#060918]/95 px-4 pb-3.5 pt-3">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? t("lab.pause") : t("lab.play")}
            className="rc-press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-chalk text-ink"
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <rect x="1.5" y="1" width="3" height="10" fill="currentColor" />
                <rect x="7.5" y="1" width="3" height="10" fill="currentColor" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 1 L11 6 L2.5 11 Z" fill="currentColor" />
              </svg>
            )}
          </button>
          <span ref={clockRef} className="min-w-[54px] font-display text-[18px] font-extrabold tabular-nums [font-stretch:120%]">
            {clock(c.t0)}
          </span>
          <div className="relative h-9 min-w-0 flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-[17px] h-[3px] rounded bg-[#222b5c]" />
            <div ref={fillRef} className="pointer-events-none absolute left-0 top-[17px] h-[3px] rounded bg-chalk" />
            <div ref={knobRef} className="pointer-events-none absolute top-[11px] -ml-[7px] h-[15px] w-[15px] rounded-full bg-chalk shadow-[0_0_0_4px_rgba(233,236,255,.15)]" />
            {marks.map((m) => (
              <div key={m.text} className={`pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.08em] ${m.cls}`} style={{ left: pct(m.s) }}>
                <span className="hidden sm:inline">{m.text}</span>
                <i className="absolute left-1/2 top-[13px] -ml-px h-[11px] w-[2px] bg-current" />
              </div>
            ))}
            <input
              ref={scrubRef}
              type="range"
              min={c.t0}
              max={c.t1}
              step={0.05}
              defaultValue={c.t0}
              aria-label={t("lab.time")}
              onChange={(e) => {
                state.current.t = +e.target.value;
              }}
              className="absolute inset-0 m-0 w-full cursor-pointer opacity-0"
            />
          </div>
          <button
            type="button"
            onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
            aria-label={t("lab.speed")}
            className="rc-press h-9 min-w-9 shrink-0 rounded-full border border-[#222b5c] px-3 text-[13px] font-bold text-chalk"
          >
            {speed}×
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {(["see", "mistake", "fix"] as const).map((k) => (
          <div key={k} className="min-w-0 rounded-panel border border-[#222b5c] bg-[#0d1330] px-4 py-3.5">
            <h3 className={`text-[11px] font-bold uppercase tracking-[0.14em] ${k === "mistake" ? "text-flare" : "text-[#8f97c8]"}`}>{t(`lab.notesHead.${k}`)}</h3>
            <p className="mt-1 text-[15px]">{t(`lab.notes.${id}.${k}${k === "see" ? "" : open}`, p)}</p>
          </div>
        ))}
      </div>
      <p className="text-[13px] text-chalk-faint">{t("lab.foot", { home: lab.clubs[0].name, away: lab.clubs[1].name })}</p>
    </div>
  );
}
