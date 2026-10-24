import i18n from "./index";

/**
 * Raw engine codes never reach the screen. Any form the data uses ("LATE_STEP_UP", "late_step_up #3",
 * "late_step") becomes words in the current language: "Stepped up late".
 */
const ALIASES: Record<string, string> = { LATE_STEP: "LATE_STEP_UP" };

export function codeKey(code: string): string {
  const k = code.replace(/\s*#\d+$/, "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return ALIASES[k] ?? k;
}

/** "Stepped up late"; with lower: true, "stepped up late" for use mid-sentence. */
export function mistakeWords(code: string, opts: { lower?: boolean } = {}): string {
  const k = codeKey(code);
  const fallback = k.toLowerCase().replace(/_/g, " ");
  const s = i18n.exists(`bug.${k}`) ? i18n.t(`bug.${k}`) : fallback.charAt(0).toUpperCase() + fallback.slice(1);
  // Devanagari has no case; toLocaleLowerCase leaves it alone
  return opts.lower ? s.charAt(0).toLocaleLowerCase(i18n.language) + s.slice(1) : s;
}

/** The better option, as the end of a sentence: "holds the line with the rest of the back four instead." */
export function fixWords(code: string): string {
  const k = codeKey(code);
  return i18n.exists(`fix.${k}`) ? i18n.t(`fix.${k}`) : i18n.t("fix.generic");
}
