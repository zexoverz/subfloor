import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decide, driftBps, type PolicyInputs } from "../src/policy/decide.ts";
import { readIndex, IndexUnavailable } from "../src/market/index-reads.ts";
import type { IndexView } from "../src/market/index-reads.ts";

const NOW = 1_757_000_000;

function view(over: Partial<IndexView> = {}): IndexView {
  return {
    indexedBlock: 1000,
    hasIndexingErrors: false,
    strategies: [{ id: "0xabc", classification: "CONCENTRATED", stepCount: 4, programWrappedInOrder: true }],
    quality: { fills: 10, p50Bps: -3, p99Bps: 20, medianReferenceAgeSeconds: 40 },
    reference: { answer: 250_000_000_000n, updatedAt: NOW - 60 },
    ...over,
  };
}

function inputs(over: Partial<PolicyInputs> = {}): PolicyInputs {
  return {
    index: view(),
    chainHead: 1002,
    maxReferenceAgeSeconds: 3600,
    maxIndexLagBlocks: 50,
    now: NOW,
    venueMid: 2_500_000_000n,
    centredOn: 2_500_000_000n,
    recenterBps: 50,
    ...over,
  };
}

describe("the policy loop fails closed", () => {
  test("a stale reference docks rather than re-quoting", () => {
    const a = decide(inputs({ index: view({ reference: { answer: 1n, updatedAt: NOW - 7200 } }) }));
    assert.equal(a.kind, "dock");
    assert.match(a.why, /reference is 7200s old/);
  });

  test("an index reporting errors docks", () => {
    assert.equal(decide(inputs({ index: view({ hasIndexingErrors: true }) })).kind, "dock");
  });

  test("an index far behind the chain docks rather than reasoning from stale state", () => {
    const a = decide(inputs({ chainHead: 5000 }));
    assert.equal(a.kind, "dock");
    assert.match(a.why, /4000 blocks behind/);
  });

  test("no reference at all docks", () => {
    assert.equal(decide(inputs({ index: view({ reference: null }) })).kind, "dock");
  });

  test("no venue mid docks", () => {
    assert.equal(decide(inputs({ venueMid: null })).kind, "dock");
  });

  test("every stopping branch is reached before any trading branch", () => {
    // A state that is both stale *and* would otherwise re-centre. Stopping has to win, and the
    // ordering in decide() is the only thing that makes that true.
    const a = decide(
      inputs({
        index: view({ reference: { answer: 1n, updatedAt: NOW - 99999 } }),
        venueMid: 9_000_000_000n,
        centredOn: 2_500_000_000n,
      }),
    );
    assert.equal(a.kind, "dock");
  });
});

describe("the policy loop trades when it can see", () => {
  test("nothing shipped means ship", () => {
    const a = decide(inputs({ index: view({ strategies: [] }) }));
    assert.equal(a.kind, "requote");
  });

  test("a book somebody else shipped raw does not count as ours", () => {
    const a = decide(inputs({
      index: view({ strategies: [{ id: "0x1", classification: "UNKNOWN", stepCount: 2, programWrappedInOrder: false }] }),
    }));
    assert.equal(a.kind, "requote");
  });

  test("a mid inside the band holds", () => {
    const a = decide(inputs({ venueMid: 2_505_000_000n }));
    assert.equal(a.kind, "hold");
  });

  test("a mid outside the band re-centres, and carries the price to centre on", () => {
    const a = decide(inputs({ venueMid: 2_600_000_000n }));
    assert.equal(a.kind, "recenter");
    if (a.kind === "recenter") assert.equal(a.referencePrice, 2_600_000_000n);
  });
});

describe("drift is integer arithmetic, like settlement's", () => {
  test("400 bps up", () => assert.equal(driftBps(2_600_000_000n, 2_500_000_000n), 400));
  test("400 bps down", () => assert.equal(driftBps(2_400_000_000n, 2_500_000_000n), -400));
  test("a zero centre is not a division", () => assert.equal(driftBps(1n, 0n), 0));
  test("no float rounding at rates settlement actually uses", () => {
    // 4e26-scale rates overflow a double's integer range; this is why the function takes bigint.
    assert.equal(driftBps(400_100_000_000_000_000_000_000_000n, 400_000_000_000_000_000_000_000_000n), 2);
  });
});

