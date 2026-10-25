import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SECONDS, type Lab } from "../../lab/data";
import { matchStats } from "../../lab/stats";
import { quality } from "../../lib/device";
import { useUi } from "../../store/uiStore";
import { reelModel } from "./reelModel";
import type { ReelStage } from "./reel";

const clock = (t: number) => `${Math.floor(t / 60)}′`;

/**
 * One player's whole match as a 3D reel that tells its own story: the speed curtain grows, passes
 * leap out as arcs, shots streak at goal, and a caption calls out each moment worth knowing. About
 * a minute for 90 minutes, slowing down on the big moments. Scrub to go anywhere.
 */
export function PlayerReel({ lab, i }: { lab: Lab; i: number }) {
  const { t } = useTranslation();
  const reduced = useUi((u) => u.reducedMotion) || quality.reducedMotion;
  const reel = useMemo(() => reelModel(lab, i), [lab, i]);
  const st = matchStats(lab);
  const host = useRef<HTMLDivElement>(null);
  const time = useRef(reduced ? SECONDS - 1 : 0);
  const [playing, setPlaying] = useState(!reduced);
  const playRef = useRef(playing);
  playRef.current = playing;
  const [now, setNow] = useState(time.current);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stage: ReelStage | null = null, raf = 0, dead = false, ro: ResizeObserver | null = null;
    void import("./reel").then(({ ReelStage }) => {
      if (dead || !host.current) return;
      try {
        stage = new ReelStage(host.current, reel);
      } catch {
        setFailed(true);
        return;
      }
      ro = new ResizeObserver(() => stage?.resize());
      ro.observe(host.current);
      let last = performance.now(), lastUi = 0;
      const loop = (ms: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(ms - last, 100) / 1000;
        last = ms;
        if (playRef.current) {
          // slow down for a few match minutes after each caption so it can be read
          const recent = reel.captions.some((c) => time.current >= c.s && time.current - c.s < 150);
          time.current = Math.min(SECONDS - 1, time.current + dt * (recent ? 28 : 110));
          if (time.current >= SECONDS - 1) setPlaying(false);
        }
        stage!.render(time.current, dt);
        if (ms - lastUi > 100) {
          lastUi = ms;
          setNow(time.current);
        }
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      stage?.dispose();
    };
  }, [reel]);

  const s = Math.min(Math.floor(now), SECONDS - 1);
  const cap = [...reel.captions].reverse().find((c) => c.s <= now) ?? reel.captions[0];
  const mine = st.passes.filter((x) => x.player === i && x.s <= now);
  let top = 0;
  for (let k = 0; k <= s; k++) top = Math.max(top, st.speed[i * SECONDS + k]);
  const counters: [string, string][] = [
    [(st.cum[i * SECONDS + s] / 1000).toFixed(1), t("fan.reel.kmL")],
    [(top * 3.6).toFixed(1), t("fan.reel.topL")],
    [`${mine.filter((x) => x.ok).length}/${mine.length}`, t("fan.reel.passes")],
  ];

  return (
    <div className="relative mt-5 h-[min(74svh,660px)] min-h-[460px] w-full overflow-hidden rounded-[18px] bg-[#06070b]">
      <div ref={host} className="absolute inset-0" aria-hidden="true" />
      {failed && <p className="absolute inset-0 grid place-items-center text-[15px] text-chalk-dim">{t("tlab.noGl")}</p>}
      <div className="pointer-events-none absolute left-3 top-3 flex gap-2 sm:left-5 sm:top-5">
        {counters.map(([v, k]) => (
          <div key={k} className="rounded-xl bg-black/55 px-3 py-2 backdrop-blur">
            <div className="font-display text-[22px] font-black tabular-nums leading-none text-white sm:text-[28px]">{v}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">{k}</div>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06070b] via-[#06070b]/85 to-transparent px-3 pb-3 pt-14 sm:px-5">
        <p key={cap.key + cap.s} aria-live="polite" className="rc-fade-in max-w-[760px] text-[17px] font-semibold leading-snug text-white sm:text-[22px]">
          <span className={`mr-2 rounded-full px-2 py-0.5 align-middle text-[12px] font-bold tabular-nums ${cap.hot ? "bg-flare text-flare-ink" : "bg-white/15 text-white/80"}`}>{clock(cap.s)}</span>
          {t(`fan.reel.${cap.key}`, cap.p)}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (time.current >= SECONDS - 1) time.current = 0;
              setPlaying(!playing);
            }}
            className="rc-press min-h-[40px] shrink-0 rounded-full bg-white px-4 text-[13px] font-bold text-[#0b0c12]"
          >
            {playing ? t("fan.reel.pause") : now >= SECONDS - 1 ? t("fan.reel.again") : t("fan.reel.play")}
          </button>
          <input
            type="range"
            min={0}
            max={SECONDS - 1}
            value={Math.floor(now)}
            aria-label={t("fan.reel.scrub")}
            onChange={(e) => {
              time.current = Number(e.target.value);
              setNow(time.current);
            }}
            className="min-w-0 flex-1 accent-[rgb(var(--flare))]"
          />
          <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-white/70">{clock(now)}</span>
        </div>
        <p className="mt-2 hidden text-[12px] text-white/45 sm:block">{t("fan.reel.legend")}</p>
      </div>
    </div>
  );
}
