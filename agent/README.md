# `agent/` — the Key Ring on a host with no USB port

The SUBFLOOR agent runs on a VPS. A VPS has no USB port, and the Ledger Key Ring
CLI cannot be provisioned on one:

```
$ WALLET_PASS=… wallet-cli ring init --output json
{"ok":false,"error":{"command":"ring init","code":"unknown",
 "message":"No Ledger device found. Unlock the device and try again."}}
```

That is `@ledgerhq/wallet-cli@2.1.0`, run on this machine on 7 Sep 2026 with no
device attached. Every other `ring` subcommand sits behind `init`, so on a
headless host the whole command group is unreachable.

This package closes that gap. The agent host generates its own member identity
locally, is enrolled into the ring over an encrypted channel by a machine that
does have the device, and from then on seals and opens its delegate key against
the ring with no device and no cable. Revoking its membership takes the device,
and that asymmetry is the point.

## The claim, stated so it can be checked

| | needs a device | why |
|---|---|---|
| generate member credentials | no | a secp256k1 keypair |
| create the ring | **yes** | the seed block is device-signed |
| add a member | no | signed by an existing member's software key |
| derive the ring key | no | unwrapped from the blocks with the member's own key |
| seal / open a secret | no | AES-GCM under the ring key |
| **ring revocation** | **yes** | closing the branch is device-signed, deliberately |

The two "yes" rows are the security boundary. A compromised agent host holds a
member credential and no device, so it can read what the ring gives it and can
neither revoke the owner nor rotate the ring out from under them. Enrollment is
remote; revocation is physical.

Every row was read out of the SDK source rather than inferred, at
`@ledgerhq/ledger-key-ring-protocol@0.15.2`:

- `initMemberCredentials` is `crypto.randomKeypair()`, `src/sdk.ts:97-100`.
- `getOrCreateTrustchain` creates the root through `hwDeviceProvider.withHw`,
  `src/sdk.ts:137`.
- `addMember` builds a `SoftwareDevice` from the caller's own credentials,
  `src/sdk.ts:332`. No device provider on the path.
- `removeMember` closes the live stream through `withHw`, `src/sdk.ts:272`, and
  the source says why: *"We close the current trustchain with the hardware
  wallet in order to get a user confirmation of the action"*, `src/sdk.ts:271`.

Underneath, `StreamTree` takes a `Device` interface and does not care which
implementation it gets. **The hardware requirement is a policy in the SDK
wrapper, not a property of the protocol.** That is the finding this package is
built on, and it is why the same two operations here take a `Device` you supply:
a Ledger, Speculos, or — in the offline walkthrough and the tests — a software
key you have to ask for by name.

## What runs with no hardware, right now

```
npm install
npm test        # 40 tests, 39 pass, 1 skipped
npm run typecheck
```

Nothing in that run touches a device, a cable, an emulator, or the network. It
covers member generation, ring creation, enrollment over a real WebSocket
between two real processes, sealing and opening the delegate secret, ring
revocation, and the failure modes: wrong digits, wrong ring, stale branch,
revoked member, tampered ciphertext.

The one skipped test is the Speculos one, and the section below says why.

### The walkthrough, two machines

`test/cli.e2e.test.ts` runs exactly this as separate processes. `--software-owner`
stands in for the Ledger on the two device-rooted steps; drop it and attach a
device, or set `SUBFLOOR_SPECULOS_COINAPPS`, and the same commands run for real.

On the machine with the device:

```bash
node --experimental-strip-types src/cli.ts keygen      --member laptop.member.json --name owner-laptop
node --experimental-strip-types src/cli.ts create-ring --member laptop.member.json --ring laptop.ring.json --software-owner
node --experimental-strip-types src/cli.ts relay       --port 8787 &
node --experimental-strip-types src/cli.ts enroll-host --member laptop.member.json --ring laptop.ring.json --relay ws://127.0.0.1:8787
# prints an enrollment URL, then three digits once the other side connects
```

On the agent host, which has no USB port:

```bash
node --experimental-strip-types src/cli.ts keygen --member vps.member.json --name vps-1
node --experimental-strip-types src/cli.ts enroll --member vps.member.json --ring vps.ring.json \
  --url 'ws://…/v1/enroll?host=03…' --name vps-1
# asks for the digits the other machine is showing
```

