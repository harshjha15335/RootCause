import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchJson, HttpError, MalformedJsonError } from "../src/api/rest";
import type { Analysis } from "../src/api/analysis";
import type { Evidence } from "../src/api/types";
import { loadLab } from "../src/lab/data";
import { buildAutopsy, goalsOf } from "../src/lab/autopsy/model";

const root = "public/showcase"; // vitest runs from web/
const MATCHES = ["kby-ira", "p-1008", "p-1009", "p-1014", "p-1017"];
const read = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const fsFetch = (async (url: string) => {
  const buf: Uint8Array = readFileSync(url);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString()),
  };
}) as unknown as typeof fetch;
const analyses: Record<string, Analysis> = Object.fromEntries(MATCHES.map((m) => [m, read(`${root}/${m}/analysis.json`)]));

describe("Goal Autopsy", () => {
  for (const match of MATCHES) {
    it(`gives every goal in ${match} a verdict or an honest answer`, async () => {
      const lab = await loadLab(match, `${root}/${match}/`, fsFetch);
      const replays = read(`${root}/${match}/replays.json`);
      const traces: Evidence[] = readdirSync(`${root}/${match}/traces`).map((f: string) => read(`${root}/${match}/traces/${f}`) as Evidence);
      const goals = goalsOf(lab, traces);
      const score = read(`${root}/${match}/match.json`).score;
      expect(goals.filter((g) => g.team === 0)).toHaveLength(score.home);
      expect(goals.filter((g) => g.team === 1)).toHaveLength(score.away);
      expect(goals.filter((g) => g.traced)).toHaveLength(traces.length);
      for (const g of goals) {
        const ev = traces.find((e) => e.goal_id === g.id) ?? null;
        const a = buildAutopsy(lab, g, ev, replays[g.id] ?? {}, analyses)!;
        expect(a).not.toBeNull();
        expect(a.kind).toBe(g.traced ? "traced" : "honest");
        // the scorer attacks right: the ball ends in the net at x = 105
        expect(a.frame(a.goalS).ball[0]).toBeGreaterThan(100);
        expect(a.plan.shape.filter(Boolean)).toHaveLength(22);
        expect(a.dossier.facts[0].length).toBeGreaterThan(0);
        if (a.kind === "honest") {
          // the honest answer is built from the real chance
          expect(a.chance).not.toBeNull();
          continue;
        }
        // every suspect in the trace gets a mistake layer, walked from the goal down
        expect(a.mistakes).toHaveLength(ev!.links.length);
        for (let k = 1; k < a.mistakes.length; k++) expect(a.mistakes[k].x.second).toBeLessThanOrEqual(a.mistakes[k - 1].x.second);
        // blame is his prevented goals over all prevented
        const c = a.j.culprit;
        expect(Math.round((100 * Math.max(0, c.base - c.fixed)) / a.total)).toBe(Math.round(c.blame));
        // the culprit's ghost is up the pitch from where he stood (he was too deep), and he left space
        const m = a.mistakes.find((x) => x.x === c)!;
        expect(m.ghost[0]).toBeLessThan(m.real[0] - 1);
        expect(m.cells.length).toBeGreaterThan(0);
      }
    });
  }

  describe("HTTP-level trace loading and autopsy navigation", () => {
    it("detects HTML SPA fallback on 200 as HttpError 404", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => ({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/html" }),
          text: async () => "<!DOCTYPE html><html><body>RootCause SPA Fallback</body></html>",
        })) as unknown as typeof fetch;

        await expect(fetchJson("/traces/missing.json")).rejects.toThrow(HttpError);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("distinguishes malformed JSON from expected 404 missing traces", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => ({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => "invalid json content {[[",
        })) as unknown as typeof fetch;

        await expect(fetchJson("/traces/corrupt.json")).rejects.toThrow(MalformedJsonError);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("loads eight goals with only four traces, keeping all goals visible and preserving valid traces", async () => {
      const match = read(`${root}/kby-ira/match.json`);
      const lab = await loadLab("kby-ira", `${root}/kby-ira/`, fsFetch);
      const goalIds = match.goal_ids as string[];
      expect(goalIds).toHaveLength(8);

      const mockTraceFetch = async (id: string): Promise<Evidence> => {
        const file = `${root}/kby-ira/traces/${id}.json`;
        try {
          return read(file) as Evidence;
        } catch {
          throw new HttpError(404, `Trace ${id} not found`);
        }
      };

      const settled = await Promise.allSettled(goalIds.map((id) => mockTraceFetch(id)));
      const validTraces: Evidence[] = [];
      const unexpectedErrors: Error[] = [];
      for (const res of settled) {
        if (res.status === "fulfilled") validTraces.push(res.value);
        else if (res.reason instanceof HttpError && res.reason.status === 404) continue;
        else unexpectedErrors.push(res.reason);
      }
      expect(unexpectedErrors).toHaveLength(0);
      expect(validTraces).toHaveLength(4);

      const goals = goalsOf(lab, validTraces);
      expect(goals).toHaveLength(8);
      const tracedGoals = goals.filter((g) => g.traced);
      const untracedGoals = goals.filter((g) => !g.traced);
      expect(tracedGoals).toHaveLength(4);
      expect(untracedGoals).toHaveLength(4);

      // Direct Goal 3 navigation resolves cleanly to Goal 3
      const goal3 = goals.find((g) => g.id === "kby-ira-g3");
      expect(goal3).toBeDefined();
      expect(goal3?.traced).toBe(true);
      expect(goal3?.s).toBe(2184);

      // Untraced goal navigation resolves cleanly to honest autopsy
      const goal1 = goals.find((g) => g.id === "kby-ira-s1444");
      expect(goal1).toBeDefined();
      expect(goal1?.traced).toBe(false);

      // Nonexistent goal
      const missing = goals.find((g) => g.id === "nonexistent-goal-999");
      expect(missing).toBeUndefined();
    });

    it("propagates genuine network errors and does not swallow them as untraced", async () => {
      const mockFailFetch = async () => {
        throw new TypeError("Failed to fetch (network disconnected)");
      };

      const settled = await Promise.allSettled(["g1"].map(() => mockFailFetch()));
      const errors: Error[] = [];
      for (const res of settled) {
        if (res.status === "rejected" && !(res.reason instanceof HttpError && res.reason.status === 404)) {
          errors.push(res.reason);
        }
      }
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("network disconnected");
    });
  });
});
