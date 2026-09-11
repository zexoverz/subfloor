#!/usr/bin/env bash
# Move the live testnet vault onto #253's bytecode and hand it to a new house agent (#260).
#
# Run from the repo, on an up-to-date `main`, in the owner's own terminal:
#
#     bash scripts/new-vault.sh              # does it
#     DRY_RUN=1 bash scripts/new-vault.sh    # reads and simulates everything, sends nothing
#
# It asks for the keystore password once. Every step checks the chain before it sends and skips what
# has already happened, so a run that stops halfway can simply be run again. What it has made so far
# is kept in ~/.subfloor-new-vault.
#
#   1. a keystore for the new delegate, `subfloor-delegate`, with the same password, and gas for it
#   2. a VaultFactory carrying #253's AquaGuardVault, verified on Sourcify
#   3. a vault from it: the new delegate, guardian 0x9ebd…, the registry guardian, both pairs at
#      100 bps with absolute 0 (an absolute backstop is what froze the old vault's selling side)
#   4. the old vault's live books docked and its inventory moved across
#   5. a wait until the web service names the new delegate as its house agent. That is an address,
#      not a secret, and an agent session sets it
#   6. one fourteen-day mandate, signed and posted by `agent/src/house/switch-on.ts`
#
# The delegate's private key never passes through this script. The last lines say how to put it into
# Railway yourself.
set -euo pipefail

# A password or keystore exported in the calling shell changes what every cast call means: Foundry
# reads ETH_PASSWORD as a password *file* and then demands --keystore, so even a plain `cast call`
# fails. Everything here passes its wallet explicitly.
unset ETH_PASSWORD CAST_UNSAFE_PASSWORD ETH_KEYSTORE_ACCOUNT

export PATH="$HOME/.foundry/bin:$PATH"
cd "$(git rev-parse --show-toplevel)"

DRY_RUN="${DRY_RUN:-0}"
RPC="${SUBFLOOR_RPC:-https://sepolia.base.org}"
WEB="${SUBFLOOR_API:-https://web-production-37798.up.railway.app}"
OWNER_ACCOUNT="${OWNER_ACCOUNT:-subfloor-dev}"
DELEGATE_ACCOUNT="${DELEGATE_ACCOUNT:-subfloor-delegate}"
DELEGATE_GAS="${DELEGATE_GAS:-0.02ether}"
STATE="${STATE_FILE:-$HOME/.subfloor-new-vault}"
KEYSTORES="$HOME/.foundry/keystores"

OWNER=0x9ebdC8ACc879a8284Ae5B3CecfbD280ec307aFA3
OLD_VAULT=0xaf6b337440FFEa63c47f077eee2663987aEEc33f
AQUA=0xA86da73e0c1b4C70cB9a924F57BaE9699198bbDB
REGISTRY=0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123
WETH=0x4200000000000000000000000000000000000006
TUSDC=0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD
# The order every book of ours was shipped with: WETH sorts below tUSDC.
TOKENS="[$WETH,$TUSDC]"

say()     { printf '\n[new-vault] %s\n' "$*"; }
stop()    { printf '\n[new-vault] stopped: %s\n' "$*" >&2; exit 1; }
lower()   { printf %s "$1" | tr '[:upper:]' '[:lower:]'; }
same()    { [ "$(lower "$1")" = "$(lower "$2")" ]; }
sending() { [ "$DRY_RUN" != "1" ]; }

touch "$STATE"
# shellcheck disable=SC1090
. "$STATE"
save() { printf '%s=%s\n' "$1" "$2" >> "$STATE"; printf -v "$1" '%s' "$2"; }

# --- preflight ----------------------------------------------------------------------------------------
command -v cast >/dev/null && command -v forge >/dev/null || stop "foundry is not on PATH"
command -v python3 >/dev/null || stop "python3 is needed to read the index"
[ -z "$(git status --porcelain -- contracts)" ] \
  || stop "contracts/ has uncommitted changes; the factory has to come from a commit Sourcify can rebuild"
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  sending && stop "check out an up-to-date main first (git checkout main && git pull)"
  say "note: not on an up-to-date main; a real run stops here"
