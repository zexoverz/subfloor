import { test } from "node:test";
import assert from "node:assert/strict";
import { callTool, TOOLS } from "./server.ts";
import { COMPOSE_TOOLS } from "./compose.ts";
import { QUERIES } from "./queries.ts";

function stub(data: unknown, capture?: { body?: any }) {
  return (async (_url: string, init: RequestInit) => {
    if (capture) capture.body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as unknown as typeof fetch;
}

test("every tool declares a description and a JSON Schema", () => {
  for (const t of TOOLS) {
    assert.ok(t.description.length > 40, `${t.name} needs a description that says when to use it`);
    assert.equal(t.inputSchema.type, "object");
    assert.ok(QUERIES[t.query], `${t.name} points at a query that exists`);
  }
});

test("an unknown tool is rejected rather than silently returning nothing", async () => {
  await assert.rejects(() => callTool("drop_table", {}), /unknown tool/);
});

test("addresses are lowercased, because the index stores them that way", async () => {
  const cap: { body?: any } = {};
  await callTool("floor_for", { recipient: "0x441EE52d939E46A33919C4295e88d32458797503" }, stub({ floors: [] }, cap));
  assert.equal(cap.body.variables.recipient, "0x441ee52d939e46a33919c4295e88d32458797503");
});

test("the trailing window defaults to 7 days and is overridable", async () => {
  const a: { body?: any } = {};
  await callTool("execution_quality", {}, stub({ executionQualityDailySnapshots: [] }, a));
  const b: { body?: any } = {};
  await callTool("execution_quality", { days: 30 }, stub({ executionQualityDailySnapshots: [] }, b));
  assert.equal(a.body.variables.since - b.body.variables.since, 23);
});

test("every answer carries the query and variables that produced it", async () => {
  const r = await callTool("recent_fills", { first: 3 }, stub({ fillQualities: [] }));
  assert.equal(r.provenance.query, QUERIES.recentFills);
  assert.deepEqual(r.provenance.variables, { first: 3 });
  assert.ok(r.provenance.endpoint.startsWith("http"));
});

test("a failing index surfaces as an error, not as an empty result", async () => {
  const bad = (async () => new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(() => callTool("reference", {}, bad), /boom/);
});

// --- the compose tool ---------------------------------------------------------------------
//
// The reason this server stops being only a reader. Everything above answers questions about the
// venue; this one produces the bytes a maker would ship, which is what an agent that is not ours
// needs in order to quote at all.

test("compose_book returns the program the contract would build", async () => {
  const r = (await callTool("compose_book", {
    referencePrice: "2478669714",
    spreadBps: 50,
    feeBps: 3000,
    decayPeriodSeconds: 600,
    salt: "1",
  })) as { program: string; opcodes: string[] };

  // The program currently live on Base Sepolia, shipped from the Foundry script.
  assert.equal(
    r.program,
    "0x020800000000000000019c0202587003000bb8514000000000000000000000000000000000000000000000000000002d2abf23404000000000000000000000000000000000000000000000000000002d64b4a3cf0d",
  );
  assert.deepEqual(r.opcodes, ["0x02", "0x9c", "0x70", "0x51"]);
});

test("compose_book answers without the index, because a reader being down is not a reason to be blind", async () => {
  const dead = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;

  const r = (await callTool("compose_book", { referencePrice: "2478669714", spreadBps: 50, salt: "1" }, dead)) as {
    program: string;
  };
  assert.ok(r.program.startsWith("0x0208"));
});

test("it is listed alongside the read tools, so an agent discovers it", () => {
  const names = [...TOOLS, ...COMPOSE_TOOLS].map((t) => t.name);
  assert.ok(names.includes("compose_book"));
  assert.ok(names.includes("floor_for"));
});
