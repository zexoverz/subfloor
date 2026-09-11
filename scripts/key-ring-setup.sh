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
#   3. owner's laptop again:
#        bash scripts/key-ring-setup.sh seal <ring.json>
#      seals the delegate key on that ring, piped from the keystore and never printed
#
# One person holding both can run all three on one machine: `ring` takes this laptop's own id, and
# `seal` with no argument uses the ring `ring` just wrote.
set -euo pipefail
unset ETH_PASSWORD CAST_UNSAFE_PASSWORD ETH_KEYSTORE_ACCOUNT
export PATH="$HOME/.foundry/bin:$PATH"
export NODE_NO_WARNINGS=1
cd "$(git rev-parse --show-toplevel)/agent"

CMD="${1:-}"
[ $# -gt 0 ] && shift
DIR="${SUBFLOOR_RING_DIR:-$HOME/.subfloor}"
DELEGATE_ACCOUNT="${DELEGATE_ACCOUNT:-subfloor-delegate}"
MEMBER="$DIR/member.json"
RING="$DIR/ring.json"
SEALED="$DIR/delegate.sealed.json"

say()     { printf '\n[key-ring] %s\n' "$*"; }
stop()    { printf '\n[key-ring] stopped: %s\n' "$*" >&2; exit 1; }
keyring() { node --experimental-strip-types src/cli.ts "$@"; }
is_id()   { [[ "$1" =~ ^[0-9a-fA-F]{66}$ ]]; }

mkdir -p "$DIR"
chmod 700 "$DIR"

# This machine's member identity, made once and kept. The private half never leaves the file.
member_id() {
  [ -f "$MEMBER" ] || keyring keygen --member "$MEMBER" --name "$(hostname -s)" >/dev/null
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pubkey"])' "$MEMBER"
}

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
    SRC="${1:-$RING}"
    [ -f "$SRC" ] || stop "no ring at $SRC; pass the ring.json the Ledger holder sent"
    command -v cast >/dev/null || stop "foundry is not on PATH"
    ID="$(member_id)"
    [ "$SRC" -ef "$RING" ] || cp "$SRC" "$RING"
    keyring members --ring "$RING" | grep -q "$ID" \
      || stop "this machine ($ID) is not in that ring. The Ledger holder adds it with: bash scripts/key-ring-setup.sh ring $ID"
    say "sealing the delegate key. cast asks for the $DELEGATE_ACCOUNT password once; the key goes straight into the seal"
    KEY="$(cast wallet decrypt-keystore "$DELEGATE_ACCOUNT" | awk '{print $NF}')"
    [[ "$KEY" =~ ^0x[0-9a-fA-F]{64}$ ]] || { unset KEY; stop "$DELEGATE_ACCOUNT did not open to a private key"; }
    printf %s "$KEY" | keyring seal --member "$MEMBER" --ring "$RING" --key subfloor-delegate --out "$SEALED" >/dev/null
    unset KEY
    chmod 600 "$MEMBER" "$RING" "$SEALED"
    say "done. Tell Claude \"ring ready\". It puts $RING into SUBFLOOR_RING_BLOCKS and $SEALED into
  SUBFLOOR_DELEGATE_SEALED on the agent service, and SUBFLOOR_DELEGATE_KEY comes out."
    ;;

  *)
    sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
