import { cachedPost, firstClean } from "./indexCache.ts";

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
export const STUDIO_ENDPOINT = "https://api.studio.thegraph.com/query/1758825/subfloor-base-sepolia/v3.1.0";
export const DEFAULT_ENDPOINT = process.env.SUBFLOOR_SUBGRAPH ?? STUDIO_ENDPOINT;

/// Where to ask when the primary does not answer cleanly. Studio by default, which is free to read
/// and serves the same deployment; when the primary *is* Studio the list collapses to one.
const FALLBACK_ENDPOINT = process.env.SUBFLOOR_SUBGRAPH_FALLBACK ?? STUDIO_ENDPOINT;
export const INDEX_ENDPOINTS: readonly string[] = [...new Set([DEFAULT_ENDPOINT, FALLBACK_ENDPOINT])];

const GATEWAY_HOST = "gateway.thegraph.com";

/// The paid gateway's key, as a header, to the gateway and nowhere else. A key in the URL would be
/// printed by `/api/health`, the startup line and every provenance block, all of which are public.
export function headersFor(endpoint: string, key: string | undefined = process.env.SUBFLOOR_GRAPH_API_KEY): Record<string, string> {
  if (!key) return {};
  try {
    return new URL(endpoint).hostname === GATEWAY_HOST ? { authorization: `Bearer ${key}` } : {};
  } catch {
    return {};
  }
}

/// An endpoint fit to print. The gateway also accepts its key as a path segment
/// (`/api/<key>/subgraphs/...`), and an operator who configures it that way should not publish it.
export function publicEndpoint(endpoint: string): string {
  return endpoint.replace(/\/api\/[0-9a-f]{32}\//i, "/api/<key>/");
}

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

/// The maker's side of every scored fill in the window. What the floor screen calibrates from: the
/// number a vault owner signs is how the vault's own fills landed against the reference, and a
/// daily snapshot cannot give the worst tail of a week, only the tail of each day.
export const MAKER_FILLS_QUERY = `query MakerFills($since: BigInt!, $first: Int!, $skip: Int!) {
  fillQualities(
    where: { timestamp_gte: $since, referenceAgeSeconds_gte: 0 }
    orderBy: timestamp
    orderDirection: asc
    first: $first
    skip: $skip
  ) {
    makerAdverseDeviationBps
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
  const request = JSON.stringify({ query: q, variables });
  // Through the shared cache on the real fetch, so the calibration, the report and every open tab
  // cost the index one read per window between them. An injected fetch is a test, and a test must
  // see its own fetch rather than an answer another test left behind.
  const answer =
    fetchImpl === fetch
      ? endpoint === DEFAULT_ENDPOINT
        ? await firstClean(INDEX_ENDPOINTS, request, (e) => headersFor(e))
        : await cachedPost(endpoint, request, fetch, undefined, undefined, headersFor(endpoint))
      : await fetchImpl(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: request }).then(
          async (r) => ({ status: r.status, body: await r.text(), retryAfter: null }),
        );
  if (answer.status < 200 || answer.status >= 300) throw new SubgraphError(`subgraph HTTP ${answer.status}`);

  const body = JSON.parse(answer.body) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new SubgraphError(body.errors.map((e) => e.message).join("; "));
  if (!body.data) throw new SubgraphError("subgraph returned no data");
  return body.data;
}
