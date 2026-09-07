import { generate, renderMarkdown } from "./_lib/report.ts";
import { SubgraphError } from "./_lib/subgraph.ts";

/// The daily execution-quality record, generated from the index with the query attached.
///
/// `?format=md` returns the published shape; anything else returns JSON for the stats page.
export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 7);

  try {
    const report = await generate(days);
    if (url.searchParams.get("format") === "md") {
      return new Response(renderMarkdown(report), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "cache-control": "public, max-age=300, stale-while-revalidate=900",
        },
      });
    }
    return Response.json(report, {
      headers: { "cache-control": "public, max-age=300, stale-while-revalidate=900" },
    });
  } catch (err) {
    const upstream = err instanceof SubgraphError;
    return Response.json(
      { error: (err as Error).message, source: upstream ? "index" : "server" },
      { status: upstream ? 503 : 500 },
    );
  }
}
