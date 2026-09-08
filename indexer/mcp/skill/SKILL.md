---
name: subfloor-aqua-index
description: Query realized execution quality, price floors and decoded SwapVM strategies on 1inch Aqua. Use when asked how good a venue's fills are, what floor protects an address, or what a shipped strategy actually does.
---

# The Aqua execution-quality index

A public index of 1inch Aqua built on Messari's DEX Aggregator standardized schema, extended with
what Aqua needs and the venue does not record.

Endpoint: `https://api.studio.thegraph.com/query/1758825/subfloor-base-sepolia/v3.1.0`

## What it answers that nothing else does

**What a shipped strategy actually does.** Aqua stores a strategy as an opaque blob and the VM reads
it only at execution time, so nobody records what ran. `Strategy` carries the program decoded into
named instructions, plus a classification in plain words.

**How good the fills really were.** `FillQuality` scores every fill against the Chainlink answer that
was current at its block — the same number settlement compared against — and
`ExecutionQualityDailySnapshot` rolls that into p50/p99 per day.

**What price a recipient will refuse.** `Floor` is keyed to the recipient of a fill, not chosen per
order by the caller.

## Reading it without getting it wrong

- **A floor is keyed to the recipient.** For an agent-run vault that is the vault, not its owner. A
  floor registered to the owner protects nothing, because the owner never appears in a fill.
- **`referenceAgeSeconds: -1` means the fill could not be scored.** It is not zero deviation. Exclude
  those rather than averaging them in, or the venue looks better than it was.
- **Refusals never appear in fill data.** A refused fill reverts, and a reverted transaction emits no
  logs, so a subgraph cannot see one. The refusal counts come from a Substreams module reading
  transaction status.
- **Check `_meta.hasIndexingErrors` and the reference age before quoting a number.** A stale
  reference makes every deviation stale with it.

## Tools

`floor_for`, `execution_quality`, `strategies`, `recent_fills`, `reference`. Each returns the
GraphQL query and variables that produced its answer, so anything reported from here can be checked.
