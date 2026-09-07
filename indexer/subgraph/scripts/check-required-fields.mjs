// Fails if a handler can create an entity without setting one of its non-nullable fields.
//
// graph-node aborts the handler when that happens, deterministically on every retry, and the
// subgraph stops dead at that block while still reporting `hasIndexingErrors: false`. There is no
// error to read on hosted Studio. One instance — `Account` saved with only `id` set — halted the
// index at the first fill and cost most of a night, because the block it stops at is not the block
// with the bug.
//
// Scoped per construction site on purpose. A first version searched the whole source for
// `.field =` and passed while `Account.cumulativeVolumeUSD` was deleted, because `Token` assigns a
// field of the same name. A check that cannot fail is worse than no check.
//
//   node scripts/check-required-fields.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(new URL("../schema.graphql", import.meta.url), "utf8");

function sources(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith(".ts")) out.push([p, readFileSync(p, "utf8")]);
  }
  return out;
}
const files = sources(new URL("../src", import.meta.url).pathname);

const required = new Map();
for (const m of schema.matchAll(/type (\w+) @entity[^{]*\{([\s\S]*?)\n\}/g)) {
  const [, entity, body] = m;
  const fields = [];
  // Directives can sit on the line after the field, so split on declaration starts rather than on
  // newlines — `dailySnapshots` is `@derivedFrom` on its second line and read as a failure once.
  for (const f of body.split(/\n(?=\s*(?:"|\w+\s*:))/)) {
    const decl = f.match(/(\w+)\s*:\s*(\S+)/);
    if (!decl) continue;
    const [, field, type] = decl;
    if (field === "id" || !type.endsWith("!") || f.includes("@derivedFrom")) continue;
    fields.push(field);
  }
  required.set(entity, fields);
}

const failures = [];
for (const [path, src] of files) {
  // `const x = new Entity(...)` / `x = new Entity(...)`, then the assignments that follow it up to
  // its `.save()`.
  for (const m of src.matchAll(/(?:const|let|var)?\s*(\w+)\s*=\s*new (\w+)\(/g)) {
    const [, variable, entity] = m;
    const fields = required.get(entity);
    if (!fields) continue;

    const after = src.slice(m.index);
    const end = after.indexOf(`${variable}.save()`);
    const scope = end === -1 ? after.slice(0, 4000) : after.slice(0, end);

    for (const field of fields) {
      if (!new RegExp(`${variable}\\.${field}\\s*=`).test(scope)) {
        failures.push(`${path.split("/").pop()}: ${entity} built as \`${variable}\` never sets ${field}`);
      }
    }
  }
}

if (failures.length) {
  console.error("Entities can be saved without a required field:\n");
  for (const f of failures) console.error("  " + f);
  console.error("\ngraph-node aborts the handler for this, and the subgraph halts with no error.");
  process.exit(1);
}
console.log(`required fields: ${files.length} files checked, every construction sets all of them`);
