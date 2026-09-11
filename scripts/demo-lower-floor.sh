#!/usr/bin/env bash
# Moment two: the key that trades cannot weaken the floor, and the guardian can.
#
#     DRY_RUN=1 bash scripts/demo-lower-floor.sh                  plans and checks the message, sends nothing
#     bash scripts/demo-lower-floor.sh attack                     the house agent's key tries to lower the floor
#     bash scripts/demo-lower-floor.sh guardian                   the guardian lowers it, the owner puts it back
#     GUARDIAN=ledger bash scripts/demo-lower-floor.sh guardian   the guardian's signature comes off a Ledger
#
# Both legs sign the same FloorLowering message, built by agent/src/injection/demo-lower-floor.ts and
# checked against the registry's own domain. `attack` signs it with the delegate keystore and sends it
# with an explicit gas limit; the registry reverts BadGuardianSignature, the mined failure is the
# artifact, and because it reverted the nonce is untouched. `guardian` signs the same message as the
# vault's guardian and the floor moves.
#
# The legs can run on two machines, each for the vault SUBFLOOR_VAULT names (ours by default): the
# delegate keystore on one, the guardian's Ledger on the other. With GUARDIAN=ledger the guardian is
# the Ledger account at LEDGER_HD_PATH (account 0 when unset), and it needs a little Base Sepolia ETH
# because it sends the transaction too. The attack sends from the house agent's address, so a
# re-centre landing in the same seconds can collide on the nonce; run it again if one does.
set -euo pipefail
unset ETH_PASSWORD CAST_UNSAFE_PASSWORD ETH_KEYSTORE_ACCOUNT
export PATH="$HOME/.foundry/bin:$PATH"
export NODE_NO_WARNINGS=1
cd "$(git rev-parse --show-toplevel)"

LEG="${1:-}"
DRY_RUN="${DRY_RUN:-0}"
RPC="${SUBFLOOR_RPC:-https://sepolia.base.org}"
VAULT="${SUBFLOOR_VAULT:-0x1168C48a74055486BC4D1E7036d3b1aC4bb75586}"
REGISTRY="${SUBFLOOR_REGISTRY:-0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123}"
GUARDIAN="${GUARDIAN:-keystore}"
DELEGATE_ACCOUNT="${DELEGATE_ACCOUNT:-subfloor-delegate}"
GUARDIAN_ACCOUNT="${GUARDIAN_ACCOUNT:-subfloor-dev}"
OWNER_ACCOUNT="${OWNER_ACCOUNT:-subfloor-dev}"
LEDGER_HD_PATH="${LEDGER_HD_PATH:-}"
EXPLORER=https://sepolia.basescan.org/tx
LOWER='lowerFloor(address,address,address,uint16,uint256,uint256,uint256,bytes)'
BAD_GUARDIAN=0x5760fd80

say()     { printf '\n[lower] %s\n' "$*"; }
stop()    { printf '\n[lower] stopped: %s\n' "$*" >&2; exit 1; }
lower()   { printf %s "$1" | tr '[:upper:]' '[:lower:]'; }
same()    { [ "$(lower "$1")" = "$(lower "$2")" ]; }
field()   { python3 -c "import json,sys; v=json.load(sys.stdin)$1; print(json.dumps(v) if isinstance(v,(list,dict)) else v)"; }
usage()   { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
floor_bps() { cast call "$REGISTRY" 'floor(address,address,address)(bool,uint16,uint232)' "$VAULT" "$BASE" "$QUOTE" --rpc-url "$RPC" | sed -n 2p; }

case "$LEG" in
  attack|guardian) ;;
  "") [ "$DRY_RUN" = "1" ] || usage ;;
  *) usage ;;
esac
command -v cast >/dev/null || stop "foundry is not on PATH"
LEDGER=()
[ "$GUARDIAN" = "ledger" ] && LEDGER=(--ledger ${LEDGER_HD_PATH:+--mnemonic-derivation-path "$LEDGER_HD_PATH"})

# --- the message --------------------------------------------------------------------------------------------
PLAN="$(cd agent && SUBFLOOR_VAULT="$VAULT" SUBFLOOR_REGISTRY="$REGISTRY" SUBFLOOR_RPC="$RPC" \
  node --experimental-strip-types src/injection/demo-lower-floor.ts)" || stop "the planner stopped (its reason is above)"
