# SUBFLOOR — Base mainnet (8453) turnkey deploy runbook

Scope: put registry + router + factory + one vault (Ledger guardian, non-zero absolute backstop) on
Base mainnet, wire the services, broadcast the demo fills/refusals. Every signing step is the
builder's; nothing here is run by an agent. Read-only `cast call` is fine to verify.

All mainnet contract addresses below were re-confirmed live via `cast` on 12 Sep against
`https://mainnet.base.org`:
- Aqua `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` (code present, 11,241 hex chars)
- Chainlink ETH/USD `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` — `description()="ETH / USD"`, `decimals()=8`, latest answer ~`2.5358e11` ($2,535.83)
- WETH `0x4200000000000000000000000000000000000006`
- USDC native `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` — `symbol()="USDC"`, `decimals()=6`, EIP-2612

Placeholders filled after deploy: `<REGISTRY>`, `<ROUTER>`, `<FACTORY>`, `<VAULT>`, `<DEPLOY_BLOCK>`,
`<DELEGATE>` (rotated house-agent address), `<LEDGER>` (guardian device address).

---

## 0. One-time shell setup (builder's terminal, on an up-to-date `main`)

```bash
export PATH="$HOME/.foundry/bin:$PATH"
unset ETH_PASSWORD CAST_UNSAFE_PASSWORD ETH_KEYSTORE_ACCOUNT   # trap §7: these break every cast call
export RPC=https://mainnet.base.org
export OWNER_ACCOUNT=subfloor-dev        # the keystore that pays gas AND becomes cold owner/guardian
export SUBFLOOR_OWNER=0x<cold owner address>   # cast wallet address --account $OWNER_ACCOUNT
cd contracts
git status --porcelain -- contracts     # MUST be clean: Sourcify can only rebuild a committed tree
forge clean && forge build              # trap §7: a stale out/ artifact lies in bytecode comparisons
```

Confirm chain and balance before spending:
```bash
cast chain-id --rpc-url $RPC            # must print 8453
cast balance $SUBFLOOR_OWNER --rpc-url $RPC --ether
```

---

## 1. How `DeploySubfloor.s.sol` is parameterized (Task 1)

`contracts/script/DeploySubfloor.s.sol` is already a mainnet script. It hardcodes **no** testnet
values — every address comes from `SubfloorParams.sol` (all Base mainnet) and it reverts
`WrongChain` unless `block.chainid == 8453`.

Inputs:
- `SUBFLOOR_OWNER` (env, required) — final cold owner of the registry; also passed as the router's and
  the bare vault's owner.
- `SUBFLOOR_LOWERING_DELAY` (env, optional, default `0`) — registry `LOWERING_DELAY`. Leave `0`: a
  guardian-signed lowering applies immediately, which is what the demo needs.

What it does, in one broadcast:
1. `new FloorRegistry(deployer, loweringDelay)` — owned by the broadcaster first (feeds are onlyOwner).
2. Two **write-once** `setReferenceFeed` calls, both directions of WETH/USDC, using
   `SubfloorParams`: feed `0x71041d…`, staleness `ETH_USD_STALENESS_BOUND_PROVISIONAL = 2464`s,
   feed decimals `8`, token decimals 18/6 (and 6/18 inverted, `inverted=true`).
3. `new FloorRouter(BASE_AQUA, BASE_WETH, owner, registry)`.
4. `new AquaGuardVault(BASE_AQUA, owner)` — a **bare** vault: no delegate, no guardian, no floors, no
   registry guardian, **no absolute backstop**.
5. `registry.transferOwnership(owner)`.
6. `new VaultFactory(BASE_AQUA)`.

**Two consequences that shape this runbook:**

- The **router this script emits is unverifiable** (trap §6/§7: `forge script`/`forge create` produce
  FloorRouter bytecode that matches no commit). So we run the script for the **registry + feeds +
  factory** only, and deploy the real router separately by verifier-produced bytes (§3). The script's
  router and its bare vault are throwaways — do not point anything at them.
- The script's bare vault has **no backstop and no guardian wiring**. The hardening the adversarial
  benchmark asked for (`docs/adversarial-benchmark.md`) — a **non-zero absolute backstop** — is set
  per-pair when the vault is created, and the only path that sets it atomically together with the
  delegate, the vault guardian and the registry-side guardian is `VaultFactory.createVault(InitialSetup)`
  (§5). `DeploySubfloor` has no field for it. So: do **not** use the script's bare vault; create the
  real vault through the factory with a non-zero `absoluteRate`.

