import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useUi, type Depth } from "../store/uiStore";

/** Simple ↔ Expert, shared by the Match and Autopsy pages. Simple: visuals and one line. Expert: every number. */
export function DepthSwitch({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const depth = useUi((s) => s.depth);
  const opts: Depth[] = ["simple", "expert"];
  return (
    <div role="radiogroup" aria-label={t("depth.label")} className={`relative inline-flex rounded-full p-1 ring-1 ring-inset ring-turf-edge ${className}`}>
      {opts.map((d) => {
        const on = d === depth;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={t(`depth.${d}Hint`)}
            onClick={() => useUi.getState().setDepth(d)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = d === "simple" ? "expert" : "simple";
              useUi.getState().setDepth(next);
              (e.currentTarget.parentElement?.querySelector(`[data-d="${next}"]`) as HTMLElement | null)?.focus();
            }}
            data-d={d}
            className={`rc-press relative z-10 min-h-[36px] rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-300 ${on ? "text-turf-deep" : "text-chalk-faint hover:text-chalk"}`}
          >
            {on && <motion.span layoutId="depth-pill" className="absolute inset-0 -z-10 rounded-full bg-chalk" transition={{ type: "spring", duration: 0.4, bounce: 0.15 }} />}
            {t(`depth.${d}`)}
          </button>
        );
      })}
    </div>
  );
}
