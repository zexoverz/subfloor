---
name: ledger-signer-wiring
description: Wire a Ledger signer into a TypeScript app — signTypedData over WebHID in the browser and over USB from Node, plus Ledger Key Ring for secrets an agent needs without a device attached. Use when adding hardware signing to an app, or when a Ledger SDK install or import fails.
---

# Wiring a Ledger signer into an app

Everything here was learned by doing it, on a real device and against real contracts. The parts
that read like warnings are warnings: each one cost hours.

## The two questions to answer first

**What must the device sign, and what must run without it?** A hardware wallet in a trading loop is
a contradiction — nobody is present at 3am. The split that works is: the device signs the
*authorisation*, software acts inside it. In SUBFLOOR the device signs a mandate ("this agent may
commit these tokens, up to these amounts, until this date") and any weakening of a price floor.
Everything else is a hot key bounded by what the device already signed.

Get that boundary right before writing any transport code. If the answer is "the device signs every
transaction", the product will not work and no amount of SDK wiring will save it.

**Browser or Node?** They are different transports and different failure modes, and you probably
need both: the owner is at a browser, the agent is on a server.

## signTypedData over WebHID, from the browser

```ts
const [{ DeviceManagementKitBuilder }, { webHidTransportFactory }, { SignerEthBuilder }] =
  await Promise.all([
    import("@ledgerhq/device-management-kit"),
    import("@ledgerhq/device-transport-kit-web-hid"),
    import("@ledgerhq/device-signer-kit-ethereum"),
  ]);

const dmk = new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build();
const sessionId = await dmk.connect({ device: await dmk.startDiscovering() });
const signer = new SignerEthBuilder({ dmk, sessionId, originToken: "your-app" }).build();

const { observable } = signer.signTypedData(DERIVATION_PATH, typedData);
```

Import them dynamically. WebHID does not exist in Node, and a static import breaks server-side
rendering and any test that touches the module.

`navigator.hid` is undefined on Firefox and Safari — check for it and say so, rather than letting
the connect button do nothing.

## signTypedData over USB, from Node

The transport is `@ledgerhq/hw-transport-node-hid-noevents`, and it must be loaded through
`createRequire`:

```ts
import { createRequire } from "node:module";
const require = createRequire(`${process.cwd()}/`);
const Transport = require("@ledgerhq/hw-transport-node-hid-noevents").default;
```

**Why, because this one is not obvious.** The package ships an ESM build whose internal imports have
no file extensions — `./hid-framing` rather than `./hid-framing.js` — which Node's ESM resolver
rejects. The `exports` map points the `import` condition at that build, so a normal import can never
reach the working CommonJS one. It installs cleanly, the types resolve, and it fails only at runtime
with an error that reads like a missing file:

```
Cannot find module '.../lib-es/hid-framing' imported from '.../lib-es/TransportNodeHid.js'
```

Then, on a server, **always check whether a device is attached before assuming one is**:

```ts
const paths = await Transport.list();
if (paths.length === 0) throw new Error("no Ledger attached; plug one in and unlock it");
```

A host with no device is the normal case, and it deserves a sentence, not a stack trace about HID.

## Ledger Key Ring, and the split that makes it usable

Key Ring lets a group of machines share a secret — an agent's delegate key, an API credential —
without every machine holding a device. The split that matters:

| Needs a device | Needs no device |
|---|---|
| `getOrCreateTrustchain()` | `initMemberCredentials()` |
| `removeMember()` | `addMember()` |

So: **hardware is required once, at ring creation**, and once more to revoke. Enrolling a new
machine and reading the secret need nothing attached. That is what makes it possible to run an agent
on a server the device has never touched.

Revocation is the part worth building carefully: removing a member's ring-held secret cuts that
machine off from everything the ring holds, remotely and immediately. Say **ring revocation**, never
"trustchain", in anything a reader sees.

## The install traps

**`@ledgerhq/speculos-transport` is uninstallable as published.** It depends on
`@ledgerhq/live-dmk-speculos@0.10.0`, which 404s at every version. Vendor a stub — the emulator path
only needs the interface — and set `SPECULOS_USE_WEBSOCKET=1` so `createSpeculosDevice` takes the
websocket branch instead of the DMK branch that reaches for the missing package.

**The Key Ring SDK's ESM build does not load in Node either.** Same extensionless-import problem, and
`.../lib/index.js` resolves to `lib/index.js.js`. The path that works is extensionless CommonJS:

```ts
import { ... } from "@ledgerhq/hw-ledger-key-ring-protocol/lib/index";
```

**`encryptUserData` is typed `obj: object` and implemented for `Uint8Array`.** Pass bytes. Passing an
object type-checks and produces ciphertext nothing can decrypt.

## Clear signing, or the device shows a hash

A device without an ERC-7730 descriptor renders typed data as a hash, and a person facing a hash
either approves everything or refuses everything. Neither is security, so the descriptors are part of
the signer wiring rather than a polish step.

A brand-new contract needs no Ledger review for its descriptors — author them yourself. Key each
format by the **exact** EIP-712 type string; rename one struct field and the descriptor silently
stops matching and the device falls back to the blob. Put a test on it that reads the descriptor and
the Solidity and asserts they agree, because nothing in a normal build notices.

Note that `pip install erc7730` finds no such package despite the docs. Read the schema and the
registry examples and write the JSON by hand.

## What to check before you believe it works

Render the descriptors in the Ledger tester against the deployed addresses and read the screens as a
holder would. If a line does not help someone decide, it is noise; if a decision needs a line that is
not there, the descriptor is incomplete. No test can tell you this.
