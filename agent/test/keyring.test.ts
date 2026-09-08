import { test, describe } from "node:test";
import assert from "node:assert/strict";

// --- the USB path, on a host with no device attached ---------------------------------------
//
// Added because the CLI's error message promised "attach a Ledger" while only the Speculos branch
// existed, so plugging one in did nothing at all. These run on any machine: the interesting case
// for CI is the one where no device is present, and it has to be a clear refusal rather than an
// exception about HID internals.

import { attachedDeviceCount, openUsbDevice, NoDeviceAttached } from "../src/keyring/usb.ts";

describe("a host with no Ledger attached", () => {
  test("counts zero rather than throwing", async () => {
    const n = await attachedDeviceCount();
    assert.equal(typeof n, "number");
    assert.ok(n >= 0);
  });

  test("opening says what to do, in the three ways there are to proceed", async () => {
    if ((await attachedDeviceCount()) > 0) return; // a device is plugged in; nothing to assert here

    await assert.rejects(
      () => openUsbDevice(),
      (e: Error) => {
        assert.ok(e instanceof NoDeviceAttached);
        assert.match(e.message, /Plug one in/);
        assert.match(e.message, /SUBFLOOR_SPECULOS_COINAPPS/);
        assert.match(e.message, /--software-owner/);
        return true;
      },
    );
  });

  test("the transport loads at all, which is not a given", async () => {
    // `@ledgerhq/hw-transport-node-hid-noevents` ships an ESM build whose internal imports have no
    // file extensions, so `import` of it fails outright and only the CommonJS build works. This
    // fails the day someone 'tidies' that require back into an import.
    await assert.doesNotReject(() => attachedDeviceCount());
  });
});
