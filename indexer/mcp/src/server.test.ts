import { test } from "node:test";
import assert from "node:assert/strict";
import { callTool, TOOLS } from "./server.ts";
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
