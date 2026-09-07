# The settlement invariant, proved

Fuzzing samples the space of hostile programs. This closes the part of it that matters, for all
inputs rather than for millions of them.

```
$ FOUNDRY_PROFILE=symbolic halmos --contract FloorSettlementSymTest

[PASS] check_belowTheFloorAlwaysReverts(uint256,uint256,uint256)      (paths: 5, time: 0.15s)
[PASS] check_passingImpliesAtOrAboveTheFloor(uint256,uint256,uint256) (paths: 7, time: 0.14s)
Symbolic test result: 2 passed; 0 failed; time: 0.31s
```

## What is proved

Both directions, which is what makes it a guarantee rather than a formality:

1. **If the check passes, what moved was at or above the floor.** For all `given`, `received` and
   `floorRate`.
2. **If what moved was below the floor, the check reverts.** Also for all of them. A check that
   never passed a bad fill *and never passed a good one either* would satisfy (1) alone and be
   worthless; this is the half that rules it out.

Bounded to amounts below `2**128`. Not a convenience: OpenZeppelin's `mulDiv` carries a 512-bit path
for products that overflow 256 bits, and an open domain makes the solver explore it without
terminating. Under `2**128` the product with `1e18` cannot overflow, that branch is unreachable, and
what is proved covers every token amount that can exist — the total supply of every real ERC-20 is
orders of magnitude below the bound.

## What is not proved, and why it is said out loud

**Halmos does not converge on `FloorRegistry` itself.** `effectiveFloor` reaches an external oracle
through a storage mapping and the path count blows up long before the solver arrives at the
comparison. So the proof runs against `FloorSettlementLemma`, the same arithmetic lifted into a
standalone contract.

A proof about a contract that *resembles* the shipped one is the classic way a formal-methods claim
comes to mean nothing, so the two are pinned together by
`testFuzz_theLemmaMatchesTheShippedComparison`: for fuzzed inputs, the registry and the lemma revert
on exactly the same fills. Break the equivalence and that test fails.

**Monotonicity is not proved.** "Raising can never weaken protection" was written both as one lemma
and split into two, and every version times out: the solver ends up relating two symbolic `mulDiv`
calls under `Ceil` rounding, and bounding the reference rate below `2**128` did not help. It stays
covered by `testFuzz_raisingIsMonotone`, which is fuzzed and mutation-tested.

It is also the weaker of the two properties. Monotonicity constrains how a floor may **change**; the
two proved lemmas constrain what settlement may **do**. The spec's own cut order says to shrink the
proof to the settlement lemma rather than cut it, and this is what that looks like when the solver
decides where the line falls rather than the schedule.

## Reproducing

```bash
cd contracts
FOUNDRY_PROFILE=symbolic forge build --no-dynamic-test-linking
FOUNDRY_PROFILE=symbolic halmos --contract FloorSettlementSymTest --solver-timeout-assertion 90000
forge test --match-test testFuzz_theLemmaMatchesTheShippedComparison   # the equivalence pin
```

The `symbolic` profile exists because Foundry's dynamic test linking rewrites `new C(...)` into
`vm.deployCode`, which Halmos cannot execute, and because Halmos needs the solc AST that the default
profile does not emit. Both cost an afternoon to find and are recorded in `foundry.toml` next to the
settings that fix them.
