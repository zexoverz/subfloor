# Handoff

Written 11 Sep 2026, 13:30 UTC, end of session `4b501d9e-ac35-4e51-a3af-60b26459555c`, on top of
the 10 Sep handoff from sessions `07fe383f…` and `136b9b22…`. **§0b is the recap since that one**;
§8, §8b and §8c are the history. Submission is **13 Sep 2026, 16:00 UTC**, about 50 hours from now.

Everything here was verified against the running system on 11 Sep rather than recalled. Where a
number appears, the way to re-check it appears next to it. Where something is unfinished, it says so.

---

## 0. Read this in the right order

1. **`CLAUDE.md`** — the working rules. They are not style preferences; each one cost something.
2. **`docs/SPEC.md`, in full.** All 2,500+ lines. The rule exists because two sessions have already
   sampled it by section and been confidently wrong about things the spec had settled.
3. This file, for what is true *now* — the spec records intent and design, this records state.

If you only have budget for one, read the spec. This file goes stale; the spec does not.

---

## 0b. Since the last handoff, in one screen

**Shipped to `main`:** the house agent (`#239`), `/api/mandates` (`#238`), one index read per window
(`#237`), the MCP tools on the live index (`#245`), calibration from the adverse tail with a 100 bps
default (`#246`), the `switch-on` script (`#249`), and **mandates that last until they expire**
(`#254`, closing `#253`). Details in §8c.

**The vault moved on 11 Sep.** `scripts/new-vault.sh` deployed factory `0x5c43…` and vault
`0x1168…` (both Sourcify `match`), docked `0xaf6b…`'s three books, moved its 0.0438 WETH and 49,923
tUSDC across, and posted one fourteen-day mandate (nonce 0, expiry 1790361860). The new delegate is
`0xFfCc8ee26a9aA8c3b4DddBf4a5aE957CBd509242`, keystore `subfloor-delegate`, funded with 0.02 ETH;
`subfloor-testnet` and `0x28Fb…` are retired. Railway points at all of it (`SUBFLOOR_HOUSE_AGENT`,
`VITE_VAULT` and `VITE_VAULT_FACTORY` on `web`, `SUBFLOOR_VAULT` on `taker`).

