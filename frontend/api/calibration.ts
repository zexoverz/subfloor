import { calibrate } from "./_lib/calibration.ts";
import { SubgraphError } from "./_lib/subgraph.ts";

/// The floor screen's default, served from the same origin as the screen that reads it.
///
/// Deployed here rather than as its own service because the only consumer is this frontend, and a
/// second origin would mean CORS, a second deploy to keep in step, and a second URL to get wrong.
/// The logic lives in `indexer/consumers/` and is tested there; this file is transport.
export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 7);

  try {
    const body = await calibrate(days);
    return Response.json(body, {
      headers: {
        // Short, because the screen is calibrated from a daily rollup that moves at most once a day,
        // and a stale calibration is a number a human might sign.
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    const upstream = err instanceof SubgraphError;
    // 503 rather than a fallback. A calibration that quietly degrades to the house number while the
    // screen still says "from venue history" is worse than one that stops.
    return Response.json(
      { error: (err as Error).message, source: upstream ? "index" : "server" },
      { status: upstream ? 503 : 500 },
    );
  }
}
