import { lazy, type ComponentType } from "react";

/**
 * React.lazy that survives a redeploy: if a code-split chunk 404s because the open page still
 * points at the previous build's file names, reload once to pick up the new build.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((err: unknown) => {
      let reloaded = false;
      try {
        reloaded = sessionStorage.getItem("rc.chunkReload") === "1";
        sessionStorage.setItem("rc.chunkReload", "1");
      } catch {
        /* storage blocked: reload anyway, once per page load */
      }
      if (!reloaded) {
        location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }),
  );
}

/** Called once the app has rendered, so a later stale chunk can trigger its own reload. */
export function chunkReloadDone() {
  try {
    sessionStorage.removeItem("rc.chunkReload");
  } catch {
    /* ignore */
  }
}
