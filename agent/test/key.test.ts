import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { delegateKeyFromEnv } from "../src/house/key.ts";
import { initMemberCredentials, toKeyPair } from "../src/keyring/credentials.ts";
import { SoftwareDevice } from "../src/keyring/lkrp.ts";
import { Permissions, Ring } from "../src/keyring/ring.ts";
import { resealSecret, sealSecret } from "../src/keyring/secret.ts";
import { writeMemberCredentials } from "../src/keyring/store.ts";

/// Generated per run, so nothing key-shaped is ever written into the repo.
const aKey = () => `0x${randomBytes(32).toString("hex")}`;

async function memberFile() {
  const dir = await mkdtemp(join(tmpdir(), "subfloor-key-"));
  return join(dir, "ring-member.json");
}

/// The owner's ring, the agent host enrolled in it, and the delegate key sealed on it.
async function sealedForHost(delegateKey: string) {
  const owner = initMemberCredentials();
  const ownerDevice = new SoftwareDevice(toKeyPair(owner));
  const ring = await Ring.create(ownerDevice, toKeyPair(owner).publicKey, "laptop");
  const host = initMemberCredentials();
  const withHost = await ring.addMember(owner, { id: host.pubkey, name: "agent-host", permissions: Permissions.OWNER });
  const sealed = await sealSecret(withHost, owner, "subfloor-delegate", delegateKey);
  const path = await memberFile();
  await writeMemberCredentials(path, host);
  return { owner, ownerDevice, host, ring: withHost, sealed, path };
}

describe("where the house agent's key comes from", () => {
  it("is nothing when nothing is configured, so the agent only watches", async () => {
    assert.equal(await delegateKeyFromEnv({}, () => {}), null);
  });

  it("takes a plain key, and says it is in the clear", async () => {
    const key = aKey();
    const lines: string[] = [];
    const found = await delegateKeyFromEnv({ SUBFLOOR_DELEGATE_KEY: key }, (l) => lines.push(l));
    assert.deepEqual(found, { key, source: "plain" });
    assert.ok(lines.some((l) => l.includes("in the clear")));
  });

  it("opens a key sealed on the ring with this host's own member credential", async () => {
    const key = aKey();
    const { ring, sealed, path } = await sealedForHost(key);
    const found = await delegateKeyFromEnv(
      {
        SUBFLOOR_RING_MEMBER_PATH: path,
        SUBFLOOR_DELEGATE_SEALED: JSON.stringify(sealed),
        SUBFLOOR_RING_BLOCKS: JSON.stringify(ring.toBlocks()),
      },
      () => {},
    );
    assert.deepEqual(found, { key, source: "ring" });
  });

  it("generates this host's member identity on first start, mode 0600, and waits for the sealed key", async () => {
    const path = await memberFile();
    const lines: string[] = [];
    assert.equal(await delegateKeyFromEnv({ SUBFLOOR_RING_MEMBER_PATH: path }, (l) => lines.push(l)), null);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.ok(lines.some((l) => /this host is ring member [0-9a-f]{66}/.test(l)), "the member id is logged for the owner to add");
  });

  it("keeps trading on the plain key while the ring is being set up, before anything is sealed", async () => {
    const key = aKey();
    const found = await delegateKeyFromEnv({ SUBFLOOR_RING_MEMBER_PATH: await memberFile(), SUBFLOOR_DELEGATE_KEY: key }, () => {});
    assert.deepEqual(found, { key, source: "plain" });
  });

  it("does not fall back to a plain key once a sealed one is configured and will not open", async () => {
    const { sealed, ring } = await sealedForHost(aKey());
    const stranger = await memberFile();
    await writeMemberCredentials(stranger, initMemberCredentials());
    const found = await delegateKeyFromEnv(
      {
        SUBFLOOR_RING_MEMBER_PATH: stranger,
        SUBFLOOR_DELEGATE_SEALED: JSON.stringify(sealed),
        SUBFLOOR_RING_BLOCKS: JSON.stringify(ring.toBlocks()),
        SUBFLOOR_DELEGATE_KEY: aKey(),
      },
      () => {},
    );
    assert.equal(found, null);
  });

  it("stops the agent after the owner revokes this host and re-seals: the kill switch", async () => {
    const key = aKey();
    const { owner, ownerDevice, host, ring, sealed, path } = await sealedForHost(key);
    const revoked = await ring.revoke(ownerDevice, host.pubkey);
    const resealed = await resealSecret(ring, revoked, owner, sealed);
    const lines: string[] = [];
    const found = await delegateKeyFromEnv(
      {
        SUBFLOOR_RING_MEMBER_PATH: path,
        SUBFLOOR_DELEGATE_SEALED: JSON.stringify(resealed),
        SUBFLOOR_RING_BLOCKS: JSON.stringify(revoked.toBlocks()),
      },
      (l) => lines.push(l),
    );
    assert.equal(found, null);
    assert.ok(lines.some((l) => l.includes("kill switch")));
  });

  it("refuses a sealed key without its ring rather than guessing", async () => {
    const { sealed, path } = await sealedForHost(aKey());
    assert.equal(await delegateKeyFromEnv({ SUBFLOOR_RING_MEMBER_PATH: path, SUBFLOOR_DELEGATE_SEALED: JSON.stringify(sealed) }, () => {}), null);
  });
});
