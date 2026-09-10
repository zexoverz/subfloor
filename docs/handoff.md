# Handoff

Written 10 Sep 2026, end of session `07fe383f-8343-418d-a0ca-58851e185406`. Submission is
**13 Sep 2026, 16:00 UTC**.

Everything here was verified against the running system on 10 Sep rather than recalled. Where a
number appears, the way to re-check it appears next to it. Where something is unfinished, it says so.

---

## 0. Read this in the right order

1. **`CLAUDE.md`** — the working rules. They are not style preferences; each one cost something.
2. **`docs/SPEC.md`, in full.** All 2,500+ lines. The rule exists because two sessions have already
   sampled it by section and been confidently wrong about things the spec had settled.
3. This file, for what is true *now* — the spec records intent and design, this records state.

If you only have budget for one, read the spec. This file goes stale; the spec does not.

---

## 1. What SUBFLOOR is, mechanically

An agent trades your portfolio. You set one number. Your money cannot settle below it.

The claim is not "the agent is sandboxed" or "the key is safe". The agent **is supposed to have the
key**. So defending the key is the wrong perimeter: a compromised or badly-prompted agent already
has everything it needs to lose your money without ever stealing it. SUBFLOOR moves the perimeter to
**the price at settlement**.

**Where the check lives, and why that is the whole idea.**

`GuardedSwapVM._settlementGuard` runs inside `swap()` on a forked 1inch SwapVM router, after taker
validation and before any token moves, and it is mirrored in `quote()` so a quote cannot promise what
settlement would refuse. It calls `FloorRegistry.checkSettlement`, which scores **both** parties —
the taker recipient and the maker recipient — each against their own floor. A fill that would settle
either side below its floor reverts with
`SettledBelowFloor(recipient, tokenIn, tokenOut, executionRate, floorRate)`.

This is deliberately **not** an instruction. `MinRate` and friends live in the program, and the
program is written by whoever ships the strategy. When the party you are defending against is the
one authoring the program, an in-program guard is a suggestion. `docs/counterexamples.md` archives
the programs that prove it.

**The floor is relative, not static.**

```
effectiveFloor = max(ceil(reference * (10000 - bps) / 10000), absoluteRate)
```

`reference` comes from a Chainlink feed with a freshness check that **fails closed** — where the
guard cannot prove its input is fresh it stops rather than guesses. A static min-rate is either too
tight to trade or too loose to mean anything once the market moves. This is the part that was
actually hard, and it is the main technical separation from every "bounded agent mandate" project.

**Rate convention, everywhere:** `received * 1e18 / given`, in **raw** token units. On WETH(18) /
tUSDC(6) the forward rate is ~`2.478e9` and the inverted ~`4e26`. Getting this wrong is the single
most common bug in this codebase — it has caused three separate defects, one of them in 1inch's own
shipped code.

**The registry is recipient-keyed.** A floor protects a recipient on every fill it takes through the
router, with no vault, no delegate, no mandate and no agent. The vault is a convenience for the agent
story, not a requirement for the protection. `#174` is the open issue about leading with that.

**Delegate surface is exactly four calls:** `ship`, `dock`, `updateQuote`, `rescueApproval`. The
delegate is a separate address from the owner, proven on chain.

**One mandate authorises exactly one ship** (`mandateUsed[nonce]`), which is why re-quoting needs a
pre-signed batch. Both the agent (`agent/src/vault/mandates.ts`) and the frontend
(`frontend/src/lib/mandateStore.ts`) issue batches and pick the next unused nonce by reading the
chain, never by counting locally.

**Ledger's role is a role, not a login.** Raising a floor is free and device-free, because it can
only help you. Lowering it is the one dangerous action, so it is the one the device owns, enforced on
chain by the registry's guardian signature check. Anyone can connect with any wallet; the device is
the guardian. Do not build "two connect flows" — that misunderstanding has already happened once.

---

## 2. Repo map

