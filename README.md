<div align="center">

# SUBFLOOR

### Let an AI agent trade your portfolio. Set one number. Your money can never go below it.

[![Base](https://img.shields.io/badge/Live%20on-Base-0052FF?style=for-the-badge)](https://basescan.org)
[![1inch](https://img.shields.io/badge/1inch-Aqua-1B314F?style=for-the-badge)](https://github.com/1inch/swap-vm)
[![Ledger](https://img.shields.io/badge/Ledger-Key%20Ring-000000?style=for-the-badge)](https://developers.ledger.com)
[![ERC-8377](https://img.shields.io/badge/ERC--8377-6E56CF?style=for-the-badge)](https://github.com/ethereum/ERCs/pull/1935)

</div>

---

## The problem

An AI agent can trade for you around the clock. To do that it needs access to your money, and the
moment it has that, one bad prompt is all it takes.

```
   you give the agent access    →    someone poisons what it reads
                                →    it dumps your bag at any price
                                →    your money is gone
```

Today's answer is to watch the agent and try to catch bad behaviour. But a watcher is a program
forming an opinion, and the same attacker who fooled your agent can fool the thing watching it.

## The solution

A vault where you set one number, the worst price you will accept, and the exchange itself refuses
anything below it.

```
   agent gets hacked     →   tries to dump 38% below market
   your floor            →   ✗ reverted
   your balance          →   unchanged
```

We watch nothing. Your floor is arithmetic inside the code that moves the tokens. An agent cannot
route around it, switch it off, or argue with it. Watching can be fooled. A number cannot.

## How it works

```
   1  DEPOSIT        your tokens go into a vault you own

   2  SET ONE NUMBER "never below $2,463"
                     raising it later is free and instant

   3  HAND IT OVER   the agent can trade your inventory
                     it never gets your keys

   4  IT TRADES      all day, without asking you anything

                                ↓

      every fill  ──►  above your number, or it does not happen
```

We prove this rather than promise it. Millions of hostile trading programs were generated and run
against the vault, and a machine-checked proof covers every program that could ever exist.

## What you get

| | |
|---|---|
| You keep custody | the agent gets a trading permit, never your keys |
| Raising your floor is free | one click, no device, instant |
| Lowering it needs your hardware wallet | so nobody, including a hacked agent, can move it |
| One button kills the agent | revoke mid-trade, funds stay put |
| Anyone can check | every fill is public and recomputed against your floor |

## Built with

### 1inch

The first thing built inside SwapVM rather than on top of it. Aqua's thesis is programmable
liquidity you never hand away, and SUBFLOOR is the case that makes it hold under an adversary. The
floor sits in the settlement path itself, checked after taker validation and before tokens move, for
both sides, mirrored in `quote()`.

That matters because `MinRate`, the guard that exists today, is maker-side and lives in the program,
written by whoever writes the program. When the program's author is the agent you are defending
against, an in-program guard is a suggestion. A settlement invariant is not. We also add three
instructions to the `0x20` guard bank and run a property suite against the full instruction set.

An agent can be handed a whole portfolio on Aqua and still cannot hurt you. That is what turns Aqua
into somewhere agent capital can actually live.

### Ledger

Every hardware-wallet integration signs a transaction. This one signs the constraint the chain then
enforces on every transaction after it.

Your floor and the agent's permit are clear-signed on the device. Raising the floor is free and
device-free because it can only help you. Lowering it is the one dangerous action, so it is the one
the device owns, and ring revocation cuts the agent off mid-quote. The security claim only holds
because of this split. "Even a hacked agent cannot go below your floor" is circular if the
floor-setting key sits on the machine the agent runs on.

The device is not a confirmation step. It is where the economic rule is authored.

### The Graph

A guarantee nobody can check is not a guarantee. A Substreams package decodes canonical Aqua
settlements into a subgraph on the DEX Aggregator standardized schema, a listed Messari schema no
one has ever implemented, alongside the Token API.

The index is load-bearing twice. The floor-setting screen reads it, showing realized adverse
deviation p50 and p99 from live history, so the number a human signs is calibrated rather than
guessed. And the daily execution-quality report is generated from it, query attached, so the
guarantee is not the operator auditing their own fills.

This is what indexing is for. Not a dashboard beside the product, but the thing that makes the
product's promise checkable by a stranger.

## Live on Base

**[subfloor.vercel.app](https://subfloor.vercel.app)**

<!-- filled during the build -->

| | |
|---|---|
| Vault | _pending_ |
| Floor registry | _pending_ |
| A rogue agent, refused | _pending_ |
| A normal day of trading | _pending_ |

Real money from day one. Everything on this page comes from the live deployment.

## The standard

Implements [ERC-8377 (Reference-Relative Slippage Bounds)](https://github.com/ethereum/ERCs/pull/1935),
a draft standard written by this project's author. The specification is public prior art. Every line
of implementation here was written during the event.

MIT.
