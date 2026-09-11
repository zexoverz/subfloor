#!/usr/bin/env bash
# Put the house agent's delegate key in the Ledger Key Ring (#274).
#
# Split across whoever holds the two things it needs, the Ledger and the delegate keystore, so
# neither hands the other anything secret. Only public member ids and the ring blocks move between
# them, and the ring blocks carry no key material.
#
#   1. owner's laptop, the one with the delegate keystore:
#        bash scripts/key-ring-setup.sh id
#      prints this laptop's ring member id
#
#   2. the machine with the Ledger, plugged in and unlocked:
#        bash scripts/key-ring-setup.sh ring <agent id> <laptop id>
#      creates the ring on the device if there is none (approve on it), and adds both ids with no
#      device. The agent's id is in its Railway log: "[ring] this host is ring member <id>". Then
#      send ~/.subfloor/ring.json to the owner.
#
#   3. owner's laptop again, one of:
#        bash scripts/key-ring-setup.sh rotate <ring.json>
#      a new delegate whose key has never been on a screen: its own keystore, set on the vault, a
#      fresh fourteen-day mandate, the old mandates revoked, and its key sealed into the ring. Use
#      this when the current delegate key has ever been printed, as ours was on 11 Sep (#287)
#        bash scripts/key-ring-setup.sh seal <ring.json>
#      seals the current delegate key as it is, for a key that never left its keystore
#
# One person holding both can run all of it on one machine: `ring` takes this laptop's own id, and
# `seal` or `rotate` with no argument uses the ring `ring` just wrote.
set -euo pipefail
unset ETH_PASSWORD CAST_UNSAFE_PASSWORD ETH_KEYSTORE_ACCOUNT
export PATH="$HOME/.foundry/bin:$PATH"
export NODE_NO_WARNINGS=1
# Kept before the cd below, so the usage text can still find this file.
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(git rev-parse --show-toplevel)/agent"

