import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { clock, playerInfo, surname } from "../lib/format";
import { backToLive, begin, jumpTo, skipAhead, source } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { useSelectedEvidence } from "../store/selectors";
import { playhead, useTrace } from "../store/traceStore";
import { useUi } from "../store/uiStore";

const SPEEDS = [0.25, 0.5, 1];

export function ReplayBar() {
  const { t } = useTranslation();
  const [a, b] = useTrace((s) => s.window);
  const second = useTrace((s) => s.second);
  const playing = useTrace((s) => s.playing);
  const speed = useTrace((s) => s.speed);
  const phase = useTrace((s) => s.phase);
  const ev = useSelectedEvidence();
  const goals = useMatch((s) => s.goals);
  const meta = useMatch((s) => s.meta);
  const track = useRef<HTMLDivElement>(null);
  const live = phase === "live";
  const busy = phase === "goal" || phase === "tracing";
  const span = Math.max(1, b - a);
  const at = (s: number) => `${Math.min(100, Math.max(0, ((s - a) / span) * 100))}%`;

  const scrubTo = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    jumpTo(a + k * span, { ms: 0, play: false });
  };

  return (
    <div className="flex items-center gap-2 border-t border-turf-edge/70 bg-turf px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3 sm:px-4">
      <button
        type="button"
        disabled={busy}
        aria-label={playing && !live ? t("replay.pause") : t("replay.play")}
        onClick={() => {
          if (live) return jumpTo(playhead.t, { ms: 0, play: false });
          const tr = useTrace.getState();
          if (!tr.playing && playhead.t >= b - 0.2) tr.seek(a);
          tr.setPlaying(!tr.playing);
        }}
        className="rc-press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-chalk text-turf-deep transition-opacity duration-150 disabled:opacity-40"
      >
        {playing && !busy ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2.5" y="2" width="3" height="10" rx="1" fill="currentColor" /><rect x="8.5" y="2" width="3" height="10" rx="1" fill="currentColor" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
        )}
      </button>

      <span className="w-[3.2em] shrink-0 text-right font-display text-[14px] font-semibold text-chalk tabular-nums">{clock(second)}</span>

      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={t("replay.scrub")}
        aria-valuemin={a}
        aria-valuemax={b}
        aria-valuenow={second}
        aria-valuetext={clock(second)}
        className="group relative h-10 min-w-0 flex-1 cursor-pointer touch-none select-none"
        onPointerDown={(e) => {
          if (busy) return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          scrubTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1 && !busy) scrubTo(e.clientX);
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-turf-edge" />
        <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-chalk/70" style={{ width: at(second) }} />
        {goals
          .filter((g) => g.second >= a && g.second <= b)
          .map((g) => (
            <Marker key={g.eventId} left={at(g.second)} label={`${t("replay.goal")} ${clock(g.second)}`} onClick={() => jumpTo(g.second - 3, { play: true })}>
              <span className="block h-3.5 w-3.5 rounded-full border-2 border-chalk bg-turf" />
            </Marker>
          ))}
        {ev?.links.map((l) => (
          <Marker
            key={l.evidence_id}
            left={at(l.second)}
            label={`${surname(playerInfo(meta, l.player_id).name)} ${clock(l.second)}`}
            onClick={() => {
              useTrace.getState().pin(l.evidence_id, l.player_id);
              jumpTo(l.second - 1, { play: true });
            }}
            onHover={(on) => useTrace.getState().hover(on ? l.evidence_id : null, on ? l.player_id : null)}
          >
            <span className={`block h-3.5 w-3.5 rotate-45 rounded-[3px] ${l.evidence_id === ev.root_cause_evidence_id ? "bg-flare" : "border-2 border-flare bg-turf"}`} />
          </Marker>
        ))}
        <div className="pointer-events-none absolute top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-chalk shadow" style={{ left: at(second) }} />
      </div>

      <div className="hidden items-center rounded-full bg-turf-deep p-0.5 ring-1 ring-turf-edge sm:flex" role="group" aria-label={t("replay.speed")}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            disabled={live || busy}
            onClick={() => useTrace.getState().setSpeed(s)}
            className={`rc-press min-h-[30px] rounded-full px-2 text-[12px] font-semibold tabular-nums transition-colors duration-150 disabled:opacity-40 ${speed === s && !live ? "bg-turf-raised text-chalk" : "text-chalk-dim hover:text-chalk"}`}
          >
            {s === 1 ? "1×" : s === 0.5 ? "½×" : "¼×"}
          </button>
        ))}
      </div>

      {live ? (
        <button type="button" onClick={skipAhead} className="rc-press min-h-[38px] shrink-0 rounded-full px-3 text-[13px] font-semibold text-chalk ring-1 ring-turf-edge transition-colors duration-150 hover:bg-turf-raised">
          {t("replay.skip")}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => (source.kind === "showcase" ? begin("buildup") : backToLive())}
          className="rc-press min-h-[38px] shrink-0 rounded-full px-3 text-[13px] font-semibold text-chalk ring-1 ring-turf-edge transition-colors duration-150 hover:bg-turf-raised disabled:opacity-40"
        >
          {source.kind === "showcase" ? t("replay.buildup") : t("replay.live")}
        </button>
      )}
      <button
        type="button"
        onClick={() => useUi.getState().setShortcuts(true)}
        className="rc-press hidden h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-bold text-chalk-dim ring-1 ring-turf-edge hover:text-chalk md:grid"
        aria-label={t("keys.title")}
      >
        ?
      </button>
    </div>
  );
}

function Marker({ left, label, onClick, onHover, children }: { left: string; label: string; onClick: () => void; onHover?: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      onPointerEnter={() => onHover?.(true)}
      onPointerLeave={() => onHover?.(false)}
      className="rc-press absolute top-1/2 z-10 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center"
      style={{ left }}
    >
      {children}
    </button>
  );
}
