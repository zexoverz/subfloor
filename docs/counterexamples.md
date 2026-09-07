# Counterexamples

The red half of red-then-green. Each entry is a program that takes money at a price the recipient
did not agree to, against a router missing the settlement check. They are archived because the
claim "no program can settle below the floor" is only worth something next to the programs that
can, when it is removed.

Every one is reproducible from this repository. None is hypothetical.

---

## 1 — The floor as an opcode: omit it and it is gone

**Against:** `ControlFloorRouter`, where the floor is the `RequireFloor` instruction rather than a
settlement check. This is the shape every prior design in this space uses, Ballast included.

**Program:** an ordinary limit swap. It attacks nothing and contains no trick. It simply does not
include the guard instruction.

```
StaticBalances(100e18, 200e18)
LimitSwap(tokenA, tokenB)
```

**Result:** the maker's floor is 0.6e18. The fill settles at 0.5e18 and the tokens move.
`test_red_controlRouterSettlesBelowTheFloorWhenTheProgramOmitsTheOpcode`.

**The same program against `FloorRouter`** reverts
`SettledBelowFloor(maker, tokenB, tokenA, 0.5e18, 0.6e18)`. There is no instruction to leave out, so
leaving it out changes nothing.

The control is not broken, and that is the point: include the opcode and it does refuse the fill
(`test_red_controlRouterDoesRefuseWhenTheProgramCooperates`). An optional guard works exactly as
long as the program cooperates, which is not a property worth having against a compromised agent.

---

## 2 — Hostile `Extruction`: the taker pays and receives nothing

**Against:** the guarded router with `_settlementGuard` removed. This is the counterexample that
says what the settlement check is actually buying.

`src/instructions/Extruction.sol` documents that a call target "may modify the swap registers, set
the program counter". So a maker-chosen contract can rewrite what settles. `HostileExtruction` does
exactly that, and nothing more than the interface permits.

**Counterexample found in 4 fuzz runs:**

```
args = [shape 25, takerFloor 937856, makerFloor 3976537911616004,
        amount 2467396412341873148315, forcedIn …, forcedOut …, forcedPC 117]

taker floor : 3,900,000,000,000,937,857
taker got   : 0
```

The taker parts with its tokens and receives nothing at all, because the Extruction target set
`amountOut` to zero after the swap curve had run. With the settlement check present the same
program reverts, and 256 runs over six program shapes — fee stacking, nested `RequireMinRate` and
`AdjustMinRate`, jumps, both swap curves — find nothing.

**Why this one matters most.** A fuzz suite that skips `Extruction` proves very little, because it
is the one instruction that can rewrite the result of everything before it. The first version of
this suite did run through `Extruction` and still failed to catch the removed guard: it fuzzed
`amountIn` as well, so `takerTraits.validate` rejected on the mismatch and essentially every run
reverted before settlement. It passed 256 runs against a router with no floor check at all. Pinning
`amountIn` to the taker's requested amount — which is what a real attack does, since shrinking the
return is the goal — is what made the suite bite.

That failure is recorded here rather than quietly fixed, because a fuzz test that cannot fail is
worse than no fuzz test: the counter goes up, the suite is green, and nobody looks again.

---

## Reproducing

```bash
cd contracts
forge test --match-contract RedThenGreen -vv     # counterexample 1, both arms
forge test --match-contract HostileFuzz          # counterexample 2, green
```

To see counterexample 2 red, delete the `FLOOR_REGISTRY.checkSettlement(...)` call in
`src/subfloor/GuardedSwapVM.sol` and run the same command.
