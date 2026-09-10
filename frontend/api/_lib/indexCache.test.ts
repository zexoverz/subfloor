import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedPost, clearIndexCache } from "./indexCache.ts";

function upstream(answer: { status?: number; body?: string; headers?: Record<string, string> } = {}) {
  const counter = { calls: 0 };
  const f = (async () => {
    counter.calls++;
    return new Response(answer.body ?? '{"data":{"x":1}}', { status: answer.status ?? 200, headers: answer.headers });
  }) as unknown as typeof fetch;
  return { counter, f };
}

test("callers asking at once share one upstream request", async () => {
  clearIndexCache();
  const { counter, f } = upstream();
  const answers = await Promise.all([1, 2, 3, 4].map(() => cachedPost("https://index", '{"q":1}', f)));
  assert.equal(counter.calls, 1);
  assert.ok(answers.every((a) => a.status === 200));
});

test("an answer is reused inside the window and asked for again after it", async () => {
  clearIndexCache();
  const { counter, f } = upstream();
  let t = 0;
  const now = () => t;
  await cachedPost("https://index", '{"q":1}', f, 30_000, now);
  t = 29_999;
  await cachedPost("https://index", '{"q":1}', f, 30_000, now);
  assert.equal(counter.calls, 1, "still inside the window");
  t = 30_000;
  await cachedPost("https://index", '{"q":1}', f, 30_000, now);
  assert.equal(counter.calls, 2, "the window is over, so the index is asked again");
});

test("a rate limit is passed through and never served from the cache", async () => {
  clearIndexCache();
  const { counter, f } = upstream({ status: 429, body: "", headers: { "retry-after": "45" } });
  const first = await cachedPost("https://index", '{"q":1}', f);
  assert.equal(first.status, 429);
  assert.equal(first.retryAfter, "45");
  await new Promise((r) => setImmediate(r));
  await cachedPost("https://index", '{"q":1}', f);
  assert.equal(counter.calls, 2, "the next caller asks again rather than inheriting the failure");
});

test("a GraphQL error is not kept either, because it arrives with a 200", async () => {
  clearIndexCache();
  const { counter, f } = upstream({ body: '{"errors":[{"message":"indexing_error"}]}' });
  await cachedPost("https://index", '{"q":1}', f);
  await new Promise((r) => setImmediate(r));
  await cachedPost("https://index", '{"q":1}', f);
  assert.equal(counter.calls, 2);
});

test("different requests are kept apart", async () => {
  clearIndexCache();
  const { counter, f } = upstream();
  await cachedPost("https://index", '{"q":1}', f);
  await cachedPost("https://index", '{"q":2}', f);
  await cachedPost("https://other", '{"q":1}', f);
  assert.equal(counter.calls, 3);
});
