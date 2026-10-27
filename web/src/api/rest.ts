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
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
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

export class MalformedJsonError extends Error {
  constructor(
    public readonly url: string,
    cause: Error,
  ) {
    super(`Malformed JSON response from ${url}: ${cause.message}`);
    this.name = "MalformedJsonError";
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new HttpError(r.status, `${url} returned ${r.status}`);
  const contentType = (r.headers.get("content-type") ?? "").toLowerCase();
  const text = await r.text();
  // Detect static SPA server fallback (e.g. Vite or GitHub Pages returning index.html for 404)
  if (
    contentType.includes("text/html") ||
    text.trim().startsWith("<!DOCTYPE") ||
    text.trim().startsWith("<!doctype") ||
    text.trim().startsWith("<html")
  ) {
    throw new HttpError(404, `${url} returned HTML fallback instead of JSON`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new MalformedJsonError(url, err as Error);
  }
}

const json = fetchJson;

declare const __MATCHES__: string[];
/** Every match exported to public/showcase, found at build time (tools/matches.mjs). The first is the default. */
export const DEMO_MATCHES: readonly string[] = __MATCHES__;
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
  let manifest: Promise<ShowcaseManifest> | null = null;
  const loadManifest = () => (manifest ??= json<ShowcaseManifest>(`${base}/manifest.json`));
  let meta: Promise<MatchMeta> | null = null;
  const loadMeta = () => (meta ??= json<MatchMeta>(`${base}/meta.json`));
  return {
    kind: "showcase",
    matchId,
    extras() {
      extras ??= Promise.all([
        loadMeta(),
        json<EngineMatchEvent[]>(`${base}/ticks.json`),
        json<Record<string, Record<string, RecordedReplay>>>(`${base}/replays.json`),
        // Only engine matches (with a seed) have planted mistakes to check against; skip the 404 otherwise.
        loadMeta().then((m) => (m.seed != null ? json<GroundTruth>(`${base}/ground_truth.json`) : null)).catch(() => null),
        loadManifest(),
        json<WsMessage[]>(`${base}/messages.json`),
      ]).then(([meta, ticks, replays, truth, manifest, messages]) => ({ meta, ticks, replays, truth, manifest, messages }));
      return extras;
    },
    // Untraced goals have no trace file: answer 404 from the manifest instead of asking the server.
    trace: async (goalId) => {
      const m = await loadManifest().catch(() => null);
      if (m && !m.traced.includes(goalId)) throw new HttpError(404, `${goalId} is not traced`);
      return json(`${base}/traces/${goalId}.json`);
    },
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
