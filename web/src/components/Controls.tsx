import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Lang, Mode } from "../api/types";
import { source } from "../store/broadcast";
import { useExplanation } from "../store/selectors";
import { useTrace } from "../store/traceStore";
import { useUi } from "../store/uiStore";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  id,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; lang?: string; title?: string }[];
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="relative flex rounded-full p-1 ring-1 ring-inset ring-turf-edge">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            lang={o.lang}
            title={o.title}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const i = options.findIndex((x) => x.value === value);
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const n = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
                onChange(n.value);
                (e.currentTarget.parentElement?.querySelector(`[data-v="${n.value}"]`) as HTMLElement | null)?.focus();
              }
            }}
            data-v={o.value}
            tabIndex={on ? 0 : -1}
            className={`rc-press relative z-10 min-h-[34px] rounded-full px-3 text-[13px] font-medium transition-colors duration-300 ease-out ${on ? "text-turf-deep" : "text-chalk-faint hover:text-chalk"}`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-full bg-chalk"
                transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ModeSwitch() {
  const { t } = useTranslation();
  const mode = useUi((s) => s.mode);
  return (
    <Segmented<Mode>
      id="mode"
      label={t("controls.mode")}
      value={mode}
      onChange={(m) => {
        useUi.getState().setMode(m);
        const ui = useUi.getState();
        if (ui.tab === "script" && m !== "studio") ui.setTab("cause");
      }}
      options={[
        { value: "fan", label: t("mode.fan"), title: t("mode.fanHint") },
        { value: "analyst", label: t("mode.analyst"), title: t("mode.analystHint") },
        { value: "studio", label: t("mode.studio"), title: t("mode.studioHint") },
      ]}
    />
  );
}

export function LanguageSelect() {
  const { t } = useTranslation();
  const lang = useUi((s) => s.lang);
  return (
    <Segmented<Lang>
      id="lang"
      label={t("controls.language")}
      value={lang}
      onChange={(l) => useUi.getState().setLang(l)}
      options={[
        { value: "en", label: "EN", lang: "en", title: "English" },
        { value: "hi", label: "HI", title: "हिन्दी (Hindi)" },
        { value: "es", label: "ES", lang: "es", title: "Español" },
      ]}
    />
  );
}

/**
 * Plays GET /goals/{id}/audio. The API answers 503 when Azure Speech is not configured
 * (local demo and this recording), so the button says why it is off instead of hiding.
 */
export function VoiceButton() {
  const { t } = useTranslation();
  const goalId = useTrace((s) => s.selectedGoalId);
  const mode = useUi((s) => s.mode);
  const lang = useUi((s) => s.lang);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "off">("idle");
  // the explanation response says whether the API can speak it (audio_available)
  const available = useExplanation(goalId).data?.audio_available;
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setState(source.kind === "showcase" || available === false ? "off" : "idle");
    return () => audio.current?.pause();
  }, [goalId, mode, lang, available]);

  const label =
    state === "off" ? t("voice.off") : state === "playing" ? t("voice.stop") : state === "loading" ? t("voice.loading") : t("voice.play");

  return (
    <button
      type="button"
      disabled={!goalId || state === "off"}
      title={state === "off" ? t("voice.offHint") : undefined}
      aria-label={label}
      onClick={async () => {
        if (!goalId) return;
        if (state === "playing") {
          audio.current?.pause();
          setState("idle");
          return;
        }
        setState("loading");
        try {
          const blob = await source.audio(goalId, mode, lang);
          audio.current = new Audio(URL.createObjectURL(blob));
          audio.current.onended = () => setState("idle");
          await audio.current.play();
          setState("playing");
        } catch {
          setState("off");
        }
      }}
      className="rc-press inline-flex min-h-[42px] items-center gap-2 rounded-full px-3 text-[13px] font-medium text-chalk-faint ring-1 ring-inset ring-turf-edge transition-colors duration-150 ease-out enabled:hover:text-chalk disabled:cursor-not-allowed disabled:opacity-60"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M2.5 6v4h2.5l3.5 3V3L5 6z" fill="currentColor" stroke="none" />
        {state === "off" ? <path d="m11 6 3.5 4m0-4L11 10" /> : <path d="M11 5.5q1.6 2.5 0 5M12.8 3.8q3 4.2 0 8.4" />}
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
