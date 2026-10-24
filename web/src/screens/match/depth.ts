import { create } from "zustand";

/**
 * Simple ↔ Expert for this page. The shell is adding a shared `useUi(s => s.depth)`; until that
 * lands this local store stands in with the same names, so the swap is one import.
 */
export type Depth = "simple" | "expert";

const read = (): Depth => {
  try {
    return localStorage.getItem("rc.depth") === "expert" ? "expert" : "simple";
  } catch {
    return "simple";
  }
};

export const useDepth = create<{ depth: Depth; setDepth(d: Depth): void }>((set) => ({
  depth: read(),
  setDepth(depth) {
    try {
      localStorage.setItem("rc.depth", depth);
    } catch {
      /* private mode: the choice just doesn't persist */
    }
    set({ depth });
  },
}));
