import { refusals } from "./_lib/refusals.ts";

/// Refusals, which exist only as reverted transactions and therefore only here.
///
/// Not served from the index: a refused fill reverts and emits no logs, so no subgraph can see one.
/// The daily snapshot's `refusals` field is structurally zero and this endpoint is what replaces it.
export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 200);
  try {
    return Response.json(await refusals(limit), {
      headers: { "cache-control": "public, max-age=30, stale-while-revalidate=120" },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message, source: "chain" }, { status: 503 });
  }
}
