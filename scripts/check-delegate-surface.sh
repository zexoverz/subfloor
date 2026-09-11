#!/usr/bin/env bash
# The agent's delegate key may reach exactly four functions on AquaGuardVault. This reads the
# compiled ABI and fails if a fifth state-changing function appears that is not owner-gated.
#
# It lives here rather than in a Solidity test because Solidity cannot filter the ABI JSON, and a
# hand-maintained list inside a test only ever proves the functions someone remembered to list.
# A fuzz test over random calldata does not catch this: random bytes essentially never form a valid
# selector with valid arguments, and one passed while a deliberate passthrough sat in the contract.
set -euo pipefail

ARTIFACT="${1:-contracts/out/AquaGuardVault.sol/AquaGuardVault.json}"
[ -f "$ARTIFACT" ] || { echo "no artifact at $ARTIFACT; run forge build first" >&2; exit 1; }

DELEGATE_REACHABLE="ship dock updateQuote rescueApproval"
# transferOwnership is OpenZeppelin's and is owner-gated. renounceOwnership is overridden to
# revert: renouncing would permanently remove the rescue path, and a vault holding inventory with
# no owner is bricked rather than decentralised.
# revokeMandate is the owner's or the guardian's, never the delegate's: it withdraws authority, and a
# delegate that wants to stop can already dock.
OWNER_GATED="setDelegate setGuardian setDockOperator withdraw execute transferOwnership renounceOwnership revokeMandate"

# bash 3.2 on macOS has no mapfile, so keep it portable.
MUTATING=$(jq -r '.abi[] | select(.type=="function") | select(.stateMutability!="view" and .stateMutability!="pure") | .name' "$ARTIFACT" | sort -u)
COUNT=$(printf '%s\n' "$MUTATING" | grep -c . || true)

[ "$COUNT" -gt 0 ] || { echo "ABI scan found no state-changing functions, so it proved nothing" >&2; exit 1; }

fail=0
for fn in $MUTATING; do
  if ! grep -qw -- "$fn" <<<"$DELEGATE_REACHABLE $OWNER_GATED"; then
    echo "UNCLASSIFIED state-changing function on AquaGuardVault: $fn" >&2
    echo "  If the delegate can reach it, the custody claim is wrong. If the owner alone can," >&2
    echo "  add it to OWNER_GATED in this script and say why in the PR." >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "delegate surface OK: $COUNT state-changing functions, all classified"
