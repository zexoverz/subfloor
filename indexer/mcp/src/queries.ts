/// The questions worth asking the index, as named tools rather than as GraphQL.
///
/// Every tool returns the query it ran alongside its answer. That is the same rule the floor screen's
/// [run query] affordance follows, and it matters more here: an agent that can only report what a
/// tool told it cannot be checked, whereas one that reports the query with the answer can.

export const ENDPOINT =
  process.env.SUBFLOOR_SUBGRAPH ??
  "https://api.studio.thegraph.com/query/1758825/subfloor-base-sepolia/v0.0.4";

export const QUERIES = {
  floorFor: `query FloorFor($recipient: Bytes!) {
  floors(where: { recipient: $recipient }) {
    recipient
    base
    quote
    maxAdverseBps
    absoluteRate
    updatedAt
    updatedAtBlock
    base { id symbol decimals }
    quote { id symbol decimals }
  }
}`,

  executionQuality: `query ExecutionQuality($since: Int!) {
  executionQualityDailySnapshots(where: { day_gte: $since }, orderBy: day, orderDirection: asc) {
    day
    fills
    refusals
    adverseDeviationP50Bps
    adverseDeviationP99Bps
    medianReferenceAgeSeconds
  }
}`,

  strategies: `query Strategies($maker: Bytes, $first: Int!) {
  strategies(where: { maker: $maker }, orderBy: shippedTimestamp, orderDirection: desc, first: $first) {
    strategyHash
    app
    classification
    families
    stepCount
    decodeError
    active
    shippedTimestamp
    steps(orderBy: index) { index opcode name args }
  }
}`,

  recentFills: `query RecentFills($first: Int!) {
  fillQualities(orderBy: timestamp, orderDirection: desc, first: $first) {
    executionRate
    referencePrice
    adverseDeviationBps
    referenceAgeSeconds
    floorAtFill
    timestamp
  }
}`,

  reference: `query Reference {
  referenceAnswer(id: "0x4554482f555344") { aggregator answer updatedAt roundId blockNumber }
  _meta { block { number } hasIndexingErrors }
}`,
} as const;

export class IndexError extends Error {}

export async function run<T>(
  query: string,
  variables: Record<string, unknown> = {},
  endpoint = ENDPOINT,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new IndexError(`index HTTP ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new IndexError(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new IndexError("index returned no data");
  return body.data;
}

/// Wraps an answer with what produced it. An agent quoting this can be checked by a person.
export function withProvenance(data: unknown, query: string, variables: Record<string, unknown>, endpoint = ENDPOINT) {
  return { data, provenance: { endpoint, query, variables } };
}