describe("reading the index is not allowed to silently succeed", () => {
  const ok = {
    data: {
      _meta: { block: { number: 100 }, hasIndexingErrors: false },
      strategies: [],
      executionQualityDailySnapshots: [],
      referenceAnswers: [],
    },
  };

  test("a GraphQL error throws rather than reading as an empty market", () => {
    const f = (async () => new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 200 })) as unknown as typeof fetch;
    return assert.rejects(() => readIndex("http://x", f), IndexUnavailable);
  });

  test("an unreachable index throws", () => {
    const f = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    return assert.rejects(() => readIndex("http://x", f), IndexUnavailable);
  });

  test("a 503 throws", () => {
    const f = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    return assert.rejects(() => readIndex("http://x", f), IndexUnavailable);
  });

  test("a well-formed empty response is not an error, because a quiet market is real", async () => {
    const f = (async () => new Response(JSON.stringify(ok), { status: 200 })) as unknown as typeof fetch;
    const v = await readIndex("http://x", f);
    assert.equal(v.indexedBlock, 100);
    assert.equal(v.strategies.length, 0);
    assert.equal(v.reference, null);
  });
});

import { cycle, midFromIndex, type LoopConfig } from "../src/policy/loop.ts";
import { IndexRateLimited } from "../src/market/index-reads.ts";

const CFG: LoopConfig = {
  subgraph: "http://index.test",
  rpc: "http://rpc.test",
  maxReferenceAgeSeconds: 3600,
  maxIndexLagBlocks: 200,
  maxIndexSilenceSeconds: 600,
  recenterBps: 50,
  spreadBps: 50,
  feeBps: 3000,
  decayPeriodSeconds: 600,
  intervalMs: 1000,
};

function indexResponse(over: any = {}) {
  return {
    data: {
      _meta: { block: { number: 1000 }, hasIndexingErrors: false },
      strategies: [{ id: "0xa", classification: "CONCENTRATED", stepCount: 4, programWrappedInOrder: true }],
      executionQualityDailySnapshots: [{ fills: 9, adverseDeviationP50Bps: -3, adverseDeviationP99Bps: 20, medianReferenceAgeSeconds: 40 }],
      referenceAnswers: [{ answer: "250000000000", updatedAt: NOW - 60 }],
      ...over,
    },
  };
}