```
contracts/          Foundry. via_ir, solc 0.8.30. Full suite ~40s, cold build ~9 min.
  src/subfloor/     FloorRegistry, GuardedSwapVM, AquaGuardVault, VaultFactory,
                    TestnetFaucet, SettlementFeeLib, strategies/ConcentratedBook
  src/instructions/ Vendored SwapVM instructions. Ours: RequireFloor, SubfloorGuards,
                    and a modified OraclePriceAdjuster (see §6)
  src/opcodes/      SubfloorOpcodes = AquaOpcodes + our guards + three instructions
  src/routers/      FloorRouter (shipped), plus test-local full-set routers
agent/src/          Delegate agent, taker bot, injection harness, Ledger keyring
indexer/subgraph/   Messari DEX Aggregator standardized schema, AssemblyScript
indexer/substreams/ Refusal decoding from transaction status. Rust/WASM.
indexer/consumers/  Calibration and report logic, re-exported from frontend/api/_lib
frontend/           Vite SPA + api/ functions, shipped as one image
docs/               SPEC.md and everything measured
```

**One image, one origin.** `Dockerfile` builds the frontend and serves the `api/` functions from the
same origin, so a number on screen and the query behind it cannot drift apart. Deep links work
because the server falls unknown paths back to the shell — checked against the deployment, not
assumed.

---

## 3. Deployed, and verified

**Base Sepolia** — the integration environment. Canonical Aqua exists on Ethereum Sepolia but on no
L2 testnet, so this deploys its own from the same source.

| Contract | Address |
|---|---|
| FloorRegistry | `0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123` |
| FloorRouter | `0x03189D102286fa8cDd0fBF3578B492e67e665A27` |
| VaultFactory | `0xbfF56689e5fC80055766E5E75ce0Fcbc42e1A7C5` |
| AquaGuardVault (ours) | `0xaf6b337440FFEa63c47f077eee2663987aEEc33f` |
| Aqua (ours, not canonical) | `0xA86da73e0c1b4C70cB9a924F57BaE9699198bbDB` |
| tUSDC | `0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD` |
| TestnetFaucet | `0x044BB6a857A875e30f8933aDf652905d02EB65D2` |

**Ethereum Sepolia** — portability evidence only. No vault, no funding, no taker, no live run.

| Contract | Address |
|---|---|
| FloorRegistry | `0x0af3d784d5Cd67f49DA8977A79edaC18fc594Da7` |
| FloorRouter | `0x7A3cf5C71a6fc39a35a60159B1bC398262df1CDd` |

Both routers are Sourcify `exact_match`. Re-check:
`curl -s https://sourcify.dev/server/v2/contract/84532/0x03189D102286fa8cDd0fBF3578B492e67e665A27`

**Base mainnet: not deployed.** That is `#38` and it needs real money.

---

## 4. Live services

| What | Where |
|---|---|
| App and API | `https://web-production-37798.up.railway.app` |
| Subgraph | `https://api.studio.thegraph.com/query/1758825/subfloor-base-sepolia/v3.1.0` |

There is no Vercel deployment any more. The `subfloor` project was deleted on 10 Sep because it
served a stale build whose `/api/*` functions did not run, while the README's headline link pointed
at it. `subfloor.vercel.app` now returns `DEPLOYMENT_NOT_FOUND`. If you find that URL anywhere, it is
wrong.

Endpoints, all same-origin: `/api/health`, `/api/calibration`, `/api/refusals`, `/api/fills`,
`/api/report`. All returned 200 on 10 Sep.

---

## 5. What is true right now, with provenance

| Claim | Value | How to re-check |
|---|---|---|
| Contract tests | **962 pass, 0 fail** | `cd contracts && forge test` |
| Programs fuzzed | **980,000** over 13 campaigns; two of the four counted suites are hostile, so do not call the whole number hostile | `docs/fuzz-counter.json`, written only by CI |
| Scored fills | **261** | `curl .../api/fills` |
| Refusals on chain | **4** (read 10 Sep, 15:50 UTC) | `curl .../api/refusals` |
| Index health | `hasIndexingErrors: false` | `{ _meta { hasIndexingErrors block { number } } }` |
| Upstream suite | 797 → **803** | `1inch/swap-vm#197` |

The fuzz counter **cannot be backfilled** — it scales with wall-clock time, not with a number anyone
chose. The campaign was raised to 26,000 runs per suite on 10 Sep so the copy's "millions" is true by
submission: 12 campaigns remaining at 104,000 each lands near **2.23M**. At the old size it would
have reached ~1.94M, and the sentence would have been false by a hair.

A named refusal, if you need one to point at:
`0xd8969d01cdce69b8d9dc258f07af56f9b1e84fc1f0fac17b7868c428b00827f0`, block 46534207, reverts
`SettledBelowFloor` at 2491787104 against a floor of 2495000000.

---

## 6. The one divergence you must know about

