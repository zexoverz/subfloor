# Indexer schema decisions

Settled 7 Sep. Read this before writing a handler; the decisions here are what make the two claims
in the Graph filing checkable rather than asserted.

## The standard we implement

`schema-dex-agg.graphql` from `messari/subgraphs`, **version 1.0.2** — confirmed by reading the file
at the repository head, not from memory. Core entities: `DexAggProtocol`, `VirtualPool`, `Swap`,
`Token`, `Account`, plus the usage, financial and pool snapshots.

It is a listed Messari schema with no implementations. That is the point of choosing it: implementing
a standard nobody has implemented is a stronger composability claim than adding one more subgraph to
a schema that already has forty.

## Decision 1 — venue-agnostic from the first handler, Aqua first

Multi-venue across Base, with Aqua implemented to full depth before a second venue is added.

The reason is the measured winner pattern: single-protocol depth places second in this track, and
building for second place has already conceded. What makes multi-venue worth the work is not the
extra data, it is that **the same query shape answers for every venue**:

```graphql
{ swaps(where: { protocol: "aqua" })        { amountsIn amountsOut virtualPool { tokensIn } } }
{ swaps(where: { protocol: "uniswap-v3" })  { amountsIn amountsOut virtualPool { tokensIn } } }
```

One shape, two venues, comparable answers. That is demonstrable in a screenshot; "we support
multiple venues" is not.

Aqua goes to full depth first so that if the day runs out the entry still stands on the Aqua leg
alone, and the second venue becomes an upgrade rather than a hole. This is also the Graph cut order's
third item, so cutting it is already the planned response to pressure.

## Decision 2 — SUBFLOOR facts are separate entities, never edits to the standard ones

`Swap`, `VirtualPool` and `DexAggProtocol` are used **exactly as the standard defines them**. Every
SUBFLOOR-specific fact hangs off a parallel entity keyed to the same id.

```
Swap (standard, untouched)
  └── FillQuality      reference price at block, adverse deviation bps, the floor in force
  └── Floor            current floor per (recipient, base, quote)
  └── FloorChange      raised / lowered, with the guardian that signed a lowering
  └── Refusal          a fill the floor turned away
```

Extending the standard entities in place would make the subgraph answer the standard's queries with
non-standard shapes, which defeats the entire reason for adopting a standardized schema. A consumer
who knows dex-agg can query this subgraph without reading our docs, and a consumer who wants the
floor data joins one hop.

## Decision 3 — refusals come from Substreams, never from a subgraph handler

**A refused fill emits no events.** `SettledBelowFloor` is a revert (error selector `0x027e4c46`),
and a reverted transaction produces no logs at all. A subgraph is log-driven, so every refusal is
invisible to it.

This is not a footnote. The refusal *is* the product — the revert counter on the dashboard, the
refusal screen, the injection-defeated evidence in the video. All of it counts exactly the
transactions that produce nothing.

The Firehose block model carries every transaction with its receipt and status, so the Substreams
module can see reverted transactions and decode the revert reason. The subgraph provably cannot.

**So: do not write a `Refusal` handler expecting an event to call it. Nothing ever will.** `Refusal`
entities are produced by the Substreams module and enter through the SPS path or a direct write.

This also settles how the Graph filing should be argued. "Substreams feeds the subgraph" is a
decoration claim and every entrant makes it. "The headline number on our dashboard cannot be
produced by a subgraph at all, and here is why" is a reason.

## Decision 4 — the reference join is Chainlink at the fill's block

`FillQuality.referencePrice` is read from the same Chainlink feed the registry scores against, at the
block of the fill. Two consequences that must not be smoothed over:

- The subgraph cannot call `latestRoundData` for a historical block, so the reference comes from
  indexing the feed's own `AnswerUpdated` events and taking the most recent at or before the fill.
- That means `FillQuality` carries the **age** of the reference it used. A fill scored against a
  20-minute-old reference is a weaker measurement than one scored against a 3-minute-old reference,
  and the daily report says so rather than averaging them together silently.

## Field naming

`protocol.slug` follows the standard: `aqua`, `uniswap-v3`. `Floor` and `FillQuality` ids are the
`Swap` id and `{recipient}-{base}-{quote}` respectively, both `Bytes` per the standard's convention.
