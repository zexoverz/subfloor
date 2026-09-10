# subfloor_refusals

Fills that a recipient-keyed price floor turned away, on Base Sepolia.

The floor is checked inside `swap()` on a forked 1inch SwapVM router, between taker validation and
the transfers. When a fill would settle below it, the transaction reverts with
`SettledBelowFloor(recipient, tokenIn, tokenOut, executionRate, floorRate)`.

**A revert emits no logs.** That is why this module exists rather than a subgraph handler: nothing
log-driven can observe a refused fill. The Firehose block model carries every transaction with its
status and its full call tree, so the revert payload can be read and decoded there.

The module walks the call tree rather than only the outermost frame, because a revert can come from
a nested call and taking only the top level loses refusals routed through an aggregator. It decodes
only the `SettledBelowFloor` selector — most reverts are ordinary failures and counting those would
inflate the one number that has to be exact.

Rates are emitted as decimal strings in the canonical convention, `received * 1e18 / given`. They
routinely exceed `u128` and cannot be narrowed without corrupting the reported number.
