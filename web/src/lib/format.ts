import type { ClubMeta, MatchMeta } from "../api/types";

/** Match clock as broadcasters show it: 62:36 */
export function clock(second: number): string {
  const s = Math.max(0, Math.floor(second));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Whole-number percent, one decimal only when it matters (0.5% not 1%). */
export function pct(value: number): string {
  if (value > 0 && value < 1) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

export function rate(goals: number, trials: number): number {
  return trials ? (goals / trials) * 100 : 0;
}

export type PlayerInfo = {
  id: string;
  name: string;
  number: number | null;
  position: string | null;
  side: "home" | "away";
  club: ClubMeta | null;
};

/**
 * Player IDs arrive as engine IDs (H5, A10) from the Debugger, or as "home-9"/"away-6"
 * from the API's synthetic fixture. Names exist only when MatchMeta is available.
 */
export function playerInfo(meta: MatchMeta | null, id: string): PlayerInfo {
  const side: "home" | "away" = id.startsWith("H") || id.startsWith("home") ? "home" : "away";
  const club = meta ? meta[side] : null;
  const p = club?.players.find((x) => x.id === id);
  const fallbackNumber = Number(id.replace(/^\D+-?/, "")) || null;
  return {
    id,
    name: p?.name ?? id,
    number: p?.number ?? fallbackNumber,
    position: p?.position ?? null,
    side,
    club,
  };
}

export function surname(name: string): string {
  const parts = name.split(" ");
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}

/** Long decimals from evidence-only templates (88.8889%) shown at one decimal place. */
export function tidyNumbers(text: string): string {
  return text.replace(/(\d+\.\d{2,})%/g, (_, n: string) => `${Number(n).toFixed(1)}%`);
}

/** Matches engine and fixture player IDs inside sentences. */
export const PLAYER_TOKEN = /\b((?:H|A)\d{1,2}|(?:home|away)-\d{1,2})\b/g;

/** Figures on the pitch wear the theme, not the club kit: white for home, blue for away, so the
 * yellow stays free for the bug and both sides read on the cobalt pitch. Badges keep real kits. */
export function pitchKit(side: "home" | "away"): { kit: string; trim: string } {
  return side === "home" ? { kit: "#f3f5ff", trim: "#1530d6" } : { kit: "#5a78ff", trim: "#f3f5ff" };
}