No Solidity edits are required. If you would rather not deploy the throwaway router+vault at all, the
alternative is deploying the registry with `forge create` and issuing the two `setReferenceFeed` calls
by hand — but those feeds are write-once, so a wrong argument means a new registry. Running the script
is the safer way to get the feed wiring exactly right; the wasted gas on the throwaway router+vault is
sub-dollar (measured deploy gas < $1 total).

### Command — run the deploy (registry + feeds + factory)

```bash
cd contracts
SUBFLOOR_OWNER=$SUBFLOOR_OWNER \
forge script script/DeploySubfloor.s.sol \
  --rpc-url $RPC --account $OWNER_ACCOUNT --broadcast
# DO NOT pass --verify (script constructor-arg decode aborts; see the NatSpec).
```

Record from the log: `FloorRegistry` → `<REGISTRY>`, `VaultFactory` → `<FACTORY>`. Ignore the
`FloorRouter` and `AquaGuardVault` it prints. Note the broadcast block as `<DEPLOY_BLOCK>`.

Verify registry and factory (both are ordinary contracts, unaffected by the router divergence):
```bash
forge verify-contract <REGISTRY> src/subfloor/FloorRegistry.sol:FloorRegistry \
  --chain 8453 --verifier sourcify \
  --constructor-args $(cast abi-encode "constructor(address,uint32)" $SUBFLOOR_OWNER 0) --watch
forge verify-contract <FACTORY> src/subfloor/VaultFactory.sol:VaultFactory \
  --chain 8453 --verifier sourcify \
  --constructor-args $(cast abi-encode "constructor(address)" 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a) --watch
```
(Repeat each with `--verifier etherscan --etherscan-api-key <BASESCAN_KEY>` for Basescan; note the
registry `loweringDelay` in the constructor args must match what you deployed — `0` unless you set
`SUBFLOOR_LOWERING_DELAY`.)

Confirm the feeds are set both ways (they cannot be fixed later):
```bash
cast call <REGISTRY> 'referenceAge(address,address)(uint256)' \
  0x4200000000000000000000000000000000000006 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --rpc-url $RPC
cast call <REGISTRY> 'referenceAge(address,address)(uint256)' \
  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 0x4200000000000000000000000000000000000006 --rpc-url $RPC
```
Both must return a small number (seconds), not revert.

---

## 2. (Not used for the first mainnet router) `RedeployRouter.s.sol`

`RedeployRouter.s.sol` is a testnet maintenance tool: it deploys a router **and docks old
strategies**, reading `SUBFLOOR_OLD_STRATEGY`/`SUBFLOOR_OLD_STRATEGIES` and `SUBFLOOR_TUSDC`, and it
still produces script-compiled (unverifiable) bytecode. There is no old book on mainnet to dock, and
we need verifiable bytes, so **it is not the tool for the first mainnet router.** Use §3 instead. Its
only value here is documenting the router constructor shape: `(aqua, weth, owner, registry)`.

`scripts/set-router.mjs` is likewise **not** part of the mainnet runbook: it rewrites the
`base-sepolia` subgraph manifest, the README and testnet fixtures against a hardcoded old sepolia
address. Mainnet has no subgraph and the frontend reads `VITE_*` env vars, not the `chain.ts` default.

---

## 3. Deploy `FloorRouter` from verifier-produced bytes, verify same day (Task 2)

This is the trap §6/§7 procedure: the bytes the verifier recompiles are the only bytes that will ever
verify, so deploy exactly those.

Constructor args (encode once, reuse):
```bash
ROUTER_ARGS=$(cast abi-encode "constructor(address,address,address,address)" \
  0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a \
  0x4200000000000000000000000000000000000006 \
  $SUBFLOOR_OWNER \
  <REGISTRY>)
```

### 3a. Get the recompiled creation code from the verifier

Ask `forge verify-contract` to verify FloorRouter against **any already-deployed address** (the
throwaway router from §1 is convenient). It will report a bytecode mismatch, and the job result
carries `recompiledCreationCode` — the exact creation bytecode the verifier builds from the committed
source. Capture it as JSON:

```bash
cd contracts
forge verify-contract <throwaway router from §1> src/routers/FloorRouter.sol:FloorRouter \
  --chain 8453 --verifier sourcify --constructor-args $ROUTER_ARGS \
  --show-standard-json-input > /tmp/router-input.json   # keeps the exact standard-json for step 3c
```

