#!/usr/bin/env bash
# The refusal, on demand: a compromised house agent ships a book under the reference, a taker asks
# it for a fill, and settlement refuses with the vault's floor exactly where it was.
#
#     DRY_RUN=1 bash scripts/demo-refusal.sh    # plans the book, simulates the ship, sends nothing
#     bash scripts/demo-refusal.sh              # does it
#
# Both parts are played from the owner's machine. The compromised agent is the house agent's own
# keystore (`subfloor-delegate`) and the taker is the owner (`subfloor-dev`), which holds tUSDC. One
# password prompt covers both. Nothing is armed and nothing is privileged:
#
#   1. the delegate ships the hostile book under the live mandate the guardian already signed
#   2. the owner, as an ordinary taker, asks that book for a fill; it lands and reverts
#      SettledBelowFloor, which is the artifact
#   3. the delegate docks the hostile book again, so the house agent is left running its own
#
# Then it waits for /api/refusals to show the refusal decoded, which is where the app reads it from.
# The house agent shares the delegate key, so a re-centre landing in the same seconds can collide on
# the nonce. Run it again if one does.
set -euo pipefail

# Foundry reads ETH_PASSWORD as a password *file* and then demands --keystore on every call.
unset ETH_PASSWORD CAST_UNSAFE_PASSWORD ETH_KEYSTORE_ACCOUNT
export PATH="$HOME/.foundry/bin:$PATH"
cd "$(git rev-parse --show-toplevel)"

DRY_RUN="${DRY_RUN:-0}"
RPC="${SUBFLOOR_RPC:-https://sepolia.base.org}"
WEB="${SUBFLOOR_API:-https://web-production-37798.up.railway.app}"
VAULT="${SUBFLOOR_VAULT:-0x1168C48a74055486BC4D1E7036d3b1aC4bb75586}"
OWNER_ACCOUNT="${OWNER_ACCOUNT:-subfloor-dev}"
DELEGATE_ACCOUNT="${DELEGATE_ACCOUNT:-subfloor-delegate}"
EXPLORER=https://sepolia.basescan.org/tx

say()     { printf '\n[demo] %s\n' "$*"; }
stop()    { printf '\n[demo] stopped: %s\n' "$*" >&2; exit 1; }
lower()   { printf %s "$1" | tr '[:upper:]' '[:lower:]'; }
same()    { [ "$(lower "$1")" = "$(lower "$2")" ]; }
sending() { [ "$DRY_RUN" != "1" ]; }
field()   { python3 -c "import json,sys; v=json.load(sys.stdin)$1; print(json.dumps(v) if isinstance(v,(list,dict)) else v)"; }
atleast() { python3 -c "import sys; sys.exit(0 if int('$1') >= int('$2') else 1)"; }

command -v cast >/dev/null || stop "foundry is not on PATH"
command -v node >/dev/null || stop "node is needed to plan the book"
command -v python3 >/dev/null || stop "python3 is needed to read the plan"

DELEGATE="$(cast call "$VAULT" 'delegate()(address)' --rpc-url "$RPC")"
OWNER="$(cast call "$VAULT" 'owner()(address)' --rpc-url "$RPC")"

PWFILE="$(mktemp)"
chmod 600 "$PWFILE"
trap 'rm -f "$PWFILE"' EXIT
AS_DELEGATE=(--rpc-url "$RPC" --account "$DELEGATE_ACCOUNT" --password-file "$PWFILE")
AS_TAKER=(--rpc-url "$RPC" --account "$OWNER_ACCOUNT" --password-file "$PWFILE")

if sending; then
  read -r -s -p "Keystore password (for $DELEGATE_ACCOUNT and $OWNER_ACCOUNT): " PW
  echo
  printf %s "$PW" > "$PWFILE"
  unset PW
  same "$(cast wallet address --account "$DELEGATE_ACCOUNT" --password-file "$PWFILE" 2>/dev/null)" "$DELEGATE" \
    || stop "$DELEGATE_ACCOUNT does not open to the vault's delegate $DELEGATE"
  same "$(cast wallet address --account "$OWNER_ACCOUNT" --password-file "$PWFILE" 2>/dev/null)" "$OWNER" \
    || stop "$OWNER_ACCOUNT does not open to the vault's owner $OWNER"
fi

# --- the plan: the compromised agent's book, from the live mandate and the index ------------------------
say "planning the compromised agent's book from the live mandate and the index"
PLAN="$(cd agent && NODE_NO_WARNINGS=1 SUBFLOOR_VAULT="$VAULT" SUBFLOOR_API="$WEB" SUBFLOOR_RPC="$RPC" \
  node --experimental-strip-types src/injection/demo-refusal.ts)" || stop "the planner stopped (its reason is above)"
