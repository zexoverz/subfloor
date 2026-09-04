# Event map

What the indexer consumes, with the topic hashes, so the Substreams module, the subgraph and the
dashboard agree on one schema. Every signature here was read off the source on 4 Sep and every
topic0 was computed with `cast keccak`, not copied from anywhere.

## Canonical Aqua — `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` (Base)

| Event | Signature | topic0 |
|---|---|---|
| Shipped | `Shipped(address,address,bytes32,bytes)` | `0xdc3622e06fb145651f567d421c9ef261d71d43e3778b761907bc0d70d42e52b0` |
| Docked | `Docked(address,address,bytes32)` | `0xd173a1d140c154eb1ce9298d251d5eb8c4089cc2d16e70f1067bdc810c6fe004` |
| Pulled | `Pulled(address,address,bytes32,address,uint256)` | `0x3ad61047071575417c75e3311e5d46ff042e292b5dd8769ff18b4b254098ca7a` |
| Pushed | `Pushed(address,address,bytes32,address,uint256)` | `0x3f18354abbd5306dd1665c2c90f614a4559e39dd620d04fbe5458e613b6588f3` |

Parameter order for all four is `(maker, app, strategyHash, …)`.

## The router — `FloorRouter`, our deployment

| Event | Signature | topic0 |
|---|---|---|
| Swapped | `Swapped(bytes32,address,address,address,address,uint256,uint256)` | `0x54bc5c027d15d7aa8ae083f994ab4411d2f223291672ecd3a344f3d92dcaf8b2` |

Order: `(orderHash, maker, taker, tokenIn, tokenOut, amountIn, amountOut)`.

## FloorRegistry — ours, and these *are* indexed

| Event | Signature | topic0 |
|---|---|---|
| FloorRaised | `FloorRaised(address,address,address,uint256,uint256)` | `0xda9cf44e2b729b118c14ddb22669e0c62d60a94c484d886f98a360bdd88a2ae1` |
| FloorLowered | `FloorLowered(address,address,address,uint256,uint256,address)` | `0x31c315154f88f9afaa9db9ede1ca6ed3e31a94b5b5eac310dfa010d02c7f3c7d` |
| ToleranceTightened | `ToleranceTightened(address,address,address,uint16,uint16)` | `0x3fdc2221d481a987e1095b36ad5791490a70c29896831b5e46f077df4b579db0` |
| ToleranceWidened | `ToleranceWidened(address,address,address,uint16,uint16,address)` | `0x0ed127de88eade12af12d6e3110a200b019861b068b03767065d09f073681c84` |

`recipient`, `base` and `quote` are indexed on all four, so floor history for one recipient is a
topic filter rather than a scan.

## Two things that change how the indexer is built

### Nothing upstream is indexed

Not one parameter on any Aqua event, and not one on `Swapped`, is `indexed`. `maker`, `app`,
`token`, `strategyHash`, `taker` — all of them live in the data blob.

- These can only be filtered by contract address and topic0. Every `Pulled` on canonical Aqua comes
  back, for every maker and every app on the venue, and narrowing to our vault happens after
  decoding. Size the HyperSync and Firehose work for that volume rather than assuming a maker
  filter exists.
- `Shipped` carries the whole strategy blob in `data`, which is where the SwapVM program bytecode
  lives. That is the decoder's input, and it is why `Shipped` logs are large.

Our own events were made `indexed` deliberately, because the floor-setting screen reads floor
history per recipient and that should be a filter, not a scan.

### The refusal counter cannot come from the subgraph

**A refused fill emits nothing.** `SettledBelowFloor` is a revert, not an event — error selector
`0x027e4c46` — and a reverted transaction produces no logs at all. A subgraph is driven by logs, so
every refusal is invisible to it. That matters because the refusal is the product: the dashboard's
revert counter, the refusal screen, and the injection-defeated demo evidence all depend on counting
exactly the transactions that produce no events.

Substreams can see them. The Firehose block model carries every transaction with its receipt and
status, so a Substreams module can count reverts and decode their revert reason, which an
event-driven subgraph cannot do at all.

This is worth saying plainly in the Graph filing: Substreams is not decoration on top of a subgraph
that would have worked anyway. It is doing something the subgraph provably cannot, and the headline
number on the dashboard is the thing it is doing.

Practical consequence for whoever wires this up: refusals come from the Substreams module reading
transaction status, never from an event handler. Do not design a `Refusal` entity that a subgraph
handler is expected to populate — nothing will ever call it.
