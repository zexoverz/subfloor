/// What only the index has.
///
/// The policy loop reads these before every decision. §9 makes that load-bearing for the Graph
/// filing, and the difference between a loop that consumes the index and one that fetches it and
/// ignores it is visible in a minute to anyone who opens the file — so every field read here is
/// read because a decision depends on it, and there is a test that kills the index and asserts the
/// loop stops trading.

export interface OpenStrategy {
  id: string;
  classification: string;
  stepCount: number;
  /// False when the maker shipped raw bytecode rather than an Order. Ours is always true; a false
  /// here means we are looking at somebody else's strategy and should not reason about it.
  programWrappedInOrder: boolean;
}

export interface RecentQuality {
  /// Median adverse deviation over the day's scored fills, in bps. Negative is worse than reference.
  p50Bps: number;
  p99Bps: number;
  fills: number;
  /// Median age of the reference at fill time. Growing without bound means the feed moved and the
  /// index is watching an aggregator nobody updates any more.
  medianReferenceAgeSeconds: number;
}

export interface IndexView {
  /// Block the index has reached. Compared against the chain head to detect a stalled index.
  indexedBlock: number;
  hasIndexingErrors: boolean;
  strategies: OpenStrategy[];
  quality: RecentQuality | null;
  /// The most recent Chainlink answer the index saw, and when the feed said it was written.
  reference: { answer: bigint; updatedAt: number } | null;
}

const QUERY = `query PolicyState {
  _meta { block { number } hasIndexingErrors }
  strategies(first: 50) { id classification stepCount programWrappedInOrder }
  executionQualityDailySnapshots(first: 1, orderBy: day, orderDirection: desc) {
    fills adverseDeviationP50Bps adverseDeviationP99Bps medianReferenceAgeSeconds
  }
  referenceAnswers(first: 1) { answer updatedAt }
}`;

export class IndexUnavailable extends Error {}

/// A 429 is the index saying "not now", which is a different fact from "the index is down". It is a
/// subclass so anything that only knows `IndexUnavailable` still fails closed on it; the loop, which
/// knows the difference, can wait out a rate limit instead of docking a healthy book over it.
export class IndexRateLimited extends IndexUnavailable {
  readonly retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null) {
    super(`index HTTP 429${retryAfterSeconds === null ? "" : `, retry after ${retryAfterSeconds}s`}`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/// Read the index. Throws rather than returning a default.
///
/// A default here would be the whole failure this loop is meant not to have: an empty strategy list
/// and a zero deviation read exactly like a quiet, healthy market, and the loop would re-quote into
/// a venue it can no longer see. Fail closed means the caller has to handle the throw, and it docks.
export async function readIndex(endpoint: string, fetchImpl: typeof fetch = fetch): Promise<IndexView> {
  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
    });
  } catch (err) {
    throw new IndexUnavailable(`index unreachable: ${(err as Error).message}`);
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new IndexRateLimited(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null);
  }
  if (!res.ok) throw new IndexUnavailable(`index HTTP ${res.status}`);

  const body = (await res.json()) as { data?: any; errors?: { message: string }[] };
  if (body.errors?.length) throw new IndexUnavailable(`index errors: ${body.errors.map((e) => e.message).join("; ")}`);
  if (!body.data?._meta) throw new IndexUnavailable("index returned no _meta");

  const snap = body.data.executionQualityDailySnapshots?.[0];
  const ref = body.data.referenceAnswers?.[0];

  return {
    indexedBlock: Number(body.data._meta.block.number),
    hasIndexingErrors: body.data._meta.hasIndexingErrors === true,
    strategies: (body.data.strategies ?? []).map((s: any) => ({
      id: s.id,
      classification: s.classification,
      stepCount: Number(s.stepCount),
      programWrappedInOrder: s.programWrappedInOrder === true,
    })),
    quality: snap
      ? {
          fills: Number(snap.fills),
          p50Bps: Number(snap.adverseDeviationP50Bps),
          p99Bps: Number(snap.adverseDeviationP99Bps),
          medianReferenceAgeSeconds: Number(snap.medianReferenceAgeSeconds),
        }
      : null,
    reference: ref ? { answer: BigInt(ref.answer), updatedAt: Number(ref.updatedAt) } : null,
  };
}