Then extract `recompiledCreationCode`. The reliable way that does not depend on how a given forge
version formats the failure is to fetch it from the Sourcify verify API with the standard-json you
just captured — but the repo's established shortcut (handoff §7) is: run the verify against a dummy
address and read `error.recompiledCreationCode` off the returned job JSON. Save the resulting hex
(0x-prefixed creation code, constructor args already appended because you passed `--constructor-args`)
to a file:

```bash
# result of the verify job → save the 0x… recompiledCreationCode string here:
CREATION=$(cat /tmp/router-creation.hex)   # e.g. paste from the verifier job output
```

FLAG — this is the single fiddly step. Confirm on the builder's forge version where
`recompiledCreationCode` appears (job JSON vs `error.*`). If it is not surfaced, the equivalent is a
direct POST to `https://sourcify.dev/server/verify` with `/tmp/router-input.json` and reading
`recompiledCreationCode` from the response. Do **not** substitute `forge create` output — that is the
exact bytecode that will never verify.

### 3b. Deploy exactly those bytes

```bash
cast send --create $CREATION --rpc-url $RPC --account $OWNER_ACCOUNT
```
Record the deployed address as `<ROUTER>`. Sanity-check size (trap: a too-small router is the #167
failure):
```bash
cast code <ROUTER> --rpc-url $RPC | wc -c    # expect ~48k+ hex chars (>24000 runtime bytes)
cast call <ROUTER> 'AQUA()(address)' --rpc-url $RPC   # or the router's aqua getter, must be canonical Aqua
```

### 3c. Verify on Sourcify AND Basescan, same day

Because the on-chain bytes now equal the recompiled bytes, both verifiers succeed:
```bash
forge verify-contract <ROUTER> src/routers/FloorRouter.sol:FloorRouter \
  --chain 8453 --verifier sourcify --constructor-args $ROUTER_ARGS --watch

forge verify-contract <ROUTER> src/routers/FloorRouter.sol:FloorRouter \
  --chain 8453 --verifier etherscan --etherscan-api-key <BASESCAN_KEY> \
  --constructor-args $ROUTER_ARGS --watch
```
Confirm Sourcify:
```bash
curl -s https://sourcify.dev/server/v2/contract/8453/<ROUTER>
```
An unverified router turns the demo's `SettledBelowFloor` revert into hex soup on the explorer — this
must be green before filming.

---

## 4. Create the vault with a NON-ZERO absolute backstop, Ledger as guardian (Task 1 hardening + §5 of the plan)

The absolute backstop is the one hardening the adversarial benchmark asked for. It is the last array
of `VaultFactory.createVault(InitialSetup)`:

`InitialSetup = (delegate, guardian, registry, base[], quote[], maxAdverseBps[], absoluteRate[])`

- `delegate` = `<DELEGATE>` (the rotated house-agent address from the Key Ring step, handoff §9a).
- `guardian` = `<LEDGER>` (the device address). The factory sets both the vault guardian and the
  **registry-side** guardian from this one field (confirmed in `VaultFactory.sol` — skipping the
  registry guardian is the silent failure that makes `lowerFloor` revert `NoGuardianRegistered`).
- `registry` = `<REGISTRY>`.
- pairs: `[WETH, USDC]` and `[USDC, WETH]`, both `maxAdverseBps = 100`.
- `absoluteRate[]` = **non-zero**, one per pair, in the registry's rate convention
  `received * 1e18 / given` in raw units. `effectiveFloor = max(relative, absolute)`, so the absolute
  is a hard floor the oracle cannot drag below.

### Compute the two absolute rates from the live feed (a few % under spot)

```bash
# live ETH/USD, 8 decimals
ANS=$(cast call 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70 'latestRoundData()(uint80,int256,uint256,uint256,uint80)' --rpc-url $RPC | sed -n 2p | awk '{print $1}')
# forward: WETH given (1e18 raw), USDC received; rate = USDC_raw*1e18/WETH_raw = ANS/1e8 * 1e6  = ANS*1e-2
#   backstop 5% under: floor_fwd = ANS * 1e-2 * 0.95
python3 - "$ANS" <<'PY'
import sys
ans=int(sys.argv[1])            # e.g. 253583153381  (=$2535.83)
spot_fwd = ans*10**6//10**8     # USDC(6) per WETH, in received*1e18/given raw units → equals USDC raw per 1 WETH
fwd = spot_fwd*95//100          # 5% under spot
# inverted: USDC given (1e6 raw), WETH received; spot = 1e18*1e18 / (spot_fwd*1e12)... use raw formula:
# rate_inv = WETH_raw*1e18/USDC_raw ; 1 USDC = (1e8/ANS) WETH = (1e8/ANS)*1e18 raw per 1e6 USDC raw
inv_spot = (10**8*10**18*10**18)//(ans*10**6)
inv = inv_spot*95//100
print("absoluteRate forward  WETH->USDC :", fwd)     # ~2.409e9 at $2535
print("absoluteRate inverted USDC->WETH :", inv)     # ~3.75e26 at $2535
PY
```
Use the two printed integers as `absoluteRate[0]` (WETH→USDC) and `absoluteRate[1]` (USDC→WETH).
Recompute at setup time against the then-current feed; do not hardcode a stale number. (uint232 caps
the value — both are far under 2^232, fine.)

