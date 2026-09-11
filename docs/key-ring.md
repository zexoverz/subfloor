# The house agent's key, in the Ledger Key Ring

The Ledger track pays for one property: the machine the agent runs on holds ciphertext, not the key.
Since #274 the house agent can run that way. This is the runbook.

## What sits where

| | Where | Secret? |
|---|---|---|
| the delegate key | nowhere in the clear; sealed in `SUBFLOOR_DELEGATE_SEALED` on the `agent` service | ciphertext |
| the ring blocks | `SUBFLOOR_RING_BLOCKS` on `agent`, and `~/.subfloor/ring.json` on the owner's laptop | no key material |
| the agent host's member credential | `/data/ring-member.json` on the `agent` volume, generated there on first start | yes, and it never leaves that volume |
| the owner's member credential | `~/.subfloor/owner-member.json` | yes, laptop only |
| the ring's root | the owner's Ledger | on the device |

The agent opens the envelope at start with its own member credential (`agent/src/house/key.ts`).
Adding a member needs no device; creating the ring and revoking a member do. That is the same
asymmetry as the floor: strengthening is cheap, weakening needs the hardware.

## Setting it up

1. On `agent`: a volume at `/data` and `SUBFLOOR_RING_MEMBER_PATH=/data/ring-member.json`. On the next
   start the log says `[ring] this host is ring member <id>`. While nothing is sealed it keeps trading
   on `SUBFLOOR_DELEGATE_KEY`, so there is no gap.
2. On the owner's laptop, Ledger plugged in and unlocked:
   `bash scripts/key-ring-setup.sh <id>`. It creates the ring on the device if there is none, adds the
   agent host by its public id, and seals the delegate key straight from the keystore without
   printing it.
3. On `agent`: `SUBFLOOR_RING_BLOCKS` from `~/.subfloor/ring.json` and `SUBFLOOR_DELEGATE_SEALED` from
   `~/.subfloor/delegate.sealed.json`, then delete `SUBFLOOR_DELEGATE_KEY`. The log says
   `[ring] opened the delegate key from the Key Ring`.

Once a sealed key is configured the agent never falls back to a plain one, even if one is still set.
A revocation that a fallback could route around would not be a revocation.

## Ring revocation, the kill switch

```bash
cd agent && node --experimental-strip-types src/cli.ts revoke \
  --member ~/.subfloor/owner-member.json --ring ~/.subfloor/ring.json \
  --member-id <agent id> --reseal ~/.subfloor/delegate.sealed.json
```

Approve on the Ledger. Put the new `ring.json` and `delegate.sealed.json` into the two variables. The
agent restarts, cannot derive the ring key on the new branch, logs `the kill switch working. Not
trading.`, and watches instead.

## What it does not do

Say these on any surface that makes the claim.

- **It acts at the next start.** A running agent already holds the key in memory. Changing the
  variables redeploys the service, and that restart is where the revocation bites.
- **A key already read stays read.** Whoever controlled the host before the revocation could have
  copied the key. Revoking the ring closes future access; `revokeMandate` on the vault, or
  `setDelegate` to a fresh address, is what makes an old copy useless on chain. The floor still holds
  either way, which is the point of the product.
- **The member credential is on the host.** Anyone who owns the host owns that file, and with it the
  envelope, until the ring revokes it. What the ring adds is that revocation is one action on the
  owner's device, and that the key is never in the dashboard, the logs or the deploy config.