**The deployed FloorRouter no longer matches `main`.** Measured 10 Sep: **24,323 bytes on chain,
23,988 at `main`**, with `cast code` against the local artifact.

Fixing `#175` changed `OraclePriceAdjuster`'s encoding from four fields to six, and that instruction
compiles into the router. The behavioural difference on chain is **nothing**, and that is measured
rather than assumed: all ten strategies ever shipped to this router decode to `Salt`,
`ValidateSeriesEpoch`, `Decay`, `FeeFlatIn` and `XYCConcentrateSwap`. Opcode `0xb2` appears in none
of them.

```graphql
{ strategies(first: 1000) { strategyHash steps { opcode } } }
```

It is deliberately **not** redeployed. The address is the subgraph's data source, the taker's target,
the frontend's config and every explorer link in the README. Trading all of that days before
submission, for an oracle improvement the position never had, is a bad exchange. The live book ships
with `oracle` unset and the reason is written into `contracts/script/ShipTestnetBook.s.sol`.

If you *do* redeploy the router, you must also re-verify it, update the README table, the subgraph
data source, the taker and the frontend config, and re-ship the book.

---

## 7. Traps that already cost time

These are not hypothetical. Each one has happened, most of them more than once.

**`eth_getLogs` is forbidden, not discouraged.** Log history goes through Envio HyperSync. Public
RPCs cap the range and rate-limit under a walk, so the RPC version passes every local test, ships,
works for an hour, and then fails on every call as the chain moves. Chunking does not fix it — the
cap and the rate limit are two problems and chunking trades one for the other. This rule was already
in `CLAUDE.md` and was violated twice in one night anyway. `eth_call` against current state is fine;
this is about log *history*.

**`forge script` and `forge build` produce different `FloorRouter` bytecode in this repo.** Measured
8 Sep: 25,639 vs 25,769 init bytes from the same sources and the same `foundry.toml`. A router
deployed through a script therefore matches no commit and can never be verified. Deploy the bytes the
verifier itself produces: run `forge verify-contract` against any address, read
`error.recompiledCreationCode` off the job result, then `cast send --create` with it.

**`forge script` will not broadcast a transaction that reverts.** It simulates first and aborts, and
`--skip-simulation` does not change that. A refusal never leaves the machine. Use
`cast send --gas-limit <n>`, which skips estimation and lets the transaction land and fail on chain.

**A stale `contracts/out/` artifact will lie to you.** A previous session compared deployed runtime
against a stale artifact and concluded they were byte-identical. They were not. Clean-build before
any bytecode comparison.

**Prove a venue is alive from event recency before reading it.** A contract answers every call and
returns a well-formed book whether or not anyone is trading against it. This has cost time twice.

**A passing test is not a pinned behaviour.** Two examples from this repo, both real. A subgraph
handler change showed zero mutation failures because nothing seeded the entity it touched. And
`OracleAdjusterDecimals.t.sol` wrote `247_867 * 1e4` — which is $24.79, not $2,478.67 — so the test
named "there is a working exponent" passed through an early return rather than by the two sides
lining up. Before citing a test as coverage, break the behaviour and watch it go red.

**Foundry specifics.** `vm.prank` is consumed by a `vm.sign` in the call arguments, so sign before
you prank. Reusing a strategy blob reverts `StrategiesMustBeImmutable`. `vm.expectRevert` does not
catch an inlined internal library revert — you need a harness contract. `runtimeCode` is unavailable
for contracts with immutables.

**AssemblyScript has no closures.** Consts declared in a `describe` body are invisible inside the
tests. This has been hit twice.

**Adding an opcode can break an unrelated file.** Adding a dispatch branch to `SubfloorOpcodes`
pushed `FeeProtocol.sol` into stack-too-deep under via_ir. `FloorRouter` has roughly 268 bytes of
EIP-170 margin; `RouterSize.t.sol` guards it.

**Do not create a burst of branches.** Five pushes in half an hour exhausted a hosting build quota
and made every PR show a red check that had nothing to do with the code.

---

## 8. What changed on 10 Sep

Merged: `#205` `#206` `#207` `#208` `#209` `#210` `#211` `#212` `#213` `#214`. Closed: `#145` `#170`
`#175`.

