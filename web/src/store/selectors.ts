import { useQuery } from "@tanstack/react-query";
import { HttpError } from "../api/rest";
import type { Evidence, ExplanationResponse } from "../api/types";
import { source } from "./broadcast";
import { useMatch } from "./matchStore";
import { useTrace } from "./traceStore";
import { useUi } from "./uiStore";

export function useSelectedEvidence(): Evidence | null {
  const id = useTrace((s) => s.selectedGoalId);
  return useMatch((s) => (id ? s.evidence[id] ?? null : null));
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
  const traces = useQuery({
    queryKey: ["traces", source.matchId, ids.join(",")],
    queryFn: () => Promise.all(ids.map((id) => source.trace(id))),
    enabled: ids.length > 0,
    staleTime: Infinity,
  });
  return { match: match.data ?? null, traces: traces.data ?? [], loading: match.isPending || (ids.length > 0 && traces.isPending) };
}
