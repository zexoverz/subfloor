import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, renderMarkdown, TAKER_DISCLOSURE } from "./report.ts";
import { SubgraphError } from "./subgraph.ts";

function stub(quality: unknown[], meta: unknown = { block: { number: 1 }, hasIndexingErrors: false }) {
  let call = 0;
  return async () =>
    new Response(
      JSON.stringify(
        call++ === 0
          ? { data: { executionQualityDailySnapshots: quality } }
          : { data: { referenceAnswer: null, _meta: meta } },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
}

const day = (d: number, fills: number, refusals: number, p50: number, p99: number, age = 120) => ({
  day: d, fills, refusals,
  adverseDeviationP50Bps: p50, adverseDeviationP99Bps: p99,
  medianReferenceAgeSeconds: age, timestamp: "0",
});

test("an empty window says there is nothing rather than printing an empty table", async () => {
  const r = await generate(7, "https://x", new Date(0), stub([]) as unknown as typeof fetch);
  assert.equal(r.totals.fills, 0);
  assert.match(renderMarkdown(r), /No fills in the window/);
});

test("the worst day is the worst p99, not the last row", async () => {
  const r = await generate(7, "https://x", new Date(0), stub([day(1, 10, 0, 5, 90), day(2, 10, 0, 5, 20)]) as unknown as typeof fetch);
  assert.equal(r.worstDay?.day, 1);
  assert.match(renderMarkdown(r), /Worst day by p99: day 1 at 90 bps/);
});

test("refusals are counted and shown, because they are the product working", async () => {
  const r = await generate(7, "https://x", new Date(0), stub([day(1, 4, 3, 5, 20)]) as unknown as typeof fetch);
  assert.equal(r.totals.refusals, 3);
  assert.match(renderMarkdown(r), /4 fills, 3 refused/);
});

test("unscored fills are named as excluded rather than silently averaged in", async () => {
  // day 2 has fills but no reference behind any of them, so its percentiles are zero.
  const r = await generate(7, "https://x", new Date(0), stub([day(1, 10, 0, 5, 20), day(2, 6, 0, 0, 0, 0)]) as unknown as typeof fetch);
  assert.equal(r.totals.fills, 16);
  assert.equal(r.totals.scoredFills, 10);
  assert.match(renderMarkdown(r), /6 of those fills had no reference indexed/);
});

test("indexing errors are surfaced at the top, not buried", async () => {
  const r = await generate(7, "https://x", new Date(0), stub([day(1, 10, 0, 5, 20)], { block: { number: 9 }, hasIndexingErrors: true }) as unknown as typeof fetch);
  const md = renderMarkdown(r);
  assert.match(md, /reported indexing errors/);
  assert.ok(md.indexOf("indexing errors") < md.indexOf("| day |"), "the warning comes before the numbers");
});

test("every report carries the self-operated-taker disclosure and its own queries", async () => {
  const r = await generate(7, "https://x", new Date(0), stub([day(1, 10, 0, 5, 20)]) as unknown as typeof fetch);
  const md = renderMarkdown(r);
  assert.equal(r.disclosure, TAKER_DISCLOSURE);
  assert.match(md, /The taker is ours/);
  assert.match(md, /## Run it yourself/);
  assert.match(md, /```graphql/);
});

test("a failing index throws rather than reporting zeroes as if they were measured", async () => {
  const bad = async () => new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 200 });
  await assert.rejects(() => generate(7, "https://x", new Date(0), bad as unknown as typeof fetch), SubgraphError);
});