- **`#175`, the oracle scaling bug.** `OraclePriceAdjuster` compared a 1e18-scaled Chainlink answer
  against a raw-unit swap price. On any pair with mismatched decimals the two are 1e12 apart, the
  ratio saturates `min(priceRatio, 2e18 - maxPriceDecay)`, and the taker is handed the cap — **twice**
  the tokenOut the curve priced, with no revert. Now scales to
  `10 ** (18 + tokenOutDecimals - tokenInDecimals)`. Tests in `OracleAdjusterDecimals.t.sol` and
  `OracleAdjusterMismatchedPair.t.sol`, the latter filling end to end on an 18/6 book through the
  shipped router. Written up as counterexample 3.
- **Upstream.** The same bug is in `1inch/swap-vm` on `main` today. Issue `#31` had reported the scale
  mismatch and been closed as out of focus; what was missing is that it *pays out*. Commented there,
  and opened `1inch/swap-vm#197` with a test on their own fixture, taking their suite 797 → 803. Full
  write-up in `docs/upstream-contributions.md`. **Assume it will not be merged** — they said the
  opcode is out of focus, and the fix is breaking.
- **Mandate batches in the frontend**, matching the agent.
- **Fuzz campaign raised** to 26,000 runs per suite. Measured campaign time 2h21m at 20,000 against a
  300-minute timeout and a shortest observed gap of 4h17m before choosing the number.
- **Substreams package made publishable** — `package.image` set, `logo.png` rescued from a global
  `*.png` ignore (without it `substreams pack` fails on a fresh clone), deprecated `package.doc`
  removed. Runbook in `docs/indexer-schema.md`.
- **Vercel deleted.** See §4. Also fixed: `appkit.ts` had `https://subfloor.vercel.app` as the Reown
  metadata fallback, which ships in the bundle and is what a wallet shows on connect.
- **README honesty passes**: the router divergence in §6, the corrected fill counts, and the server
  env vars documented for the first time.

---

## 9. What to do next, in order

**1. File check-in 2. Deadline 11 Sep 03:59 UTC.** Draft is `docs/check-in-2.md`, already audited
against the deployment. `docs/SPEC.md` records a missed check-in as elimination by technicality. This
outranks everything below it.

**2. Ask the Ledger question in the sponsor Discord.** Issue `#4`, a `spike`, and it was due before
4 Sep. `ring init` is USB-only in the source we read, so enrolling a headless agent host into a Key
Ring has no path we can find; the track page says "headless by design", which suggests one exists.
It cannot be resolved locally. It blocks `#44`, `#55` and `#35`.

Until it is answered the registry guardian is **still a development key**. Do not present that as the
hardware-owned path. "Even a hacked agent cannot go below your floor" is circular if the
floor-setting key sits on the machine the agent runs on. The asymmetry is enforced on chain; what is
unproven is that the key lives on the device.

**3. Publish the Substreams package.** `#33`. The package is built and `substreams registry verify`
is clean. `substreams registry login` needs a TTY and cannot run from an agent session, but the
binary reads `SUBSTREAMS_REGISTRY_TOKEN`, so:

```bash
cd indexer/substreams
SUBSTREAMS_REGISTRY_TOKEN=<token from https://substreams.dev/me> substreams registry publish
```

Note `substreams.yaml` says `network: base` while the deployment is Base **Sepolia**. If the registry
objects, that is the thing to fix first. Link the result from the README once it is up.

**4. Base mainnet** (`#38`), then the injection reverts on mainnet (`#50`).

**Not mine, and parked by the builder:** `#31` and `#41`, the second-chain subgraph and its README
demo. Everything labelled `frontend` is Zikri's.

---

## 10. Secrets

Named, never valued, and never committed. `.env` stays out of the repo; `.env.example` is the only
committed shape.

- `SUBFLOOR_HYPERSYNC_TOKEN` — required by every API endpoint that reads chain history. Documented in
  `frontend/.env.example` as of 10 Sep; it was undocumented before that, and a deployment missing it
  fails at the first request rather than at build.
- `SUBSTREAMS_REGISTRY_TOKEN` — publishing only.
- Deploy keys and the Railway environment live outside the repo.

This repository is private now and **public at submission, with its whole history**. Never commit a
key.

---

## 11. Board discipline

Open an issue before starting work, assign it to yourself, branch for it, PR it, and close it through
the PR rather than through a push to `main`. Labels: `contracts`, `frontend`, `indexer`, `agent`,
`proofs`, `ops`, `spike`, `blocked`, `demo`.

`spike` means answer it before building on it. `blocked` names who you are waiting on and since when.

Commit at short stages with short messages, and sign them. Sponsors read the history, and a single
dump on the final day reads as one.