fi

PWFILE="$(mktemp)"
chmod 600 "$PWFILE"
trap 'rm -f "$PWFILE"' EXIT
WALLET=(--account "$OWNER_ACCOUNT" --password-file "$PWFILE")
TX=(--rpc-url "$RPC" "${WALLET[@]}")

if sending; then
  read -r -s -p "Keystore password (for $OWNER_ACCOUNT, and for $DELEGATE_ACCOUNT if it is created now): " PW
  echo
  printf %s "$PW" > "$PWFILE"
  who="$(cast wallet address "${WALLET[@]}" 2>/dev/null)" || stop "could not open $OWNER_ACCOUNT with that password"
  same "$who" "$OWNER" || stop "$OWNER_ACCOUNT is $who, but the owner is $OWNER"
fi
say "owner $OWNER holds $(cast balance "$OWNER" --rpc-url "$RPC" --ether) ETH on Base Sepolia"

# --- 1. the new delegate ---------------------------------------------------------------------------------
if [ ! -f "$KEYSTORES/$DELEGATE_ACCOUNT" ]; then
  if sending; then
    say "creating keystore $DELEGATE_ACCOUNT with the same password"
    cast wallet new "$KEYSTORES" "$DELEGATE_ACCOUNT" --unsafe-password "$PW" >/dev/null
  else
    say "would create keystore $DELEGATE_ACCOUNT"
  fi
fi
unset PW
if [ -f "$KEYSTORES/$DELEGATE_ACCOUNT" ] && sending; then
  DELEGATE="$(cast wallet address --account "$DELEGATE_ACCOUNT" --password-file "$PWFILE" 2>/dev/null)" \
    || stop "$DELEGATE_ACCOUNT exists but does not open with this password; move it aside or set DELEGATE_ACCOUNT"
  save DELEGATE "$DELEGATE"
fi
DELEGATE="${DELEGATE:-0x000000000000000000000000000000000000dEaD}"
say "delegate $DELEGATE"

gas="$(cast balance "$DELEGATE" --rpc-url "$RPC")"
# In python, because a wei balance overflows bash's 64-bit integers past about nine ether.
if python3 -c "import sys; sys.exit(0 if int('$gas') < 5 * 10**15 else 1)"; then
  if sending; then
    say "sending $DELEGATE_GAS to the delegate for its ship and re-quote gas"
    cast send "$DELEGATE" --value "$DELEGATE_GAS" "${TX[@]}" >/dev/null
  else
    say "would send $DELEGATE_GAS to the delegate"
  fi
fi

# --- 2. the factory ---------------------------------------------------------------------------------------
if [ -z "${FACTORY:-}" ]; then
  if sending; then
    say "deploying VaultFactory from $(git rev-parse --short HEAD); a cold via_ir build takes up to ten minutes"
    # forge create refuses --account with --password-file and demands --keystore, unlike cast, so it
    # gets the keystore's path. The constructor args go last, because that flag takes every value after it.
    out="$(cd contracts && forge create src/subfloor/VaultFactory.sol:VaultFactory \
      --rpc-url "$RPC" --keystore "$KEYSTORES/$OWNER_ACCOUNT" --password-file "$PWFILE" --broadcast \
      --constructor-args "$AQUA")"
    FACTORY="$(printf '%s\n' "$out" | awk '/Deployed to:/ {print $3}')"
    [ -n "$FACTORY" ] || stop "forge create printed no address:
$out"
    save FACTORY "$FACTORY"
    save FACTORY_COMMIT "$(git rev-parse HEAD)"
  else
    say "would deploy VaultFactory($AQUA) from $(git rev-parse --short HEAD)"
  fi