### Create the vault (owner signs)

```bash
WETH=0x4200000000000000000000000000000000000006
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
FWD=<forward absoluteRate>; INV=<inverted absoluteRate>
SETUP="(<DELEGATE>,<LEDGER>,<REGISTRY>,[$WETH,$USDC],[$USDC,$WETH],[100,100],[$FWD,$INV])"
cast send <FACTORY> \
  'createVault((address,address,address,address[],address[],uint16[],uint256[]))' "$SETUP" \
  --rpc-url $RPC --account $OWNER_ACCOUNT
# find the new vault:
cast call <FACTORY> 'vaultsOfOwner(address)(address[])' $SUBFLOOR_OWNER --rpc-url $RPC
```
Record `<VAULT>`. Verify wiring (all must match):
```bash
cast call <VAULT> 'owner()(address)'    --rpc-url $RPC     # SUBFLOOR_OWNER
cast call <VAULT> 'delegate()(address)' --rpc-url $RPC     # <DELEGATE>
cast call <VAULT> 'guardian()(address)' --rpc-url $RPC     # <LEDGER>
cast call <REGISTRY> 'guardian(address)(address)' <VAULT> --rpc-url $RPC   # <LEDGER>  (registry-side!)
cast call <REGISTRY> 'floor(address,address,address)(bool,uint16,uint232)' <VAULT> $WETH $USDC --rpc-url $RPC  # true 100 <FWD>
cast call <REGISTRY> 'floor(address,address,address)(bool,uint16,uint232)' <VAULT> $USDC $WETH --rpc-url $RPC  # true 100 <INV>
```
Optionally verify the vault contract itself on Sourcify/Basescan (constructor
`(aqua, address(factory))`? No — the factory transfers ownership, so verify with
`constructor(address,address)` = `(canonical Aqua, <FACTORY>)`, since the factory was the constructor
owner before the transfer; confirm the exact constructor args from `AquaGuardVault`'s constructor if
Basescan rejects).

---

## 5. Fund the vault ($20) and the taker ($55) (plan step 6)

Owner (or anyone — the vault is protected by ERC20 balance) transfers maker inventory into `<VAULT>`:
~0.004 WETH + ~10 USDC. On mainnet USDC supports EIP-2612 so funding can use a permit instead of an
approve tx. Send the taker EOA ~0.015 WETH + ~20 USDC + a little ETH for gas. Prove the venue is live
later from event recency, not from a balance (trap §7).

---

## 6. Point the services at mainnet (Task 4)

All values below are **non-secret** and can be set by an agent session with the Railway MCP; the
**keys** (`SUBFLOOR_DELEGATE_KEY`, `TAKER_PRIVATE_KEY`, `SUBFLOOR_HYPERSYNC_TOKEN`,
`SUBFLOOR_GRAPH_API_KEY`) are set by the builder from the dashboard only.

HyperSync is chain-agnostic in logic but its **URL is chain-specific** — repoint it. Base mainnet
endpoint: `https://base.hypersync.xyz/query` (equivalently `https://8453.hypersync.xyz/query`).

### `agent` service (house agent) — `agent/src/house/run.ts`, `switch-on.ts`, injection scripts
```
SUBFLOOR_RPC            = https://mainnet.base.org
SUBFLOOR_ROUTER         = <ROUTER>
SUBFLOOR_REGISTRY       = <REGISTRY>
SUBFLOOR_AQUA           = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a
SUBFLOOR_WETH           = 0x4200000000000000000000000000000000000006
SUBFLOOR_TUSDC          = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913   # var is named TUSDC; on mainnet it is real USDC
SUBFLOOR_QUOTE          = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
SUBFLOOR_AGGREGATOR     = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70
SUBFLOOR_VAULT          = <VAULT>
SUBFLOOR_FROM_BLOCK     = <DEPLOY_BLOCK>          # default 46513825 is a sepolia block — must change
SUBFLOOR_HYPERSYNC_URL  = https://base.hypersync.xyz/query
# Key Ring (handoff §9a): SUBFLOOR_RING_BLOCKS + SUBFLOOR_DELEGATE_SEALED set from ~/.subfloor/,
# SUBFLOOR_DELEGATE_KEY left EMPTY. SUBFLOOR_HYPERSYNC_TOKEN set by builder.
```

