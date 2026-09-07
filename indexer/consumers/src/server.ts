import { createServer } from "node:http";
import { calibrate } from "./calibration.ts";
import { generate, renderMarkdown } from "./report.ts";
import { DEFAULT_ENDPOINT, SubgraphError } from "./subgraph.ts";

/// The two consumers, served. The floor screen calls `/calibration`; the public page and the daily
/// publish call `/report`.
///
/// Both fail loudly when the index is unreachable. A 503 makes the screen show its own error state,
/// which is correct: the alternative is a floor screen that quietly falls back to a constant while
/// still telling the user the number came from venue history.

const PORT = Number(process.env.PORT ?? 8787);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const windowDays = Number(url.searchParams.get("days") ?? 7);
  const cors = { "access-control-allow-origin": "*" };

  try {
    if (url.pathname === "/calibration") {
      const body = await calibrate(windowDays);
      res.writeHead(200, { "content-type": "application/json", ...cors });
      res.end(JSON.stringify(body, null, 2));
      return;
    }

    if (url.pathname === "/report") {
      const report = await generate(windowDays);
      if (url.searchParams.get("format") === "md") {
        res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", ...cors });
        res.end(renderMarkdown(report));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", ...cors });
      res.end(JSON.stringify(report, null, 2));
      return;
    }

    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json", ...cors });
      res.end(JSON.stringify({ ok: true, endpoint: DEFAULT_ENDPOINT }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "not found", routes: ["/calibration", "/report", "/health"] }));
  } catch (err) {
    const upstream = err instanceof SubgraphError;
    res.writeHead(upstream ? 503 : 500, { "content-type": "application/json", ...cors });
    res.end(JSON.stringify({ error: (err as Error).message, source: upstream ? "index" : "server" }));
  }
});

server.listen(PORT, () => console.log(`consumers on :${PORT}, reading ${DEFAULT_ENDPOINT}`));
