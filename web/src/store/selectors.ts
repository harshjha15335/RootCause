import { useQuery } from "@tanstack/react-query";
import { HttpError } from "../api/rest";
import type { Evidence, ExplanationResponse, GroundTruth } from "../api/types";
import { source } from "./broadcast";
import { useMatch } from "./matchStore";
import { useTrace } from "./traceStore";
import { useUi } from "./uiStore";

export function useSelectedEvidence(): Evidence | null {
  const id = useTrace((s) => s.selectedGoalId);
  return useMatch((s) => {
    if (id && s.evidence[id]) return s.evidence[id];
    const firstId = Object.keys(s.evidence)[0];
    return firstId ? s.evidence[firstId] : null;
  });
}

/** The most recent goal, traced or not (drives the live "Tracing…" and untraced states). */
export function useLatestGoal() {
  return useMatch((s) => s.goals[s.goals.length - 1] ?? null);
}

/**
 * GET /goals/{id}/explanation?mode=&lang=. Enabled once explanation.ready has arrived for the
 * goal (or immediately for history), so the card never polls an endpoint that would 404.
 */
export function useExplanation(goalId: string | null, always = false) {
  const mode = useUi((s) => s.mode);
  const lang = useUi((s) => s.lang);
  const ready = useMatch((s) => (goalId ? Boolean(s.explanations[goalId]) : false));
  return useQuery<ExplanationResponse, Error>({
    queryKey: ["explanation", source.matchId, goalId, mode, lang],
    queryFn: () => source.explanation(goalId!, mode, lang),
    enabled: Boolean(goalId) && (ready || always),
    placeholderData: (prev) => (prev?.goal_id === goalId ? prev : undefined),
    staleTime: Infinity,
    retry: (n, e) => !(e instanceof HttpError && e.status === 404) && n < 2,
  });
}

export function useReport() {
  const mode = useUi((s) => s.mode);
  const lang = useUi((s) => s.lang);
  return useQuery({
    queryKey: ["report", source.matchId, mode, lang],
    queryFn: () => source.report(mode, lang),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    retry: (n, e) => !(e instanceof HttpError && e.status === 409) && n < 2,
  });
}

/**
 * Full-time view for the Bug Report, independent of where the live replay is:
 * GET /matches/{id} for the final score and goal ids, then GET /goals/{id}/trace for each.
 */
export function useFullTime() {
  const match = useQuery({ queryKey: ["match", source.matchId], queryFn: () => source.match(), staleTime: 30_000 });
  const ids = match.data?.goal_ids ?? [];
  const traces = useQuery<Evidence[], Error>({
    queryKey: ["traces", source.matchId, ids.join(",")],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const settled = await Promise.allSettled(ids.map((id: string) => source.trace(id)));
      const valid: Evidence[] = [];
      const unexpectedErrors: Error[] = [];

      for (const res of settled) {
        if (res.status === "fulfilled") {
          valid.push(res.value);
        } else {
          const reason = res.reason;
          // Expected missing trace: HTTP 404 (file/route does not exist for an untraced goal)
          if (reason instanceof HttpError && reason.status === 404) {
            continue;
          }
          // Genuine unexpected failures (auth, 500, network failure, malformed JSON)
          unexpectedErrors.push(reason instanceof Error ? reason : new Error(String(reason)));
        }
      }

      if (unexpectedErrors.length > 0) {
        throw unexpectedErrors[0];
      }

      return valid;
    },
    enabled: ids.length > 0,
    staleTime: Infinity,
    retry: (n, e) => !(e instanceof HttpError && e.status === 404) && n < 2,
  });
  return {
    match: match.data ?? null,
    traces: traces.data ?? [],
    loading: match.isPending || (ids.length > 0 && traces.isPending),
    error: match.error || traces.error || null,
  };
}

/** The mistake planted in a synthetic showcase match, to check the Debugger against. Live matches have none. */
export function useTruth(): GroundTruth | null {
  const q = useQuery({
    queryKey: ["truth", source.matchId],
    queryFn: async () => {
      if (source.kind !== "showcase") return null;
      const r = await fetch(`${import.meta.env.BASE_URL}showcase/${source.matchId}/ground_truth.json`);
      return r.ok ? ((await r.json()) as GroundTruth) : null;
    },
    staleTime: Infinity,
  });
  return q.data ?? null;
}
