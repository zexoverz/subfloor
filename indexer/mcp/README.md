# subfloor-mcp

An MCP server over the SUBFLOOR Aqua index. The index is public and anyone can query it; this exists
so an agent can ask the venue a question without first learning the schema, which is the difference
between an index that is available and one that is used.

```bash
npm install
npm run check    # tests
npm start        # stdio
```

Point it at another deployment with `SUBFLOOR_SUBGRAPH`.

## Install into a client

```json
{
  "mcpServers": {
    "subfloor": {
      "command": "node",
      "args": ["--experimental-strip-types", "/absolute/path/to/indexer/mcp/src/server.ts"]
    }
  }
}
```

`skill/SKILL.md` is the same knowledge as a skill, for clients that take one.

## Tools

| tool | answers |
|---|---|
| `floor_for` | the floors registered for an address |
| `execution_quality` | daily fills, refusals, p50/p99 adverse deviation |
| `strategies` | shipped strategies with their SwapVM programs decoded |
| `recent_fills` | recent fills and how far each landed from the reference |
| `reference` | the answer being scored against, and how far the index has synced |

## One rule the whole thing is built around

Every answer carries the GraphQL query and variables that produced it. An agent that can only report
what a tool told it cannot be checked; one that reports the query alongside the answer can. It is the
same reason the floor screen puts `[run query]` next to every number it shows.
