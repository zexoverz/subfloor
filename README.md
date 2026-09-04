<div align="center">

# SUBFLOOR

### Let an AI agent trade your portfolio. Set one number. Your money can never go below it.

[![Base](https://img.shields.io/badge/Live%20on-Base-0052FF?style=for-the-badge)](https://basescan.org)
[![1inch](https://img.shields.io/badge/1inch-Aqua-1B314F?style=for-the-badge)](https://github.com/1inch/swap-vm)
[![Ledger](https://img.shields.io/badge/Ledger-Key%20Ring-000000?style=for-the-badge)](https://developers.ledger.com)
[![ERC-8377](https://img.shields.io/badge/ERC--8377-6E56CF?style=for-the-badge)](https://github.com/ethereum/ERCs/pull/1935)

</div>

---

## How it works

```
   YOU                                          YOUR MONEY
   ┌────────────────────┐
   │ deposit tokens     │  ─────────────────►   sits in your vault
   └────────────────────┘
   ┌────────────────────┐
   │ set one number:    │  ─────────────────►   "never below $2,463"
   │ your worst price   │
   └────────────────────┘
   ┌────────────────────┐
   │ hand the agent     │  ─────────────────►   it trades all day.
   │ a trading permit   │                       you do nothing.
   └────────────────────┘

                            ↓

   every fill  ──────►  above your number, or it does not happen
```

That is the whole product. Set one number, stop thinking about it.

## What if the agent goes rogue

It cannot hurt you. That is the point.

```
   agent gets hacked     →   tries to dump 38% below market
   your floor            →   ✗ reverted
   your balance          →   unchanged
```

Most agent-safety tools watch the agent and try to spot bad behaviour. Watching can be fooled.
**We watch nothing.** Your floor is arithmetic inside the code that moves the tokens — an agent
cannot route around it, switch it off, or talk it out of anything.

And we prove that rather than promise it: millions of hostile trading programs generated and run
against it, plus a machine-checked proof covering every program that could ever exist.

## What you get

| | |
|---|---|
| **You keep custody** | the agent gets a trading permit, never your keys |
| **You set the limit** | one number; raising it is free and instant |
| **Lowering it needs your hardware wallet** | so nobody, including a hacked agent, can move your floor |
| **One button kills the agent** | revoke mid-trade, funds stay put |
| **Anyone can check** | every fill is public and recomputed against your floor |

## Live on Base

<!-- filled during the build -->

| | |
|---|---|
| Vault | _pending_ |
| Floor registry | _pending_ |
| A rogue agent, refused | _pending_ |
| A normal day of trading | _pending_ |

Real money from day one. Everything on this page comes from the live deployment.

## Built with

**1inch Aqua** — the floor lives inside the trading engine, not in an app on top of it, which is why
no program can skip it. **Ledger** — your floor and the agent's permit are signed on your device, so
the machine that trades is never the machine that sets the limit. **The Graph** — a public index
recomputes every fill against every floor, so the guarantee is anyone's query rather than our word.

Implements **[ERC-8377](https://github.com/ethereum/ERCs/pull/1935)**, a draft standard written by
this project's author.

MIT.