**The house agent is live since 11 Sep, 19:10 UTC.** The first deploy with the delegate key
crash-looped: `policy/loop.ts` and `house/run.ts` imported each other under a top-level await, and
Node exits that before logging anything (`#269`, fixed in `#270` with a test that starts the process
the way Railway does). Its first cycle shipped book `0xa5e7eb6e…` for `0x1168…` (`0x63741b33…`,
block 46,692,771, 80% of the vault's inventory), and the taker filled it about thirty seconds later
(`0xd6fe61f3…`). It re-centres under the one mandate from here.

**A refusal on demand: `scripts/demo-refusal.sh`** (`DRY_RUN=1` first). It plays a compromised house
agent: the delegate ships a book 500 bps under the reference under the live mandate, the owner as an
ordinary taker asks it for a fill, settlement reverts `SettledBelowFloor`, and the delegate docks the
book again so the house agent keeps its own.

**The product gap is the frontend, not the contracts.** A stranger reaches the thesis and not the
product: the interface signs a mandate and never delivers it to the agent (`#232`). The audit and
its ranked fixes are in §8c; they are Zikri's, and they are what decides whether a judge sees an
agent working for a user or a demo of signatures.

**The index hit Studio's daily cap today.** The builder moved Studio to the billing plan, and that
does **not** lift the development URL's 3,000 queries a day (measured, §4). The paid path is the
network gateway, which needs the subgraph published to The Graph Network. `/api/subgraph` now tries
the gateway first and Studio second (`#255`), so it is ready the moment both exist. The API key works
(a public subgraph answered through the gateway on 11 Sep, after a first attempt minutes after it was
created returned `API key not found`); the subgraph was then published to the network and production reads the gateway first, with Studio
behind it (§4).

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

**One mandate covers every ship until it expires** (`#253`, on `main` since 11 Sep). The per-token
cap binds what is live at once (`committed + amount <= cap`), and `revokeMandate(nonce)` (owner or
guardian, never the delegate) withdraws one early; the view is `mandateRevoked(nonce)`. The agent
and the frontend pick the lowest unexpired, unrevoked nonce by reading the chain, never by counting
locally. **Only vaults from a factory deployed after `#254` behave this way**: ours, `0x1168…`, since
11 Sep. The previous vault `0xaf6b…` marks every nonce used and has been emptied.

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
| VaultFactory (since 11 Sep, #253's vault) | `0x5c434a6C212F5A58FE1c78F63f10c5cf36ACcFb3` |
| AquaGuardVault (ours, since 11 Sep) | `0x1168C48a74055486BC4D1E7036d3b1aC4bb75586` |
| Previous factory and vault (single-use mandates; the vault is emptied) | `0xbfF5…A7C5`, `0xaf6b…c33f` |
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
| App and API | `https://subfloor.xyz` (custom domain on the Railway `web` service, port 8080) |
| Same, direct | `https://web-production-37798.up.railway.app` |
| Subgraph, Studio | `https://api.studio.thegraph.com/query/1758825/subfloor-base-sepolia/v3.1.0` (free, 3,000 queries a day) |
| Subgraph, gateway (read first) | `https://gateway.thegraph.com/api/subgraphs/id/vSC2ZsPqdQmRrmfnQPKeDRaLDYkJbewabiGa4i3hFs5`, published to The Graph Network on Arbitrum One on 11 Sep; needs the API key |

**The index, measured 11 Sep 13:20 UTC.** Deployment `QmfYvtWkyPkNEwG5QVt83dcXG8D6YVDJjcTnN8VedZtEkn`,
3 blocks behind the chain head, `hasIndexingErrors: false`. Studio answered
`x-ratelimit-limit: 3000`, `x-ratelimit-remaining: 2548`, with and without an API key, after the
billing upgrade. Re-check: `curl -sD - -o /dev/null -X POST <studio url> -H 'content-type:
application/json' -d '{"query":"{_meta{block{number}}}"}' | grep ratelimit`.

Three Railway services in project `subfloor`, all in `production`:

| Service | What it runs | Holds a key? |
|---|---|---|
| `web` | the app and every `/api/*` endpoint | no |
| `taker` | the taker bot | yes, the taker's |
| `agent` | the policy loop; the house agent once `SUBFLOOR_DELEGATE_KEY` is set (`#236`) | **not yet** |

The `agent` service builds from `main` (it deployed from a side branch until the evening of 10 Sep)
and runs `policy/loop.ts`. Without `SUBFLOOR_DELEGATE_KEY` it reads the index, decides, composes and
**prints** the ship command, holding no key. With the key set it is the house agent (`#236`): for every
vault whose mandates reach `/api/mandates` it ships one book, recentres it on drift, docks on the
fail-closed branches and retires older books so each vault runs one. The key is deliberately not set
yet; it goes in from the dashboard, never from an agent session. See §9 step 4.

`POLICY_INTERVAL_MS` is set to **180000** on the service; the code's own default is 120000 since
`#237`. It was 30000 for part of the evening and that was a mistake worth recording, because the free
Studio endpoint is shared: while the loop was polling it every thirty seconds the subgraph answered
429, and a vault-scoped tape under a 429 renders **refusals and no fills** — refusals come from
`/api/refusals` reading transaction status, while fills need `maker`, which only the index carries.
Half a tape disappearing looks like lost transactions and is not.

`#237` fixed the loop's half properly: one index read per cycle, and a 429 now **holds** while the
last good read is younger than `maxIndexSilenceSeconds` rather than docking on every one. The
frontend's half is `frontend/api/_lib/indexCache.ts` from the same PR.

**`/api/subgraph` is the only way anything of ours reads Studio now.** The browser bundle
(`VITE_SUBGRAPH_URL=/api/subgraph`), the consumers and the agent (`SUBFLOOR_SUBGRAPH` set to
`<web>/api/subgraph`) share that one 30s cache. The agent needed it: its Railway egress IP was still
being answered 429 by Studio directly after `#237` deployed, and through the proxy it read cleanly on
the first cycle. A 429 is passed through and never cached.

Since `#255` that one origin reads a list: `SUBFLOOR_SUBGRAPH` first, `SUBFLOOR_SUBGRAPH_FALLBACK`
(Studio by default) second, first clean answer wins, and when neither is clean the last failure goes
back uncached. With only Studio configured the list is one entry and nothing changes. The gateway
key is `SUBFLOOR_GRAPH_API_KEY` on `web`, sent as a header to `gateway.thegraph.com` only, and
`/api/health` lists the endpoints with any path key masked.

**`/api/mandates` holds the signed batches the house agent spends** (`#235`), on the `web-mandates`
volume at `/data` (`SUBFLOOR_MANDATES_PATH=/data/mandates.json`). It refuses anything the house agent
could not spend, with the reason. `SUBFLOOR_HOUSE_AGENT` names the agent it serves; unset, it answers
503 rather than holding signatures for nobody. Attaching the volume replaced the web deployment
outright, so the site returned Railway's 404 for about twenty seconds; expect the same on any volume
change.

There is no Vercel deployment any more. The `subfloor` project was deleted on 10 Sep because it
served a stale build whose `/api/*` functions did not run, while the README's headline link pointed
at it. `subfloor.vercel.app` now returns `DEPLOYMENT_NOT_FOUND`. If you find that URL anywhere, it is
wrong.

Endpoints, all same-origin: `/api/health`, `/api/calibration`, `/api/refusals`, `/api/fills`,
`/api/report`, `/api/subgraph` and `/api/mandates`. All returned 200 on 10 Sep.

---

## 5. What is true right now, with provenance

| Claim | Value | How to re-check |
|---|---|---|
| Contract tests | **967 pass, 0 fail** (after `#254`) | `cd contracts && forge test` |
| Programs fuzzed | **1,500,000** over 18 campaigns, last 11 Sep 19:17 UTC; two of the four counted suites are hostile, so do not call the whole number hostile | `docs/fuzz-counter.json`, written only by CI |
| Fills through the router | **325** (read 11 Sep, 19:25 UTC), the first on `0x1168…` among them | `curl .../api/refusals`, field `fills` |
| Refusals on chain | **6** (read 11 Sep, 19:25 UTC) | `curl .../api/refusals`, field `floorRefusals` |
| Index health | `hasIndexingErrors: false`, 3 blocks behind head | `{ _meta { hasIndexingErrors block { number } } }` |
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

**`ETH_PASSWORD` in the shell breaks every `cast` call.** Foundry reads it as the password *file*
path and then demands `--keystore`, so even a plain `cast call` fails with a usage error. This
handoff used to recommend exporting it; that line is gone, and `scripts/new-vault.sh` now unsets it.
`unset ETH_PASSWORD CAST_UNSAFE_PASSWORD` before anything that signs. And `forge create` will not
take `--account` with `--password-file` the way `cast` does: give it `--keystore <path>`.

---

**Running the injection harness deletes the evidence of the last one.** `src/injection/run.ts`
rewrites `docs/injection/case-N-*.json` whole, and those files carry a hand-written `broadcast` block
— the shipped strategy hash, the refusal tx, the block, the decoded revert — that the harness never
produces, because it composes and records and does not broadcast. Re-running `escalation` on 10 Sep
to look at the program wiped `refusalTx 0x0cbf7b45…`, which is cited in `docs/e2e-walkthrough.md` and
is a video asset. Recovered with `git restore`, and only because it had been committed. Filed as
`#225`. **Check `git status` after running the harness.**

**Railway ignores a service's `dockerfilePath` when `railway.json` is in the repo root.** Three
builds of the agent service produced the frontend image instead: the root `railway.json` pins
`dockerfilePath: Dockerfile`, and the builder reads that file even though the API refuses to *set*
`railwayConfigFile` on the grounds that config-as-code is deprecated. `RAILWAY_DOCKERFILE_PATH` as an
env var did not win either. The way through was to stop needing a second image — the policy loop
rides the root image and a `startCommand` selects it. If you add a service to this project, expect
the same and plan for it.

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

## 8b. The e2e, walked end to end on the evening of 10 Sep

The first time the walkthrough was run from a mandate signed in the **interface** rather than by
`cast`. It found four frontend bugs that no amount of clicking would have surfaced, because all four
only appear when something tries to spend what the screen produced.

**A second vault exists, and it is the one to use for this.** Ours (`0xaf6b…c33f`) is set up for the
live book; this one was created from a fresh wallet through the factory, which is what made it a real
test of first-run.

| | |
|---|---|
| Vault | `0x5a436B0e8EFBe12E9068105eC4d650018817AD60` |
| Owner and guardian | `0x7EdAA11fEBc57A5115105ECCC94023D1e76746Fd` — MetaMask, **gas-sponsored** |
| Delegate | `0x76b36d8f88Df6f61E65779DB99F1769b15D50C81` |

The owner holds **no ETH**. The vault was created gaslessly through MetaMask's sponsorship, so that
wallet cannot send a transaction — and it does not need to. Signing a mandate is a signature, and the
vault's inventory is its ERC20 balance, so anyone can fund it. Both funding transfers were sent from
the delegate. If you find yourself telling someone to `cast send` from that owner, it will not work.

The delegate's private key is **testnet only** and lives in `agent/.env.local`, gitignored by
`.gitignore:8`. It is not the live delegate and must never be used on mainnet.

**What was walked, and what it produced.** Both books were shipped by the delegate against mandates
signed in the interface by the guardian.

| | tx | |
|---|---|---|
| ship, honest book (nonce 0) | `0x546bddc15b17269e839e70f5c19afced3991e826c4283a271d50fe6546f72f9f` | 237,222 gas |
| ship, guard-free book (nonce 1) | `0x9d48715b0889f72abcd124bffb724a551675b77ba406ae34a243fbd42eaff61c` | 168,738 gas |
| four fills, quote token in | `0x362abaca…` `0x944d17d1…` `0xcfb4b365…` `0x9b936dec…` | succeeded |
| two refusals, guard-free book | `0x96a2c1a1…` `0xb4e13b4d…` | reverted |
| two refusals, honest book, other side | `0x54a4ba18…` `0xdc1d9473…` | reverted |

The fills are the 1inch qualification's *"on-chain execution of token transfers … not only reverts"*,
and the transfers mirror exactly: the vault gave 0.000407486854855867 WETH and received 1.000000
tUSDC on the first, and so on. Vault balances after the refusals were unchanged to the wei, which is
the sentence the refusal card leads with.

**The last two refusals are the interesting ones, and they are not the attack.** They are the
*honest* book, refused on the side where it had gone stale. The reference moved −24.0 bps after it
was shipped, and the vault's buy side fell ~21 bps under its own floor. Nothing was armed; the
mechanism caught a book that was merely old. This is exactly what the policy loop's `recenter` exists
to prevent — and the loop had been saying `recenter` for an hour, into a log, because nothing ships
what it composes. Two layers, and the second one earned its place.

**Two tools were needed and are now in the repo.** Neither forge script can spend an
interface-signed mandate: both build the mandate themselves with hardcoded amounts, so they can only
spend a signature over their own struct, while the interface signs `maxAmounts` equal to the vault's
inventory. And `contracts/` has no `node_modules`, so reaching them at all is the measured
ten-minute `via_ir` build.

- `agent/src/vault/ship-signed.ts` — ships a mandate as it was signed, recovering the signature
  against the vault's guardian before broadcasting.
- `agent/src/taker/attempt-refusal.ts` — attempts one fill against a named book and reads what
  settlement says, reusing the taker bot's `buildTakerData`, `ROUTER_ABI` and `decodeFloorRevert`.
  `SUBFLOOR_TOKEN_IN=weth` takes the other side, which is what produced the last two refusals.

**Merged: `#217` and `#221`. Closed: `#216` `#218` `#219` `#220` `#223`.**

- **`#216`** — the mandate the interface signed named **Aqua** as its `app` where the vault wants the
  **router**. Valid signature, well-formed struct, and `_consumeMandate` only compares the two at
  ship time — so the ceremony completed, the device approved, and it failed days later on another
  machine as `MandateWrongApp`.
- **`#218`** — `saveMandate` kept the signature and threw the struct away. The vault rebuilds the
  hash from every field, so it was unspendable by anyone. `expiry` made it unrecoverable rather than
  inconvenient: it is derived from the instant `buildMandate` ran, which is not the instant
  `saveMandate` recorded.
- **`#219`** — nothing in the interface handed over the vault address or the mandate. The only
  clipboard call in the frontend copied the connected wallet, and getting the mandate out meant
  devtools. The signed state now hands over both.
- **`#220`** — the interface offered nonce 0 and then nothing, so once the first mandate was spent it
  could never sign another. One mandate is one ship, so an interface that authorises once can start
  an agent and never keep it running.

---

## 8c. What changed on 11 Sep

Merged: `#237` (one index read per window, a 429 holds), `#238` (`/api/mandates`), `#239` (house
agent), `#242` (the previous handoff), `#245` (MCP tools read the live index), `#246` (calibration
takes the adverse tail; the floor default went from 50 to 100 bps), `#249` (`switch-on` script),
`#254` (mandates last until they expire, closing `#253`). In review: `#255`'s PR (the gateway with
Studio behind it) and `#256` (this handoff, the spec and the README).

**A mandate lasts until it expires (`#253`).** SPEC §10 promised one signature for fourteen days; the
vault marked a nonce used on every ship and `updateQuote`, so a re-centring agent needed a signature
per re-centre. Now one mandate covers every ship until expiry, the per-token cap binds what is live at
once (`committed + amount <= cap`), and `revokeMandate(nonce)` lets the owner or the guardian withdraw
one. The view is `mandateRevoked`, not `mandateUsed`. **The live vault `0xaf6b` keeps the old
single-use bytecode**: taking this needs a new `VaultFactory` and a vault from it (§9 step 4).

**The live testnet run on 11 Sep.** The guardian lowered `0xaf6b`'s backstop to 0 (`0xad4f4247…`), so
its floor is the 100 bps relative one and follows the market. Eight single-use mandates (nonces 9 to
16) sit in `/api/mandates` for `0xaf6b`. The taker ran out of WETH (`SafeTransferFromFailed` on every
WETH-in cycle) and was refilled with 0.02 WETH. **The taker's key is `0x02538e43…`, not the
`0x8960…` in `agent/.secrets/taker.address`**: check balances against a fill's `from`, not that file.

**The delegate key is not on Railway.** `subfloor-dev` is the owner and guardian `0x9ebd…`.
`subfloor-testnet` answered `Mac Mismatch` to the password the owner typed, so either its password
differs or it is not `0x28Fb…`. If it cannot be opened, the owner sets a new delegate (§9 step 4).

**Filed, not fixed:** `#250` (the vault's Aqua allowance drifts below what its live books can pull:
pulls do not reduce `committed`, pushes do not raise the allowance) and `#247` (the daily report's
worst day is the snapshot's best tail; needs a subgraph redeploy).

**The production audit on 11 Sep**, from a Playwright walk and a read of `frontend/src` by an audit
agent; the points below are its findings, not each re-verified. A stranger gets the thesis and not the
product. The connected journey is about eight prompts and still never reaches the agent: nothing in
`frontend/src` POSTs to `/api/mandates`, and the agent address field is empty with the house agent
never offered (`#232`). Also on screen: "Base mainnet" in the eyebrow and on the refusal card, fixture
values on the LIVE tiles (notional, markout, worst fill, reference 2,470.10) and on the agent lines,
`STOP AGENT` docking `(aqua, 0x0)` which reverts while the copy claims a revocation that does not
exist, lowering a floor sending nothing on chain, `/app/device` showing a TODO skeleton, and no door
one. Its ranked fixes: deliver the mandate to the agent with the house agent as the default; a real
first-run screen; remove fixture leakage; make STOP AGENT stop (now possible: `revokeMandate`); wire
lowering and door one or remove them.

---

## 9. What to do next, in order

**1. Confirm check-in 2 went in.** Its deadline was 11 Sep 03:59 UTC and nothing in the repo records
that it was filed. Draft: `docs/check-in-2.md`. `docs/SPEC.md` records a missed check-in as
elimination by technicality, so ask the builder before anything else.

**2. ~~Put the index on the paid gateway~~ — done 11 Sep (`#255`).** Published as subgraph
`vSC2ZsPqdQmRrmfnQPKeDRaLDYkJbewabiGa4i3hFs5` (deployment `QmfYvt…`, the one Studio serves). The
gateway answered about 40 seconds after the publish, at the same block as Studio and with identical
entities (17 floor changes, 12 strategies, 317 fill qualities, same content hash). Both variables are
on `web` and `/api/health` lists the gateway first. The steps are kept for the next subgraph deploy,
which needs a new version published the same way.

**How to tell production is on the gateway rather than falling back**, since the answers are
identical: read Studio's `x-ratelimit-remaining`, send a few `/api/subgraph` queries with a fresh
alias each so the cache cannot answer, and read it again. On 11 Sep five such queries moved Studio's
counter by exactly one, the second read itself (2465 → 2464). A counter that drops by the number of
queries means the gateway is refusing and Studio is carrying it.

1. The query key exists: `subfloor` in Studio → API Keys, active, $5 spending limit. Checked on
   11 Sep against a public subgraph through the gateway. A key minutes old answered
   `API key not found`, so allow a few minutes after creating one before concluding it is wrong.
2. Publish `subfloor-base-sepolia` to The Graph Network from Studio. It goes to Arbitrum One and
   costs a little ETH there for gas; curation is optional because `base-sepolia` has issuance rewards
   and the upgrade indexer indexes every published subgraph. Note the subgraph id.
3. Wait until the gateway answers for it:
   `curl -s -X POST https://gateway.thegraph.com/api/subgraphs/id/<id> -H "authorization: Bearer <key>" -H 'content-type: application/json' -d '{"query":"{_meta{block{number} hasIndexingErrors}}"}'`
4. In the Railway dashboard, on `web` only: `SUBFLOOR_SUBGRAPH` =
   `https://gateway.thegraph.com/api/subgraphs/id/<id>` and `SUBFLOOR_GRAPH_API_KEY` = the key. Keys go
   in from the dashboard, never through an agent session.
5. `/api/health` should list the gateway first and Studio second.

Cost, roughly: Studio counted about 450 queries in the first eleven hours of 11 Sep's window, so on
the order of 1,000 a day with the agent idle. That is inside the plan's 100,000 free a month; the
house agent and a demo day add to it, at $2 per 100,000 past the free tier.

**3. ~~Move to a vault on `#253`'s bytecode~~ done 11 Sep (§0b); switch the house agent on (`#233`).** Everything that
signs runs from the owner's terminal; an agent session cannot open the keystores and must not be
handed a password or a key.

**`scripts/new-vault.sh` does steps 1 to 4 and the mandate in one run (`#260`).** Run it with
`DRY_RUN=1` first; that reads and simulates everything and sends nothing (checked 11 Sep: all three
of `0xaf6b`'s books dock from the owner, 0.0438 WETH and 49,923 tUSDC to move). The real run asks for
the password once, creates a new delegate keystore `subfloor-delegate` instead of recovering
`subfloor-testnet`, keeps what it made in `~/.subfloor-new-vault` so a stopped run resumes, and pauses
for an agent session to set `SUBFLOOR_HOUSE_AGENT` before posting the mandate. The steps it runs:

1. deploy a `VaultFactory` with `forge create` and verify it on Sourcify (a small contract; only the
   router needs verifier-produced bytes)
2. `createVault(setup)` from the owner: the delegate, guardian `0x9ebd…`, the registry, both pairs at
   100 bps and absolute 0 (an absolute backstop is what froze the old vault's selling side)
3. as owner, dock `0xaf6b`'s three books and `withdraw` its inventory into the new vault
4. from `agent/`: `SUBFLOOR_VAULT=<new vault> node --experimental-strip-types src/house/switch-on.ts`,
   one mandate for fourteen days
5. the delegate key into Railway from the dashboard (`agent` → Variables →
   `SUBFLOOR_DELEGATE_KEY`); then an agent session with the Railway MCP sets `SUBFLOOR_HOUSE_AGENT`,
   `VITE_VAULT`, `VITE_VAULT_FACTORY` and the taker's `SUBFLOOR_VAULT` to the new addresses, and
   updates the README and spec deployment tables

After that the agent ships one book for the new vault and keeps it centred on the one mandate.

**4. The frontend's first run (Zikri, `#232`).** In the audit's order (§8c): the signed mandate
POSTed to `/api/mandates` with the house agent as the default delegate; a first-run screen; no
fixture values on LIVE tiles; `STOP AGENT` calling `revokeMandate` instead of a `dock` that reverts;
floor lowering and door one wired or removed. This is what a judge clicks through.

**5. Ask the Ledger question in the sponsor Discord.** Issue `#4`, a `spike`, and it was due before
4 Sep. `ring init` is USB-only in the source we read, so enrolling a headless agent host into a Key
Ring has no path we can find; the track page says "headless by design", which suggests one exists.
It cannot be resolved locally. It blocks `#44`, `#55` and `#35`.

Until it is answered the registry guardian is **still a development key**. Do not present that as the
hardware-owned path. "Even a hacked agent cannot go below your floor" is circular if the
floor-setting key sits on the machine the agent runs on. The asymmetry is enforced on chain; what is
unproven is that the key lives on the device.

**6. ~~Publish the Substreams package~~ — done 10 Sep.** `subfloor-refusals` v0.1.0 is on
[substreams.dev](https://substreams.dev/packages/subfloor-refusals/v0.1.0), linked from the README.
The manifest said `network: base` from block 35,000,000, where nothing of ours is deployed, so it was
changed to `base-sepolia` from 46,513,825 before publishing. **Not yet streamed end to end** — there
is no Substreams API key on this machine, so nobody has watched it emit refusal `0xd8969d01…` at block
46534207. That run is the check before citing it. To publish a new version, `registry login` needs a
TTY, but the binary reads `SUBSTREAMS_REGISTRY_TOKEN`:

```bash
cd indexer/substreams
SUBSTREAMS_REGISTRY_TOKEN=<token from https://substreams.dev/me> substreams registry publish ./subfloor-refusals-v0.1.0.spkg
```

**7. Base mainnet** (`#38`), then the injection reverts on mainnet (`#50`).

**Open from the 10 Sep e2e, both small, both `frontend` except the first:**

- **`#230`** — a maker-side refusal in the tUSDC→WETH direction renders as **`$0.00`**. The decoder is
  right and the bps column is right; `formatPrice` is fixed at two decimals and the tape prefixes a
  dollar sign, and that direction's price is `0.00040773 WETH per tUSDC`. Do **not** fix it by
  inverting: shown the other way the attempt reads *above* the floor, because inverting flips which
  direction is worse, and the card would have to flip its language per side. Significant digits and a
  unit label from the decoded tokens.
- **`#225`** — the harness clobber above.

**Not mine, and parked by the builder:** `#31` and `#41`, the second-chain subgraph and its README
demo. Everything labelled `frontend` is Zikri's.

---

## 10. Secrets

Named, never valued, and never committed. `.env` stays out of the repo; `.env.example` is the only
committed shape.

- `SUBFLOOR_HYPERSYNC_TOKEN` — required by every API endpoint that reads chain history. Documented in
  `frontend/.env.example` as of 10 Sep; it was undocumented before that, and a deployment missing it
  fails at the first request rather than at build. On Envio's Starter plan ($70) since 11 Sep, when
  it was rotated on Railway. The `taker` service holds its own copy, so a rotation has to reach it too.
- `SUBSTREAMS_REGISTRY_TOKEN` — publishing only.
- `SUBFLOOR_GRAPH_API_KEY` — the network gateway's query key, on `web` only (§9 step 2).
- `SUBFLOOR_DELEGATE_KEY` — the house agent's key, on `agent` only, set from the dashboard.
- Deploy keys and the Railway environment live outside the repo.

**Rotate before submission.** On 11 Sep the keystore password and a Graph API key were both pasted
into an agent chat. Neither was used by the agent or written anywhere, but a secret typed into a chat
is a secret that left the machine: change the keystore password (`cast wallet change-password`) and
regenerate the Graph key once a working one is in place.

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
