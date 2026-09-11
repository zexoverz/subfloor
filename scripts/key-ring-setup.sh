#!/usr/bin/env bash
# Put the house agent's delegate key in the Ledger Key Ring (#274).
#
# Run on the owner's laptop, with the Ledger plugged in and unlocked, after the agent has printed its
# ring member id:
#
#     bash scripts/key-ring-setup.sh <agent member id>
#
# The id is in the agent's Railway log, on the line "[ring] this host is ring member <id>". What this
# makes lives in ~/.subfloor, mode 0600, and nothing leaves this machine except what then goes into
# Railway: the ring blocks, which carry no key material, and the sealed envelope, which only the
# agent host's own member credential can open.
#
#   1. this laptop's ring member identity                      no device
#   2. the ring, rooted in the Ledger; approve on the device   DEVICE, skipped if the ring exists
#   3. the agent host added to the ring by its public id       no device
#   4. the delegate key sealed on the ring, piped from the keystore and never printed
set -euo pipefail
unset ETH_PASSWORD CAST_UNSAFE_PASSWORD ETH_KEYSTORE_ACCOUNT
export PATH="$HOME/.foundry/bin:$PATH"
export NODE_NO_WARNINGS=1
cd "$(git rev-parse --show-toplevel)/agent"

AGENT_ID="${1:-}"
DIR="${SUBFLOOR_RING_DIR:-$HOME/.subfloor}"
DELEGATE_ACCOUNT="${DELEGATE_ACCOUNT:-subfloor-delegate}"
MEMBER="$DIR/owner-member.json"
RING="$DIR/ring.json"
SEALED="$DIR/delegate.sealed.json"

say()     { printf '\n[key-ring] %s\n' "$*"; }
stop()    { printf '\n[key-ring] stopped: %s\n' "$*" >&2; exit 1; }
keyring() { node --experimental-strip-types src/cli.ts "$@"; }

[[ "$AGENT_ID" =~ ^[0-9a-fA-F]{66}$ ]] \
  || stop "give the agent's ring member id: the 66 hex characters after 'this host is ring member' in its Railway log"
command -v cast >/dev/null || stop "foundry is not on PATH"
mkdir -p "$DIR"
chmod 700 "$DIR"

if [ ! -f "$MEMBER" ]; then
  say "1/4 this laptop's ring member identity (no device)"
  keyring keygen --member "$MEMBER" --name owner-laptop >/dev/null
else
  say "1/4 this laptop is already a member identity at $MEMBER"
fi

if [ ! -f "$RING" ]; then
  say "2/4 creating the ring, rooted in the Ledger. Unlock it, and approve on the device when it asks"
  keyring create-ring --member "$MEMBER" --ring "$RING" --name owner-laptop >/dev/null
else
  say "2/4 the ring already exists at $RING"
fi

say "3/4 adding the agent host ${AGENT_ID:0:10}… to the ring (no device)"
keyring add-member --member "$MEMBER" --ring "$RING" --id "$AGENT_ID" --name railway-agent >/dev/null

say "4/4 sealing the delegate key. cast asks for the $DELEGATE_ACCOUNT password once; the key goes straight into the seal"
KEY="$(cast wallet decrypt-keystore "$DELEGATE_ACCOUNT" | awk '{print $NF}')"
[[ "$KEY" =~ ^0x[0-9a-fA-F]{64}$ ]] || { unset KEY; stop "$DELEGATE_ACCOUNT did not open to a private key"; }
printf %s "$KEY" | keyring seal --member "$MEMBER" --ring "$RING" --key subfloor-delegate --out "$SEALED" >/dev/null
unset KEY
chmod 600 "$MEMBER" "$RING" "$SEALED"

say "the ring now holds:"
keyring members --ring "$RING"
say "done. Tell Claude \"ring ready\". It puts $RING into SUBFLOOR_RING_BLOCKS and $SEALED into
  SUBFLOOR_DELEGATE_SEALED on the agent service; then SUBFLOOR_DELEGATE_KEY can be deleted there.
  Keep $DIR: revoking the agent later needs this laptop's member file, the ring and the Ledger."
