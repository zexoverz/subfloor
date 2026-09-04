# SUBFLOOR

<div align="center">

**An agent trades your whole portfolio. The worst price is the one you set.**

[![Base](https://img.shields.io/badge/Live%20on-Base-0052FF?style=for-the-badge)](https://basescan.org)
[![ERC-8377](https://img.shields.io/badge/Implements-ERC--8377-6E56CF?style=for-the-badge)](https://github.com/ethereum/ERCs/pull/1935)
[![Built on](https://img.shields.io/badge/1inch-Aqua%20%2B%20SwapVM-1B314F?style=for-the-badge)](https://github.com/1inch/swap-vm)
[![MIT License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

## What it is

A vault where an autonomous agent trades your whole multi-token portfolio, and one thing is
impossible by arithmetic: **a fill below the worst price you signed.**

```
┌──────────────────────────────────────────────────────────────┐
│              WHAT EVERY OTHER DEFENCE DOES                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  A guard reads the transaction and asks:                     │
│                                                              │
│     "does this look malicious?"                              │
│                                                              │
│  • answered by a model, a heuristic, or a score              │
│  • which can be wrong                                        │
│  • and can itself be prompt-injected                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘

                          ↓ SUBFLOOR ↓

┌──────────────────────────────────────────────────────────────┐
│                    ASKS NOTHING AT ALL                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  The floor is arithmetic in the settlement function —        │
│  the one place tokens actually move.                         │
│                                                              │
│  • no classifier, no score, no verdict                       │
│  • not an opcode a program can leave out                     │
│  • an empty program still settles, still hits the check      │
│                                                              │
│  A detector can be wrong. A bound cannot.                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Three legs, three ways a guarantee fails

A guarantee can be **unenforced**, **forged**, or **unverifiable**. Each leg closes exactly one.

| Failure | Closed by |
|---|---|
| **Unenforced** | A recipient-keyed floor consulted inside `swap()` settlement, for both parties, mirrored in `quote()`. Program bytecode cannot reach it or skip it. |
| **Forged** | The machine that trades is never the machine that defines "worst". The agent holds a delegate credential; the mandate and every floor-lowering are signed on hardware. |
| **Unverifiable** | A public Substreams-fed subgraph recomputes every fill against every floor. The guarantee is not our claim about our own execution — it is anyone's query. |

## The agent has full authority and still cannot sell you short

The delegate surface is exactly compose, ship, dock, update-quote. **No arbitrary-call passthrough,
no delegate-reachable `approve` or `transfer`**, and vault approvals go only to canonical Aqua,
finite rather than infinite.

So the demo is not a story about a well-behaved agent. It is a compromised one: a poisoned data
feed, an agent that obediently broadcasts a sell far below market, and a settlement that refuses it
with balances unchanged — then the same attack again with every guard instruction stripped out of
the program, refused identically.

## Verified

<!-- filled during the build; every row links to a real transaction -->

| What | Address / tx | Network |
|---|---|---|
| `GuardedSwapVM` | _pending_ | Base |
| `FloorRegistry` | _pending_ | Base |
| `AquaGuardVault` | _pending_ | Base |
| Injection refused | _pending_ | Base |
| Guard-stripped retry refused | _pending_ | Base |

## Built on

Canonical Aqua `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` and SwapVM
`0x111111338c5091E8440b67B168bAe16a668AC0De`, both live on Base. The modified router is a
redeployment of SwapVM, which the protocol permits; Aqua itself is used as deployed.

Reference price from Chainlink ETH/USD on Base
[`0x71041ddd`](https://basescan.org/address/0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70), with a
staleness bound measured from the feed's real inter-round gaps rather than guessed.

## Standard

SUBFLOOR implements **ERC-8377 (Reference-Relative Slippage Bounds)**, a draft standard authored by
this repo's author ([ethereum/ERCs #1935](https://github.com/ethereum/ERCs/pull/1935), public since
August 2026). The specification is public prior art; every line of implementation here was written
during the event, and none of the ERC's reference implementation is reused.

## License

MIT.
