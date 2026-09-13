<div align="center">

# SUBFLOOR

### Let an AI agent trade your portfolio. Set one number. Your money can never go below it.

<img width="1886" height="944" alt="image" src="https://github.com/user-attachments/assets/820705dc-1ebb-4c89-a468-65302215fd18" />


[![Base Mainnet](https://img.shields.io/badge/Live%20on-Base%20Mainnet-0052FF?style=for-the-badge)](https://basescan.org/address/0xE291ddE058a1Fb128B8baA3a7F80BB12Eca5b171)
[![1inch swap-vm#197](https://img.shields.io/badge/1inch-swap--vm%20%23197-1B314F?style=for-the-badge)](https://github.com/1inch/swap-vm/pull/197)
[![Ledger](https://img.shields.io/badge/Ledger-Key%20Ring-000000?style=for-the-badge)](https://developers.ledger.com)
[![ERC-8377](https://img.shields.io/badge/ERC--8377-6E56CF?style=for-the-badge)](https://github.com/ethereum/ERCs/pull/1935)

**Live on Base mainnet with real money.** Every fill, every refusal, every reverted attack below is a
transaction you can open on [basescan.org](https://basescan.org/address/0x441EE52d939E46A33919C4295e88d32458797503).
The agent's key is public and its vault holds real funds — [the bounty](#the-bounty) is standing:
break the floor, keep what is inside. Upstream, we found and fixed a live giveaway in 1inch SwapVM,
offered as [`1inch/swap-vm#197`](https://github.com/1inch/swap-vm/pull/197).

</div>

---

## How this was built

`docs/SPEC.md` is the document that directed it — settled decisions, measurements with their
provenance, and the traps that had already cost time. It is published because ETHOnline's rules ask
for the spec, prompts and planning artifacts of a spec-driven build, and because it is the honest
answer to how much of this was directed rather than generated.

Two things in it are redacted in place: our own win estimates, and assessments of other teams read
from their public repositories. Marked rather than deleted, so the gaps are visible.

The git history is the other half. Small commits, in order, including the reversals — the router
redeployed because it matched no commit, the execution-quality number that had the wrong sign for a
day, the harness that could not produce the refusal it existed to demonstrate.

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

We prove this rather than promise it, in three layers that answer different questions.

**No program can avoid the check.** It runs where tokens move, after the trade is validated and
before anything transfers. Program code cannot reach that point or skip it, so there is nothing for
an attacker to leave out. That is architecture, not a promise.

**Hostile programs are thrown at it continuously.** Randomly generated trading bytecode, fired by
CI every six hours, including programs that hand control to an attacker-chosen contract mid-trade.
None has ever settled below a floor. The running count is
[published in this repo](docs/fuzz-counter.json) and every increment maps to a CI run you can open.

**And the check itself is machine-verified, in both directions.** If it passes, what moved was at
or above the floor; if what moved was below the floor, it reverts. For every possible input, in
0.31 seconds, reproducible. What that proof does and does not cover is written out in
[docs/proof.md](docs/proof.md) — including the part still covered by fuzzing rather than proof.

## Architecture

The floor is checked **between validation and transfer**, inside the settlement function itself.
That position is the entire design — it is why no program can avoid it.

```
  SETUP — who is allowed to trade, and inside what

    agent                    AquaGuardVault                  canonical Aqua
      │                      (the maker)                          │
      │   ship / dock /            │                              │
      ├─── updateQuote ──────────► │ ── mandate signed on ───────► │  inventory
      │   nothing else             │    the owner's device         │  committed
      │                            │                               │
      └── holds a delegate key, never a key to funds ──────────────┘


  SETTLEMENT — one swap, and where the floor sits

    taker ──► FloorRouter.swap()          (forked SwapVM)
                     │
                     ├─ 1. runLoop()                 program executes
                     │                               amounts computed
                     │                               ── no tokens move ──
                     │
                     ├─ 2. order.traits.validate()
                     │     takerTraits.validate()
                     │
                     ├─ 3. ★ _settlementGuard() ──►  FloorRegistry
                     │        both recipients            .checkSettlement()
                     │        scored post-fee            reverts
                     │                                   SettledBelowFloor
                     │
                     └─ 4. _transferIn() / _transferOut()
                              ▲
                              └── tokens move only past this line
```

Program bytecode runs in `runLoop` and cannot reach or skip what comes after it. A program that
carries no guard instruction at all still arrives at the check; there is nothing to omit. The
identical call sits in `quote()`, so a quote can never report a price the settlement would refuse.

## Contracts

| Contract | What it does |
|---|---|
| `FloorRegistry` | The worst rate each recipient accepts, keyed to the recipient rather than chosen per order. Reference-relative tolerance plus an absolute backstop; the stronger of the two binds |
| `GuardedSwapVM` | The fork. One hook in `swap()` and one in `quote()`, three hunks against upstream `f09a41e` |
| `FloorRouter` | The deployed router: Aqua opcodes, the settlement guard, and three new `0x20` guard instructions |
| `AquaGuardVault` | The smart account that **is** the Aqua maker. The agent holds a delegate credential whose whole surface is ship / dock / updateQuote / rescueApproval |
| `VaultFactory` | Deploys a vault owned by whoever asks. Holds nothing, owns nothing, cannot act on what it creates — a factory that could would put a trusted party back into a design whose argument is that there is not one |
| `ControlFloorRouter` | The control arm. Same floor, but as an opcode a program can decline to include — it exists to be broken, and it is |
| `SettlementFeeLib` | Mirrors the protocol fee arithmetic without moving anything, so the maker is scored on what it actually receives |

Three instructions were added to the free slots in the `0x20` guard bank:
`RequireFreshReference` (0x22), `NotionalThrottle` (0x27), `ApprovalGate` (0x28).

`sdk/` composes SwapVM programs from TypeScript. Its encoders are asserted byte-for-byte against
output from the instruction libraries the VM actually runs, printed by `EncodingVectors.t.sol` — an
off-chain encoder checked against hand-written expectations only proves it agrees with whoever wrote
them.

## Deployed

**Base mainnet** — the live run, on **canonical Aqua** and never a fork of it, against **real
WETH/USDC**. Every contract is fresh-deployed and Sourcify `match`; the router went out through
`forge create` so the bytes on chain are the bytes the verifier reproduces from this repo.

| Contract | Address | Verified |
|---|---|---|
| FloorRegistry | [`0xE291ddE058a1Fb128B8baA3a7F80BB12Eca5b171`](https://basescan.org/address/0xE291ddE058a1Fb128B8baA3a7F80BB12Eca5b171) | Sourcify |
| FloorRouter | [`0x441EE52d939E46A33919C4295e88d32458797503`](https://basescan.org/address/0x441EE52d939E46A33919C4295e88d32458797503) | Sourcify |
| VaultFactory | [`0x653363d9EfE33898DB7948FB78EB30c43e0B8498`](https://basescan.org/address/0x653363d9EfE33898DB7948FB78EB30c43e0B8498) | Sourcify |
| AquaGuardVault (bounty) | [`0xf50E5b4f6DD1e70181dB9Da544127AFEc5a334CE`](https://basescan.org/address/0xf50E5b4f6DD1e70181dB9Da544127AFEc5a334CE) | — |
| AquaGuardVault (second maker) | [`0xb613D32b819FB8b47AA219B8c6040Bd3BfB58E1c`](https://basescan.org/address/0xb613D32b819FB8b47AA219B8c6040Bd3BfB58E1c) | — |
| Aqua (canonical, not ours) | [`0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a`](https://basescan.org/address/0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a) | canonical |
| Chainlink ETH/USD aggregator | [`0x05c84a58FE042275b37db038bAAcD15F410c7bB0`](https://basescan.org/address/0x05c84a58FE042275b37db038bAAcD15F410c7bB0) | — |
| WETH / USDC | `0x4200…0006` / `0x8335…2913` | canonical |

The agent's delegate is [`0xFfCc8ee2…`](https://basescan.org/address/0xFfCc8ee26a9aA8c3b4DddBf4a5aE957CBd509242)
— its key is **published on purpose** for [the bounty](#the-bounty); it can ship, dock and re-quote,
and it cannot lower a floor or move a token out. That containment is a mined transaction:
[`0xbbd9151d…`](https://basescan.org/tx/0xbbd9151d9dcff513abfc85806a19955907b98ddaaabfe1c915b621d646ce87a8)
is the delegate trying to widen the floor and the registry reverting `BadGuardianSignature`.

**Base Sepolia** — integration environment. Canonical Aqua exists on Ethereum Sepolia but on no L2
testnet, so this deploys its own from the same source. Byte-identical behaviour, different address;
mainnet uses canonical Aqua and never forks it.

| Contract | Address | Verified |
|---|---|---|
| FloorRegistry | [`0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123`](https://sepolia.basescan.org/address/0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123) | Sourcify |
| FloorRouter | [`0x03189D102286fa8cDd0fBF3578B492e67e665A27`](https://sepolia.basescan.org/address/0x03189D102286fa8cDd0fBF3578B492e67e665A27) | Sourcify |
| VaultFactory | [`0x5c434a6C212F5A58FE1c78F63f10c5cf36ACcFb3`](https://sepolia.basescan.org/address/0x5c434a6C212F5A58FE1c78F63f10c5cf36ACcFb3) | Sourcify |
| AquaGuardVault (ours) | [`0x1168C48a74055486BC4D1E7036d3b1aC4bb75586`](https://sepolia.basescan.org/address/0x1168C48a74055486BC4D1E7036d3b1aC4bb75586) | Sourcify |
| Aqua (ours, not canonical) | [`0xA86da73e0c1b4C70cB9a924F57BaE9699198bbDB`](https://sepolia.basescan.org/address/0xA86da73e0c1b4C70cB9a924F57BaE9699198bbDB) | — |
| tUSDC (testnet stand-in) | [`0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD`](https://sepolia.basescan.org/address/0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD) | — |
| TestnetFaucet | [`0x044BB6a857A875e30f8933aDf652905d02EB65D2`](https://sepolia.basescan.org/address/0x044BB6a857A875e30f8933aDf652905d02EB65D2) | Sourcify |

**Setting a vault up is one transaction.** `createVault(setup)` deploys it, names the delegate and
the guardian, registers the guardian on the registry, and raises the floors on both directions —
ending owned by the caller.

It replaced six, and three of those were `execute` carrying ABI-encoded calldata that a wallet
renders as "Execute" over an unreadable blob. That is the shape a drainer asks for, and a poor
thing for a security product to teach someone in their first minute.

The friction was not the real cost. A vault could trade from the moment `createVault` returned, so
anyone who stopped halfway owned something that looked finished and had no floor. One call closes
that window rather than shortening it. Proven on chain: a fresh wallet, one transaction, and the
vault comes out owned, delegated, guarded on both sides and floored in both directions.

**Anyone can draw test tokens.** `TestnetFaucet.draw()` for yourself or `drawTo(address)` to fund a
wallet a screen just connected — 25,000 tUSDC, twelve-hour cooldown per recipient, and
`nextDrawAt(address)` so an interface can show a countdown instead of letting a transaction revert.
Before it the deployer was the only address that could mint, which made every flow start with asking
us for tokens.

**Why there is a stand-in for USDC here, and only here.** Circle's testnet USDC is not
permissionlessly mintable — `isMinter` is false for us and the masterMinter is Circle's — so funding
a two-sided book means going through their faucet by hand, for every address, every time. That
blocks the interface and the taker on something with nothing to do with the mechanism. `tUSDC` is
six decimals, so decimal handling is exercised exactly as it is on mainnet. The registry configures
**both** pairs: real WETH/USDC for what mainnet will use, WETH/tUSDC for what runs today. Mainnet
uses real USDC and this contract does not exist there.

The vault holds inventory, its floors are set **keyed to the vault** in both directions, and one
two-sided book is shipped and live under a mandate signed EIP-712 by the guardian.

**One signature covers fourteen days, not one ship** ([#253](https://github.com/zexoverz/subfloor/issues/253)).
A mandate names the delegate, the app, the tokens, a cap per token and an expiry, and the vault now
honours it for every ship and re-quote until it expires. The cap binds what is live at once rather
than each call, so re-centring a book cannot add up past what the guardian signed, and
`revokeMandate(nonce)` lets the owner or the guardian withdraw one early. The delegate cannot. The
factory and vault in the table above are on this bytecode since 11 Sep. The vault before them,
`0xaf6b…`, had its books docked and its inventory moved across, and the factory before them,
`0xbfF5…`, still deploys the single-use version.

**The three keys are three, and on mainnet the third is a device.** Owner, delegate (the agent — its
key is published for [the bounty](#the-bounty)), and guardian, which here is the **Ledger**
[`0x1e0344df…`](https://basescan.org/address/0x1e0344df59a94D387bb051215AadC5DED63396e6) that
clear-signs the mandate and is the only key that can lower a floor. The delegate that trades cannot
touch it — a separation the chain enforces, not one described.

`docs/e2e-walkthrough.md` walks the whole thing from a cold wallet — vault, mandate, book, and the
floor turning a fill away — in about ten minutes. `docs/bring-your-own-agent.md` is what it takes to
be the delegate yourself.

**~$15 of real WETH and USDC** sits in the agent's vault on Base mainnet
([`0xf50E…`](https://basescan.org/address/0xf50E5b4f6DD1e70181dB9Da544127AFEc5a334CE)), and the key
that trades it — the agent's delegate — is published right here, in the open:

```text
delegate address       0xFfCc8ee26a9aA8c3b4DddBf4a5aE957CBd509242
delegate private key   0xbab55b2a08a11ddea01e178b75181698f243b7ffc6fc63a853f411c58a0ed953
```

Take it, write any program you like, and try to move one token below the floor the guardian set.
Whatever is in the vault is yours if you do.

Nothing about that is brave, and that is the point. The key reaches four calls — ship, dock,
re-quote, rescue an approval — and none of them is a transfer or a floor change. Settlement scores
both recipients after fees and reverts anything under the floor, so a hacked agent, a naked program,
and the published key itself all arrive at the same wall. A project that guards its agent by watching
it could never post its watcher's key; it would be drained in a block. This one can, because there is
nothing to fool.

Both refusals are already on chain, from this key itself:

- it tries to **sell below the floor** → [`0xa43eda4d…`](https://basescan.org/tx/0xa43eda4defd419908ebe2d01db70f3fe9c580a5afd3a3353e2f3e6d11a73b01c) reverts `SettledBelowFloor`, status 0
- it tries to **lower the floor** → [`0x7f9acec9…`](https://basescan.org/tx/0x7f9acec9ce242a6233dfbb25acd8cb3f5ebc49f8fbf9cbcd144b4788b433a957) reverts `BadGuardianSignature`, status 0

The counters on [subfloor.xyz](https://subfloor.xyz) read the chain: **fills** climb and **refused**
counts the below-floor reverts.

## The index

Every fill is recomputed against every floor by an independent index, so the guarantee is anyone's
query rather than our claim about our own execution.

```
https://api.studio.thegraph.com/query/1758825/subfloor-mainnet/v1.0.0
```

That is the Base mainnet subgraph the app reads today, free to query and capped at 3,000 queries a
day. The subgraph is **published to The Graph Network** on Arbitrum One as
[`ANp4ZK8i3NJxndoxydoQ8Lrw8CzUKB61boJfaNQdtcAR`](https://thegraph.com/explorer/subgraphs/ANp4ZK8i3NJxndoxydoQ8Lrw8CzUKB61boJfaNQdtcAR?chain=arbitrum-one)
— discoverable on the decentralized network, with the gateway serving it once an indexer allocates.
`/api/subgraph` asks the network gateway first when one is configured, falls back to Studio on a
402, a 429, an auth error or an empty answer, and fails closed when neither answers cleanly. The Base
Sepolia subgraph (`subfloor-base-sepolia/v3.1.0`) carries the longer execution-quality history and is
kept for that.

Built on the Messari **DEX Aggregator standardized schema v1.0.2** — a listed schema with no prior
implementations. SUBFLOOR-specific facts (`Floor`, `FloorChange`, `FillQuality`, `Refusal`) hang off
the standard entities by id rather than modifying them, so anyone who knows `dex-agg` can query this
subgraph without reading our docs.

```graphql
{ floorChanges(orderBy: timestamp) {
    kind oldMaxAdverseBps newMaxAdverseBps guardian hash } }
```

**Shipped strategies are decoded.** Aqua stores a strategy as an opaque blob and the VM reads it only
at execution time, so nothing on the venue records what actually ran. `Strategy` carries the program
decoded into named instructions, plus a classification in the words an interface can show a person.
The opcode table is generated from `contracts/src/libs/OpcodeList.sol`, so a renamed or newly claimed
slot cannot drift out of the decoder silently.

```graphql
{ strategies(where: { active: true }) {
    classification families stepCount
    steps(orderBy: index) { index name args } } }
```

**Two consumers read it, which is what makes it load-bearing rather than a checkbox.**
`indexer/consumers/` serves `/calibration` — the floor-setting screen's default, derived as the p99
of realized adverse deviation over the trailing week rather than configured — and `/report`, the
daily execution-quality record, generated from the index with the query attached and never from
operator logs. Below 100 scored fills the calibration refuses to return a percentile at all and says
so, because a p99 over a dozen fills is a rumour with a decimal point.

Every answer either endpoint returns carries the query and variables that produced it. That is the
same reason the floor screen puts `[run query]` next to every number: a figure you can re-derive is
worth more than one you are asked to believe.

**An MCP server and a skill** over the same index are in `indexer/mcp/`, so an agent can ask the
venue a question without first learning the schema.

Both consumers are live at `https://web-production-37798.up.railway.app` — `/api/calibration` and
`/api/report` — served from the same origin as the site itself, so a number on screen and the query
behind it come from one place. `/api/fills` and `/api/refusals` sit beside them and read the chain
directly, so the interface still has something when the index does not.

**The taker runs as its own service**, from its own image with no HTTP listener. It holds a signing
key and serves nothing; the web service serves a public origin and holds no key. One image with both
would put a key behind a listener for no reason.

One detail decides the whole indexing design: **a refused fill emits nothing.**
`SettledBelowFloor` is a revert, reverted transactions produce no logs, and a subgraph is
log-driven. The refusal counter — the headline number — provably cannot come from a subgraph at all.
It has to come from something that sees transaction status. `indexer/substreams/` decodes exactly
that, and is published as [`subfloor-refusals`](https://substreams.dev/packages/subfloor-refusals/v0.1.0)
on substreams.dev, declared on Base Sepolia from the contracts' creation block. What serves the live
number today is `/api/refusals`, which walks the
router's transaction history through HyperSync, filters on status, and recovers each revert payload
by replaying the call. Either way the point stands and is the reason the composition exists: the
headline number is structurally outside the subgraph.

Proven rather than described — [`0xd8969d01…`](https://sepolia.basescan.org/tx/0xd8969d01cdce69b8d9dc258f07af56f9b1e84fc1f0fac17b7868c428b00827f0)
is a real reverted fill, and the endpoint decodes it to `SettledBelowFloor` with both rates.

## What is new here, stated precisely

**Not the first settlement-enforced price guarantee.** CoW Protocol's settlement contract already
enforces on-chain that no order clears worse than it specifies — **taker-side, per discrete order**.
A CoW order is its own floor, one signed order at a time.

**What has no precedent is the delegated-maker case.** Nothing covers a maker that hands continuous,
two-sided, programmatic authority over standing inventory to something else — which is exactly what
an agent-run book is. The property exists for taker orders; nobody gives it to delegated makers.

Four things follow from that, and each is checkable:

| | |
|---|---|
| **Recipient-keyed, not caller-chosen** | 1inch's own `TakerTraits.threshold` is optional and chosen by whoever calls. The floor here is keyed to the recipient and cannot be selected per order |
| **In settlement, not in the program** | Every prior design in this space makes the guard an instruction. `ControlFloorRouter` is that design, and an ordinary swap program that simply omits the opcode settles below the floor on it |
| **Both sides, post-fee** | The maker receives `amountIn` minus the fee. Scoring the pre-fee number would let a fill pass the check and still pay out below the floor |
| **First implementation of ERC-8377** | Reference-Relative Slippage Bounds, authored by this project's author. The specification is public prior art; every line of implementation here was written during the event |

## The attack this defends against, and what is honestly known about it

The demo runs a real prompt injection against a real agent holding real inventory. That is worth
being precise about, because the interesting claim is narrow and the uninteresting version of it is
easy to overstate.

**There is no verified real-money loss from data-channel injection of a trading agent in the public
record.** So this is a first in the sense that the attack has no casualty to re-enact — not in the
sense that nobody has demoed injection defence. People have. What is different here is that the
attack runs against money on chain and the refusal is a transaction anyone can open.

What is real and citable:

- **Zscaler ThreatLabz, Jul 2026** — SEO-poisoned pages carrying agent instructions in JSON-LD,
  CSS-hidden off-screen divs and `<noscript>`, telling agents to send ETH to attacker addresses.
  Four of twenty-six models paid. The harness's poisoned page uses the off-screen-div shape from
  this, verbatim, because a strawman attack would prove nothing.
- **Princeton, "Fake Memories" (arXiv:2503.16248)** — memory injection against ElizaOS substituting
  a transaction recipient, with real testnet transactions.
- **Freysa, Nov 2024** — a $47k real-money consented contest.

**Deliberately not cited: aixbt and Virtuals.** Both are commonly listed as injection precedent and
both were credential or dashboard breaches. A judge who knows the incidents catches the
misattribution, and it costs the credibility of everything cited beside it.

The harness is in `agent/src/injection/`, three cases, each reproducible from this repo.

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

**Upstream, we found and fixed a live giveaway in SwapVM.** `OraclePriceAdjuster` compares a
1e18-scaled Chainlink answer against a swap price computed from raw token amounts. On any pair whose
tokens differ in decimals — WETH/USDC included — the two are 1e12 apart, so the feed looks better on
every fill, the ratio saturates `min(priceRatio, 2e18 - maxPriceDecay)`, and the taker is handed the
cap. Measured through our own router: **5,046,836,538 out where the curve priced 2,523,418,269.
Exactly twice, and no revert.** No setting avoids it, because `maxPriceDecay < ONE` is required at
build, so some giveaway is always expressible.

[`1inch/swap-vm#31`](https://github.com/1inch/swap-vm/issues/31) had reported the scale mismatch and
been closed as out of focus; what was missing was that it pays out rather than merely misbehaves.
The fix scales the answer to `10 ** (18 + tokenOutDecimals - tokenInDecimals)`, which on an
eighteen-and-eighteen pair is the original instruction unchanged. It is in our fork with an
end-to-end test on an 18/6 book, written up as [counterexample 3](docs/counterexamples.md), and
offered upstream as [`1inch/swap-vm#197`](https://github.com/1inch/swap-vm/pull/197) with a test on
their own fixture, taking their suite from 797 to 803. The full write-up, including what was already
known and what was not, is in [`docs/upstream-contributions.md`](docs/upstream-contributions.md).

That counterexample is the one worth reading, because it is the one the floor does **not** catch. A
floor bounds how bad a fill can be; it does not make a wrong price right. Anything that treats a
settlement guard as a substitute for correct pricing has mistaken a backstop for a brake.

### Ledger

Every hardware-wallet integration signs a transaction. This one signs the constraint the chain then
enforces on every transaction after it.

Your floor and the agent's permit are clear-signed on the device. Raising the floor is free and
device-free because it can only help you. Lowering it is the one dangerous action, so it is the one
the device owns — that asymmetry is enforced on chain today, by the registry's guardian signature
check. Ring revocation, which cuts the agent off mid-quote, is the half still being wired. The
security claim only holds because of this split. "Even a hacked agent cannot go below your floor" is circular if the
floor-setting key sits on the machine the agent runs on.

The device is not a confirmation step. It is where the economic rule is authored.

### The Graph

A guarantee nobody can check is not a guarantee. The subgraph implements the DEX Aggregator
standardized schema, a listed Messari schema no one has ever implemented, and scores every fill
against the same Chainlink answer the settlement guard used — so a stranger can recompute any number
on the site from the public endpoint. A Substreams package sits beside it for the one thing a
log-driven index structurally cannot see, which is a refusal.

The index is load-bearing twice, and both consumers are built rather than planned. The floor-setting
screen's default is derived from realized adverse deviation over the trailing week, so the number a
human signs is calibrated rather than guessed — and below a hundred scored fills it refuses to return
a percentile at all and says so, because a p99 over a dozen fills is a rumour with a decimal point.
The daily execution-quality report is generated from the index with the query attached, never from
operator logs, so the guarantee is not the operator auditing its own fills.

This is what indexing is for. Not a dashboard beside the product, but the thing that makes the
product's promise checkable by a stranger.

## Where this actually is, right now

**[subfloor.xyz](https://subfloor.xyz)** — the live app on Base mainnet
(also at [web-production-37798.up.railway.app](https://web-production-37798.up.railway.app))

One origin, one image: the built site and the two consumers ship together from `Dockerfile`, which
is why a number on screen and the query behind it cannot drift apart, and why the server falls
unknown paths back to the shell so a deep link survives a hard load.

An older `subfloor.vercel.app` deployment was deleted on 10 Sep and was never the app. The frontend calls
`/api/*` on its own origin and those functions did not run there, so it served a dashboard with
errors where the numbers should be. If you have that link, it is the wrong one.

Written plainly, because a repo that overstates its own state is the one thing that makes the rest of
it worth less.

| | |
|---|---|
| Contracts, Base mainnet | **live**, [addresses above](#deployed), Sourcify `match`; Base Sepolia is kept as the integration environment |
| Floors, both directions | **set on chain**, keyed to the vault |
| A concentrated two-sided book | **shipped and live** on Aqua under a device-shaped mandate |
| The index | **live**, syncing, `hasIndexingErrors: false` |
| Calibration and the daily report | **live** at `/api/calibration` and `/api/report`, calibrated from the mainnet fills rather than a default |
| Refusals, which no index can serve | **live** at `/api/refusals`, decoded from reverted transactions; the below-floor refusal above is counted there |
| Vault setup | **one transaction** — `createVault(setup)` leaves nothing unset |
| Fills, and the execution-quality dataset | both directions, scored against the same Chainlink answer settlement used |
| **Base mainnet, with our own money** | **live** — [contracts above](#deployed), Sourcify `match`, real WETH/USDC on canonical Aqua; two vaults funded and quoting under device-signed mandates |
| **A rogue agent, refused, on chain** | **on chain, both ways** — the published key tries to sell below the floor → [`0xa43eda4d…`](https://basescan.org/tx/0xa43eda4defd419908ebe2d01db70f3fe9c580a5afd3a3353e2f3e6d11a73b01c) `SettledBelowFloor`; tries to lower the floor → [`0x7f9acec9…`](https://basescan.org/tx/0x7f9acec9ce242a6233dfbb25acd8cb3f5ebc49f8fbf9cbcd144b4788b433a957) `BadGuardianSignature`; both status 0 |

Nothing published here is invented. The fuzz counter is
[a file in this repo](docs/fuzz-counter.json) written only by CI, and every increment maps to a run
you can open. The fills, when there are fills, are a subgraph query anyone can run — and until then
the endpoints say so rather than showing a number.

## The standard

Implements [ERC-8377 (Reference-Relative Slippage Bounds)](https://github.com/ethereum/ERCs/pull/1935),
a draft standard written by this project's author. The specification is public prior art. Every line
of implementation here was written during the event.

## License

The contracts are a fork of 1inch SwapVM and carry its license, `LicenseRef-Degensoft-SwapVM-1.1`,
which is source-available rather than open source. The texts are in
[`contracts/LICENSES/`](contracts/LICENSES/), headers are intact in every file, and the 1inch prize
terms permit modified redeployments, which is what this is. Everything outside `contracts/` is MIT.
