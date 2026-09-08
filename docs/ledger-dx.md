# Ledger DX feedback

Written while building SUBFLOOR for ETHOnline 2026. Every item below was hit building the thing,
not reading the docs, and every one is reproducible from the commands given.

The headline first, because it is the one that matters most to the track itself.

---

## 1. `wallet-cli ring` cannot do either of the two flagship asks

The prize slide names four directions and says, verbatim, that **the two highlighted ones must be
built on `wallet-cli ring`**. Those two are:

> Give agents permission, not passwords. Build a service that holds the keys and makes the API calls
> for them, so there is nothing in the agent to leak.

> Bring the Key Ring to machines you can't plug into: a VPS, a CI runner, or a hosted agent.

The second cannot be done with `wallet-cli ring`. Its entire surface, read from `--help` on 2.1.0:

```
$ wallet-cli ring --help
Subcommands:
  init     Set up this machine as a Ledger Key Ring member, creating or
           recovering a trustchain (device required).
  encrypt  Encrypt data with a key from your Ledger Key Ring.
  decrypt  Decrypt data with a key from your Ledger Key Ring.
  keys     List the keys you've used on your Ledger Key Ring.
  destroy  Tear down your Ledger Key Ring on LKRP and wipe local member credentials.
```

There is no way to **enroll another host**, and no way to **remove one member** — `destroy` tears
down the whole ring. So the flagship ask has no CLI path, and neither does revocation, which is what
makes "bring the Key Ring to a VPS" safe to do in the first place.

`ring init` is also USB-only with no transport override, reproduced live:

```
$ wallet-cli ring init --output json
{"ok":false,...,"No Ledger device found. Unlock the device and try again."}
```

**What we did instead**, and why it is not a workaround so much as the protocol working as designed:
the SDK splits hardware requirements per operation, and only two of the four need a device.

| Operation | Device? | Source |
|---|---|---|
| `initMemberCredentials()` | no | `sdk.ts:97` — `crypto.randomKeypair()` and nothing else |
| `addMember()` | **no** | `sdk.ts:332` — `getSoftwareDevice(memberCredentials)` |
| `getOrCreateTrustchain()` | yes | `sdk.ts:102` — `hwDeviceProvider.withHw` |
| `removeMember()` | yes | the source comment says why: *"we close the current trustchain with the hardware wallet in order to get a user confirmation"* |

`StreamTree` takes a `Device` interface, so **the hardware requirement is policy in the SDK wrapper,
not in the protocol**. A no-USB host can generate its own member credentials locally, hand over its
public identity, and be added by a USB-attached machine. That is exactly the flagship ask, and it is
already possible — it just is not reachable from the CLI the track names.

**Suggestion:** `ring add-member` and `ring revoke <member>`, mirroring `addMember` and
`removeMember`. The QR handshake in `src/qrcode/index.ts` is already the transport for it.

---

## 2. `@ledgerhq/speculos-transport` cannot be installed

```
$ npm view @ledgerhq/speculos-transport dependencies
{ ..., "@ledgerhq/live-dmk-speculos": "0.10.0", ... }

$ npm view @ledgerhq/live-dmk-speculos version
npm error 404 Not Found - GET https://registry.npmjs.org/@ledgerhq%2flive-dmk-speculos
```

The dependency is not published, at any version, so the package cannot be installed from a clean
registry. This one costs Ledger a bar on its own judging rubric: **"a demo we can run without you in
the room"** rests on Speculos, and Speculos does not install.

`createSpeculosDevice` additionally wants the Ledger Sync app ELF in a `coinapps` directory
(`speculos-transport/lib/index.js:147`), which is not distributed — the helper's own comment calls it
"completed by e2e script". So even with the dependency published, a hardware-free run needs an
artifact that is not available.

We wired the Speculos path anyway and the test skips with the reason printed, rather than being
deleted. It is the one part of our submission we could not make judge-runnable without hardware.

---

## 3. The SDK's ESM build does not load in Node

`lib-es` uses extensionless imports, and the exports map resolves `…/lib/index.js` to
`lib/index.js.js`. Only `…/lib/index` resolves. We keep a shim module whose entire job is to import
the working path.

## 4. `encryptUserData` is typed `object` and implemented `Uint8Array`

`types.ts:225` declares `obj: object`; `sdk.ts:359` treats it as `Uint8Array`. Passing an object
type-checks and fails at runtime.

## 5. The package root exports only `getSdk`

The QR enrollment handshake needs a deep import into `src/qrcode/index.ts`. If cableless member-add
is a supported path, its entry points belong in the public surface.

## 6. `npm i @ledgerhq/wallet-cli` creates no `node_modules/.bin` entry

On darwin-arm64. The binary is at `bin/wallet-cli` and has to be invoked by path.

---

## One suggestion about the protocol, not the tooling

Ledger's own QR flow ships the enrolling device **the ring key**, inside the envelope. We diverged
and ship blocks only, so the new host derives its own copy.

The reason is revocation. If a host was handed the key directly, removing it from the ring does not
take the key back — it keeps whatever that key opens, forever. Shipping blocks means a revoked host
loses access to everything sealed after it, and `revoke --reseal` closes the rest.

This may be deliberate on Ledger's side for a Ledger Sync use case where both ends are the same
person's devices. For the agent case the track is asking for — a VPS you may need to cut off — the
distinction matters, and it is not called out anywhere in the docs.

---

## What we would say went right

The per-operation hardware split is the right design and it is what made the whole thing possible.
Being able to add a member without a device, while removing one requires it, is exactly the
asymmetry an agent host needs: enrollment is cheap, revocation is deliberate and physical. It mirrors
the asymmetry in our own contract, where raising a floor is one call and lowering it needs the
device.

That idea is good enough to be reachable from the CLI.

## `hw-transport-node-hid-noevents` ships an ESM build Node cannot load

`@ledgerhq/hw-transport-node-hid-noevents@6.30.x` has a `lib-es` build whose internal imports carry
no file extensions — `./hid-framing` rather than `./hid-framing.js`. Node's ESM resolver requires
them, so a plain `import` of the package fails:

```
Cannot find module '.../lib-es/hid-framing' imported from '.../lib-es/TransportNodeHid.js'
```

The `exports` map points `import` at that build, so there is no way to reach the working CommonJS
one through a normal import. `createRequire` does it, and that is what we ship, with a comment
saying why so nobody tidies it back.

Cost: about an hour, most of it spent assuming the fault was ours. The package installs cleanly,
the types resolve, and it fails only at runtime with an error that reads like a missing file rather
than a packaging problem.

Suggested fix: add `.js` to the relative specifiers in the ESM build, or drop the `import` condition
so Node falls through to CommonJS.