fi
if [ -n "${FACTORY:-}" ]; then
  aqua="$(cast call "$FACTORY" 'AQUA()(address)' --rpc-url "$RPC")" || stop "could not read AQUA() from factory $FACTORY"
  same "$aqua" "$AQUA" || stop "factory $FACTORY points at $aqua, not our Aqua $AQUA"
  if [ -z "${FACTORY_VERIFIED:-}" ] && sending; then
    if (cd contracts && forge verify-contract "$FACTORY" src/subfloor/VaultFactory.sol:VaultFactory \
        --chain 84532 --verifier sourcify --constructor-args "$(cast abi-encode 'constructor(address)' "$AQUA")" --watch); then
      save FACTORY_VERIFIED 1
    else
      say "Sourcify did not confirm yet; the deployment stands, re-run this script later to retry"
    fi
  fi
  say "factory $FACTORY"
fi

# --- 3. the vault -----------------------------------------------------------------------------------------
SETUP="($DELEGATE,$OWNER,$REGISTRY,[$WETH,$TUSDC],[$TUSDC,$WETH],[100,100],[0,0])"
if [ -z "${NEW_VAULT:-}" ]; then
  if sending; then
    say "creating the vault: delegate, guardian, registry guardian and both floors in one transaction"
    cast send "$FACTORY" 'createVault((address,address,address,address[],address[],uint16[],uint256[]))' "$SETUP" "${TX[@]}" >/dev/null
    NEW_VAULT="$(cast call "$FACTORY" 'vaultsOfOwner(address)(address[])' "$OWNER" --rpc-url "$RPC" | tr -d '[] ' | awk -F, '{print $NF}')"
    [ -n "$NEW_VAULT" ] || stop "the factory lists no vault for $OWNER"
    save NEW_VAULT "$NEW_VAULT"
  else
    say "would call createVault$SETUP"
  fi
fi
if [ -n "${NEW_VAULT:-}" ]; then
  same "$(cast call "$NEW_VAULT" 'owner()(address)' --rpc-url "$RPC")" "$OWNER" || stop "$NEW_VAULT is not owned by $OWNER"
  same "$(cast call "$NEW_VAULT" 'delegate()(address)' --rpc-url "$RPC")" "$DELEGATE" || stop "$NEW_VAULT names a different delegate"
  same "$(cast call "$NEW_VAULT" 'guardian()(address)' --rpc-url "$RPC")" "$OWNER" || stop "$NEW_VAULT names a different guardian"
  same "$(cast call "$REGISTRY" 'guardian(address)(address)' "$NEW_VAULT" --rpc-url "$RPC")" "$OWNER" \
    || stop "the registry has no guardian for $NEW_VAULT, so lowerFloor would revert NoGuardianRegistered forever"
  # #253's bytecode answers this; the old vault's reverts, because the view is named mandateUsed there.
  cast call "$NEW_VAULT" 'mandateRevoked(uint256)(bool)' 0 --rpc-url "$RPC" >/dev/null \
    || stop "$NEW_VAULT does not have #253's mandateRevoked; the factory was built from the wrong commit"
  for pair in "$WETH $TUSDC" "$TUSDC $WETH"; do
    base="${pair%% *}"
    quote="${pair##* }"
    f="$(cast call "$REGISTRY" 'floor(address,address,address)(bool,uint16,uint232)' "$NEW_VAULT" "$base" "$quote" --rpc-url "$RPC" | tr '\n' ' ')"
    case "$f" in "true 100 0 "*) ;; *) stop "floor $base -> $quote on $NEW_VAULT is '$f', expected true 100 0" ;; esac
  done
  say "vault $NEW_VAULT: owner, delegate, guardian, registry guardian and both floors check out"
fi

