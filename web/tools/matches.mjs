// Which matches the site shows: every folder under public/showcase that holds an exported match
// (meta.json and manifest.json). Drop a new export in and it appears; nothing lists match ids by hand.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function matchIds(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "meta.json")) && existsSync(join(root, d.name, "manifest.json")))
    .map((d) => d.name)
    .sort();
}
