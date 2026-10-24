// Writes public/showcase/library.json: the small index the match library reads, so cards don't
// download each match's full analysis. Run by `npm run build`; rerun after any showcase export.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "showcase");
const rest = readFileSync(join(root, "..", "..", "src", "api", "rest.ts"), "utf8");
const ids = JSON.parse(rest.match(/DEMO_MATCHES = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
const read = (id, f) => JSON.parse(readFileSync(join(root, id, f), "utf8"));

const matches = ids.map((id, i) => {
  const meta = read(id, "meta.json");
  const match = read(id, "match.json");
  const manifest = read(id, "manifest.json");
  const analysis = read(id, "analysis.json");
  const traced = new Set(manifest.traced);
  const goals = analysis.momentum
    .flatMap((w) => w.goals)
    .sort((a, b) => a.second - b.second)
    .map((g, k) => ({ id: `${id}-g${k + 1}`, second: g.second, side: g.side, player_id: g.player_id, traced: traced.has(`${id}-g${k + 1}`) }));
  const club = (c) => ({ name: c.name, short_name: c.short_name, kit_primary: c.kit_primary, kit_secondary: c.kit_secondary });
  return {
    id,
    n: i + 1,
    duration_s: meta.duration_s,
    home: club(meta.home),
    away: club(meta.away),
    score: [match.score.home, match.score.away],
    goals,
    traced: goals.filter((g) => g.traced).length,
  };
});

writeFileSync(join(root, "library.json"), JSON.stringify({ matches }) + "\n");
console.log(`library.json: ${matches.length} matches, ${matches.reduce((n, m) => n + m.traced, 0)} traced goals`);
