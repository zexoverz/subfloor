import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { initMemberCredentials } from "../src/keyring/credentials.ts";
import { NotARingMember, Permissions } from "../src/keyring/ring.ts";
import { openSecret, resealSecret, sealSecret } from "../src/keyring/secret.ts";
import { ownedRing } from "./helpers.ts";
import type { MemberCredentials } from "../src/keyring/types.ts";

const member = (c: MemberCredentials, name: string) => ({
  id: c.pubkey,
  name,
  permissions: Permissions.OWNER,
});

describe("ring revocation, the kill switch", () => {
  it("moves the ring to a new branch and drops the revoked member", async () => {
    const { ring, owner, device } = await ownedRing();
    const agent = initMemberCredentials();
    const laptop = initMemberCredentials();
    let r = await ring.addMember(owner, member(agent, "vps-1"));
    r = await r.addMember(owner, member(laptop, "laptop-2"));
    assert.equal(r.applicationPath, "m/0'/16'/0'");

    const after = await r.revoke(device, agent.pubkey);
    assert.equal(after.applicationPath, "m/0'/16'/1'");
    assert.deepEqual(
      (await after.members()).map((m) => m.name).sort(),
      ["laptop-2", "owner-laptop"],
    );
    assert.equal(after.rootId, r.rootId, "the ring keeps its identity across a revocation");
  });

  it("leaves the revoked host unable to derive the live key", async () => {
    const { ring, owner, device } = await ownedRing();
    const agent = initMemberCredentials();
    const r = await ring.addMember(owner, member(agent, "vps-1"));
    assert.equal((await r.ringKey(agent)).length, 32);

    const after = await r.revoke(device, agent.pubkey);
    await assert.rejects(() => after.ringKey(agent), NotARingMember);
  });

  it("gives the survivors a different key than the one that was live before", async () => {
    const { ring, owner, device } = await ownedRing();
    const agent = initMemberCredentials();
    const r = await ring.addMember(owner, member(agent, "vps-1"));
    const before = Buffer.from(await r.ringKey(owner)).toString("hex");
    const after = await r.revoke(device, agent.pubkey);
    const now = Buffer.from(await after.ringKey(owner)).toString("hex");
    assert.notEqual(before, now);
  });

  it("bricks the agent's sealed secret once it is re-sealed", async () => {
    const { ring, owner, device } = await ownedRing();
    const agent = initMemberCredentials();
    const r = await ring.addMember(owner, member(agent, "vps-1"));
    const sealed = await sealSecret(r, owner, "subfloor-delegate", "0xdelegate");
    assert.ok(await openSecret(r, agent, sealed));

    const after = await r.revoke(device, agent.pubkey);
    const resealed = await resealSecret(r, after, owner, sealed);

    // The owner keeps working.
    assert.equal(new TextDecoder().decode(await openSecret(after, owner, resealed)), "0xdelegate");
    // The agent is finished, whichever envelope it holds.
    await assert.rejects(() => openSecret(after, agent, resealed), NotARingMember);
    await assert.rejects(() => openSecret(after, agent, sealed), /must be re-sealed/);
  });

  it("does NOT reach into the revoked host: an old envelope it already read stays readable there", async () => {
    // This is the honest limit of the mechanism and it belongs in a test, not
    // only in prose. Revocation removes future access. A host that cached the
    // old branch's key keeps whatever that key opens, so a revocation is only
    // finished when the surviving secrets are re-sealed and the old ciphertext
    // is deleted from the host.
    const { ring, owner, device } = await ownedRing();
    const agent = initMemberCredentials();
    const r = await ring.addMember(owner, member(agent, "vps-1"));
    const sealed = await sealSecret(r, owner, "subfloor-delegate", "0xdelegate");
    const cachedKey = await r.ringKey(agent);

    await r.revoke(device, agent.pubkey);

    const { crypto } = await import("../src/keyring/lkrp.ts");
    const stillReadable = crypto.decryptUserData(
      cachedKey,
      Uint8Array.from(Buffer.from(sealed.ciphertext, "base64")),
    );
    assert.equal(new TextDecoder().decode(stillReadable), "0xdelegate");
  });

  it("refuses to revoke someone who is not a member", async () => {
    const { ring, device } = await ownedRing();
    await assert.rejects(
      () => ring.revoke(device, initMemberCredentials().pubkey),
      /not a member/,
    );
  });

  it("refuses to revoke the last member", async () => {
    const { ring, owner, device } = await ownedRing();
    await assert.rejects(() => ring.revoke(device, owner.pubkey), /last member/);
  });

  it("can revoke twice, walking the branch along each time", async () => {
    const { ring, owner, device } = await ownedRing();
    const a = initMemberCredentials();
    const b = initMemberCredentials();
    let r = await ring.addMember(owner, member(a, "vps-1"));
    r = await r.addMember(owner, member(b, "vps-2"));
    r = await r.revoke(device, a.pubkey);
    assert.equal(r.applicationPath, "m/0'/16'/1'");
    r = await r.revoke(device, b.pubkey);
    assert.equal(r.applicationPath, "m/0'/16'/2'");
    assert.deepEqual((await r.members()).map((m) => m.name), ["owner-laptop"]);
    await assert.rejects(() => r.ringKey(a), NotARingMember);
    await assert.rejects(() => r.ringKey(b), NotARingMember);
  });
});
