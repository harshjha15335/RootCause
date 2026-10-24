import { useQueries } from "@tanstack/react-query";
import { DEMO_MATCHES, SHOWCASE_MATCH } from "./rest";
import type { MatchMeta, MatchRecord } from "./types";
import { pageHref } from "../lib/nav";

/** A link that reloads the app on another demo match. Prefer pageHref(screen, { demo }) in new code. */
export function demoHref(id: string, screen: Parameters<typeof pageHref>[0]): string {
  return pageHref(screen, { demo: id });
}

type Manifest = { goals: string[]; traced: string[] };

/** Clubs, final score and traced goals for each demo match, from its exported files. */
export function useDemos() {
  const base = import.meta.env.BASE_URL;
  const get = async <T,>(url: string): Promise<T> => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} returned ${r.status}`);
    return r.json();
  };
  const qs = useQueries({
    queries: DEMO_MATCHES.map((id) => ({
      queryKey: ["demo", id],
      queryFn: () =>
        Promise.all([
          get<MatchMeta>(`${base}showcase/${id}/meta.json`),
          get<MatchRecord>(`${base}showcase/${id}/match.json`),
          get<Manifest>(`${base}showcase/${id}/manifest.json`),
        ]),
      staleTime: Infinity,
    })),
  });
  return DEMO_MATCHES.map((id, i) => {
    const [meta, match, manifest] = qs[i].data ?? [null, null, null];
    return {
      id,
      n: i + 1,
      current: id === SHOWCASE_MATCH,
      meta,
      score: match ? ([match.score.home, match.score.away] as [number, number]) : null,
      goals: manifest?.goals.length ?? 0,
      traced: manifest ? manifest.traced.length : null,
    };
  });
}
