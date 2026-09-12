# Adversarial benchmark — the published key against the live deployment

The bounty (§8) hands the agent's delegate key to the public and funds the vault. This is the
evidence that the offer is safe to make: with that exact key, every path that could move money out
or weaken the floor was attempted against the **live Base Sepolia deployment** and refused.

Every case here is run read-only with `eth_call` impersonating the attacker's `from` — the call
walks the identical contract path a real transaction would (the settlement guard and the
`onlyOwner` / guardian checks all run before any state change), so a revert here is the same revert
a broadcast would hit. Reproduce any row with `cast call --from <attacker> <to> <calldata>`; the
revert selectors below are `cast sig` of the named error.

## What the key holder cannot do — refused live

| Attack, as the delegate key (or a random address) | Result | Revert |
|---|---|---|
| `lowerFloor(...)` to zero, correct nonce, forged signature | refused | `BadGuardianSignature` `0x5760fd80` |
| `withdraw(token, amount, to)` | refused | `OwnableUnauthorizedAccount` `0x118cdaa7` |
| `execute(token, 0, transfer(...))` — arbitrary call | refused | `OwnableUnauthorizedAccount` |
| `setGuardian(attacker)` / `setDelegate(attacker)` | refused | `OwnableUnauthorizedAccount` |
| `withdraw(...)` from a random address (not delegate, not owner) | refused | `OwnableUnauthorizedAccount` |

The delegate surface is exactly `ship` / `dock` / `updateQuote` / `rescueApproval`. `ship` needs a
guardian-signed mandate it cannot forge (the `BadGuardianSignature` row proves the forge fails);
`dock` can only stop trading; `rescueApproval` can only reduce an approval to zero. None of them
moves a token out, and the owner-only surface (`withdraw`, `execute`, `setDelegate`, `setGuardian`)
rejects the delegate.

## The floor itself — settle below it

Not re-demonstrated by a live swap here: the concentrated books rotate (the house agent re-centres
and refreshes them), so a swap against a captured strategy hash reverts at Aqua's
`SafeBalancesForTokenNotInActiveStrategy` — a stale-book artifact, not the floor. The below-floor
property rests on three standing sources instead:

- **Halmos**, both directions, in `docs/proof.md` (`check_belowTheFloorAlwaysReverts`,
  `check_passingImpliesAtOrAboveTheFloor`).
- **Fuzzing** over generated and hostile programs, `docs/fuzz-counter.json` (1.6M+ and rising, zero
  below the floor), method in `docs/counterexamples.md`.
- **Real on-chain refusals**: `SettledBelowFloor` reverts on Base Sepolia, e.g.
  `0xd8969d01cdce69b8d9dc258f07af56f9b1e84fc1f0fac17b7868c428b00827f0`, and the `quote()` mirror
  reverts the same before a fill is ever sent.

To produce a fresh below-floor refusal on demand, `scripts/demo-refusal.sh` ships a book under the
reference from the delegate and takes it; settlement reverts `SettledBelowFloor`.

## Blast radius

Even a settlement-math bug is capped at **shipped inventory** by Aqua's `pull` underflow revert
(§8). With the demo vault funded at ~$20 and a $15 pot, the most a break could take is what is
shipped — which is why the offer is publishable.

## Honest residual

The core price comparison is proven; the surrounding plumbing (rate orientation, decimals, the
mandate/allowance accounting behind `#250`) is covered by 967 contract tests and fuzzing, not by the
symbolic proof. Aqua and SwapVM themselves are 1inch's, young and shared. The floor is a bound on
price through this venue — not a shield over everything (§1).
