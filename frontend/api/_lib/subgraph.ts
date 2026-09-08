/// The only place a URL or a query string lives. Everything else in this package takes data.
///
/// The queries are exported as strings on purpose. The floor screen renders a [run query] affordance
/// next to every number it shows, and the point of that affordance is that a stranger can run the
/// same query against the same public endpoint and get the same answer. That only stays true if the
/// query the screen advertises is literally the query the calibration ran, so it travels with the
/// response rather than being retyped into a docs page that drifts.

/// The fallback is pinned to a version rather than a floating alias because Studio has no floating
/// alias. That makes it a thing to update on every subgraph deploy, and forgetting is not loud: the
/// endpoint keeps answering, with `indexing_error` from a version that halted, and `/api/report` and
/// `/api/calibration` return 503 while `/api/fills` — which reads the chain — stays green. That is
/// what was live for several hours: the deploy moved to v1.3.0 and this line still said v1.2.0.
///
/// `SUBFLOOR_SUBGRAPH` overrides it, and Railway should set it so a subgraph deploy does not need a
/// code deploy to follow.
export const DEFAULT_ENDPOINT =
  process.env.SUBFLOOR_SUBGRAPH ??
  "https://api.studio.thegraph.com/query/1758825/subfloor-base-sepolia/v2.1.0";

export const DAILY_QUALITY_QUERY = `query DailyQuality($since: Int!) {
  executionQualityDailySnapshots(
    where: { day_gte: $since }
    orderBy: day
    orderDirection: asc
  ) {
    day
    fills
    refusals
    adverseDeviationP50Bps
    adverseDeviationP99Bps
    medianReferenceAgeSeconds
    timestamp
  }
}`;

export const DAY_FILLS_QUERY = `query DayFills($since: BigInt!, $first: Int!, $skip: Int!) {
  fillQualities(
    where: { timestamp_gte: $since, referenceAgeSeconds_gte: 0 }
    orderBy: timestamp
    orderDirection: asc
    first: $first
    skip: $skip
  ) {
    executionRate
    referencePrice
    adverseDeviationBps
    referenceAgeSeconds
    timestamp
  }
}`;

export const REFERENCE_QUERY = `query Reference {
  referenceAnswer(id: "0x4554482f555344") {
    aggregator
    answer
    updatedAt
    roundId
  }
  _meta { block { number } hasIndexingErrors }
}`;

export interface DailyQuality {
  day: number;
  fills: number;
  refusals: number;
  adverseDeviationP50Bps: number;
  adverseDeviationP99Bps: number;
  medianReferenceAgeSeconds: number;
  timestamp: string;
}

export class SubgraphError extends Error {}

/// Throws rather than returning a default on failure. Both consumers feed a number a human is about
/// to sign or publish, and a calibration that silently degrades to a house default when the index is
/// unreachable is worse than one that stops: the screen would say "calibrated from venue history"
/// over a number that came from a constant.
export async function query<T>(
  q: string,
  variables: Record<string, unknown> = {},
  endpoint: string = DEFAULT_ENDPOINT,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: q, variables }),
  });
  if (!res.ok) throw new SubgraphError(`subgraph HTTP ${res.status}`);

  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new SubgraphError(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new SubgraphError("subgraph returned no data");
  return body.data;
}
