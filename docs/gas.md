# Gas, measured

Every number here comes from a run on this machine. Nothing is estimated, and the method is
written down so the numbers can be reproduced or contradicted.

## Method

Two trees, one toolchain. The baseline is a git worktree at `cfbc6ba` — the vendored
`1inch/swap-vm` at `f09a41e`, before any SUBFLOOR change — with `node_modules` symlinked from the
working tree so both compile against identical dependencies. Both are built with Foundry 1.8.1,
solc 0.8.30, `optimizer_runs = 700`, `via_ir = true`.

The vendored `.gas-snapshot` file is **not** a valid baseline. It was produced by an older Foundry
and its numbers differ from what 1.8.1 reports on the same source — one quote case moved by more
than 9,000 gas with no code change at all. Comparing against it would have measured a toolchain
upgrade and called it our cost.

## What the settlement hook costs a router that does not use it

Zero, on every case in the dedicated gas suite.

| | |
|---|---|
| Gas suite cases compared | 56 |
| Cases where the fork differs from `f09a41e` | **0** |

The hook is an empty `internal view virtual` function. A router that does not override it compiles
to the same bytecode, so an unmodified `SwapVMRouter` pays nothing for the hook existing.

Across all 769 shared tests, 96 differ, by between −27,084 and +3,131. These are multi-swap
invariant harnesses, the deltas run in both directions, and the per-swap gas cases are all exactly
zero — consistent with bytecode layout shifting, not with work being added. Stated here rather than
omitted, because a reader running the suite will see them.

## What the floor check costs when it is switched on

One test, one program, one block, three routers, each measured from identical cold state
(`test_gasCostOfTheSettlementCheck` in `test/subfloor/RedThenGreen.t.sol`). Measuring them back to
back without reverting state compares a cold first swap against a warm second one and reports the
guard as nearly free; that is a measurement artefact and the test avoids it deliberately.

| Case | Gas | vs upstream |
|---|---:|---:|
| Upstream `SwapVMRouter`, LimitSwap | 91,798 | — |
| Guarded router, neither side opted in | 101,757 | **+9,959** |
| Guarded router, taker floor configured | 102,001 | **+10,203** |

For context, from `.gas-snapshot` at `f09a41e`: `MinRate`, the maker's *optional, in-program* rate
guard, costs **+1,994**.

## How it got there, because the first number was worse

| Change | Opted out | Opted in |
|---|---:|---:|
| First working version | +15,133 | +13,118 |
| One `checkSettlement` call instead of two `checkFill` calls | +14,569 | +12,554 |
| Per-recipient default tolerance removed | **+9,959** | **+10,203** |

The default was the expensive part, at 4,628 gas on every fill — a third of the whole overhead. It
let a recipient set one tolerance covering any pair they had not configured, and it cost that
because an unconfigured pair read the pair slot, found it empty, and then read the default slot.
Two cold SLOADs on the path taken by recipients getting no benefit.

Removing it also fixed the ordering. Opting out used to cost **more** than opting in, which is the
wrong way round for a guarantee nobody is forced to use, and it would have been the first thing a
reader noticed in this table. Now a recipient who never opts in pays for one cold SLOAD that finds
zero, and a recipient with a floor pays 244 gas more for the reference read and the comparison.

Setting a floor per pair is one call, so nothing is lost but a convenience, and the convenience was
a third of the price.

Publishing the number before it is fully optimised is deliberate. It is the honest starting point,
and a table that improves between now and submission is worth more than one that appears finished.

## The optional in-program guards

Measured in `test/subfloor/SubfloorGuards.t.sol`, same-harness, cold state.

| Case | Gas | vs the same program without it |
|---|---:|---:|
| LimitSwap, no guard | 109,402 | — |
| plus `NotionalThrottle`, first write in an epoch | 133,044 | **+23,642** |

`RequireFreshReference` and `ApprovalGate` are reads and a signature check; `NotionalThrottle` is
the only guard here that writes storage, and the cold SSTORE is essentially all of that 23,642.

**So it does not ship by default.** 22% on top of a fill is not a cost to impose on every strategy,
and the flagship strategies do not carry it. It stays a documented instruction for the case it
exists for: a strategy whose operator wants a hard ceiling on churn within an epoch, accepting the
write. That decision is exactly what §13 asked for — measure it early, and if the number embarrasses
the table, keep the instruction and stop shipping it by default.

The number is per epoch, not per fill: the second and later fills in the same epoch write a warm
slot instead.
