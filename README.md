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

An AI agent can trade for you around the clock. To do that it needs access to your money — and the
moment it has that, one bad prompt is all it takes.

```
   you give the agent access    →    someone poisons what it reads
                                →    it dumps your bag at any price
                                →    your money is gone
```

Today's answer is to watch the agent and try to catch bad behaviour. But a watcher is a program
forming an opinion, and **the same attacker who fooled your agent can fool the thing watching it.**

## The solution

A vault where you set one number — the worst price you will accept — and the exchange itself
refuses anything below it.

```
   agent gets hacked     →   tries to dump 38% below market
   your floor            →   ✗ reverted
   your balance          →   unchanged
```

**We watch nothing.** Your floor is arithmetic inside the code that moves the tokens. An agent
cannot route around it, switch it off, or argue with it. Watching can be fooled; a number cannot.

## How it works

```
   1  DEPOSIT        your tokens go into a vault you own

   2  SET ONE NUMBER "never below $2,463"
                     raising it later is free and instant

   3  GIVE A PERMIT  the agent gets permission to trade
                     it never gets your keys

   4  IT TRADES      all day, without asking you anything

                                ↓

      every fill  ──►  above your number, or it does not happen
```

And we prove it rather than promise it: millions of hostile trading programs were generated and run
against the vault, plus a machine-checked proof covering every program that could ever exist.

## What you get

| | |
|---|---|
| **You keep custody** | the agent gets a trading permit, never your keys |
| **Raising your floor is free** | one click, no device, instant |
| **Lowering it needs your hardware wallet** | so nobody, including a hacked agent, can move it |
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
