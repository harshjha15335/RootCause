import type { Config } from "tailwindcss";

// Tokens live in src/theme/tokens.css as CSS variables; Tailwind only names them.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        turf: { DEFAULT: v("turf"), deep: v("turf-deep"), raised: v("turf-raised"), edge: v("turf-edge") },
        chalk: { DEFAULT: v("chalk"), dim: v("chalk-dim"), faint: v("chalk-faint") },
        flare: { DEFAULT: v("flare"), ink: v("flare-ink") },
        paper: v("paper"),
        ink: v("ink"),
      },
      fontFamily: {
        display: ["'Anybody Variable'", "'Noto Sans Devanagari'", "system-ui", "sans-serif"],
        body: ["'Hanken Grotesk Variable'", "'Noto Sans Devanagari'", "system-ui", "sans-serif"],
        trace: ["'JetBrains Mono Variable'", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
        "in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      borderRadius: { panel: "14px" },
      letterSpacing: { display: "-0.01em" },
    },
  },
  plugins: [],
} satisfies Config;
