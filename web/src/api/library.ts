import { useQuery } from "@tanstack/react-query";
import type { LibraryMatch } from "./types";

/** Every demo match, small enough for cards: clubs, score, goals and which are traced. */
export function useLibrary() {
  return useQuery({
    queryKey: ["library"],
    queryFn: async (): Promise<LibraryMatch[]> => {
      const r = await fetch(`${import.meta.env.BASE_URL}showcase/library.json`);
      if (!r.ok) throw new Error(`library.json returned ${r.status}`);
      return (await r.json()).matches;
    },
    staleTime: Infinity,
  });
}
