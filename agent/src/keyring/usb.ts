import { createRequire } from "node:module";
import { deviceFactories } from "./lkrp.ts";
import type { Device } from "./lkrp.ts";

/// A real Ledger over USB, for the agent host.
///
/// The CLI's error message has always said "attach a Ledger, or set SUBFLOOR_SPECULOS_COINAPPS",
/// and until now only the second half was implemented — attaching a device did nothing. This is the
/// first half.
///
/// It matters for the claim rather than for convenience. The whole design says the key that can
/// weaken a floor lives on hardware in the owner's hand, and a host that can only talk to an
/// emulator makes that a statement about a test rig.

/// Loaded through `createRequire` rather than `import`.
///
/// `@ledgerhq/hw-transport-node-hid-noevents` ships an ESM build whose internal imports have no file
/// extensions — `./hid-framing` rather than `./hid-framing.js` — which Node's ESM resolver rejects
/// outright. The CommonJS build in the same package is fine. Worth writing down rather than working
/// around silently: it is the kind of thing that costs an hour and belongs in the DX notes.
function loadTransport(): { list: () => Promise<unknown[]>; open: (id: unknown) => Promise<unknown> } {
  const require = createRequire(`${process.cwd()}/`);
  const mod = require("@ledgerhq/hw-transport-node-hid-noevents");
  return (mod.default ?? mod) as ReturnType<typeof loadTransport>;
}

export type UsbSession = {
  device: Device;
  close: () => Promise<void>;
};

export class NoDeviceAttached extends Error {}

/// How many Ledgers this host can see. Zero is the ordinary case on a server, and the caller should
/// say so plainly rather than throwing something about HID.
export async function attachedDeviceCount(): Promise<number> {
  try {
    return (await loadTransport().list()).length;
  } catch {
    return 0;
  }
}

/// Open the first attached device.
///
/// No device chooser: the flows this serves are ring creation and a floor lowering, and both are
/// one person at one desk with one device. A picker would be ceremony over a list of length one.
export async function openUsbDevice(): Promise<UsbSession> {
  const Transport = loadTransport();

  const paths = await Transport.list();
  if (paths.length === 0) {
    throw new NoDeviceAttached(
      "no Ledger is attached to this host. Plug one in and unlock it, or set " +
        "SUBFLOOR_SPECULOS_COINAPPS to run against the emulator, or pass --software-owner for the " +
        "offline walkthrough.",
    );
  }

  const transport = (await Transport.open(paths[0])) as { close: () => Promise<void> };

  return {
    device: deviceFactories.apdu(transport as never) as Device,
    close: async () => {
      await transport.close();
    },
  };
}
