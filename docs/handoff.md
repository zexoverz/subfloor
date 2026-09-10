# Handoff

Written 10 Sep 2026, end of session `07fe383f-8343-418d-a0ca-58851e185406`, and extended the same
evening from session `136b9b22-a62a-47ed-bea4-91695b1601ed`, which walked the end-to-end from the
interface — see §8b. Submission is **13 Sep 2026, 16:00 UTC**.

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
| App and API | `https://subfloor.xyz` (custom domain on the Railway `web` service, port 8080) |
| Same, direct | `https://web-production-37798.up.railway.app` |
| Subgraph | `https://api.studio.thegraph.com/query/1758825/subfloor-base-sepolia/v3.1.0` |

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
| Contract tests | **962 pass, 0 fail** | `cd contracts && forge test` |
| Programs fuzzed | **980,000** over 13 campaigns; two of the four counted suites are hostile, so do not call the whole number hostile | `docs/fuzz-counter.json`, written only by CI |
| Scored fills | **265** (read 10 Sep, 16:54 UTC) | `curl .../api/fills` |
| Refusals on chain | **6** (read 10 Sep, 16:54 UTC) | `curl .../api/refusals` |
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

**3. ~~Publish the Substreams package~~ — done 10 Sep.** `subfloor-refusals` v0.1.0 is on
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

**4. Switch the house agent on, which also unsticks the live book (`#233`).** The code is merged and
deployed. Three things are left, and none of them can be done from an agent session:

- set `SUBFLOOR_DELEGATE_KEY` on the Railway `agent` service to the key for `0x28Fb6255…`
- sign a mandate batch for vault `0xaf6b…` as its guardian `0x9ebdC8AC…`, naming that delegate, and
  POST it to `/api/mandates`, from the interface once `#232` lands or from the keystore
- decide the backstop: the vault's WETH→tUSDC absolute is 2,460.46, above the market on 10 Sep, so
  even a recentred book cannot sell WETH until it is lowered with a guardian signature

After that the agent retires the vault's two older books and recentres the newest one.

**5. Base mainnet** (`#38`), then the injection reverts on mainnet (`#50`).

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
