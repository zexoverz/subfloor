<div align="center">

# SUBFLOOR

### Let an AI agent trade your portfolio. Set one number. Your money can never go below it.

[![Base Sepolia](https://img.shields.io/badge/Live%20on-Base%20Sepolia-0052FF?style=for-the-badge)](https://sepolia.basescan.org/address/0x2329BdFb8Ea2672D5F461fc5C64Ec26064e25FC6)
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

**Base Sepolia** — integration environment. Canonical Aqua exists on Ethereum Sepolia but on no L2
testnet, so this deploys its own from the same source. Byte-identical behaviour, different address;
mainnet uses canonical Aqua and never forks it.

| Contract | Address | Verified |
|---|---|---|
| FloorRegistry | [`0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123`](https://sepolia.basescan.org/address/0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123) | Sourcify |
| FloorRouter | [`0x03189D102286fa8cDd0fBF3578B492e67e665A27`](https://sepolia.basescan.org/address/0x03189D102286fa8cDd0fBF3578B492e67e665A27) | Sourcify |
| VaultFactory | [`0xD985Ad481D396D37344f7c1229433a7D342cf1F1`](https://sepolia.basescan.org/address/0xD985Ad481D396D37344f7c1229433a7D342cf1F1) | Sourcify |
| AquaGuardVault (ours) | [`0xaf6b337440FFEa63c47f077eee2663987aEEc33f`](https://sepolia.basescan.org/address/0xaf6b337440FFEa63c47f077eee2663987aEEc33f) | Sourcify |
| Aqua (ours, not canonical) | [`0xA86da73e0c1b4C70cB9a924F57BaE9699198bbDB`](https://sepolia.basescan.org/address/0xA86da73e0c1b4C70cB9a924F57BaE9699198bbDB) | — |
| tUSDC (testnet stand-in) | [`0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD`](https://sepolia.basescan.org/address/0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD) | — |

**Why there is a stand-in for USDC here, and only here.** Circle's testnet USDC is not
permissionlessly mintable — `isMinter` is false for us and the masterMinter is Circle's — so funding
a two-sided book means going through their faucet by hand, for every address, every time. That
blocks the interface and the taker on something with nothing to do with the mechanism. `tUSDC` is
six decimals, so decimal handling is exercised exactly as it is on mainnet. The registry configures
**both** pairs: real WETH/USDC for what mainnet will use, WETH/tUSDC for what runs today. Mainnet
uses real USDC and this contract does not exist there.

The vault holds inventory, its floors are set **keyed to the vault** in both directions, and one
two-sided book is shipped and live under a mandate signed EIP-712 by the guardian.

**The router was redeployed on 8 Sep, and the reason is worth stating.** The first one could not be
built from any commit: its runtime was 23,983 bytes where every build of the source produced ~24,3xx,
because `forge script` and `forge build` compile this contract differently and the deployment went
out through the script. Nothing was wrong with it on chain — it settled 115 fills correctly — but a
contract nobody can reproduce cannot be verified, and an unverified router turns the refusal card's
`[view]` link into hex soup. The replacement was deployed from the bytecode the public verifier
itself produces from this repo's sources, so `exact_match` is not just a pass, it is the statement
that the chain and this repository hold the same contract. Tracked in
[#167](https://github.com/zexoverz/subfloor/issues/167).

**Base mainnet** — _pending, see below._

## The index

Every fill is recomputed against every floor by an independent index, so the guarantee is anyone's
query rather than our claim about our own execution.

```
https://api.studio.thegraph.com/query/1758825/subfloor-base-sepolia/v2.2.0
```

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
that and the package is built; what serves the live number today is `/api/refusals`, which walks the
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

**[subfloor.vercel.app](https://subfloor.vercel.app)**

Written plainly, because a repo that overstates its own state is the one thing that makes the rest of
it worth less.

| | |
|---|---|
| Contracts, Base Sepolia | **live**, [addresses above](#deployed); all four verified on Sourcify |
| Floors, both directions | **set on chain**, keyed to the vault |
| A concentrated two-sided book | **shipped and live** on Aqua under a device-shaped mandate |
| The index | **live**, syncing, `hasIndexingErrors: false` |
| Calibration and the daily report | **live** at `/api/calibration` and `/api/report` |
| Fills, and the execution-quality dataset | **115 fills** on the previous router, both directions, scored against the same Chainlink answer settlement used; the taker is being repointed at the redeployed one |
| Refusals | **on chain** — [`0xd8969d01…`](https://sepolia.basescan.org/tx/0xd8969d01cdce69b8d9dc258f07af56f9b1e84fc1f0fac17b7868c428b00827f0) reverts `SettledBelowFloor` at 2491787104 against a floor of 2495000000, and the floor was then lowered again under a guardian signature |
| Base mainnet, with our own money | _pending_ |
| A rogue agent, refused, on chain | _pending_ |

Nothing published here is invented. The fuzz counter is
[a file in this repo](docs/fuzz-counter.json) written only by CI, and every increment maps to a run
you can open. The fills, when there are fills, are a subgraph query anyone can run — and until then
the endpoints say so rather than showing a number.

## The standard

Implements [ERC-8377 (Reference-Relative Slippage Bounds)](https://github.com/ethereum/ERCs/pull/1935),
a draft standard written by this project's author. The specification is public prior art. Every line
of implementation here was written during the event.

MIT.
