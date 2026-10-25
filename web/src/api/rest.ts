import type {
  EngineMatchEvent,
  Evidence,
  ExplanationResponse,
  GroundTruth,
  Lang,
  MatchMeta,
  MatchRecord,
  MatchReport,
  Mode,
  RecordedReplay,
  ShowcaseManifest,
  WsMessage,
} from "./types";

/**
 * Two interchangeable sources behind one interface:
 *  - showcase: a real engine match recorded by web/tools/export_showcase.py, served as static
 *    files and replayed through the same WebSocket message shapes the API sends;
 *  - live: the FastAPI backend (docs/SPEC.md), REST + /live/{match_id}.
 * Select live with ?api=http://127.0.0.1:8000 (optionally &match=<id> and &token=<bearer>).
 */

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type ShowcaseExtras = {
  meta: MatchMeta;
  ticks: EngineMatchEvent[];
  replays: Record<string, Record<string, RecordedReplay>>;
  truth: GroundTruth | null;
  manifest: ShowcaseManifest;
  messages: WsMessage[];
};

export interface Source {
  kind: "showcase" | "live";
  matchId: string;
  trace(goalId: string): Promise<Evidence>;
  explanation(goalId: string, mode: Mode, lang: Lang): Promise<ExplanationResponse>;
  report(mode: Mode, lang: Lang): Promise<MatchReport>;
  match(): Promise<MatchRecord>;
  audio(goalId: string, mode: Mode, lang: Lang): Promise<Blob>;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new HttpError(r.status, `${url} returned ${r.status}`);
  return r.json() as Promise<T>;
}

/** Canonical demo match for RootCause. */
export const DEMO_MATCHES = ["wlb-msb-2023-11-12"] as const;
/** ?demo= wins; otherwise the match picked last time, so every page stays on the same match. */
const asked = (() => {
  const fromUrl = new URLSearchParams(location.search).get("demo");
  try {
    // If the URL or localStorage contains a legacy match ID, migrate cleanly to the canonical fixture
    if (fromUrl && !DEMO_MATCHES.includes(fromUrl as (typeof DEMO_MATCHES)[number])) {
      localStorage.setItem("rc.demo", DEMO_MATCHES[0]);
      return DEMO_MATCHES[0];
    }
    if (fromUrl) localStorage.setItem("rc.demo", fromUrl);
    const stored = localStorage.getItem("rc.demo");
    if (stored && !DEMO_MATCHES.includes(stored as (typeof DEMO_MATCHES)[number])) {
      localStorage.setItem("rc.demo", DEMO_MATCHES[0]);
      return DEMO_MATCHES[0];
    }
    return fromUrl ?? stored;
  } catch {
    return fromUrl;
  }
})();
export const SHOWCASE_MATCH: string = DEMO_MATCHES.find((m) => m === asked) ?? DEMO_MATCHES[0];

export function showcaseSource(matchId = SHOWCASE_MATCH): Source & { extras(): Promise<ShowcaseExtras> } {
  const base = `${import.meta.env.BASE_URL}showcase/${matchId}`;
  let extras: Promise<ShowcaseExtras> | null = null;
  return {
    kind: "showcase",
    matchId,
    extras() {
      extras ??= Promise.all([
        json<MatchMeta>(`${base}/meta.json`),
        json<EngineMatchEvent[]>(`${base}/ticks.json`),
        json<Record<string, Record<string, RecordedReplay>>>(`${base}/replays.json`),
        json<GroundTruth>(`${base}/ground_truth.json`).catch(() => null),
        json<ShowcaseManifest>(`${base}/manifest.json`),
        json<WsMessage[]>(`${base}/messages.json`),
      ]).then(([meta, ticks, replays, truth, manifest, messages]) => ({ meta, ticks, replays, truth, manifest, messages }));
      return extras;
    },
    trace: (goalId) => json(`${base}/traces/${goalId}.json`),
    explanation: (goalId, mode, lang) => json(`${base}/explanations/${goalId}.${mode}.${lang}.json`),
    report: (mode, lang) => json(`${base}/reports/${mode}.${lang}.json`),
    match: () => json(`${base}/match.json`),
    // The recording was made without Azure Speech, exactly like local-demo mode (503).
    audio: async () => {
      throw new HttpError(503, "Voice is unavailable in this recording");
    },
  };
}

export function liveSource(api: string, matchId: string, token?: string): Source {
  const base = api.replace(/\/$/, "");
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  return {
    kind: "live",
    matchId,
    trace: (goalId) => json(`${base}/goals/${goalId}/trace`, { headers }),
    explanation: (goalId, mode, lang) =>
      json(`${base}/goals/${goalId}/explanation?mode=${mode}&lang=${lang}`, { headers }),
    report: (mode, lang) => json(`${base}/matches/${matchId}/report?mode=${mode}&lang=${lang}`, { headers }),
    match: () => json(`${base}/matches/${matchId}`, { headers }),
    audio: async (goalId, mode, lang) => {
      const r = await fetch(`${base}/goals/${goalId}/audio?mode=${mode}&lang=${lang}`, { headers });
      if (!r.ok) throw new HttpError(r.status, "Voice unavailable");
      return r.blob();
    },
  };
}

export async function startLiveMatch(api: string, seed: number, token?: string): Promise<MatchRecord> {
  return json(`${api.replace(/\/$/, "")}/matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ seed }),
  });
}
