import { AnimatePresence, motion } from "framer-motion";
import { Component, Suspense, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Header } from "./components/Header";
import { chunkReloadDone, lazyPage } from "./lib/lazyPage";
import { chainBounds, jumpTo } from "./store/broadcast";
import { useBroadcast } from "./store/broadcast";
import { useMatch } from "./store/matchStore";
import { playhead, useTrace } from "./store/traceStore";
import { useUi } from "./store/uiStore";
import { Home } from "./screens/Home";
import { chronological, rootLink } from "./lib/geometry";

// Match and Autopsy move to screens/Match.tsx and screens/Autopsy.tsx in their own workstreams;
// these imports switch over when those files land.
const Match = lazyPage(() => import("./screens/Analysis").then((m) => ({ default: m.Analysis })));
const Autopsy = lazyPage(() => import("./screens/Lab").then((m) => ({ default: m.Lab })));
const Story = lazyPage(() => import("./screens/Story").then((m) => ({ default: m.Story })));
const Matches = lazyPage(() => import("./screens/Matches").then((m) => ({ default: m.Matches })));
const Explore = lazyPage(() => import("./screens/MatchScreen").then((m) => ({ default: m.MatchScreen })));

const PAGES = { story: Story, matches: Matches, match: Match, autopsy: Autopsy, explore: Explore } as const;

export default function App() {
  useBroadcast();
  useKeyboard();
  const screen = useUi((s) => s.screen);
  const failure = useMatch((s) => s.failure);
  const { t } = useTranslation();
  useEffect(() => {
    const id = setTimeout(chunkReloadDone, 10_000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-turf-deep font-body text-chalk">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-chalk focus:px-3 focus:py-2 focus:text-turf-deep">
        Skip to content
      </a>
      <Header />
      {failure && (
        <div role="alert" className="border-b border-flare/40 bg-flare/10 px-4 py-2 text-[14px] text-chalk">
          {t("app.failed")}: {failure}
        </div>
      )}
      <main id="main">
        <ScreenBoundary key={screen} message={t("app.screenFailed")} retry={t("app.retry")}>
        {screen === "home" ? (
          <Home />
        ) : (
          <Suspense fallback={<PageLoading />}>
            <Page screen={screen} />
          </Suspense>
        )}
        </ScreenBoundary>
      </main>
      <Shortcuts />
    </div>
  );
}

function Page({ screen }: { screen: keyof typeof PAGES }) {
  const P = PAGES[screen];
  return <P />;
}

/** A quiet pulse while a page's code arrives; no words to flash past on a fast connection. */
function PageLoading() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("app.loading")} className="grid min-h-[60dvh] place-items-center">
      <svg width="44" height="44" viewBox="0 0 22 22" aria-hidden="true" className="rc-loading">
        <g fill="none" stroke="rgb(var(--chalk))" strokeWidth="1.2" strokeLinejoin="round">
          <path d="M3 15l8 4 8-4" />
          <path d="M3 11l8 4 8-4" opacity=".6" />
          <path d="M3 7l8 4 8-4-8-4z" opacity=".35" />
        </g>
      </svg>
    </div>
  );
}

/** Replay keyboard on the explorer: space, arrows, [ ], g, r, f, ?, Esc. */
function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (useUi.getState().screen !== "explore") return;
      const tr = useTrace.getState();
      const m = useMatch.getState();
      const ev = tr.selectedGoalId ? m.evidence[tr.selectedGoalId] : null;
      const busy = tr.phase === "goal" || tr.phase === "tracing";
      const handled = () => e.preventDefault();

      switch (e.key) {
        case " ":
          if (el.closest("button, [role=button], [role=slider]") && e.key === " " && el.tagName === "BUTTON") return;
          handled();
          if (busy) return;
          if (tr.phase === "live") jumpTo(playhead.t, { ms: 0, play: false });
          else tr.setPlaying(!tr.playing);
          break;
        case "ArrowLeft":
        case "ArrowRight": {
          if (el.closest("[role=radiogroup], [role=tablist]") || busy) return;
          handled();
          const d = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 5 : 1);
          jumpTo(Math.round(playhead.t) + d, { ms: 0, play: false });
          break;
        }
        case "[":
        case "]": {
          if (!ev) return;
          handled();
          const links = chronological(ev);
          const cur = links.findIndex((l) => l.evidence_id === tr.focus.evidenceId);
          const next = links[Math.max(0, Math.min(links.length - 1, cur < 0 ? 0 : cur + (e.key === "]" ? 1 : -1)))];
          tr.pin(null, null);
          tr.pin(next.evidence_id, next.player_id);
          jumpTo(next.second - 1, { play: true });
          break;
        }
        case "g":
          if (!ev) return;
          handled();
          jumpTo(ev.goal.second - 3, { play: true });
          break;
        case "r": {
          if (!ev) return;
          handled();
          const r = rootLink(ev)!;
          tr.pin(null, null);
          tr.pin(r.evidence_id, r.player_id);
          jumpTo(r.second - 1, { play: true });
          break;
        }
        case "f": {
          if (!ev) return;
          handled();
          const r = rootLink(ev)!;
          const on = tr.morphTarget === 0;
          tr.setMorph(on ? 1 : 0, tr.morphEvidenceId ?? r.evidence_id);
          const b = chainBounds(ev.goal_id);
          if (on && b) jumpTo(Math.max(b[0], r.second - 2), { play: true });
          break;
        }
        case "?":
          handled();
          useUi.getState().setShortcuts(!useUi.getState().shortcutsOpen);
          break;
        case "Escape":
          if (useUi.getState().shortcutsOpen) useUi.getState().setShortcuts(false);
          else {
            tr.pin(null, null);
            tr.hover(null, null);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Shortcuts() {
  const { t } = useTranslation();
  const open = useUi((s) => s.shortcutsOpen);
  const rows: [string[], string][] = [
    [["Space"], t("keys.space")],
    [["←", "→"], t("keys.arrows")],
    [["Shift", "←", "→"], t("keys.shiftArrows")],
    [["[", "]"], t("keys.brackets")],
    [["G"], t("keys.g")],
    [["R"], t("keys.r")],
    [["F"], t("keys.f")],
    [["Esc"], t("keys.esc")],
  ];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-turf-deep/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => useUi.getState().setShortcuts(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="keys-h"
            className="w-full max-w-[440px] rounded-panel bg-turf p-6 ring-1 ring-turf-edge"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="keys-h" className="font-display text-[22px] font-extrabold text-chalk">
              {t("keys.title")}
            </h2>
            <dl className="mt-4 space-y-2.5">
              {rows.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-4 text-[14px]">
                  <dt className="text-chalk-dim">{label}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <kbd key={k} className="min-w-[28px] rounded-md bg-turf-deep px-2 py-0.5 text-center font-body text-[13px] font-semibold text-chalk ring-1 ring-turf-edge">
                        {k}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              autoFocus
              onClick={() => useUi.getState().setShortcuts(false)}
              className="rc-press mt-6 min-h-[42px] w-full rounded-full bg-chalk text-[14px] font-bold text-turf-deep"
            >
              {t("keys.close")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A screen that throws shows a way out instead of an empty page. */
class ScreenBoundary extends Component<{ children: ReactNode; message: string; retry: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8">
        <p className="text-[18px] text-chalk">{this.props.message}</p>
        <button type="button" onClick={() => location.reload()} className="rc-press mt-6 inline-flex h-[48px] items-center rounded-full bg-chalk px-6 text-[15px] font-semibold text-turf">
          {this.props.retry}
        </button>
      </div>
    );
  }
}
