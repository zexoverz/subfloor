import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedPost, clearIndexCache, firstClean } from "./indexCache.ts";

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

/// One fetch standing in for two endpoints, answering per URL, and recording who was asked with what.
function byEndpoint(answers: Record<string, { status?: number; body?: string; headers?: Record<string, string> } | "throw">) {
  const asked: { url: string; auth: string | null }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    asked.push({ url, auth: new Headers(init.headers).get("authorization") });
    const a = answers[url];
    if (a === "throw" || a === undefined) throw new Error("unreachable");
    return new Response(a.body ?? '{"data":{"x":1}}', { status: a.status ?? 200, headers: a.headers });
  }) as unknown as typeof fetch;
  return { asked, f };
}

test("a clean primary is the answer and the fallback is never asked", async () => {
  clearIndexCache();
  const { asked, f } = byEndpoint({ "https://gw": {}, "https://studio": {} });
  const a = await firstClean(["https://gw", "https://studio"], '{"q":1}', () => ({}), f);
  assert.equal(a.status, 200);
  assert.deepEqual(asked.map((x) => x.url), ["https://gw"]);
});

test("an unfunded gateway falls through to Studio", async () => {
  clearIndexCache();
  const { asked, f } = byEndpoint({ "https://gw": { status: 402, body: "" }, "https://studio": { body: '{"data":{"y":2}}' } });
  const a = await firstClean(["https://gw", "https://studio"], '{"q":1}', () => ({}), f);
  assert.equal(a.status, 200);
  assert.equal(a.body, '{"data":{"y":2}}');
  assert.deepEqual(asked.map((x) => x.url), ["https://gw", "https://studio"]);
});

test("an auth error arrives as a 200 and still falls through", async () => {
  clearIndexCache();
  const { f } = byEndpoint({
    "https://gw": { body: '{"errors":[{"message":"auth error: API key not found"}]}' },
    "https://studio": { body: '{"data":{"y":2}}' },
  });
  const a = await firstClean(["https://gw", "https://studio"], '{"q":1}', () => ({}), f);
  assert.equal(a.body, '{"data":{"y":2}}');
});

test("an unreachable gateway falls through rather than throwing", async () => {
  clearIndexCache();
  const { f } = byEndpoint({ "https://gw": "throw", "https://studio": {} });
  const a = await firstClean(["https://gw", "https://studio"], '{"q":1}', () => ({}), f);
  assert.equal(a.status, 200);
});

test("when both fail the last failure is returned, with its retry-after, and nothing is kept", async () => {
  clearIndexCache();
  const { asked, f } = byEndpoint({
    "https://gw": { status: 402, body: "" },
    "https://studio": { status: 429, body: "", headers: { "retry-after": "60" } },
  });
  const a = await firstClean(["https://gw", "https://studio"], '{"q":1}', () => ({}), f);
  assert.equal(a.status, 429);
  assert.equal(a.retryAfter, "60");
  await new Promise((r) => setImmediate(r));
  await firstClean(["https://gw", "https://studio"], '{"q":1}', () => ({}), f);
  assert.equal(asked.length, 4, "a failure is asked again next time, on both");
});

test("a 200 without data is not clean, so an unpublished version falls through", async () => {
  clearIndexCache();
  const { f } = byEndpoint({ "https://gw": { body: '{"message":"Not found"}' }, "https://studio": {} });
  const a = await firstClean(["https://gw", "https://studio"], '{"q":1}', () => ({}), f);
  assert.equal(a.body, '{"data":{"x":1}}');
});

test("each endpoint gets its own headers", async () => {
  clearIndexCache();
  const { asked, f } = byEndpoint({ "https://gw": { status: 402, body: "" }, "https://studio": {} });
  await firstClean(["https://gw", "https://studio"], '{"q":1}', (e): Record<string, string> => (e === "https://gw" ? { authorization: "Bearer k" } : {}), f);
  assert.deepEqual(asked, [
    { url: "https://gw", auth: "Bearer k" },
    { url: "https://studio", auth: null },
  ]);
});
