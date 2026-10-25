import { create } from "zustand";
import type { Lab } from "../lab/data";

/**
 * The viewer's own club and player, kept in this browser. Saved by name, not by match ID, so the
 * same pick carries over to every match those names play in. Player focus follows the player
 * through the whole match in the Tactics Lab and on the Match page.
 */
type FanState = {
  club: string | null;
  player: string | null;
  /** second the Tactics Lab should open on, set by "watch in the Lab" links */
  labStart: number | null;
  setClub(club: string | null): void;
  setPlayer(player: string | null, club?: string | null): void;
  watchInLab(s: number | null): void;
};

const KEY = "rc.fan";
const read = (): { club: string | null; player: string | null } => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { club: typeof v.club === "string" ? v.club : null, player: typeof v.player === "string" ? v.player : null };
  } catch {
    return { club: null, player: null };
  }
};
const save = (club: string | null, player: string | null) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ club, player }));
  } catch {
    /* private mode: the pick lasts for this visit */
  }
};

export const useFan = create<FanState>((set, get) => ({
  ...read(),
  labStart: null,
  setClub(club) {
    // a new club drops a player who doesn't play for it; the caller re-picks
    set({ club, player: club === get().club ? get().player : null });
    save(get().club, get().player);
  },
  setPlayer(player, club) {
    set({ player, club: club === undefined ? get().club : club });
    save(get().club, get().player);
  },
  watchInLab: (labStart) => set({ labStart }),
}));

/** Tracking index (0..21) of the saved player in this match, or null. */
export function fanIndex(lab: Lab, player: string | null): number | null {
  if (!player) return null;
  const i = lab.names.indexOf(player);
  return i >= 0 ? i : null;
}

/** 0 for home, 1 for away, when the saved club plays in this match. */
export function fanSide(clubs: { name: string }[], club: string | null): 0 | 1 | null {
  if (!club) return null;
  const i = clubs.findIndex((c) => c.name === club);
  return i === 0 || i === 1 ? i : null;
}
