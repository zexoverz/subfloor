// Every place that names the subgraph endpoint must name the same one.
//
// The version is part of the URL and Studio has no floating alias, so a deploy leaves every
// hardcoded copy behind. That has now bitten three times: the API served a halted version while the
// subgraph was healthy, the README advertised a version that had been deleted and answered
// "Not found", and the published SKILL pointed at `v0.0.4` long after v3.
//
// None of those failed loudly. A stale endpoint keeps answering — with an error, with nothing, or
// with data from a version that stopped indexing — and the only symptom is a number that looks
// wrong somewhere else entirely.
//
// Railway's `SUBFLOOR_SUBGRAPH` is deliberately not checked here: it is the override and it lives
// outside the repo. It is listed in the failure message so nobody forgets it exists.
import { readFileSync } from "node:fs";

const FILES = [
  "../../frontend/api/_lib/subgraph.ts",
  "../../README.md",
  "../../docs/SPEC.md",
  "../../indexer/mcp/skill/SKILL.md",
];

const URL_RE = /https:\/\/api\.studio\.thegraph\.com\/query\/\d+\/subfloor-base-sepolia\/v[\d.]+/g;

const found = new Map();
for (const f of FILES) {
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue; // SPEC.md is gitignored and absent on a fresh clone
  }
  for (const url of text.match(URL_RE) ?? []) {
    if (!found.has(url)) found.set(url, []);
    found.get(url).push(f);
  }
}

if (found.size === 0) {
  console.error("no subgraph endpoint found anywhere — the regex or the files moved");
  process.exit(1);
}

if (found.size > 1) {
  console.error("the subgraph endpoint disagrees between files:\n");
  for (const [url, files] of found) console.error(`  ${url}\n    ${files.join("\n    ")}`);
  console.error("\nAlso update SUBFLOOR_SUBGRAPH on Railway, which overrides the code default.");
  process.exit(1);
}

console.log(`endpoint agrees across ${[...found.values()][0].length} files: ${[...found.keys()][0]}`);
