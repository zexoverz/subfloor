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
  └── FillQuality      reference at block, and the fill scored from **both** sides
  └── Floor            current floor per (recipient, base, quote)
  └── FloorChange      raised / lowered, with the guardian that signed a lowering
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

**So there is no `Refusal` entity, and that is deliberate.** One was declared for a while and nothing
ever wrote it, because nothing can. An entity that is always empty is worse than a missing one: a consumer
querying `refusals` gets `[]` and reads it as "the floor has never had to hold", which is the exact
opposite of what the empty list means — on the number this whole project is about.

Refusals are served by **`/api/refusals`**, which walks the router's transaction history through
HyperSync, filters on status, and recovers each revert payload by replaying the call one block
earlier. `indexer/substreams/` decodes the same thing from transaction status. Either way the point
holds and is the reason the composition exists: the headline number is structurally outside the
subgraph.

This also settles how the Graph filing should be argued. "Substreams feeds the subgraph" is a
decoration claim and every entrant makes it. "The headline number on our dashboard cannot be
produced by a subgraph at all, and here is why" is a reason.

### Publishing the package

The `.spkg` is a build artifact and is gitignored, so it is rebuilt rather than committed. Publishing
needs a substreams.dev account and `substreams registry login` opens a TTY prompt, so it cannot be
scripted from an agent session.

```bash
cd indexer/substreams
substreams pack                       # writes subfloor-refusals-v0.1.0.spkg
substreams registry verify subfloor-refusals-v0.1.0.spkg   # must print no warnings
substreams registry login             # paste the token from https://substreams.dev/me
substreams registry publish
```

`logo.png` is committed on purpose and the root `.gitignore` carries an explicit negation for it.
Without it `package.image` resolves to nothing, `substreams pack` fails on a fresh clone, and the
registry listing goes up with a blank tile. `package.doc` is deprecated: the registry description is
taken from `indexer/substreams/README.md`, which is why that file is written for a stranger reading
the listing rather than for us.

Link the published package from the README once it is up. A package on disk is worth nothing to a
judge.

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

## FillQuality scores both sides, and the maker's is the one to render

A settlement scores two parties. `checkSettlement` passes the taker recipient and the maker recipient
separately, each against its own floor, and the index used to compute only the taker's.

That made the headline execution-quality number a statement about how well the **counterparty** did.
On the live deployment it read `+32 bps` and looked like the vault executing well; the same fills were
the vault paying 32 bps through the reference. The sign was backwards on the number the product is
about.

| Field | Whose |
|---|---|
| `executionRate`, `adverseDeviationBps`, `takerFloorAtFill` | the taker's |
| `makerExecutionRate`, `makerAdverseDeviationBps`, `makerFloorAtFill` | the maker's — the vault |
| `maker`, `taker` | so a screen can filter to one vault |

**A floor screen or a refusal card wants the `maker` fields.** `ExecutionQualityDailySnapshot` rolls
up the maker's deviation for the same reason: the number a maker needs is how its own fills landed.

One approximation, stated rather than buried: `Swapped` carries no fee breakdown, so the maker side
inverts the taker's amounts rather than reproducing `amountIn - feeIn` and `amountOut + feeOut`. Where
the fee is charged in `tokenIn` the maker's realised rate is a little better than this says.

`makerFloorAtFill` is the floor that **binds**, not the backstop: `max(ceil(reference * (10000 - bps)
/ 10000), absoluteRate)`, mirroring `FloorRegistry.effectiveFloor`. Storing `absoluteRate` alone made
every row read `0`, because this deployment configures tolerance-only floors — an answer-shaped null
that a refusal card would have rendered as fact.

## The Network enum has no Base, and that is a finding rather than a workaround

`dex-agg` v1.0.2's `Network` enum stops at the chains that existed when it was written:
`ARBITRUM_ONE`, `AVALANCHE`, `BSC`, `CELO`, `CRONOS`, `MAINNET`, `FANTOM`, `FUSE`, `GNOSIS`,
`HARMONY`, `MATIC`, `MOONBEAM`, `MOONRIVER`, `OPTIMISM`, and a handful of non-EVM chains. There is no
`BASE`, and no `BASE_SEPOLIA`.

A subgraph that writes `network: "BASE"` does not fail at build, or at codegen, or in Matchstick. It
fails at the database, on commit:

```
Failed to transact block operations: writing DexAggProtocol entities at block 46516708 failed:
invalid input value for enum sgd909058.network: "BASE"
```

At **99% synced**, after indexing every other entity correctly, and after successfully processing
the fills. graph-node then rolls the batch back, so `_meta.block` reports the start block again and
the subgraph looks like it never started — which is what sent this build chasing three wrong causes
before the Studio UI showed the actual error.

**We added both values to the enum rather than writing a network the protocol is not on.** That is a
deviation from the published schema and it is recorded here because the filing claims to be the
first implementation of it: being first is how you find that a listed standardized schema cannot
express a chain that has been live for two years.

`DexAggProtocol.network` is read from `dataSource.network()` rather than hardcoded, so the mainnet
and Sepolia manifests cannot disagree with the row they write.

**Worth reporting upstream**, and worth saying in the submission: the value of implementing a
standard first is that you find where it stopped, and this is a concrete place it stopped.
