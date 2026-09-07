// Every enum literal written in src/ must exist in schema.graphql.
//
// This gate exists because the same mistake was made twice. `Network` was written as "BASE" when
// the vendored Messari dex-agg enum had no such value, and `FeeType` was written as
// "FIXED_TRADING_FEE", which is real but belongs to the *dex-amm* schema, a sibling standard that
// dex-agg does not carry. Both compiled, both passed `graph build`, both passed the unit tests, and
// both halted the index in production at the first block that wrote the entity.
//
// Nothing else catches this. codegen types every enum field as a plain `string`, so the assignment
// is well-typed; Matchstick's store is untyped, so a test asserting the field reads it back happily.
// The check only exists at the moment graph-node writes the row into Postgres, which is hours after
// deploy and reported as a failed sync rather than a build error.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync("schema.graphql", "utf8");

// enum name -> allowed values
const enums = new Map();
for (const m of schema.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
  const values = m[2]
    .replace(/"[^"]*"/g, " ") // strip the doc-comment strings Messari uses between values
    .split(/\s+/)
    .filter((t) => /^[A-Z][A-Z0-9_]*$/.test(t));
  enums.set(m[1], new Set(values));
}

// field name -> set of enum types that declare a field by that name
const fieldEnums = new Map();
for (const m of schema.matchAll(/(?:type|interface)\s+\w+[^{]*\{([^}]*)\}/g)) {
  for (const f of m[1].matchAll(/^\s*(\w+):\s*(\w+)!?\s*$/gm)) {
    const [, field, type] = f;
    if (!enums.has(type)) continue;
    if (!fieldEnums.has(field)) fieldEnums.set(field, new Set());
    fieldEnums.get(field).add(type);
  }
}

const problems = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".ts")) check(p);
  }
};

function check(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/\.(\w+)\s*=\s*"([^"]+)"/g)) {
      const [, field, literal] = m;
      const types = fieldEnums.get(field);
      if (!types) continue;
      const allowed = new Set([...types].flatMap((t) => [...enums.get(t)]));
      if (allowed.has(literal)) continue;
      problems.push(
        `${path}:${i + 1}  ${field} = "${literal}"\n` +
          `    ${[...types].map((t) => `${t} allows: ${[...enums.get(t)].join(", ")}`).join("\n    ")}`,
      );
    }
    // ternaries: x.field = cond ? "A" : "B"
    for (const m of line.matchAll(/\.(\w+)\s*=\s*[^=].*?\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g)) {
      const [, field, a, b] = m;
      const types = fieldEnums.get(field);
      if (!types) continue;
      const allowed = new Set([...types].flatMap((t) => [...enums.get(t)]));
      for (const literal of [a, b]) {
        if (allowed.has(literal)) continue;
        problems.push(`${path}:${i + 1}  ${field} = "${literal}" (in ternary)\n    allowed: ${[...allowed].join(", ")}`);
      }
    }
  });
}

walk("src");

if (problems.length) {
  console.error(`enum literals not present in schema.graphql:\n\n${problems.join("\n\n")}\n`);
  process.exit(1);
}
console.log(`enum values ok (${enums.size} enums, ${fieldEnums.size} enum-typed field names)`);
