import { recentFills } from "./_lib/chain.ts";

/// Fills read straight from the chain, so the interface has something when the index does not.
export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 200);
  try {
    return Response.json(await recentFills(limit), {
      headers: { "cache-control": "public, max-age=15, stale-while-revalidate=60" },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message, source: "chain" }, { status: 503 });
  }
}
