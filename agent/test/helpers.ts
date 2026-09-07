import { SoftwareDevice } from "../src/keyring/lkrp.ts";
import { initMemberCredentials, toKeyPair } from "../src/keyring/credentials.ts";
import { Ring } from "../src/keyring/ring.ts";
import type { MemberCredentials } from "../src/keyring/types.ts";

/**
 * A stand-in owner device for the two hardware-gated operations.
 *
 * This is a software key, and the tests that use it are testing the ring
 * mechanics, not the hardware gate. Nothing here claims a device was involved:
 * the device-backed path is `openSpeculosDevice`, and the test that would drive
 * it skips when the Ledger Sync application ELF is absent.
 */
export function softwareOwner(credentials: MemberCredentials): SoftwareDevice {
  return new SoftwareDevice(toKeyPair(credentials));
}

export async function ownedRing(name = "owner-laptop"): Promise<{
  ring: Ring;
  owner: MemberCredentials;
  device: SoftwareDevice;
}> {
  const owner = initMemberCredentials();
  const device = softwareOwner(owner);
  const ring = await Ring.create(device, toKeyPair(owner).publicKey, name);
  return { ring, owner, device };
}
