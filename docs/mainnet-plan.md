# Base mainnet run — minimal, for the money-on-mainnet claim and the bounty (#38)

The goal is narrow and deliberate: put the **headline demo transactions on Base mainnet with real
money** — the successful fills, the injection reverts, and the published-key bounty — so the video's
"live mainnet transaction" line and the bounty are literally true. The rich index/dashboard/Graph
demo stays on Base Sepolia, where it is fully live, and that split is disclosed (see *The index
decision* below).

Everything that signs is the builder's to run. An agent session never opens a keystore or holds a
key; it can set non-secret Railway variables and read chain/logs to verify.

## Budget (measured 12 Sep, ETH ~$2,533, Base gas 0.006 gwei, blob fee near floor)

| Item | Amount | Truly spent? |
|---|---|---|
| Gas: deploy registry + router + factory + vault + config + ship | **< $1** (measured; L1 blob fee ~$0.0005/deploy, L2 exec ~$0.23) | yes, ~$1 |
| Owner wallet gas buffer | $3 in ETH | held |
| Vault inventory (maker) | **$20** — ~0.004 WETH + 10 USDC | held, you own it |
| Taker inventory (keeps fills flowing to Sep 16) | **$55** — ~0.015 WETH + 20 USDC | held, two-sided so it recycles |
| Bounty pot | **$15** | only if someone breaks the floor (i.e. never) |
| **Total moved onto mainnet** | **~$93** | **out of pocket ≈ $1 gas** |

Per-fill gas on mainnet ~$0.003, so $3 of buffer plus the taker's own balance lasts well past Sep 16.

## Verified mainnet addresses (chain 8453)

| | Address |
|---|---|
| Canonical Aqua (the vault is a maker on this) | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` (code confirmed) |
| Chainlink ETH/USD feed | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` (`description()` = "ETH / USD") |
| WETH | `0x4200000000000000000000000000000000000006` |
| USDC (native, 6 dec, supports permit) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

Pair is **real WETH/USDC**, not the testnet tUSDC. USDC has 6 decimals — the rate convention
(`received*1e18/given`, raw units) is unchanged from the testnet WETH/tUSDC pair.

## Order of work

### 0. Rotate the delegate key first (Key Ring)
The published key must be one that has never leaked. Do the Key Ring `ring` + `rotate` (handoff
§9a step 1); the sealed delegate it produces is what the agent opens and what goes public. Do this
before anything touches mainnet.

### 1. Fund the owner wallet
~$3 ETH for gas, plus the $75 of WETH/USDC and $15 pot you'll move in later steps. Bridge/opt as you
like; all on Base mainnet.

### 2. Deploy `FloorRegistry`, register the feed, transfer ownership
Deploy to the broadcaster, register the WETH/USDC reference feed = the Chainlink address above with
its staleness bound, then transfer to the cold owner (the reference feed is write-once and
`onlyOwner`, so the order matters — trap §3/§13). `contracts/script/DeploySubfloor.s.sol` is the
mainnet script (not `…Testnet`), run against `--rpc-url https://mainnet.base.org --chain 8453`.

**Hardening from the adversarial benchmark — set a non-zero absolute backstop for WETH/USDC.** The
testnet vault runs backstop 0, so its floor is purely relative to Chainlink; a wrong or manipulated
oracle would drag the floor with it. On mainnet set the absolute backstop to a hard number (e.g. a
few percent under spot at setup), so even a bad feed cannot gut the floor. This is the one change
the benchmark asked for.

### 3. Deploy `FloorRouter` from verifier-produced bytes, verify same day
`forge script`/`forge create` produce router bytecode that matches no commit and can never verify
(trap §6/§7). Deploy the bytes the verifier itself produces: run `forge verify-contract` against a
throwaway address to get `recompiledCreationCode`, then `cast send --create` with it. Verify on
**Sourcify and Basescan, chain 8453, the same day** — the `SettledBelowFloor` reverts only decode in
the video if the router is verified.

### 4. Deploy `VaultFactory`, verify
Small contract, plain `forge create --keystore` + `forge verify-contract --chain 8453 --verifier
sourcify` (as `scripts/new-vault.sh` does, but with `--chain 8453`, not the hardcoded `84532`).

### 5. `createVault(setup)` — Ledger as guardian
One transaction: delegate = the rotated delegate, **guardian = the Ledger address**, registry =
step 2, both WETH/USDC directions floored at 100 bps with the absolute backstop from step 2. Confirm
on chain: `owner`, `delegate`, `guardian`, registry-side `guardian`, and `floor(...)` both ways.

### 6. Fund the vault ($20) and the taker ($55)
Transfer WETH + USDC into the vault (maker inventory) and into the taker EOA. On mainnet USDC
supports EIP-2612, so the vault's funding can use a permit signature instead of an approve tx.

### 7. Point the services at mainnet (agent session sets non-secret vars; you set the key)
- `agent`: `SUBFLOOR_RPC` = mainnet, the new registry/router/factory/vault/Aqua/feed/WETH/USDC
  addresses, and the sealed delegate (`SUBFLOOR_RING_BLOCKS` + `SUBFLOOR_DELEGATE_SEALED`; empty
  `SUBFLOOR_DELEGATE_KEY`).
- `taker`: mainnet RPC + addresses; `TAKER_PRIVATE_KEY` is the taker's own key (you set it),
  `TAKER_EDGE_BPS=-100`.
- `web`: `VITE_VAULT`, `VITE_VAULT_FACTORY`, and the mainnet addresses for the tape that reads chain.
- Sign the first mandate on the Ledger, POST it to `/api/mandates`, and the house agent ships.

### 8. Broadcast the two injection reverts on mainnet
`scripts/demo-refusal.sh` and `injection/run.ts escalation` against the mainnet deployment → real
`SettledBelowFloor` tx hashes for the video. `scripts/demo-lower-floor.sh attack` →
`BadGuardianSignature`. `cast send` (not `forge script`) so the reverting tx actually lands (trap §7).

### 9. Record every tx in the README, and update the tables
List each demo tx hash (fills, refusals, attacks) with its Basescan link in `README.md` — this is
what the closing VO promises ("we publish all of them in the README"). Update the deployment tables
in `README.md` and `docs/SPEC.md` §3 with the mainnet addresses.

## The index decision — flag before you start

The subgraph, calibration, daily report and the Graph "run query" affordance all run on the
**base-sepolia** subgraph. There is no mainnet subgraph, and deploying one (plus Substreams) the day
before submission is a large job for little marginal credit.

- **`/api/fills` and `/api/refusals` read the chain through HyperSync**, which is chain-agnostic —
  point them at mainnet and the tape shows the real mainnet fills and reverts.
- **The index-backed parts** (floor calibration percentiles, the daily report generated from the
  subgraph, the composable-Graph submission) stay on testnet, where they are genuinely live.

Recommended split, and it is honest: the **money, the fills, the attacks and the bounty are
mainnet**; the **index/standards/Graph story is demonstrated on the live testnet deployment** and
said so. Do not claim the mainnet run is index-backed until a mainnet subgraph exists. If time
allows after the run, a mainnet subgraph is the upgrade — not a blocker for the shoot.

## Cut / fallback

If mainnet slips on shoot day, the fallback is the run stays on testnet and the video says "testnet
today, mainnet next — the offer stands on both" (video-script closing note). The 1inch qualification
accepts a fork demo, so nothing is disqualified either way.