### `taker` service — `agent/src/taker/bot.ts`
```
SUBFLOOR_RPC            = https://mainnet.base.org
SUBFLOOR_ROUTER         = <ROUTER>
SUBFLOOR_REGISTRY       = <REGISTRY>
SUBFLOOR_AQUA           = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a
SUBFLOOR_WETH           = 0x4200000000000000000000000000000000000006
SUBFLOOR_QUOTE          = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
SUBFLOOR_AGGREGATOR     = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70
SUBFLOOR_VAULT          = <VAULT>                 # comma-list ok; the taker filters by vault
SUBFLOOR_FROM_BLOCK     = <DEPLOY_BLOCK>
SUBFLOOR_HYPERSYNC_URL  = https://base.hypersync.xyz/query
TAKER_EDGE_BPS          = -100
# TAKER_PRIVATE_KEY and SUBFLOOR_HYPERSYNC_TOKEN: builder sets (taker holds its own hypersync copy).
```

### `web` service — bundle (`VITE_*`) + api (`frontend/api/_lib/chain.ts`)
Bundle (build-time; a redeploy is required for VITE_* to take effect):
```
VITE_CHAIN            = base                       # frontend/src/lib/chain.ts switches to viem `base`
VITE_FLOOR_REGISTRY   = <REGISTRY>
VITE_FLOOR_ROUTER     = <ROUTER>
VITE_VAULT            = <VAULT>
VITE_VAULT_FACTORY    = <FACTORY>
VITE_AQUA             = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a
VITE_RPC_URL          = https://mainnet.base.org
VITE_FAUCET           = (unset — no faucet on mainnet)
VITE_SUBGRAPH_URL     = /api/subgraph            # unchanged; see §7 on the index split
```
API (`/api/fills`, `/api/refusals` read chain history via HyperSync):
```
SUBFLOOR_RPC           = https://mainnet.base.org
SUBFLOOR_ROUTER        = <ROUTER>
SUBFLOOR_REGISTRY      = <REGISTRY>
SUBFLOOR_AGGREGATOR    = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70
SUBFLOOR_WETH          = 0x4200000000000000000000000000000000000006
SUBFLOOR_QUOTE         = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
SUBFLOOR_FROM_BLOCK    = <DEPLOY_BLOCK>
SUBFLOOR_HYPERSYNC_URL = https://base.hypersync.xyz/query
```

FLAG (code hardcode): `frontend/api/_lib/chain.ts` line 79 builds its viem client with
`chain: baseSepolia` hardcoded, even though the transport uses `SUBFLOOR_RPC`. Because the RPC
transport is explicit, `/api/fills` will still read mainnet, and the decode constants
(`referenceFor(..., 8, 6)`) already match mainnet ETH/USD (8 dec) and USDC (6 dec). It is very likely
functional as-is, but the `baseSepolia` label is wrong for mainnet — verify `/api/fills` returns real
mainnet fills after cutover; if viem complains, change that literal to `base`. Everything else in that
file is env-driven.

Then: sign the first mandate on the Ledger, POST it to `/api/mandates` (handoff §9a step 2 — `#232`
means the UI may only show the signed mandate, so it may need posting by hand), and the house agent
ships.

---

## 7. Broadcast the two injection reverts on mainnet (plan step 8)

The demo scripts are env-driven; with the `agent`/CLI env pointed at mainnet (§6) plus
`SUBFLOOR_TUSDC=<USDC>`, they compose against the mainnet deployment. Use `cast send` paths (the
scripts already do) so a reverting tx actually lands (trap §7: `forge script` will not broadcast a
revert).