describe("the loop, end to end without a key", () => {
  test("killing the index stops trading rather than trading blind", async () => {
    const lines: string[] = [];
    const a = await cycle(CFG, {
      chainHead: async () => 1002,
      venueMid: async () => 2_500_000_000n,
      centredOn: () => 2_500_000_000n,
      now: () => NOW,
      fetchImpl: (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch,
      log: (s) => lines.push(s),
    });
    assert.equal(a.kind, "dock");
    assert.match(a.why, /index unreadable/);
    // And it did not quietly fall back to the chain.
    assert.ok(!lines.some((l) => l.includes("[compose]")));
  });

  test("the log carries the reads the decision rested on", async () => {
    const lines: string[] = [];
    await cycle(CFG, {
      chainHead: async () => 1002,
      venueMid: async () => 2_500_000_000n,
      centredOn: () => 2_500_000_000n,
      now: () => NOW,
      fetchImpl: (async () => new Response(JSON.stringify(indexResponse()), { status: 200 })) as unknown as typeof fetch,
      log: (s) => lines.push(s),
    });
    const index = lines.find((l) => l.startsWith("[index]"))!;
    // A judge reading this line can check every number in it against the same public endpoint.
    assert.match(index, /block 1000/);
    assert.match(index, /lag 2/);
    assert.match(index, /strategies=1/);
    assert.match(index, /fills=9 p50=-3bps p99=20bps/);
    assert.match(index, /refAge=60s/);
  });

  test("a drifted mid re-centres and composes the program it would ship", async () => {
    const lines: string[] = [];
    const a = await cycle(CFG, {
      chainHead: async () => 1002,
      venueMid: async () => 2_600_000_000n,
      centredOn: () => 2_500_000_000n,
      now: () => NOW,
      fetchImpl: (async () => new Response(JSON.stringify(indexResponse()), { status: 200 })) as unknown as typeof fetch,
      log: (s) => lines.push(s),
    });
    assert.equal(a.kind, "recenter");
    const composed = lines.find((l) => l.startsWith("[compose] 0x"))!;
    assert.ok(composed.includes("0x0208"), "the composed program should start with Salt");
  });

  test("a stale reference docks even though the index answered fine", async () => {
    const a = await cycle(CFG, {
      chainHead: async () => 1002,
      venueMid: async () => 2_500_000_000n,
      centredOn: () => 2_500_000_000n,
      now: () => NOW,
      fetchImpl: (async () =>
        new Response(JSON.stringify(indexResponse({ referenceAnswers: [{ answer: "1", updatedAt: NOW - 99999 }] })), { status: 200 })) as unknown as typeof fetch,
      log: () => {},
    });
    assert.equal(a.kind, "dock");
    assert.match(a.why, /reference is 99999s old/);
  });
});

describe("running out of authority is not a market problem", () => {
  test("a loop with no mandates left stops, and says why", () => {
    const a = decide(inputs({ mandatesRemaining: 0 }));
    assert.equal(a.kind, "unauthorised");
    assert.match(a.why, /signed on the device/);
  });

  test("it is checked before every trading branch, including the one that ships the first book", () => {
    const a = decide(inputs({ mandatesRemaining: 0, index: view({ strategies: [] }) }));
    assert.equal(a.kind, "unauthorised", "shipping the first book spends a mandate too");
  });

  test("but a stale reference still wins, because that is a reason to stop regardless", () => {
    const a = decide(inputs({ mandatesRemaining: 0, index: view({ reference: { answer: 1n, updatedAt: NOW - 99999 } }) }));
    assert.equal(a.kind, "dock");
  });

  test("a loop that was not told about mandates behaves as before", () => {
    assert.equal(decide(inputs()).kind, "hold");
  });
});

describe("a rate limit is not an outage, for a bounded while", () => {
  const limited = (async () =>
    new Response("", { status: 429, headers: { "retry-after": "45" } })) as unknown as typeof fetch;
  const base = {
    chainHead: async () => 1002,
    venueMid: async () => 2_500_000_000n,
    centredOn: () => 2_500_000_000n,
    now: () => NOW,
    fetchImpl: limited,
    log: () => {},
  };

  test("a 429 throws a rate limit that still reads as an unavailable index", async () => {
    const err = await readIndex("http://x", limited).catch((e) => e);
    assert.ok(err instanceof IndexRateLimited);
    assert.ok(err instanceof IndexUnavailable, "anything that only knows IndexUnavailable still fails closed");
    assert.equal(err.retryAfterSeconds, 45);
  });

  test("with a recent good read it holds instead of docking a healthy book", async () => {
    const a = await cycle(CFG, { ...base, lastGoodReadAt: () => NOW - 120 });
    assert.equal(a.kind, "hold");
    assert.match(a.why, /rate-limited; last good read 120s ago/);
  });

  test("once the index has gone unread past the bound it docks", async () => {
    const a = await cycle(CFG, { ...base, lastGoodReadAt: () => NOW - 601 });
    assert.equal(a.kind, "dock");
    assert.match(a.why, /601s, past the 600s bound/);
  });

  test("a loop that has never read the index docks on a rate limit", async () => {
    assert.equal((await cycle(CFG, base)).kind, "dock");
  });

  test("the index's own retry-after reaches the loop", async () => {
    const seen: Array<[boolean, number | null]> = [];
    await cycle(CFG, { ...base, onIndexRead: (ok, r) => seen.push([ok, r]) });
    assert.deepEqual(seen, [[false, 45]]);
  });

  test("any other failure still docks at once, however recent the last read", async () => {
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const a = await cycle(CFG, { ...base, fetchImpl: down, lastGoodReadAt: () => NOW - 5 });
    assert.equal(a.kind, "dock");
    assert.match(a.why, /index unreadable: index HTTP 503/);
  });
});

describe("one index read per cycle", () => {
  test("the mid comes from the same read the decision rests on", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response(JSON.stringify(indexResponse()), { status: 200 });
    }) as unknown as typeof fetch;
    const box: { v: IndexView | null } = { v: null };
    await cycle(CFG, {
      chainHead: async () => 1002,
      venueMid: async (v) => {
        box.v = v;
        return midFromIndex(v);
      },
      centredOn: () => 2_500_000_000n,
      now: () => NOW,
      fetchImpl: f,
      log: () => {},
    });
    assert.equal(calls, 1, "a second query for the mid doubles the load on a rate-limited index");
    assert.equal(box.v?.indexedBlock, 1000);
  });

  test("the mid is the reference in raw units", () => {
    assert.equal(midFromIndex(view()), 2_500_000_000n);
    assert.equal(midFromIndex(view({ reference: null })), null);
  });
});