ROUTER="$(printf %s "$PLAN" | field '["router"]')"
SHIP="$(printf %s "$PLAN" | field '["ship"]')"
SWAP="$(printf %s "$PLAN" | field '["swap"]')"
TUSDC="$(printf %s "$PLAN" | field '["tokenIn"]')"
AMOUNT_IN="$(printf %s "$PLAN" | field '["amountIn"]')"
TOKENS="$(printf %s "$PLAN" | python3 -c 'import json,sys; print("[" + ",".join(json.load(sys.stdin)["tokens"]) + "]")')"
same "$(printf %s "$PLAN" | field '["delegate"]')" "$DELEGATE" || stop "the mandate names a different delegate from the vault's"
say "reference $(printf %s "$PLAN" | field '["reference"]') raw tUSDC per raw WETH; the compromised agent sells \
$(printf %s "$PLAN" | field '["discountBps"]') bps under it, at $(printf %s "$PLAN" | field '["hostileReference"]'), \
under mandate nonce $(printf %s "$PLAN" | field '["nonce"]'), with no guard instruction in the program"

cast call --from "$DELEGATE" "$VAULT" "$SHIP" --rpc-url "$RPC" >/dev/null \
  || stop "the vault would refuse this ship; the simulation reverted"
say "simulated from the delegate: the vault accepts the ship. The mandate allows it, because a mandate bounds tokens and amounts, not price"

held="$(cast call "$TUSDC" 'balanceOf(address)(uint256)' "$OWNER" --rpc-url "$RPC" | awk '{print $1}')"
atleast "$held" "$AMOUNT_IN" || stop "the taker holds $held tUSDC, less than the $AMOUNT_IN it would spend; draw from the faucet first"

if ! sending; then
  say "dry run: planned and simulated, nothing sent"
  exit 0
fi

# --- 1. the compromised agent ships ------------------------------------------------------------------------
say "1/3 the compromised agent ships the book"
SHIP_TX="$(cast send "$VAULT" "$SHIP" "${AS_DELEGATE[@]}" --async)"
receipt="$(cast receipt "$SHIP_TX" --rpc-url "$RPC" --json)"
[ "$(printf %s "$receipt" | field '["status"]')" = "0x1" ] || stop "the ship reverted: $EXPLORER/$SHIP_TX"
TOPIC="$(lower "$(cast keccak 'Shipped(address,bytes32,uint256)')")"
BOOK="$(printf %s "$receipt" | python3 -c "import json,sys
logs=json.load(sys.stdin)['logs']
print(next(l['topics'][2] for l in logs if l['address'].lower()=='$(lower "$VAULT")' and l['topics'][0].lower()=='$TOPIC'))")"
say "shipped book ${BOOK:0:10}: $EXPLORER/$SHIP_TX"

# --- 2. a taker asks it for a fill --------------------------------------------------------------------------
allowed="$(cast call "$TUSDC" 'allowance(address,address)(uint256)' "$OWNER" "$ROUTER" --rpc-url "$RPC" | awk '{print $1}')"
if ! atleast "$allowed" "$AMOUNT_IN"; then
  say "the taker approves the router to spend tUSDC"
  cast send "$TUSDC" 'approve(address,uint256)' "$ROUTER" "$((AMOUNT_IN * 1000))" "${AS_TAKER[@]}" >/dev/null
fi
say "2/3 a taker asks the book for a fill, with an explicit gas limit: estimation reverts, and an unsent transaction is not evidence"
SWAP_TX="$(cast send "$ROUTER" "$SWAP" --gas-limit 900000 "${AS_TAKER[@]}" --async)"
status="$(cast receipt "$SWAP_TX" --rpc-url "$RPC" --json | field '["status"]')"
if [ "$status" = "0x0" ]; then
  say "refused on chain, status 0: $EXPLORER/$SWAP_TX"
else
  say "the fill went through, which means the book priced above the floor and nothing was refused: $EXPLORER/$SWAP_TX"
fi

# --- 3. put the house agent's world back --------------------------------------------------------------------
say "3/3 the hostile book is docked, so the house agent keeps running its own"
DOCK_TX="$(cast send "$VAULT" 'dock(address,bytes32,address[])' "$ROUTER" "$BOOK" "$TOKENS" "${AS_DELEGATE[@]}" --async)"
[ "$(cast receipt "$DOCK_TX" --rpc-url "$RPC" --json | field '["status"]')" = "0x1" ] \
  || say "the dock did not land ($EXPLORER/$DOCK_TX); the house agent will retire the stray book on its next cycle"

# --- where the app shows it ----------------------------------------------------------------------------------
if [ "$status" = "0x0" ]; then
  say "waiting for the app to show it; /api/refusals reads transaction status through HyperSync"
  line=""
  for _ in $(seq 1 24); do
    line="$(curl -s -m 15 "$WEB/api/refusals?limit=10" | python3 -c "import json,sys
for r in json.load(sys.stdin).get('recent', []):
    if r['hash'].lower() == '$(lower "$SWAP_TX")':
        print(r['reason'], r['executionRate'], r['floorRate'])" 2>/dev/null || true)"
    [ -n "$line" ] && break
    sleep 10
  done
  if [ -n "$line" ]; then
    read -r reason attempted floor <<< "$line"
    say "the app shows it: $reason, attempted $attempted against a floor of $floor"
  else
    say "not in /api/refusals yet; HyperSync can trail the chain by a minute. It will be on subfloor.xyz's tape"
  fi
fi

say "done.
    refusal  $EXPLORER/$SWAP_TX
    ship     $EXPLORER/$SHIP_TX
    dock     $EXPLORER/$DOCK_TX"
