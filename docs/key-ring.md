# The house agent's key, in the Ledger Key Ring

The Ledger track pays for one property: the machine the agent runs on holds ciphertext, not the key.
Since #274 the house agent can run that way. This is the runbook.

## What sits where

| | Where | Secret? |
|---|---|---|
| the delegate key | nowhere in the clear; sealed in `SUBFLOOR_DELEGATE_SEALED` on the `agent` service | ciphertext |
| the ring blocks | `SUBFLOOR_RING_BLOCKS` on `agent`, and `~/.subfloor/ring.json` on the owner's laptop | no key material |
| the agent host's member credential | `/data/ring-member.json` on the `agent` volume, generated there on first start | yes, and it never leaves that volume |
| the owner's member credential | `~/.subfloor/member.json` | yes, laptop only |
| the ring's root | the owner's Ledger | on the device |

The agent opens the envelope at start with its own member credential (`agent/src/house/key.ts`).
Adding a member needs no device; creating the ring and revoking a member do. That is the same
asymmetry as the floor: strengthening is cheap, weakening needs the hardware.

## Setting it up

1. On `agent`: a volume at `/data` and `SUBFLOOR_RING_MEMBER_PATH=/data/ring-member.json`. On the next
   start the log says `[ring] this host is ring member <id>`. While nothing is sealed it keeps trading
   on `SUBFLOOR_DELEGATE_KEY`, so there is no gap.
2. The ring on whichever machine has the Ledger, the seal on whichever has the delegate keystore.
   Only public ids and the ring blocks move between them:
   - owner's laptop: `bash scripts/key-ring-setup.sh id` prints that laptop's member id
   - the Ledger machine, device plugged in and unlocked: `bash scripts/key-ring-setup.sh ring
     <agent id> <laptop id>` creates the ring on the device if there is none and adds both ids; send
     the resulting `~/.subfloor/ring.json` to the owner
   - owner's laptop: `bash scripts/key-ring-setup.sh rotate <ring.json>` makes a new delegate whose
     key has never been printed, sets it on the vault, signs a fresh mandate for it, revokes the old
     ones and seals the new key into the ring. `seal <ring.json>` seals the current key as it is, and
     is only for a key that never left its keystore; ours was printed in a terminal on 11 Sep (#287)
3. On `agent`: `SUBFLOOR_RING_BLOCKS` from `~/.subfloor/ring.json` and `SUBFLOOR_DELEGATE_SEALED` from
   `~/.subfloor/delegate.sealed.json`, then delete `SUBFLOOR_DELEGATE_KEY`. The log says
   `[ring] opened the delegate key from the Key Ring`.

Once a sealed key is configured the agent never falls back to a plain one, even if one is still set.
A revocation that a fallback could route around would not be a revocation.

## Ring revocation, the kill switch

```bash
cd agent && node --experimental-strip-types src/cli.ts revoke \
  --member ~/.subfloor/member.json --ring ~/.subfloor/ring.json \
  --member-id <agent id> --reseal ~/.subfloor/delegate.sealed.json
```

Run it on the Ledger machine and approve on the device. `--reseal` opens the key on that machine to
seal it again on the new branch, so whoever holds the Ledger sees it for that moment; if that should
not be them, the owner reseals instead. Put the new `ring.json` and `delegate.sealed.json` into the
two variables. The
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

## Rooting the ring with no hardware — Speculos

The one device-gated step (`create-ring`, and `revoke`) can run against an emulated Ledger, so a
headless host — the exact "bring the Key Ring to a host with no USB port" the Ledger track asks for —
can do it. `agent/src/keyring/speculos.ts` drives this; `cli.ts` `ownerDevice()` picks Speculos when
`SUBFLOOR_SPECULOS_COINAPPS` is set and no USB device is attached.

The emulator needs the Ledger Sync application ELF, which ships in no public artifact but builds from
public source in one command:

```bash
git clone --depth 1 https://github.com/LedgerHQ/app-ledger-sync.git
docker pull ghcr.io/ledgerhq/ledger-app-builder/ledger-app-builder-lite:latest
docker run --rm -v "$PWD/app-ledger-sync":/app \
  ghcr.io/ledgerhq/ledger-app-builder/ledger-app-builder-lite:latest \
  bash -c 'make -j BOLOS_SDK=$NANOSP_SDK'
# => app-ledger-sync/build/nanos2/bin/app.elf
```

Place it where `createSpeculosDevice`'s `conventionalAppSubpath` looks, and point the env at it:

```bash
mkdir -p coinapps/nanos+/1.1.2/LedgerSync
cp app-ledger-sync/build/nanos2/bin/app.elf coinapps/nanos+/1.1.2/LedgerSync/app_1.2.2.elf
export SUBFLOOR_SPECULOS_COINAPPS=$PWD/coinapps
export SUBFLOOR_SPECULOS_FIRMWARE=1.1.2         # a value inferSDK ignores, so no bad --sdk flag
export SUBFLOOR_SPECULOS_APP_VERSION=1.2.2
export SPECULOS_IMAGE_TAG=ghcr.io/ledgerhq/speculos:latest   # the pinned sha-e262a0c is too old for api-level 26
```

Then the ring ceremony (`bash scripts/key-ring-setup.sh ring …`, or `cli.ts create-ring`) runs
against the emulator: the app raises its genuine on-device consent ("Turn on sync for Ledger
Wallet?") and the automation in `speculos.ts` confirms it. `addMember`, `seal`, `open`, and the
`revoke` re-seal are software (no device) and are covered by `test/*.test.ts` (19 pass).

Host arch note: on arm64 the amd64 Speculos image runs under emulation (~2 min/boot).

**Known-flaky:** the NBGL two-button confirm is timed, not screen-synced — the automation pages the
review with a right press and fires one delayed press-both on the confirm label. It usually lands;
if a run denies with `0x6985`, re-run. Deterministic per-screen sync (Ledger's own e2e records the
automation rather than reacting live) is the remaining polish.

## DX feedback — Ledger Sync / LKRP for a headless, no-USB agent

Rooting a trustchain in an emulated device is achievable but underdocumented, and the tooling fights
it at three turns, each a dead end before it worked:

- `@ledgerhq/speculos-transport`'s default (`SPECULOS_USE_WEBSOCKET` unset) routes to
  `@ledgerhq/live-dmk-speculos`, which is not published to npm — so the out-of-the-box path
  dead-ends. The websocket path works, but the flag only responds to `@ledgerhq/live-env`'s `setEnv`,
  not the `SPECULOS_USE_WEBSOCKET` environment variable the code and docs imply, and it is snapshotted
  at module load.
- the package's `import` condition resolves to `lib-es/`, whose files (and `@ledgerhq/live-env`) use
  extensionless relative imports that Node's native ESM rejects; the CommonJS `lib/` build has to be
  required explicitly.
- `createSpeculosDevice`'s coinapps convention expects a Ledger Sync ELF that is in no public
  artifact; it builds fine from `app-ledger-sync`, but that is stated nowhere.

On real hardware the trustchain APDUs (CLA `0xE0`, INS `0x04–0x09`) return `0x6d00` unless the Ledger
Sync app is the *open* app, and there is no documented way to reach that app on a Nano outside Ledger
Live's hosted Ledger Sync feature. That is exactly the blocker for a headless, no-USB hosted-agent
enrollment: `wallet-cli ring init` is USB-only, and there is no CLI or remote route to the one
device-rooted step. A supported hosted-agent enrollment needs either a device-free attestation for
the seed block, or a documented remote-signing handoff for `getOrCreateTrustchain`.
