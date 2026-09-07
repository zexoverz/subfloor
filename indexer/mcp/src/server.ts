#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ENDPOINT, QUERIES, run, withProvenance } from "./queries.ts";

/// An MCP server over the SUBFLOOR Aqua index.
///
/// The index is public and anyone can query it; this exists so an agent can ask the venue a question
/// without first learning the schema, which is the difference between an index that is available and
/// one that is used. Every answer carries the query that produced it, so a person can check what an
/// agent reports rather than taking its word.
///
/// Uses the low-level Server rather than McpServer: the tool schemas here are plain JSON Schema and
/// pulling in a runtime validator for five tools with three parameters between them is not worth the
/// dependency.

export const TOOLS = [
  {
    name: "floor_for",
    description:
      "The price floors registered for an address. A floor is keyed to the recipient of a fill, so this is the address that receives tokens — for an agent-run vault that is the vault, not its owner.",
    inputSchema: {
      type: "object",
      properties: { recipient: { type: "string", description: "0x-prefixed address" } },
      required: ["recipient"],
    },
    query: "floorFor" as const,
    vars: (a: Record<string, unknown>) => ({ recipient: String(a.recipient).toLowerCase() }),
  },
  {
    name: "execution_quality",
    description:
      "Daily realized execution quality: fills, refusals, and p50/p99 adverse deviation against the reference price. This is what a floor should be calibrated from — a floor set without it is a guess.",
    inputSchema: {
      type: "object",
      properties: { days: { type: "integer", description: "Trailing window, default 7" } },
    },
    query: "executionQuality" as const,
    vars: (a: Record<string, unknown>) => ({
      since: Math.floor(Date.now() / 1000 / 86400) - Number(a.days ?? 7),
    }),
  },
  {
    name: "strategies",
    description:
      "Strategies shipped to the venue, with their SwapVM programs decoded into named instructions. Nothing else decodes these: the venue stores the program as an opaque blob and the VM reads it only at execution time.",
    inputSchema: {
      type: "object",
      properties: {
        maker: { type: "string", description: "Optional maker address to narrow to" },
        first: { type: "integer", description: "Default 10" },
      },
    },
    query: "strategies" as const,
    vars: (a: Record<string, unknown>) => ({
      maker: a.maker ? String(a.maker).toLowerCase() : null,
      first: Number(a.first ?? 10),
    }),
  },
  {
    name: "recent_fills",
    description:
      "Recent fills with their execution rate, the reference price at the block, and how far each landed from the reference. referenceAgeSeconds of -1 means the fill could not be scored and must not be read as zero deviation.",
    inputSchema: { type: "object", properties: { first: { type: "integer", description: "Default 20" } } },
    query: "recentFills" as const,
    vars: (a: Record<string, unknown>) => ({ first: Number(a.first ?? 20) }),
  },
  {
    name: "reference",
    description:
      "The reference answer the index is currently scoring against, and how far the index has synced. Check this before trusting a deviation: a stale reference makes every score stale with it.",
    inputSchema: { type: "object", properties: {} },
    query: "reference" as const,
    vars: () => ({}),
  },
];

export async function callTool(name: string, args: Record<string, unknown>, fetchImpl: typeof fetch = fetch) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool: ${name}`);
  const query = QUERIES[tool.query];
  const variables = tool.vars(args);
  const data = await run<unknown>(query, variables, ENDPOINT, fetchImpl);
  return withProvenance(data, query, variables);
}

const server = new Server(
  { name: "subfloor", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    const out = await callTool(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  } catch (err) {
    // Reported as tool content rather than thrown, so the agent sees why and can say so, instead of
    // the call vanishing into a protocol error it cannot explain.
    return {
      content: [{ type: "text", text: `index unavailable: ${(err as Error).message}` }],
      isError: true,
    };
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  await server.connect(new StdioServerTransport());
}
