import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { calibrate } from "./calibration.ts";
import { generate, renderMarkdown } from "./report.ts";
import { DEFAULT_ENDPOINT, SubgraphError } from "./subgraph.ts";

/// One service: the built frontend and the two consumers it calls, on one origin.
///
/// Same origin is the point. The floor screen calls `/api/calibration` and the stats page calls
/// `/api/report`, and serving them from anywhere else means CORS, a second deploy to keep in step,
/// and a second URL to get wrong. It also means one place to look when something is down.
///
/// Both endpoints fail loudly when the index is unreachable. A 503 makes the screen show its own
/// error state, which is correct: the alternative is a floor screen that quietly falls back to a
/// constant while still telling the user the number came from venue history.

const PORT = Number(process.env.PORT ?? 8787);
const STATIC_ROOT = resolve(process.env.STATIC_ROOT ?? "frontend/dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

/// Resolve inside the static root or not at all. `..` in a request path is the oldest bug in
/// serving files, and this service sits next to a wallet.
async function resolveStatic(pathname: string): Promise<string | null> {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = resolve(join(STATIC_ROOT, rel));
  if (candidate !== STATIC_ROOT && !candidate.startsWith(STATIC_ROOT + "/")) return null;
  try {
    const s = await stat(candidate);
    if (s.isDirectory()) return resolveStatic(join(pathname, "index.html"));
    return candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const windowDays = Number(url.searchParams.get("days") ?? 7);

  try {
    if (url.pathname === "/api/calibration") {
      const body = await calibrate(windowDays);
      res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=60" });
      res.end(JSON.stringify(body, null, 2));
      return;
    }

    if (url.pathname === "/api/report") {
      const report = await generate(windowDays);
      if (url.searchParams.get("format") === "md") {
        res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" });
        res.end(renderMarkdown(report));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=300" });
      res.end(JSON.stringify(report, null, 2));
      return;
    }

    if (url.pathname === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, index: DEFAULT_ENDPOINT }));
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found", routes: ["/api/calibration", "/api/report", "/api/health"] }));
      return;
    }

    // Static, then the SPA fallback. Anything under /api/ has already returned, so a client route
    // named like an endpoint cannot swallow one.
    const file = (await resolveStatic(url.pathname)) ?? (await resolveStatic("/index.html"));
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch (err) {
    const upstream = err instanceof SubgraphError;
    res.writeHead(upstream ? 503 : 500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: (err as Error).message, source: upstream ? "index" : "server" }));
  }
});

server.listen(PORT, () => console.log(`subfloor on :${PORT}, index ${DEFAULT_ENDPOINT}, static ${STATIC_ROOT}`));
