# Clear-signing descriptors

ERC-7730 descriptors for the two things a SUBFLOOR owner signs on a device.

A brand-new contract needs no Ledger review for these, so they are entirely ours to author and
ours to get right.

## What they cover

**`eip712-FloorRegistry.json`** — `FloorLowering` and `GuardianRotation`.

Lowering a floor is the one action the whole design puts behind hardware. On a device without a
descriptor it renders as a hash, and a signer confronted with a hash either refuses everything or
approves everything; neither is security. With it, the device says which pair is being exposed, by
how much, and until when.

**`eip712-AquaGuardVault.json`** — `Mandate`.

What the owner is actually authorising: this agent, this venue, these tokens, up to these amounts,
until this date. The caps are the substance — a mandate without visible amounts is a blank cheque
that happens to be typed.

## Keeping them true

The formats are keyed by the exact EIP-712 type string. Add a field to a struct, or rename one, and
the hash changes and the descriptor silently stops matching — the device falls back to the blob,
which is the state these exist to prevent, and nothing in a normal build would notice.

`agent/test/erc7730.test.ts` reads these files and the Solidity and asserts they agree. Renaming one
field in `FloorRegistry.sol` fails four of its cases.

## Checking the rendering

The type strings and fields are pinned by test; how they *look* is not, and cannot be from here.
Render them at `app.devicesdk.ledger.com/clear-signing-tools` against the deployed addresses before
the run, and read the screens as a holder would: if a line does not help someone decide, it is
noise, and if a decision needs a line that is not there, the descriptor is incomplete.
