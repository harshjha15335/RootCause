import { useEffect } from "react";
import { liveFeed, recordedFeed, type Feed } from "../api/socket";
import { liveSource, showcaseSource, startLiveMatch, type Source } from "../api/rest";
import { Track } from "../lib/frames";
import { useMatch } from "./matchStore";
import { playhead, useTrace } from "./traceStore";
import { useUi } from "./uiStore";

const params = new URLSearchParams(location.search);
const API = params.get("api");
const TOKEN = params.get("token") ?? undefined;

export let source: Source = showcaseSource();
export const fixedTracks = new Map<string, Track>(); // evidence id -> recorded fixed replay

/** Showcase broadcast starts this long before the featured goal (the last traced one). */
const LEAD_IN_S = 40;
const FREEZE_MS = 1300;
const MIN_TRACE_MS = 2400;
const LIVE_TRACE_TIMEOUT_MS = 25000;

export function chainBounds(goalId: string): [number, number] | null {
  const ev = useMatch.getState().evidence[goalId];
  if (!ev) return null;
  const first = Math.min(...ev.links.map((l) => l.second), ev.goal.second);
  return [first - 2, ev.goal.second + 2];
}

export function jumpTo(second: number, opts: { ms?: number; play?: boolean } = {}) {
  const tr = useTrace.getState();
  if (tr.phase === "live" || tr.phase === "goal" || tr.phase === "tracing") tr.setPhase("review");
  const reduced = useUi.getState().reducedMotion;
  tr.seek(second, reduced ? 0 : opts.ms ?? 650);
  if (opts.play !== undefined) tr.setPlaying(opts.play);
}

export function backToLive() {
  const tr = useTrace.getState();
  tr.setPhase("live");
  tr.setPlaying(true);
  tr.setSpeed(1);
  tr.setMorph(0);
  tr.pin(null, null);
  tr.hover(null, null);
}

/** Skip the lead-in: put the broadcast a few seconds before the next goal. */
export function skipAhead() {
  const m = useMatch.getState();
  const next = goalSeconds.find((s) => s > playhead.edge + 3);
  if (next !== undefined) {
    playhead.edge = next - 9;
    playhead.t = playhead.edge;
    useTrace.getState().setPhase("live");
  }
  void m;
}

let goalSeconds: number[] = [];
let untracedEvents = new Set<string>();

