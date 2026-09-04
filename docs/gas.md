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
| Guarded router, neither side opted in | 106,367 | **+14,569** |
| Guarded router, taker floor configured | 104,352 | **+12,554** |

Was +15,133 / +13,118 when the guard made two separate calls into the registry. Folding them into
one `checkSettlement` saved 564.

For context, from `.gas-snapshot` at `f09a41e`: `MinRate`, the maker's *optional, in-program* rate
guard, costs **+1,994**.

## Two things in this table are worth saying out loud

**The opt-out path is the expensive one.** A recipient who never configured anything pays more
(+15,133) than one who did (+13,118). The reason is the resolution order: an unconfigured pair
reads the pair slot, finds it empty, and then reads the per-recipient default slot — two cold
SLOADs — while a configured pair short-circuits after the first. So the expectation that "a user
who never opts in pays one cold SLOAD finding a zero default" is not what the code does, and the
cost falls hardest on exactly the users getting no benefit.

**+14,569 is not a small number** against a 91,798 gas swap. It is roughly seven times what the
optional in-program guard costs. Where it goes, measured rather than reasoned about:

| Component | Gas |
|---|---:|
| The per-recipient default tolerance lookup | **4,628** |
| Everything else: the cold registry account, two pair-slot reads, the arithmetic and the call | 9,941 |

The 4,628 figure comes from deleting the default-tolerance branch and re-running the same test.
That one feature is a third of the whole overhead, it is paid on **every swap by everyone**
including recipients who never opted in, and it is the reason the opt-out path costs more than the
opt-in one. Without it the ordering inverts to the intuitive one: +9,941 opted out, +10,194 opted
in.

The default is a convenience — "apply this tolerance to any pair I have not configured" — and it is
in the spec. Whether it is worth 4,628 gas on every fill is a product decision, not an engineering
one, so it is recorded here with its price rather than quietly removed.

Publishing the number before it is fully optimised is deliberate. It is the honest starting point,
and a table that improves between now and submission is worth more than one that appears finished.