Back on the machine with the device, seal the delegate key and ship the envelope:

```bash
printf '%s' "$DELEGATE_KEY" | node --experimental-strip-types src/cli.ts seal \
  --member laptop.member.json --ring laptop.ring.json --key subfloor-delegate --out delegate.sealed.json
```

The agent host opens it, with nothing attached:

```bash
node --experimental-strip-types src/cli.ts open --member vps.member.json --ring vps.ring.json --in delegate.sealed.json
```

And the kill switch, on the machine with the device:

```bash
node --experimental-strip-types src/cli.ts revoke --member laptop.member.json --ring laptop.ring.json \
  --member-id 03… --reseal delegate.sealed.json --software-owner
```

After that the agent host's `open` fails, the owner's still works, and the agent
cannot produce a mandate co-signature, so `ApprovalGate` fails closed on chain.

## What genuinely needs hardware, and what we could not do without it

**Creating the ring, and ring revocation.** Both are device-signed by design and
we did not work around either. The CLI refuses them rather than degrading:

```
$ node --experimental-strip-types src/cli.ts create-ring --member m.json --ring r.json
this operation is rooted in the device. Attach a Ledger, or set
SUBFLOOR_SPECULOS_COINAPPS to a directory holding the Ledger Sync application
ELF, or pass --software-owner if you are running the offline walkthrough.
```

`--software-owner` exists, it is never the default, and it is not a claim that a
device was involved. A device check that quietly falls back to a software key is
the exact thing this package argues against.

**Speculos is wired and cannot be run here.** `src/keyring/speculos.ts` builds a
real Key Ring `Device` over `createSpeculosDevice`, and the test that would drive
it is skipped, not stubbed. The blocker: `createSpeculosDevice` loads the
application from a `coinapps` directory at
`<model>/<firmware>/LedgerSync/app_<version>.elf`
(`@ledgerhq/speculos-transport/lib/index.js:147`). That ELF is the Ledger Sync
application build. It is not on npm, not in the Speculos docker image, and
Ledger's own test helper marks the directory as *"completed by e2e script"*
(`ledger-key-ring-protocol/tests/test-helpers/recordTrustchainSdkTests.ts`).
Point `SUBFLOOR_SPECULOS_COINAPPS` at a directory holding it and the skipped test
runs.

**The LKRP backend.** The SDK's `SDK` class moves ring blocks through Ledger's
hosted service and authenticates with a JWT. We do not have an account for it, so
`RingStore` holds the blocks instead — a file on each host, and the enrollment
handshake to move them across. What that changes is *where the blocks are kept*.
What it does not change is a single byte of the protocol: the blocks are real
signed command streams, the signatures are real secp256k1, the key wrapping is
the SDK's, and `Ring` calls the same `StreamTree` methods `SDK` does. Swap
`RingStore` for the SDK and the mechanics below are unchanged.

## The honest limit of the kill switch

Ring revocation removes **future** access. It closes the live branch, moves to
the next one, and republishes the key to everyone except the revoked member, who
therefore cannot derive the new key. It does not reach into a machine it no
longer talks to and erase what that machine already read.

So a host that cached the old branch's key keeps whatever that key opens. A
revocation is only finished when the surviving secrets are re-sealed on the new
branch and the old ciphertext is deleted — which is what `revoke --reseal` does,
and what `openSecret` enforces by refusing an envelope from a closed branch
rather than failing with a decryption error nobody can read.

`test/revoke.test.ts` asserts this limit as a passing test rather than leaving it
in prose, because a caveat that is only in a README is a caveat that gets lost.

One tension worth naming against SUBFLOOR's own UX spec: the panic control is
specified as needing no device, and ring revocation needs one. Both hold. The
device-free half of the panic path is `dock()`, which stops the agent trading
immediately; ring revocation is the half that takes the device, and it is what
makes the cutoff permanent.

## DX findings, for the Ledger feedback doc

Raw material, each one hit while building this, each one reproducible.