export function useBroadcast() {
  useEffect(() => {
    let feed: Feed | null = null;
    let raf = 0;
    let cancelled = false;
    let lastNow = performance.now();
    let lastSecondPush = 0;
    let handledGoals = 0;
    let goalAt = 0;
    let goalSecond = 0;
    let goalEvent = "";

    const start = async () => {
      const match = useMatch.getState();
      if (API) {
        const id = params.get("match") ?? (await startLiveMatch(API, Number(params.get("seed") ?? 42), TOKEN)).id;
        source = liveSource(API, id, TOKEN);
        match.reset(id, null);
        feed = liveFeed(API, id, (m) => match.ingest(m), (s) => s === "open" && useMatch.getState().setStatus("streaming"), TOKEN);
        playhead.edge = 0;
      } else {
        const sc = showcaseSource();
        source = sc;
        const x = await sc.extras();
        if (cancelled) return;
        match.reset(sc.matchId, x.meta);
        const { track } = useMatch.getState();
        for (const e of x.ticks) track.addEngine(e);
        for (const [, links] of Object.entries(x.replays)) {
          for (const [eid, rep] of Object.entries(links)) {
            const t = new Track(track.order);
            for (const f of rep.frames) t.addReplay(f);
            fixedTracks.set(eid, t);
          }
        }
        useMatch.setState({ replays: x.replays, untraced: Object.fromEntries(x.manifest.untraced.map((u) => [u.event_id, u.reason])) });
        untracedEvents = new Set(x.manifest.untraced.map((u) => u.event_id));
        goalSeconds = x.ticks.filter((e) => e.type === "goal").map((e) => e.clock_s);
        const featured = x.truth?.goal_clock_s ?? goalSeconds[goalSeconds.length - 1];
        const startSecond = featured - LEAD_IN_S;
        playhead.edge = startSecond;
        playhead.t = startSecond;
        const goals = x.messages.filter((m) => m.type === "match.event" && m.payload.type === "goal");
        handledGoals = goals.filter((m) => m.type === "match.event" && m.payload.second <= startSecond).length;
        feed = recordedFeed(x.messages, startSecond, (m) => useMatch.getState().ingest(m));
        useTrace.getState().setWindow([startSecond, featured + 8]);
      }
      raf = requestAnimationFrame(loop);
    };

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      const tr = useTrace.getState();
      const m = useMatch.getState();
      const ui = useUi.getState();

      // broadcast clock
      if (tr.phase === "live") {
        if (source.kind === "showcase") playhead.edge += dt;
        else playhead.edge = Math.max(playhead.edge, m.head);
      }
      feed?.advance(playhead.edge, now);

      // a new goal: freeze, swoop, rewind while the Debugger works
      const goals = useMatch.getState().goals;
      if (goals.length > handledGoals) {
        const g = goals[goals.length - 1];
        handledGoals = goals.length;
        if (tr.phase === "live") {
          goalAt = now;
          goalSecond = g.second;
          goalEvent = g.eventId;
          playhead.t = g.second;
          tr.setPhase("goal");
          tr.setWindow([g.second - 20, g.second + 3]);
          tr.pin(null, null);
          ui.setTab("live");
        }
      }

      const phase = useTrace.getState().phase;
      if (phase === "goal") {
        playhead.t = goalSecond;
        if (now - goalAt > (ui.reducedMotion ? 500 : FREEZE_MS)) useTrace.getState().setPhase("tracing");
      } else if (phase === "tracing") {
        const g = useMatch.getState().goals.find((x) => x.eventId === goalEvent);
        const elapsed = now - goalAt - FREEZE_MS;
        // the scoring move rewinds on a 2-second loop
        if (!ui.reducedMotion) playhead.t = goalSecond - ((elapsed % 2000) / 2000) * 8;
        const timedOut = source.kind === "live" && now - goalAt > LIVE_TRACE_TIMEOUT_MS;
        const untraced = untracedEvents.has(goalEvent);
        if (g?.goalId && elapsed > MIN_TRACE_MS) {
          const b = chainBounds(g.goalId)!;
          const t = useTrace.getState();
          t.selectGoal(g.goalId);
          t.setWindow(b);
          t.setPhase("traced");
          t.setSpeed(0.5);
          t.setPlaying(true);
          t.seek(b[0], ui.reducedMotion ? 0 : 900);
          ui.setTab(ui.mode === "fan" ? "cause" : "trace");
        } else if ((untraced && elapsed > MIN_TRACE_MS) || timedOut) {
          const t = useTrace.getState();
          t.selectGoal(null);
          t.setPhase("review");
          t.setPlaying(false);
          playhead.t = goalSecond;
        }
      } else if (phase === "traced" || phase === "review") {
        const t = useTrace.getState();
        if (t.seekTo) {
          const k = Math.min(1, (now - t.seekTo.at) / t.seekTo.ms);
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          playhead.t = t.seekTo.from + (t.seekTo.t - t.seekTo.from) * e;
          if (k >= 1) useTrace.setState({ seekTo: null });
        } else if (t.playing) {
          playhead.t += dt * t.speed;
          const [a, b] = t.window;
          if (playhead.t > b) {
            if (phase === "traced") playhead.t = a;
            else {
              playhead.t = b;
              t.setPlaying(false);
            }
          }
        }
      } else {
        // live: show the broadcast edge; live API data arrives ~1 Hz, so trail it by a second
        playhead.t = source.kind === "live" ? Math.max(playhead.t, playhead.edge - 1) : playhead.edge;
      }

      // counterfactual morph, damped
      const target = useTrace.getState().morphTarget;
      playhead.morph = ui.reducedMotion ? target : damp(playhead.morph, target, 5, dt);

      if (now - lastSecondPush > 100) {
        lastSecondPush = now;
        useTrace.getState().setSecond(Math.floor(playhead.t));
      }
      raf = requestAnimationFrame(loop);
    };

    start().catch((e) => {
      console.error(e);
      useMatch.setState({ status: "failed", failure: String(e?.message ?? e) });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      feed?.close();
    };
  }, []);
}

export function damp(a: number, b: number, lambda: number, dt: number) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}
