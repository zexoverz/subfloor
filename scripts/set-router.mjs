#!/usr/bin/env node
// Point the whole repo at a new router address, in one place.
//
// The router address is not configuration in one file. It is the data source in the subgraph
// manifest, the default in the frontend's chain config, the deployment table in the README, and
// fixtures in two subgraph tests. Missing one of them is not loud: the subgraph indexes an address
// nobody trades against and reports a clean, empty sync, which is indistinguishable from a slow one
// and has already cost this project a night.
//
//   node scripts/set-router.mjs 0x<new address> [<deployment block>]
//
// The block, when given, becomes every data source's startBlock. Leaving the old one is not merely
// wasteful: the router changed, so blocks before the redeploy carry fills from a different app.
import { readFileSync, writeFileSync } from "node:fs";

const [, , next, block] = process.argv;
if (!next || !/^0x[0-9a-fA-F]{40}$/.test(next)) {
  console.error("usage: set-router.mjs 0x<address> [<startBlock>]");
  process.exit(1);
}

const OLD = "0xa2C76F6eF597B4E48d98A6085B9381C7b0fa0709";
const files = [
  "README.md",
  "frontend/api/_lib/chain.ts",
  "indexer/subgraph/subgraph.base-sepolia.yaml",
  "indexer/subgraph/tests/shipped.test.ts",
  "indexer/subgraph/tests/aquaHandlers.test.ts",
];

let total = 0;
for (const f of files) {
  const before = readFileSync(f, "utf8");
  const hits = [...before.matchAll(new RegExp(OLD, "gi"))].length;
  if (hits > 0) {
    // Both cases: the manifest and the fixtures lowercase it, the README and chain.ts checksum it.
    writeFileSync(f, before.replaceAll(OLD, next).replaceAll(OLD.toLowerCase(), next.toLowerCase()));
  }
  total += hits;
  console.log(`${f}: ${hits} occurrence${hits === 1 ? "" : "s"}`);
}

if (block !== undefined) {
  // Validated rather than trusted. A trial run passed "--dry" here and it went straight into the
  // manifest as `startBlock: --dry`, which `graph deploy` would have accepted far too late.
  if (!/^\d+$/.test(block)) {
    console.error(`\nstartBlock must be a number, got: ${block}`);
    process.exit(1);
  }
  const f = "indexer/subgraph/subgraph.base-sepolia.yaml";
  const s = readFileSync(f, "utf8").replace(/startBlock: \d+/g, `startBlock: ${block}`);
  writeFileSync(f, s);
  console.log(`${f}: startBlock -> ${block}`);
}

if (total === 0) {
  console.error("\nNothing was replaced. The old address in this script is stale — update OLD.");
  process.exit(1);
}

console.log(`\n${total} replaced. Still to do by hand:`);
console.log("  - the taker bot's env (SUBFLOOR_ROUTER) wherever it runs");
console.log("  - Railway's environment for the API");
console.log("  - sign a mandate for the new app and reship the book");
