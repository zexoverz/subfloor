# Frontend integration brief

What the screens read, what they write, and what has to exist before either works. Written
against the contracts on disk, not against the plan — the two have already drifted (the
per-recipient default is gone, the lowering timelock is deployment-optional, the vault mandate
bounds each token separately).

Nothing here is deployed yet. The app in `frontend/` (Vite + React + TypeScript + Tailwind v4)
renders every screen from `src/fixtures.ts`, typed by `src/types.ts`. No component fetches
anything, so swapping that one module for real readers is the whole integration.

```
npm install && npm run dev      # the skeleton
npm run check                   # rate-convention tests + the copy gate
npm run build                   # type-check and bundle
```

`src/lib/rate.ts` owns every rate/price conversion and is the only place that arithmetic lives.
`src/copy.ts` owns every user-visible string, which is what makes the copy gate exact.

## Three sources, and which screen reads which

| Source | Feeds | Status |
|---|---|---|
| **Contract reads** (viem/wagmi) | the standing floor, the reference age, whether a guardian is registered | contracts exist, nothing deployed (#38) |
| **Subgraph** (Graph Client) | the tape's fills, floor history, the p50/p99 the floor screen calibrates from | not started (#23, #24) |
| **Substreams** | the refusal count and the refusal card's numbers | not started (#33) |

**A refused fill emits nothing.** `SettledBelowFloor` is a revert; a reverted transaction has no
logs, so no event handler will ever populate a `Refusal` entity. Refusals come from the
Substreams module reading transaction status, or — for our own transactions on shoot day — from
watching the receipt and decoding the revert args client-side. Same five numbers either way.
Full detail in `docs/event-map.md`, which also carries every topic0 the indexer agreed on.

## The contract surface the frontend actually touches

`FloorRegistry` — the only contract the owner's browser writes to.

```solidity
// reads
effectiveFloor(recipient, base, quote) returns (uint256 floorRate, bool enforced)
floor(recipient, base, quote)          returns (bool configured, uint16 maxAdverseBps, uint232 absoluteRate)
referenceAge(base, quote)              returns (uint256 age, uint32 registryBound)
guardian(recipient)                    returns (address)
nonces(recipient)                      returns (uint256)
pendingLowering(recipient, base, quote) returns (bool exists, uint16 maxAdverseBps, uint64 effectiveAt, uint232 absoluteRate)

// writes
raiseFloor(base, quote, uint16 newMaxAdverseBps, uint256 newAbsoluteRate)   // msg.sender == recipient, no device
setGuardian(address)                                                        // once only, see below
lowerFloor(recipient, base, quote, newMaxAdverseBps, newAbsoluteRate, nonce, deadline, signature)
executeLowering(recipient, base, quote)                                     // only if LOWERING_DELAY > 0
```

`AquaGuardVault` — owner-side only: `withdraw`, `setDelegate`, `setGuardian`, `setDockOperator`,
`dock`. **`ship` / `updateQuote` are the agent's delegate surface and the frontend never calls
them.** The panic control calls `dock()` (which a dock operator may also hold, because docking can
only stop trading) and then fires ring revocation off-chain.

## The rate convention, which is the classic bug

Every rate in the system is `received_raw * 1e18 / given_raw`, from one party's point of view;
higher is better for that party. To display:

```
humanPrice = rate / 1e18 * 10**(baseDecimals - quoteDecimals)
```

For WETH(18) → USDC(6) that is `rate / 1e6`. A floor of 2,445.40 USDC per WETH is
`2_445_400_000`. Get the orientation backwards and every number still looks plausible, which is
why it is pinned in the contract tests and should be pinned in a frontend unit test too.

`base` is always the token the recipient **gives**, `quote` the token it **receives**.

## What the device signs

Three EIP-712 payloads. ERC-7730 descriptors (#36) must render these, and the pre-device summary
screen must be generated from the same descriptor source — a screen that disagrees with the
device is a stop-everything bug, not a cosmetic one.

```
domain: "SUBFLOOR FloorRegistry" v1        (the registry address, chainId 8453)
  FloorLowering(address recipient,address base,address quote,uint16 maxAdverseBps,uint256 absoluteRate,uint256 nonce,uint256 deadline)
  GuardianRotation(address recipient,address newGuardian,uint256 nonce,uint256 deadline)

domain: "SUBFLOOR AquaGuardVault" v1       (the vault address)
  Mandate(address delegate,address app,address[] tokens,uint256[] maxAmounts,uint256 nonce,uint256 expiry)
```

One nonce counter per recipient, shared across the registry's typehashes: a pending signature is
invalidated by any other signed action. Read `nonces(recipient)` at signing time, never cache it.

## States the wireframes do not cover, and the UI has to

- **`enforced == false`.** There is no per-recipient default any more. A recipient who never
  called `raiseFloor` for this pair has no floor and settlement does not check one. The live view
  cannot render "your floor" as a number in that state, and onboarding is not complete until the
  first `raiseFloor` lands.
- **`LOWERING_DELAY > 0`.** If the deployed registry carries a delay, `lowerFloor` does not lower
  anything — it emits `FloorLoweringScheduled` and someone must call `executeLowering` after
  `effectiveAt`. The device ceremony then ends in "signed, effective at 14:32", not in a new
  floor. The live run is planned with delay zero, but read `LOWERING_DELAY()` and branch; do not
  hardcode the happy path.
- **`setGuardian` is once-only.** A recipient may register a guardian while none is set; replacing
  one needs `rotateGuardian` under the *outgoing* guardian's signature. Onboarding must therefore
  register the device key before or with the first floor, and a "change device" flow is a second
  ceremony, not a settings toggle.
- **Reference feeds are write-once and owner-only.** The pair's feed and staleness bound cannot be
  changed after registration. Nothing in the owner UI sets them; the floor screen only reads the
  age and renders the fail-closed sentence.
- **A raise must not weaken either component.** `raiseFloor` reverts `NotARaise` unless
  `newMaxAdverseBps <= old && newAbsoluteRate >= old`. The slider drags one component; the other
  has to be carried through unchanged or the transaction reverts.

## Blocked on

| Need | Issue |
|---|---|
| Deployed addresses + ABIs on Base | #38 |
| Subgraph serving fills and floor history | #23, #24 |
| Calibration endpoint (p50/p99 for the floor screen) | #42 |
| Substreams refusal counter | #33 |
| ERC-7730 descriptors + DMK in the browser | #35, #36 |

Until #42 lands, the floor screen must ship in its cold-start state anyway: below 100 fills it
says the venue history is too short to calibrate and shows the house number, labelled as one.
That state has to exist regardless, so it is not throwaway work.

## Copy

The permission register is dead ground and the banned list is a hard rule on every visible string,
including tooltips, aria-labels and errors. `frontend/check-copy.mjs` greps `src/` for it (comments exempt, copy not) and
`npm run check` runs it. Sanctioned substitutions: **notional bound**, **the floor held**, **trading stops**,
**refused**, **device-signed**. The scope sentence is verbatim, everywhere scope is stated: *the
worst price on this venue is the one you set.*