# --- 4. the old vault: dock its books, move its inventory ------------------------------------------------
books="$(curl -s -m 30 -X POST "$WEB/api/subgraph" -H 'content-type: application/json' \
  -d "{\"query\":\"{ strategies(first: 50, where: { maker: \\\"$(lower "$OLD_VAULT")\\\", active: true }) { strategyHash app } }\"}" \
  | python3 -c 'import json,sys
d=json.load(sys.stdin)["data"]["strategies"]
print("\n".join(s["strategyHash"]+" "+s["app"] for s in d))')" || stop "the index did not answer, so the old vault's live books are unknown"
while read -r hash app; do
  [ -n "${hash:-}" ] || continue
  if ! cast call --from "$OWNER" "$OLD_VAULT" 'dock(address,bytes32,address[])' "$app" "$hash" "$TOKENS" --rpc-url "$RPC" >/dev/null 2>&1; then
    say "book ${hash:0:10} does not dock (already docked, or the index is behind); skipping"
    continue
  fi
  if sending; then
    say "docking book ${hash:0:10}"
    cast send "$OLD_VAULT" 'dock(address,bytes32,address[])' "$app" "$hash" "$TOKENS" "${TX[@]}" >/dev/null
  else
    say "would dock book ${hash:0:10} (simulated from the owner: it docks)"
  fi
done <<< "$books"

for token in "$WETH" "$TUSDC"; do
  held="$(cast call "$token" 'balanceOf(address)(uint256)' "$OLD_VAULT" --rpc-url "$RPC" | awk '{print $1}')"
  [ "$held" = "0" ] && continue
  if sending; then
    say "moving $held of $token from the old vault to $NEW_VAULT"
    cast send "$OLD_VAULT" 'withdraw(address,uint256,address)' "$token" "$held" "$NEW_VAULT" "${TX[@]}" >/dev/null
  else
    say "would move $held of $token to the new vault"
  fi
done

if ! sending; then
  say "dry run: every read and simulation above passed and nothing was sent"
  exit 0
fi

# --- 5. the web service has to know the new house agent before it accepts a mandate for it ---------------
house() { curl -s -m 10 "$WEB/api/mandates" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("houseAgent") or "")' 2>/dev/null || true; }
if ! same "$(house)" "$DELEGATE"; then
  say "send this to Claude, then leave this running:
    SUBFLOOR_HOUSE_AGENT=$DELEGATE
    NEW_VAULT=$NEW_VAULT
    FACTORY=$FACTORY
  waiting for $WEB to name $DELEGATE as its house agent (it redeploys in about two minutes)"
  until same "$(house)" "$DELEGATE"; do sleep 15; done
fi
say "the web service serves $DELEGATE"

# --- 6. one fourteen-day mandate ---------------------------------------------------------------------------
live="$(curl -s -m 10 "$WEB/api/mandates?vault=$NEW_VAULT" | python3 -c 'import json,sys,time
m=json.load(sys.stdin).get("mandates",[])
print(sum(1 for x in m if int(x["message"]["expiry"])>time.time()))' 2>/dev/null || echo 0)"
if [ "$live" = "0" ]; then
  (cd agent && SUBFLOOR_VAULT="$NEW_VAULT" SUBFLOOR_API="$WEB" LOWER_BACKSTOP=0 MANDATE_COUNT=1 MANDATE_DAYS=14 \
    GUARDIAN_ACCOUNT="$OWNER_ACCOUNT" KEYSTORE_PASSWORD_FILE="$PWFILE" \
    node --experimental-strip-types src/house/switch-on.ts)
else
  say "$NEW_VAULT already has $live live mandate(s) with the house agent; not signing another"
fi

say "done. The vault is ready and its mandate is with the house agent. The last step is yours:
    cast wallet decrypt-keystore $DELEGATE_ACCOUNT      (same password; prints the delegate's private key)
    Railway -> subfloor -> agent -> Variables -> SUBFLOOR_DELEGATE_KEY -> paste -> Deploy
  The agent restarts as the house agent, finds the mandate and ships the vault's first book."