```bash
# settlement refusal → real SettledBelowFloor tx hash
SUBFLOOR_RPC=$RPC SUBFLOOR_VAULT=<VAULT> SUBFLOOR_ROUTER=<ROUTER> \
SUBFLOOR_TUSDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
DELEGATE_ACCOUNT=<delegate keystore> DRY_RUN=1 bash scripts/demo-refusal.sh   # dry run first
# then DRY_RUN=0 for the real one

# guardian-signature attack → BadGuardianSignature (nonce untouched because it reverts)
SUBFLOOR_RPC=$RPC SUBFLOOR_VAULT=<VAULT> SUBFLOOR_REGISTRY=<REGISTRY> \
DELEGATE_ACCOUNT=<delegate keystore> bash scripts/demo-lower-floor.sh attack
# real guardian lowering off the Ledger, then raise back in the app:
SUBFLOOR_RPC=$RPC SUBFLOOR_VAULT=<VAULT> SUBFLOOR_REGISTRY=<REGISTRY> \
GUARDIAN=ledger bash scripts/demo-lower-floor.sh guardian
```
Record every tx hash (fills, refusals, attacks) with Basescan links in `README.md`, and update the
deployment tables in `README.md` and `docs/SPEC.md` §3.

---

## 8. Mainnet subgraph feasibility (Task 5)

Config read: `indexer/subgraph/subgraph.base-sepolia.yaml` is the deployed manifest (four data
sources: Aqua `0xA86da73e…`, FloorRouter `0x03189D…`, FloorRegistry `0x47c7Ab…`, ChainlinkEthUsd
`0xa24A68…`, all `network: base-sepolia`, `startBlock: 46513825`). The default `subgraph.yaml`
targets `network: base` with **canonical Aqua** `0x1111113CCf…` but `startBlock: 35000000` and no
address on the FloorRouter/FloorRegistry sources — it is an incomplete mainnet template. There is no
`networks.json`. `package.json` has a `deploy:mainnet` script (`graph deploy subfloor-mainnet`).

To deploy on Base mainnet you would need to: create `subgraph.base.yaml` (or complete `subgraph.yaml`)
with `<ROUTER>`, `<REGISTRY>`, a mainnet ChainlinkEthUsd source at `0x71041d…`, Aqua at canonical
`0x1111113CCf…`, every `startBlock` = `<DEPLOY_BLOCK>` (not 35,000,000), keep the ABIs, `graph codegen
&& graph build`, deploy to Studio, then publish to The Graph Network (Arbitrum One gas + optional
curation) and set `SUBFLOOR_SUBGRAPH`/`SUBFLOOR_GRAPH_API_KEY` on `web` (handoff §9 step 2).

**Verdict: not feasible well inside the submission window, and not needed for the headline claims.**
Reasons:
1. The Aqua data source must index canonical Aqua on mainnet, which carries real third-party volume;
   syncing from the deploy block to head across a live venue is a multi-hour-plus job, and any
   `startBlock` mistake (e.g. leaving 35,000,000) makes it far worse.
2. Publishing to The Graph Network needs Arbitrum gas and a wait for the gateway to answer, on top of
   Studio deploy — the plan already burned time on exactly this for testnet (handoff §9 step 2).
3. The mainnet claims that must be true — the fills, the refusals, the bounty — are all reproducible
   **without** the index: `/api/fills` and `/api/refusals` read chain history through HyperSync
   (chain-agnostic; just repoint `SUBFLOOR_HYPERSYNC_URL`). Only the index-backed extras (floor
   calibration percentiles, the daily report, the composable-Graph submission) stay on the live
   testnet subgraph, and the plan already discloses that split honestly.

Recommendation: ship the money/fills/attacks/bounty on mainnet with HyperSync-backed tape; leave the
index/standards/Graph story on the live testnet deployment and say so. A mainnet subgraph is an
after-the-run upgrade, not a blocker for the shoot.

---

## Ordered checklist

1. §0 shell setup; confirm chain-id 8453 and owner balance.
2. §1 run `DeploySubfloor` → `<REGISTRY>`, `<FACTORY>`, `<DEPLOY_BLOCK>`; verify both; confirm feeds.
3. §3 deploy `<ROUTER>` from verifier bytes; verify on Sourcify AND Basescan same day.
4. §4 compute non-zero backstops from the live feed; `createVault` with Ledger guardian; verify wiring.
5. §5 fund vault ($20) and taker ($55).
6. §6 set non-secret service vars (agent/taker/web) to mainnet; builder sets keys; redeploy web for VITE_*.
7. Sign first mandate on Ledger → `/api/mandates`; house agent ships; confirm a real fill.
8. §7 broadcast refusal + attack; record all tx hashes in README + SPEC §3.
9. §8 leave the subgraph on testnet; disclose the split.
