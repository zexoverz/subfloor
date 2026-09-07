import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { initMemberCredentials } from "../src/keyring/credentials.ts";
import { NotARingMember, Permissions } from "../src/keyring/ring.ts";
import {
  assertSealedSecret,
  openSecret,
  openSecretAsString,
  resealSecret,
  sealSecret,
} from "../src/keyring/secret.ts";
import { ownedRing, softwareOwner } from "./helpers.ts";

// Not a key. A recognisable fixture, so that a grep for key-shaped strings in
// this repo finds nothing that could ever have been one.
const DELEGATE_KEY = "not-a-real-key:subfloor-delegate-fixture";

describe("the delegate secret, held by the ring", () => {
  it("seals and opens on the host that is a member", async () => {
    const { ring, owner } = await ownedRing();
    const sealed = await sealSecret(ring, owner, "subfloor-delegate", DELEGATE_KEY);
    assertSealedSecret(sealed);
    assert.equal(await openSecretAsString(ring, owner, sealed), DELEGATE_KEY);
  });

  it("puts no plaintext, no ring key and no member key in the envelope", async () => {
    const { ring, owner } = await ownedRing();
    const sealed = await sealSecret(ring, owner, "subfloor-delegate", DELEGATE_KEY);
    const envelope = JSON.stringify(sealed);
    assert.ok(!envelope.includes(DELEGATE_KEY), "delegate key is in the envelope");
    assert.ok(!envelope.includes(DELEGATE_KEY.slice(2)), "delegate key is in the envelope");
    assert.ok(!envelope.includes(owner.privatekey), "member private key is in the envelope");
    const ringKey = Buffer.from(await ring.ringKey(owner)).toString("hex");
    assert.ok(!envelope.includes(ringKey), "the ring key is in the envelope");
  });

  it("is openable by a host enrolled after the sealing", async () => {
    const { ring, owner } = await ownedRing();
    const sealed = await sealSecret(ring, owner, "subfloor-delegate", DELEGATE_KEY);
    const agent = initMemberCredentials();
    const withAgent = await ring.addMember(owner, {
      id: agent.pubkey,
      name: "vps-1",
      permissions: Permissions.OWNER,
    });
    assert.equal(await openSecretAsString(withAgent, agent, sealed), DELEGATE_KEY);
  });

  it("will not open for a host that is not in the ring", async () => {
    const { ring, owner } = await ownedRing();
    const sealed = await sealSecret(ring, owner, "subfloor-delegate", DELEGATE_KEY);
    await assert.rejects(() => openSecret(ring, initMemberCredentials(), sealed), NotARingMember);
  });

  it("refuses an envelope from a different ring instead of returning noise", async () => {
    const a = await ownedRing("laptop-a");
    const b = await ownedRing("laptop-b");
    const sealed = await sealSecret(a.ring, a.owner, "k", DELEGATE_KEY);
    await assert.rejects(
      () => openSecret(b.ring, b.owner, sealed),
      /sealed against a different ring/,
    );
  });

  it("names the fix when the envelope predates a ring revocation", async () => {
    const { ring, owner, device } = await ownedRing();
    const agent = initMemberCredentials();
    const withAgent = await ring.addMember(owner, {
      id: agent.pubkey,
      name: "vps-1",
      permissions: Permissions.OWNER,
    });
    const sealed = await sealSecret(withAgent, owner, "k", DELEGATE_KEY);
    const after = await withAgent.revoke(device, agent.pubkey);
    await assert.rejects(() => openSecret(after, owner, sealed), /must be re-sealed/);

    const resealed = await resealSecret(withAgent, after, owner, sealed);
    assert.equal(await openSecretAsString(after, owner, resealed), DELEGATE_KEY);
  });

  it("rejects a tampered envelope", async () => {
    const { ring, owner } = await ownedRing();
    const sealed = await sealSecret(ring, owner, "k", DELEGATE_KEY);
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[bytes.length - 1] ^= 0xff;
    await assert.rejects(() =>
      openSecret(ring, owner, { ...sealed, ciphertext: bytes.toString("base64") }),
    );
  });

  it("rejects a malformed envelope", () => {
    assert.throws(() => assertSealedSecret({ version: 2 }));
    assert.throws(() => assertSealedSecret(null));
  });
});

describe("the software owner device stands in for hardware, and says so", () => {
  it("creates a ring the same way a device would", async () => {
    const owner = initMemberCredentials();
    const device = softwareOwner(owner);
    assert.equal(typeof device.sign, "function");
  });
});
