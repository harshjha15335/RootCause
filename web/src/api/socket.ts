import type { WsMessage } from "./types";

export type Feed = {
  /** Called every animation frame with the broadcast clock (match seconds). */
  advance(edge: number, now: number): void;
  close(): void;
};

/**
 * Live feed: /live/{match_id}. The server replays retained history first, then streams.
 * Messages are deduplicated by (match_id, sequence) as docs/SPEC.md asks; a dropped socket
 * reconnects with backoff and the replayed history is filtered by the same rule.
 */
export function liveFeed(
  api: string,
  matchId: string,
  onMessage: (m: WsMessage) => void,
  onStatus: (s: "connecting" | "open" | "closed") => void,
  token?: string,
): Feed {
  let last = 0;
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  const url = `${api.replace(/\/$/, "").replace(/^http/, "ws")}/live/${matchId}`;

  const connect = () => {
    onStatus("connecting");
    socket = new WebSocket(url, token ? ["rootcause", token] : undefined);
    socket.onopen = () => {
      attempt = 0;
      onStatus("open");
    };
    socket.onmessage = (e) => {
      const m = JSON.parse(e.data) as WsMessage;
      if (m.match_id !== matchId || m.sequence <= last) return;
      last = m.sequence;
      onMessage(m);
    };
    socket.onclose = () => {
      onStatus("closed");
      if (closed) return;
      attempt += 1;
      setTimeout(connect, Math.min(8000, 500 * 2 ** attempt));
    };
  };
  connect();
  return {
    advance() {},
    close() {
      closed = true;
      socket?.close();
    },
  };
}

// How long the recorded pipeline takes on screen after a goal. The recording itself carries
// no wall-clock times (evidence-only agents answer in milliseconds), so these are pacing for
// the demo, and the UI says it is a recording.
const PIPELINE_PACE_MS: Partial<Record<WsMessage["type"], number>> = {
  "trace.ready": 2600,
  "agent.step": 420,
  "explanation.ready": 520,
};

/**
 * Showcase feed: plays a recorded /live/{match_id} history. Everything before `startSecond`
 * is delivered at once (as the server does on connect); after that, match events are released
 * as the broadcast clock passes their second, and pipeline messages arrive at a steady pace.
 */
export function recordedFeed(messages: WsMessage[], startSecond: number, onMessage: (m: WsMessage) => void): Feed {
  let i = 0;
  let waitUntil = 0;
  let inHistory = true;
  return {
    advance(edge, now) {
      while (i < messages.length) {
        const m = messages[i];
        if (m.type === "match.event") {
          if (m.payload.second > (inHistory ? startSecond : edge)) {
            inHistory = false;
            break;
          }
        } else if (!inHistory && PIPELINE_PACE_MS[m.type] !== undefined) {
          if (!waitUntil) waitUntil = now + PIPELINE_PACE_MS[m.type]!;
          if (now < waitUntil) break;
          waitUntil = 0;
        }
        onMessage(m);
        i += 1;
      }
    },
    close() {
      i = messages.length;
    },
  };
}
