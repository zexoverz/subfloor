import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { respondToFailure } from "./server.ts";
import { SubgraphError } from "./subgraph.ts";

/// A response that records what was done to it, which is all these two branches are.
function stub(headersSent: boolean) {
  const calls: string[] = [];
  return {
    calls,
    headersSent,
    writeHead: (code: number) => calls.push(`writeHead ${code}`),
    end: () => calls.push("end"),
    destroy: () => calls.push("destroy"),
  };
}

test("a failure before the response starts is reported to the client", () => {
  const res = stub(false);
  respondToFailure(res, new Error("nope"));
  assert.deepEqual(res.calls, ["writeHead 500", "end"]);
});

test("an index that is down is a 503, not a 500 — the screen shows its own error state", () => {
  const res = stub(false);
  respondToFailure(res, new SubgraphError("index unreachable"));
  assert.deepEqual(res.calls, ["writeHead 503", "end"]);
});

test("a failure after the headers are gone closes the connection instead of writing again", () => {
  const res = stub(true);
  respondToFailure(res, new Error("upstream died mid-response"));
  // Writing here throws ERR_HTTP_HEADERS_SENT out of an async callback nothing encloses, which is
  // what took the whole service down rather than the one request.
  assert.deepEqual(res.calls, ["destroy"]);
});

test("no endpoint writes its status before the work that can fail", async () => {
  const src = await readFile(new URL("./server.ts", import.meta.url), "utf8");
  const handler = src.slice(src.indexOf("const server = createServer"));
  for (const block of handler.split(/if \(url\.pathname/).slice(1)) {
    const body = block.slice(0, block.indexOf("return;"));
    const head = body.indexOf("res.writeHead");
    if (head === -1) continue;
    const after = body.slice(head);
    assert.ok(
      !/await /.test(after),
      `an endpoint awaits after writing its status:\n${body.trim().slice(0, 200)}`,
    );
  }
});
