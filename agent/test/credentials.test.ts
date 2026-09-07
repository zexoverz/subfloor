import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  assertMemberCredentials,
  initMemberCredentials,
  publicIdentity,
} from "../src/keyring/credentials.ts";

describe("member credentials (no device, no network)", () => {
  it("generates a well-formed identity with nothing attached to the machine", () => {
    const a = initMemberCredentials();
    assertMemberCredentials(a);
    assert.match(a.pubkey, /^[0-9a-f]{66}$/);
    assert.match(a.privatekey, /^[0-9a-f]{64}$/);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 64 }, () => initMemberCredentials().pubkey));
    assert.equal(seen.size, 64);
  });

  it("publishes only the public half", () => {
    const c = initMemberCredentials();
    const identity = publicIdentity(c, "vps-1");
    assert.deepEqual(Object.keys(identity).sort(), ["id", "name"]);
    assert.equal(identity.id, c.pubkey);
    assert.ok(!JSON.stringify(identity).includes(c.privatekey));
  });

  it("rejects a malformed identity rather than carrying it forward", () => {
    assert.throws(() => assertMemberCredentials({ pubkey: "00", privatekey: "00" }));
    assert.throws(() => assertMemberCredentials(null));
    assert.throws(() =>
      assertMemberCredentials({ pubkey: "z".repeat(66), privatekey: "0".repeat(64) }),
    );
  });
});
