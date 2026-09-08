// Every contract a mapping binds must be in that data source's `abis:` list.
//
// graph-node resolves a contract call against the ABIs declared on the data source whose handler is
// running, not against the TypeScript import. `import { FloorRegistry } from
// "../generated/FloorRegistry/FloorRegistry"` compiles, passes `graph build`, and passes Matchstick
// (which mocks the call and never consults the manifest) — and then fails deterministically at the
// first block that runs the handler.
//
// That failure is expensive out of all proportion to the mistake: the only symptom is the subgraph
// stopping, the error text lives in the Studio UI rather than any API, and finding it costs a
// deploy-and-wait cycle. This is the fourth deploy-only failure on this subgraph after a green
// build and a green test run; the other three now have gates and this is the last of the class.
import { readFileSync, readdirSync } from "node:fs";
import { basename } from "node:path";

const manifests = readdirSync(".").filter((f) => /^subgraph.*\.ya?ml$/.test(f));
const problems = [];

for (const m of manifests) {
  const text = readFileSync(m, "utf8");

  // Split into data sources on the `- kind:` boundary at list indent.
  for (const chunk of text.split(/\n  - kind:/).slice(1)) {
    const name = (chunk.match(/\n    name:\s*(\S+)/) || [])[1] || "?";
    const file = (chunk.match(/\n      file:\s*(\S+)/) || [])[1];
    if (!file) continue;

    const declared = new Set([...chunk.matchAll(/-\s*name:\s*(\S+)\s*\n\s*file:\s*\.\/abis\//g)].map((x) => x[1]));

    let src;
    try {
      src = readFileSync(file.replace(/^\.\//, ""), "utf8");
    } catch {
      problems.push(`${m}: data source ${name} points at ${file}, which does not exist`);
      continue;
    }

    // Follow relative imports one level, since handlers factor helpers out into shared modules.
    const seen = new Set([file]);
    const queue = [[file, src]];
    const bound = new Map();
    while (queue.length) {
      const [path, body] = queue.shift();
      for (const b of body.matchAll(/\b([A-Z]\w*)\.bind\s*\(/g)) {
        if (!bound.has(b[1])) bound.set(b[1], path);
      }
      for (const imp of body.matchAll(/from\s+"(\.\/[^"]+)"/g)) {
        const p = `src/${basename(imp[1])}.ts`;
        if (seen.has(p)) continue;
        seen.add(p);
        try {
          queue.push([p, readFileSync(p, "utf8")]);
        } catch {}
      }
    }

    for (const [contract, where] of bound) {
      if (declared.has(contract)) continue;
      problems.push(
        `${m}: data source ${name} binds ${contract} (in ${where}) but its abis: list has only ` +
          `${[...declared].join(", ") || "nothing"}`,
      );
    }
  }
}

if (problems.length) {
  console.error(`contracts bound without a declared ABI:\n\n${problems.join("\n")}\n`);
  process.exit(1);
}
console.log(`bound ABIs ok (${manifests.length} manifests)`);