**1. The Key Ring SDK cannot be installed from npm. Any version.**
`@ledgerhq/speculos-transport` (a hard dependency of
`@ledgerhq/ledger-key-ring-protocol`, at every published version) depends on
`@ledgerhq/live-dmk-speculos`, which is not published on npm at all —
`npm view @ledgerhq/live-dmk-speculos` returns 404 for `*`. A clean
`npm install @ledgerhq/ledger-key-ring-protocol@0.15.2` fails outright.
`agent/vendor/live-dmk-speculos` is a local shim that satisfies the loader so the
install can complete; it throws if anything ever calls into it. This is the
single largest barrier to anyone starting on this track.

**2. The ESM build does not load in Node.**
`lib-es/index.js` uses extensionless relative imports (`from "./Device"`), which
Node's ESM resolver rejects. And the exports map declares both `"./lib/*"` and
`"./lib/*.js"`, so the natural `…/lib/index.js` resolves to `lib/index.js.js`.
The path that works is the extensionless CommonJS one, `…/lib/index`. See
`src/keyring/lkrp.ts`, which exists only to hold that workaround.

**3. `wallet-cli ring` has no command for a second host.**
The full surface at 2.1.0 is `init`, `encrypt`, `decrypt`, `keys`, `destroy`.
There is no `add-member`, no `enroll`, and no way to revoke one member — only
`destroy`, which tears down the whole ring. So the two things the prize text
asks for, enrolling a headless host and cutting one off, have no CLI path today,
even though `addMember` needs no device and the protocol supports both.

**4. `ring init` is USB-only with no transport override.**
No `--speculos`, no transport flag. Since every other `ring` command sits behind
it, a CI runner cannot use the Key Ring for anything, and a Speculos-based demo
of the CLI is not possible either.

**5. Speculos cannot run the Key Ring flow from public artifacts.**
See above: the Ledger Sync application ELF is required and is not distributed.
The "runnable without us in the room" bar is hard to clear on this track without
it.

**6. `TrustchainSDK.encryptUserData` is typed `(trustchain, obj: object)` and
implemented `(trustchain, input: Uint8Array)`** — `src/types.ts:225` against
`src/sdk.ts:359`. Passing what the interface asks for produces ciphertext of
`[object Object]`.

**7. `createQRCodeHostInstance` is not reachable from the package root.**
The only export of `@ledgerhq/ledger-key-ring-protocol` is `getSdk`; the
cableless member-add — the closest thing to what this track is asking for —
requires a deep import into `lib/qrcode`.

**8. Small one: `npm i @ledgerhq/wallet-cli` creates no `node_modules/.bin`
entry** on darwin-arm64, so the documented `wallet-cli …` invocation does not
work after a plain install.

## Layout

```
src/keyring/
  lkrp.ts             the import shim, and why it has to exist
  credentials.ts      member identity, no device
  ring.ts             the ring: create, add, derive, revoke
  secret.ts           seal / open / re-seal the delegate key
  store.ts            blocks and envelopes on disk, mode 0600
  speculos.ts         a Key Ring device over Speculos
  walletCli.ts        bridge to `wallet-cli ring`, and what it cannot do
  enroll/
    protocol.ts       the wire protocol, modelled on Ledger Sync's QR handshake
    cipher.ts         the session cipher, over Ledger's own implementation
    relay.ts          the rendezvous point; sees ciphertext only
    host.ts           the machine that has the ring
    candidate.ts      the machine that has no USB port
src/cli.ts            the commands above
```

Nothing in this package writes a key anywhere but a mode-0600 file the operator
names, and `.gitignore` keeps `*.member.json`, `*.ring.json` and `*.sealed.json`
out of the repository.

## A note on one deliberate divergence

Ledger's QR flow finishes by sending the enrolling device the resolved ring
object, which carries the ring encryption key inside the encrypted envelope.
Ours sends the blocks and nothing else; the new host unwraps its own copy of the
key with its own private key, and the key is never on the wire. Same outcome,
except that no copy of the key exists outside the host that will use it — which
is what stops a revoked host falling back on one it was handed at enrollment.
`test/enroll.test.ts` asserts this on the payload rather than on the ciphertext,
because asserting on ciphertext proves only that AES works.
