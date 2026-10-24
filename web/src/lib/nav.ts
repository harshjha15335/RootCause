import { ALIASES, useUi, type Screen } from "../store/uiStore";

/** Old screen names still accepted while screens move over: lab → autopsy, analysis/report → match. */
type AnyScreen = Screen | "lab" | "analysis" | "report";
const resolve = (s: AnyScreen): Screen => ALIASES[s] ?? (s as Screen);

/** Moving between screens of the match already loaded. */
export function go(screen: AnyScreen) {
  useUi.getState().setScreen(resolve(screen));
}

/**
 * A link to a page, optionally on another demo match or goal (?demo=<match id>&goal=<goal_id>).
 * The match is loaded once per page load, so a link that changes the match is a full navigation:
 * use it as an href, not with go().
 */
export function pageHref(screen: AnyScreen, opts: { demo?: string; goal?: string | null } = {}): string {
  const q = new URLSearchParams(location.search);
  if (opts.demo) q.set("demo", opts.demo);
  if (opts.goal) q.set("goal", opts.goal);
  else if (opts.goal === null || opts.demo) q.delete("goal");
  const qs = q.toString();
  const to = resolve(screen);
  return `${qs ? `?${qs}` : location.pathname}#/${to === "home" ? "" : to}`;
}

/** True when following pageHref(...) needs a reload because the match or goal changes. */
export function changesMatch(href: string): boolean {
  return href.split("#")[0] !== (location.search || location.pathname);
}

/** Follow a pageHref: in-app when only the screen changes, a reload when the match does. */
export function follow(href: string) {
  if (changesMatch(href)) location.assign(href);
  else go((href.split("#/")[1] || "home") as Screen);
}

/** The goal named in the URL (?goal=), if any. */
export function goalParam(): string | null {
  return new URLSearchParams(location.search).get("goal");
}