BASE="$(printf %s "$PLAN" | field '["base"]')"
QUOTE="$(printf %s "$PLAN" | field '["quote"]')"
CUR="$(printf %s "$PLAN" | field '["currentBps"]')"
TARGET="$(printf %s "$PLAN" | field '["targetBps"]')"
ABS="$(printf %s "$PLAN" | field '["absoluteRate"]')"
NONCE="$(printf %s "$PLAN" | field '["nonce"]')"
DEADLINE="$(printf %s "$PLAN" | field '["deadline"]')"
DIGEST="$(printf %s "$PLAN" | field '["digest"]')"
GUARD="$(printf %s "$PLAN" | field '["guardian"]')"
ARGS=("$VAULT" "$BASE" "$QUOTE" "$TARGET" "$ABS" "$NONCE" "$DEADLINE")
say "the vault's WETH->tUSDC floor tolerates $CUR bps. The message widens it to $TARGET bps, a weaker floor,
  under nonce $NONCE. Only the guardian, $GUARD, can sign it"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# The registry's answer to a signature, read without sending: empty when it would accept, the revert
# data when it would not.
verdict() {
  cast call --from "$1" "$REGISTRY" "$LOWER" "${ARGS[@]}" "$2" --rpc-url "$RPC" >/dev/null 2>"$TMP/err" && return 0
  # cast prints the decoded error first, which opens with the vault's address, and the raw revert data
  # after `data: "`. The raw data is what gets compared; the first error line stands in without it.
  local raw
  raw="$(grep -o 'data: "0x[0-9a-fA-F]*"' "$TMP/err" | head -1 | sed -e 's/^data: "//' -e 's/"$//')"
  printf '%s\n' "${raw:-$(head -1 "$TMP/err")}"
}
explain() {
  python3 -c "import sys
d=sys.argv[1][10:]
w=[d[i:i+64] for i in range(0,len(d),64)]
print('the guardian it wanted is', '0x'+w[1][24:])" "$1"
}

# Dry run, and the first thing every run does: a signature of zeros must be refused for the one reason
# that matters, and the digest in the refusal must be the one planned. Anything else (a wrong nonce,
# an expired deadline, a digest built differently) shows here instead of on chain.
data="$(verdict "$VAULT" "0x$(printf '0%.0s' $(seq 1 130))" || true)"
case "$data" in
  $BAD_GUARDIAN*) ;;
  *) stop "the registry answered '$data' to an unsigned message, not BadGuardianSignature" ;;
esac
checked="0x${data:138:64}"
same "$checked" "$DIGEST" || stop "the registry checks digest $checked, the plan built $DIGEST"
say "checked against the registry: an unsigned copy is refused BadGuardianSignature, over this exact digest"

if [ "$DRY_RUN" = "1" ]; then
  say "dry run: the message is the one the registry checks, and nothing was signed or sent"
  exit 0
fi

PWFILE="$TMP/pw"
ask_password() {
  read -r -s -p "Keystore password ($*): " PW
  echo
  printf %s "$PW" > "$PWFILE"
  unset PW
}

# --- attack: the key that trades ----------------------------------------------------------------------------
if [ "$LEG" = "attack" ]; then
  DELEGATE="$(cast call "$VAULT" 'delegate()(address)' --rpc-url "$RPC")"
  ask_password "$DELEGATE_ACCOUNT"
  same "$(cast wallet address --account "$DELEGATE_ACCOUNT" --password-file "$PWFILE" 2>/dev/null)" "$DELEGATE" \
    || stop "$DELEGATE_ACCOUNT does not open to the vault's delegate $DELEGATE"
  SIG="$(cast wallet sign --no-hash "$DIGEST" --account "$DELEGATE_ACCOUNT" --password-file "$PWFILE" | awk '{print $NF}')"
  say "the house agent's key signed the message. Asking the registry first:"
  data="$(verdict "$DELEGATE" "$SIG" || true)"
  case "$data" in
    $BAD_GUARDIAN*) say "refused: BadGuardianSignature, $(explain "$data")" ;;
    "") stop "the registry would accept the agent's signature; the delegate is this vault's guardian, which is the misconfiguration this demo exists to catch" ;;
    *) stop "the registry refused for another reason: $data" ;;
  esac
  say "sending it anyway, with an explicit gas limit, so the refusal is a mined transaction and not a view call"
  TX="$(cast send "$REGISTRY" "$LOWER" "${ARGS[@]}" "$SIG" --gas-limit 200000 --rpc-url "$RPC" \
    --account "$DELEGATE_ACCOUNT" --password-file "$PWFILE" --async)"
  status="$(cast receipt "$TX" --rpc-url "$RPC" --json | field '["status"]')"
  [ "$status" = "0x0" ] || stop "the lowering went through: $EXPLORER/$TX"
  say "reverted on chain, status 0: $EXPLORER/$TX
  the floor still tolerates $(floor_bps) bps, and the nonce is still $NONCE, so the guardian can sign this same message"
  exit 0
