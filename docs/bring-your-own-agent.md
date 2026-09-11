# Running your own agent against your own vault

The vault does not care whose agent trades it. The delegate is an address you nominate, and the
whole surface it can reach is four calls. This is what it takes to be that address.

It is worth saying up front what you are *not* trusting when you point a vault at an agent — yours
or anyone's.

## What a delegate can do, in full

`ship`, `dock`, `updateQuote`, `rescueApproval`. That is the entire surface.

There is no `transfer`, no `approve`, no arbitrary-call passthrough. `execute` exists and is
owner-only. `testFuzz_noDelegateCallMovesValueOrApprovesAnyoneButAqua` fires arbitrary calldata at
the vault as the delegate, 256 runs a suite, and asserts no token ever leaves and no spender but
Aqua is ever approved.

So a delegate key that is stolen cannot take anything. It can trade badly, and how badly is bounded
by two things you set: the floor, and the per-token caps in the mandate.

## The three keys, and why they are three

| | Holds | Used |
|---|---|---|
| **owner** | your wallet | once at setup, then for withdrawals |
| **delegate** | the agent's machine | continuously, unattended |
| **guardian** | hardware, ideally | to sign mandates, and to lower a floor |

The delegate is online and signing all day, so it is the one that will eventually be compromised.
Everything about the design follows from assuming that: it holds no funds, it cannot move any, and
the thing that could weaken its bounds is a different key it has never seen.

## Getting authority

Since #253 a mandate is **one signature for as long as it lasts**. The vault checks it on every ship
and re-quote until its expiry, the per-token cap binds what is live at once rather than each call,
and only expiry or `revokeMandate(nonce)` (the owner or the guardian, never you) retires it. An agent
that re-centres every few minutes needs one.

```ts
import { issueBatch, mandateDigest, MandateBook } from "./agent/src/vault/mandates.ts";

const [mandate] = issueBatch(
  {
    delegate: AGENT,
    app: ROUTER,
    tokens: [WETH, USDC],
    maxAmounts: [1n * 10n ** 18n, 5_000n * 10n ** 6n],
    expiry: BigInt(Math.floor(Date.now() / 1000) + 14 * 86_400),
  },
  firstNonce,
  1,
);

console.log(mandateDigest(VAULT, chainId, mandate));
```

Hand that digest to the guardian. On hardware it renders as a sentence rather than a hash, because
`contracts/erc7730/eip712-AquaGuardVault.json` describes the type — the agent, the tokens, the caps,
the expiry. Approving a hash is a ritual; approving that is a decision.

Then the agent holds the signature and ships under it until it expires:

```ts
const book = new MandateBook([{ mandate, signature }]);
const next = book.next(nonce => onChainMandateRevoked(nonce), BigInt(now));
```

Revocation is read from the chain, not remembered. The owner or the guardian can withdraw a mandate
at any moment, and an agent shipping on a signature it had cached would find out as a revert.

When the mandate expires or is revoked, the agent stops. That is the point of it being bounded — an
agent that could mint its own authority would not need the guardian at all.

A vault from a factory deployed before #253 still spends one mandate per ship. For one of those, sign
several with `issueBatch(template, firstNonce, n)` and the book spends them lowest nonce first.

## Deciding

`agent/src/policy/decide.ts` is a pure function from market state to one of five actions. Every
branch that stops trading comes before every branch that trades, so there is no path to a quote that
has not already passed each reason to stop: the index reporting errors, the index lagging the chain,
no reference, a stale reference, no venue mid, no mandate left.

That ordering is the fail-closed rule written as control flow rather than as a comment. Reuse it or
write your own, but keep the shape: **the reasons to stop are not conditions to weigh against the
reasons to trade.**

The loop reads the index every cycle and prints what it read beside what it decided:

```
[index] block 46536292 (head 46536295, lag 3) errors=false strategies=6 refAge=631s
[policy] recenter — the mid has moved 86 bps from the book's centre, past the 50 bps band
```

Kill the index and it docks rather than falling back to reading the chain directly. It could fall
back. It deliberately does not: the argument for putting the index in the trading path is that its
absence stops trading rather than degrading into a version nobody tested.

## Composing and shipping

`agent/src/compose/book.ts` turns market state into SwapVM bytecode, and its test asserts the bytes
are identical to what `ConcentratedBook.build` produces on chain for the same parameters. Two
implementations of one wire format only stay in step if the test pins the number rather than the
neighbourhood — an earlier version divided before scaling, matched every opcode, and produced
different bytes.

```ts
const program = composeBook({ referencePrice, spreadBps: 50, feeBps: 3000, decayPeriodSeconds: 600, salt });
const calldata = updateQuoteCalldata({ ...args, oldStrategyHash, mandate: next.mandate, signature: next.signature });
```

`updateQuoteCalldata` docks the live book and ships its replacement in one call, so there is no
window where the vault has no book and the agent has to succeed twice to get back to trading.

The calldata is returned rather than sent. Whoever holds the delegate key decides how it is signed —
a bot with a hot key, a queue, or a person clicking a wallet all want the same bytes.

## Without writing code

`indexer/mcp/` exposes the index and the composer over MCP, so an off-the-shelf agent can ask what
the venue is doing and get back bytes it could ship:

```
floor_for            the floors registered for an address
execution_quality    p50/p99 against the same Chainlink answer settlement used
strategies           what is shipped, decoded into named instructions
recent_fills         and how each one landed
reference            how fresh the reference is
compose_book         market parameters in, shippable bytecode out
```

`compose_book` holds no key and sends nothing. It returns the program and the opcodes it decodes to,
so the caller can see what it is about to put on chain rather than trusting a hex string.

## What this deployment looks like, so you can check the shape

On Base Sepolia the three keys are genuinely three:

| | |
|---|---|
| owner | `0x9ebdC8ACc879a8284Ae5B3CecfbD280ec307aFA3` |
| delegate | `0x28Fb6255eF523Ed5d8689dAa8384320A6AB7be36` |
| guardian | `0x9ebdC8ACc879a8284Ae5B3CecfbD280ec307aFA3` — the dev key, until the device takes it |

The guardian being the same as the owner is the gap, and it is stated rather than hidden: until a
device holds it, the key that can lower the floor is a key on a machine. The architecture is right
and that one row is not yet demonstrated.

Strategy `0x2bb7b6de…` was shipped by the delegate under a mandate signed by the guardian — a
different key, off-chain, before the fact. That is the separation working rather than described.
