import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { initMemberCredentials } from "../src/keyring/credentials.ts";
import { InMemoryRingStore, NotARingMember, Permissions, Ring } from "../src/keyring/ring.ts";
import { ownedRing } from "./helpers.ts";

describe("the ring", () => {
  it("starts with exactly its creator in it", async () => {
    const { ring, owner } = await ownedRing();
    const members = await ring.members();
    assert.equal(members.length, 1);
    assert.equal(members[0]?.id, owner.pubkey);
    assert.match(ring.applicationPath, /^m\/0'\/16'\/0'$/);
    assert.match(ring.rootId, /^[0-9a-f]+$/);
  });

  it("adds a member with no device on either side", async () => {
    const { ring, owner } = await ownedRing();
    const agent = initMemberCredentials();
    const updated = await ring.addMember(owner, {
      id: agent.pubkey,
      name: "vps-1",
      permissions: Permissions.OWNER,
    });
    assert.deepEqual(
      (await updated.members()).map((m) => m.name).sort(),
      ["owner-laptop", "vps-1"],
    );
  });

  it("lets a new member derive the ring key it was never sent", async () => {
    const { ring, owner } = await ownedRing();
    const agent = initMemberCredentials();
    const updated = await ring.addMember(owner, {
      id: agent.pubkey,
      name: "vps-1",
      permissions: Permissions.OWNER,
    });
    const ownerKey = await updated.ringKey(owner);
    const agentKey = await updated.ringKey(agent);
    assert.equal(Buffer.from(agentKey).toString("hex"), Buffer.from(ownerKey).toString("hex"));
    assert.equal(agentKey.length, 32);
  });

  it("refuses the key to a stranger", async () => {
    const { ring } = await ownedRing();
    await assert.rejects(() => ring.ringKey(initMemberCredentials()), NotARingMember);
  });

  it("refuses to let a stranger add members", async () => {
    const { ring } = await ownedRing();
    const stranger = initMemberCredentials();
    await assert.rejects(
      () =>
        ring.addMember(stranger, {
          id: initMemberCredentials().pubkey,
          name: "smuggled",
          permissions: Permissions.OWNER,
        }),
      NotARingMember,
    );
  });

  it("survives a round trip through the block store", async () => {
    const { ring, owner } = await ownedRing();
    const agent = initMemberCredentials();
    const updated = await ring.addMember(owner, {
      id: agent.pubkey,
      name: "vps-1",
      permissions: Permissions.OWNER,
    });
    const store = new InMemoryRingStore();
    await updated.save(store);
    const reloaded = await Ring.load(store);
    assert.equal(reloaded.rootId, updated.rootId);
    assert.equal(reloaded.applicationPath, updated.applicationPath);
    assert.equal((await reloaded.ringKey(agent)).length, 32);
  });

  it("keeps no private key material in the stored blocks", async () => {
    const { ring, owner } = await ownedRing();
    const agent = initMemberCredentials();
    const updated = await ring.addMember(owner, {
      id: agent.pubkey,
      name: "vps-1",
      permissions: Permissions.OWNER,
    });
    const blocks = JSON.stringify(updated.toBlocks());
    assert.ok(!blocks.includes(owner.privatekey), "owner private key leaked into the blocks");
    assert.ok(!blocks.includes(agent.privatekey), "agent private key leaked into the blocks");
    const ringKey = Buffer.from(await updated.ringKey(agent)).toString("hex");
    assert.ok(!blocks.includes(ringKey), "the ring key is in the blocks in the clear");
  });

  it("is idempotent about a member it already has", async () => {
    const { ring, owner } = await ownedRing();
    const agent = initMemberCredentials();
    const member = { id: agent.pubkey, name: "vps-1", permissions: Permissions.OWNER };
    const once = await ring.addMember(owner, member);
    const twice = await once.addMember(owner, member);
    assert.equal((await twice.members()).length, 2);
  });
});