fi

# --- guardian: the key that sets the rules --------------------------------------------------------------------
if [ "$GUARDIAN" = "ledger" ]; then
  who="$(cast wallet address "${LEDGER[@]}")" || stop "no Ledger answered; plug it in, unlock it and open the Ethereum app"
  same "$who" "$GUARD" || stop "the Ledger account is $who, but this vault's guardian is $GUARD (set LEDGER_HD_PATH for another account)"
  printf %s "$PLAN" | field '["typedData"]' > "$TMP/typed.json"
  say "approve on the Ledger: it shows the recipient, the pair and the new tolerance of $TARGET bps"
  SIG="$(cast wallet sign "${LEDGER[@]}" --data --from-file "$TMP/typed.json" | awk '{print $NF}')"
  FROM=("${LEDGER[@]}")
else
  ask_password "$GUARDIAN_ACCOUNT, and $OWNER_ACCOUNT to put the floor back"
  same "$(cast wallet address --account "$GUARDIAN_ACCOUNT" --password-file "$PWFILE" 2>/dev/null)" "$GUARD" \
    || stop "$GUARDIAN_ACCOUNT does not open to this vault's guardian $GUARD"
  SIG="$(cast wallet sign --no-hash "$DIGEST" --account "$GUARDIAN_ACCOUNT" --password-file "$PWFILE" | awk '{print $NF}')"
  FROM=(--account "$GUARDIAN_ACCOUNT" --password-file "$PWFILE")
fi
data="$(verdict "$GUARD" "$SIG" || true)"
[ -z "$data" ] || stop "the registry would refuse the guardian's signature: $data"
say "the registry accepts the guardian's signature on the same message. Sending"
TX="$(cast send "$REGISTRY" "$LOWER" "${ARGS[@]}" "$SIG" --rpc-url "$RPC" "${FROM[@]}" --async)"
status="$(cast receipt "$TX" --rpc-url "$RPC" --json | field '["status"]')"
[ "$status" = "0x1" ] || stop "the lowering reverted: $EXPLORER/$TX"
say "lowered: the floor now tolerates $(floor_bps) bps. $EXPLORER/$TX"

# Putting it back is a raise, and a raise is one transaction from the recipient that needs no device.
# The recipient is the vault, so its owner sends it through execute.
OWNER="$(cast call "$VAULT" 'owner()(address)' --rpc-url "$RPC")"
if [ "$GUARDIAN" != "ledger" ] && same "$(cast wallet address --account "$OWNER_ACCOUNT" --password-file "$PWFILE" 2>/dev/null)" "$OWNER"; then
  RAISE="$(cast calldata 'raiseFloor(address,address,uint16,uint256)' "$BASE" "$QUOTE" "$CUR" "$ABS")"
  TX2="$(cast send "$VAULT" 'execute(address,uint256,bytes)' "$REGISTRY" 0 "$RAISE" --rpc-url "$RPC" \
    --account "$OWNER_ACCOUNT" --password-file "$PWFILE" --async)"
  [ "$(cast receipt "$TX2" --rpc-url "$RPC" --json | field '["status"]')" = "0x1" ] || stop "putting the floor back reverted: $EXPLORER/$TX2"
  say "put back by the owner, no device: the floor tolerates $(floor_bps) bps again. $EXPLORER/$TX2"
else
  say "put it back from the app: raising a floor is one transaction from the vault's owner, $OWNER, and needs no device"
fi