CMD="${1:-}"
[ $# -gt 0 ] && shift
DIR="${SUBFLOOR_RING_DIR:-$HOME/.subfloor}"
DELEGATE_ACCOUNT="${DELEGATE_ACCOUNT:-subfloor-delegate}"
NEW_DELEGATE_ACCOUNT="${NEW_DELEGATE_ACCOUNT:-subfloor-delegate-2}"
OWNER_ACCOUNT="${OWNER_ACCOUNT:-subfloor-dev}"
VAULT="${SUBFLOOR_VAULT:-0x1168C48a74055486BC4D1E7036d3b1aC4bb75586}"
RPC="${SUBFLOOR_RPC:-https://sepolia.base.org}"
WEB="${SUBFLOOR_API:-https://web-production-37798.up.railway.app}"
KEYSTORES="$HOME/.foundry/keystores"
MEMBER="$DIR/member.json"
RING="$DIR/ring.json"
SEALED="$DIR/delegate.sealed.json"
PWFILE=""

say()     { printf '\n[key-ring] %s\n' "$*"; }
stop()    { printf '\n[key-ring] stopped: %s\n' "$*" >&2; exit 1; }
keyring() { node --experimental-strip-types src/cli.ts "$@"; }
is_id()   { [[ "$1" =~ ^[0-9a-fA-F]{66}$ ]]; }
lower()   { printf %s "$1" | tr '[:upper:]' '[:lower:]'; }
same()    { [ "$(lower "$1")" = "$(lower "$2")" ]; }

mkdir -p "$DIR"
chmod 700 "$DIR"

# This machine's member identity, made once and kept. The private half never leaves the file.
member_id() {
  [ -f "$MEMBER" ] || keyring keygen --member "$MEMBER" --name "$(hostname -s)" >/dev/null
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pubkey"])' "$MEMBER"
}

# The ring the Ledger holder sent, and proof this machine is in it before anything is sealed on it.
use_ring() {
  local src="$1" id
  [ -f "$src" ] || stop "no ring at $src; pass the ring.json the Ledger holder sent"
  id="$(member_id)"
  [ "$src" -ef "$RING" ] || cp "$src" "$RING"
  keyring members --ring "$RING" | grep -q "$id" \
    || stop "this machine ($id) is not in that ring. The Ledger holder adds it with: bash scripts/key-ring-setup.sh ring $id"
}

# A delegate key sealed on the ring, piped from its keystore and never printed. With a password file
# the keystore opens from it; without one, cast asks.
seal_from() {
  local account="$1" key
  command -v cast >/dev/null || stop "foundry is not on PATH"
  if [ -n "$PWFILE" ]; then
    key="$(CAST_UNSAFE_PASSWORD="$(cat "$PWFILE")" cast wallet decrypt-keystore "$account" | awk '{print $NF}')"
  else
    say "cast asks for the $account password once; the key goes straight into the seal"
    key="$(cast wallet decrypt-keystore "$account" | awk '{print $NF}')"
  fi
  [[ "$key" =~ ^0x[0-9a-fA-F]{64}$ ]] || stop "$account did not open to a private key"
  printf %s "$key" | keyring seal --member "$MEMBER" --ring "$RING" --key subfloor-delegate --out "$SEALED" >/dev/null
  key=""
  chmod 600 "$MEMBER" "$RING" "$SEALED"
}

house() { curl -s -m 10 "$WEB/api/mandates" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("houseAgent") or "")' 2>/dev/null || true; }
held()  { curl -s -m 10 "$WEB/api/mandates?vault=$VAULT"; }

case "$CMD" in
  id)
    ID="$(member_id)"
    say "this machine's ring member id. It is public; send it to whoever holds the Ledger:"
    printf '%s\n' "$ID"
    ;;

  ring)
    [ $# -gt 0 ] || stop "give the member ids to add: the agent host's and the owner laptop's"
    for id in "$@"; do is_id "$id" || stop "$id is not a member id (66 hex characters)"; done
    member_id >/dev/null
    if [ ! -f "$RING" ]; then
      say "creating the ring, rooted in the Ledger. Unlock it, and approve on the device when it asks"
      keyring create-ring --member "$MEMBER" --ring "$RING" --name "$(hostname -s)" >/dev/null
    else
      say "the ring already exists at $RING"
    fi
    for id in "$@"; do
      say "adding ${id:0:10}… to the ring (no device)"
      keyring add-member --member "$MEMBER" --ring "$RING" --id "$id" --name "member-${id:0:8}" >/dev/null
    done
    chmod 600 "$MEMBER" "$RING"
    say "the ring now holds:"
    keyring members --ring "$RING"
    say "done. Send $RING to whoever seals the delegate key. It holds no key material.
  Keep $MEMBER and this Ledger: revoking a member later needs both."
    ;;

  seal)
    use_ring "${1:-$RING}"
    seal_from "$DELEGATE_ACCOUNT"
    say "done. Tell Claude \"ring ready\". It puts $RING into SUBFLOOR_RING_BLOCKS and $SEALED into
  SUBFLOOR_DELEGATE_SEALED on the agent service, and SUBFLOOR_DELEGATE_KEY comes out."
    ;;

  rotate)
    use_ring "${1:-$RING}"
    command -v cast >/dev/null || stop "foundry is not on PATH"
    OWNER="$(cast call "$VAULT" 'owner()(address)' --rpc-url "$RPC")"
    OLD="$(cast call "$VAULT" 'delegate()(address)' --rpc-url "$RPC")"
    PWFILE="$(mktemp)"
    chmod 600 "$PWFILE"
    trap 'rm -f "$PWFILE"' EXIT
    read -r -s -p "Keystore password ($OWNER_ACCOUNT; the new $NEW_DELEGATE_ACCOUNT gets the same): " PW
    echo
    printf %s "$PW" > "$PWFILE"
    OWN=(--rpc-url "$RPC" --account "$OWNER_ACCOUNT" --password-file "$PWFILE")
    same "$(cast wallet address --account "$OWNER_ACCOUNT" --password-file "$PWFILE" 2>/dev/null)" "$OWNER" \
      || { PW=""; stop "$OWNER_ACCOUNT does not open to the vault's owner $OWNER"; }

    if [ ! -f "$KEYSTORES/$NEW_DELEGATE_ACCOUNT" ]; then
      say "1/6 a new delegate keystore, $NEW_DELEGATE_ACCOUNT, with the same password. Only its address is printed"
      cast wallet new "$KEYSTORES" "$NEW_DELEGATE_ACCOUNT" --unsafe-password "$PW" >/dev/null
    else
      say "1/6 $NEW_DELEGATE_ACCOUNT already exists; using it"
    fi
    PW=""
    NEW="$(cast wallet address --account "$NEW_DELEGATE_ACCOUNT" --password-file "$PWFILE" 2>/dev/null)" \
      || stop "$NEW_DELEGATE_ACCOUNT does not open with this password"
    gas="$(cast balance "$NEW" --rpc-url "$RPC")"
    if python3 -c "import sys; sys.exit(0 if int('$gas') < 5 * 10**15 else 1)"; then
      cast send "$NEW" --value 0.02ether "${OWN[@]}" >/dev/null
      say "sent the new delegate 0.02 ETH for its ship and re-quote gas"
    fi

    if ! same "$OLD" "$NEW"; then
      say "2/6 the owner sets $NEW as the vault's delegate. From here the old key, $OLD, can neither ship nor dock"
      cast send "$VAULT" 'setDelegate(address)' "$NEW" "${OWN[@]}" >/dev/null
    else
      say "2/6 the vault already names $NEW"
    fi

    if ! same "$(house)" "$NEW"; then
      say "3/6 send this to Claude, then leave this running:
    SUBFLOOR_HOUSE_AGENT=$NEW
  waiting for $WEB to serve it as the house agent (it redeploys in about two minutes)"
      until same "$(house)" "$NEW"; do sleep 15; done
    fi
    say "3/6 the web service serves $NEW"

    live="$(held | python3 -c "import json,sys,time
