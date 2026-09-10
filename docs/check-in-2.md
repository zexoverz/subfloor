# Check-in 2 — draft

Deadline **11 Sep 03:59 UTC**. File the evening before; `docs/SPEC.md` §0 records a missed check-in
as elimination by technicality.

Every number below is checkable from this repository or from a block explorer. Nothing here is
rounded up, and the unfinished parts are named as unfinished.

---

**Name**

SUBFLOOR

**Description**

Let an AI agent trade your portfolio. Set one number. Your money can never go below it. The floor is
a settlement condition inside a forked 1inch SwapVM router, not an instruction the agent's own
program can decline to run.

**Github**

https://github.com/zexoverz/subfloor

**Idea**

Every "agent wallet" today defends the key. That is the wrong perimeter: the agent is supposed to
have the key, so a compromised or badly-prompted agent has everything it needs to lose your money
without ever stealing it. SUBFLOOR moves the perimeter to the price. `FloorRegistry` is
recipient-keyed, so a floor protects a recipient on every fill it takes through the router, and
`GuardedSwapVM._settlementGuard` scores **both** parties after taker validation and before any
tokens move, mirrored in `quote()`.

The floor is relative to a live Chainlink reference,
`max(ceil(reference * (10000 - bps) / 10000), absoluteRate)`, with a freshness check that fails
closed. A static min-rate is either too tight to trade or too loose to mean anything once the market
moves; that is the part that was actually hard.

Raising a floor is free and device-free because it can only help you. Lowering it is the one
dangerous action, so it is the one the hardware device owns, enforced on chain by the registry's
guardian signature check.

**Where it is**

- Contracts live and Sourcify-verified on **Base Sepolia** (FloorRegistry, FloorRouter,
  VaultFactory, AquaGuardVault, TestnetFaucet) and on **Ethereum Sepolia** (FloorRegistry,
  FloorRouter, exact match) — the second chain is portability evidence, not a second live run.
- **962 contract tests pass**, including fuzz, invariant and a red-then-green counterexample suite.
  `docs/counterexamples.md` archives three programs that take money at a price the recipient did not
  agree to, against routers missing the check.
- **Vault setup is one transaction.** `createVault(setup)` returns a vault already delegated,
  guarded on both sides and floored in both directions. It replaced six, three of which were
  `execute` carrying opaque calldata.
- **Refusals are on chain.**
  [`0xd8969d01…`](https://sepolia.basescan.org/tx/0xd8969d01cdce69b8d9dc258f07af56f9b1e84fc1f0fac17b7868c428b00827f0)
  reverts `SettledBelowFloor` at 2491787104 against a floor of 2495000000.
- **The index is live**, `hasIndexingErrors: false`, implementing the Messari DEX Aggregator
  standardized schema, and it is load-bearing: the floor-setting screen's default is calibrated from
  realized adverse deviation, and below a hundred scored fills it refuses to return a percentile at
  all rather than quote a rumour.

**Upstream contribution**

While shipping the fuller position we found a live giveaway in 1inch SwapVM itself.
`OraclePriceAdjuster` compares a 1e18-scaled Chainlink answer against a swap price computed from raw
token amounts; on any pair whose tokens differ in decimals the two are 1e12 apart, the ratio
saturates the cap, and the taker is handed **exactly twice** the tokenOut the curve priced, with no
revert. Reproduced in their own test fixture: `6000000000` where the curve priced `3000000000`.

Reported on [`1inch/swap-vm#31`](https://github.com/1inch/swap-vm/issues/31) and fixed in
[`1inch/swap-vm#197`](https://github.com/1inch/swap-vm/pull/197), which takes their suite from 797 to
803 passing.

**Blockers**

One, on the Ledger track, and it is a question rather than a bug.

`ring init` is USB-only in the source we read, so enrolling a headless agent host into a Key Ring has
no path we can find. The track page says "headless by design", which suggests one exists. We cannot
resolve this locally — it decides whether the agent host must be a USB-attached machine or whether a
software/Speculos path is accepted for the demo.

Until it is answered the registry guardian remains a development key, which we will not present as
the hardware-owned path, because "even a hacked agent cannot go below your floor" is circular if the
floor-setting key sits on the machine the agent runs on. The asymmetry itself is already enforced on
chain; what is unproven is that the key lives on the device.

Any answer from the Ledger team on whether physical hardware is required, or a headless path is
accepted, unblocks the last items on that track.

**Also outstanding, and ours rather than anyone's to unblock**

Base mainnet deployment with our own money, and the Substreams package published to substreams.dev.
Both are scheduled before submission and neither is waiting on a sponsor.