m=json.load(sys.stdin).get('mandates',[])
print(sum(1 for x in m if x['message']['delegate'].lower()=='$(lower "$NEW")' and int(x['message']['expiry'])>time.time()))" 2>/dev/null || echo 0)"
    if [ "$live" = "0" ]; then
      say "4/6 one fourteen-day mandate for the new delegate"
      SUBFLOOR_VAULT="$VAULT" SUBFLOOR_API="$WEB" LOWER_BACKSTOP=0 MANDATE_COUNT=1 MANDATE_DAYS=14 \
        GUARDIAN_ACCOUNT="$OWNER_ACCOUNT" KEYSTORE_PASSWORD_FILE="$PWFILE" DELEGATE_ACCOUNT="$NEW_DELEGATE_ACCOUNT" \
        node --experimental-strip-types src/house/switch-on.ts | sed "/done on the vault's side/,\$d"
    else
      say "4/6 the new delegate already has a live mandate"
    fi

    for n in $(held | python3 -c "import json,sys
for x in json.load(sys.stdin).get('mandates',[]):
    if x['message']['delegate'].lower()!='$(lower "$NEW")': print(x['message']['nonce'])" 2>/dev/null); do
      if [ "$(cast call "$VAULT" 'mandateRevoked(uint256)(bool)' "$n" --rpc-url "$RPC")" = "false" ]; then
        cast send "$VAULT" 'revokeMandate(uint256)' "$n" "${OWN[@]}" >/dev/null
        say "5/6 revoked mandate $n, which named the old delegate"
      fi
    done

    say "6/6 sealing the new delegate's key into the ring, straight from its keystore"
    seal_from "$NEW_DELEGATE_ACCOUNT"
    say "done. Tell Claude \"ring ready, rotated\". It puts $RING into SUBFLOOR_RING_BLOCKS and $SEALED into
  SUBFLOOR_DELEGATE_SEALED on the agent service, and SUBFLOOR_DELEGATE_KEY, the old key, comes out.
  Until then the agent holds the old key and cannot ship; its book stays live and unchanged."
    ;;

  *)
    sed -n '2,31p' "$SELF" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
