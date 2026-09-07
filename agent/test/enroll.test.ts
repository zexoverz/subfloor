import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { initMemberCredentials } from "../src/keyring/credentials.ts";
import { Permissions } from "../src/keyring/ring.ts";
import { openSecretAsString, sealSecret } from "../src/keyring/secret.ts";
import { enrollThisHost } from "../src/keyring/enroll/candidate.ts";
import { addedMemberPayload, runEnrollmentHost } from "../src/keyring/enroll/host.ts";
import { startRelay, type Relay } from "../src/keyring/enroll/relay.ts";
import { InvalidDigits, enrollmentUrl, hostKeyFromUrl } from "../src/keyring/enroll/protocol.ts";
import { ownedRing } from "./helpers.ts";

/**
 * These run the real two-sided enrollment over a real WebSocket, in one process
 * only because a test runner is one process. Neither side reaches for a device,
 * and the ring key never appears on the wire — the last test proves that by
 * reading the frames the relay carried.
 */
describe("no-USB enrollment", () => {
  let relay: Relay;
  before(async () => {
    relay = await startRelay();
  });
  after(async () => {
    await relay.close();
  });

  it("enrolls a host that has no device, over the relay, and the host can then decrypt", async () => {
    const { ring, owner } = await ownedRing("owner-laptop");
    const agent = initMemberCredentials();
    let url: string | undefined;
    let digits: string | undefined;

    const hostSide = runEnrollmentHost({
      relayUrl: relay.url,
      ring,
      credentials: owner,
      onEnrollmentUrl: (u) => {
        url = u;
      },
      onDisplayDigits: (d) => {
        digits = d;
      },
    });

    const candidateSide = (async () => {
      await waitFor(() => url !== undefined);
      return enrollThisHost({
        url: url!,
        credentials: agent,
        name: "vps-1",
        provideDigits: async () => {
          await waitFor(() => digits !== undefined);
          return digits!;
        },
      });
    })();

    const [hostResult, candidateResult] = await Promise.all([hostSide, candidateSide]);

    assert.equal(hostResult.member.id, agent.pubkey);
    assert.equal(candidateResult.descriptor.rootId, hostResult.ring.descriptor().rootId);
    assert.deepEqual(
      (await candidateResult.ring.members()).map((m) => m.name).sort(),
      ["owner-laptop", "vps-1"],
    );

    // The point of the exercise: this host can now open a secret sealed on the
    // machine that has the device, and it has never seen a device.
    const sealed = await sealSecret(hostResult.ring, owner, "subfloor-delegate", "0xdeadbeef");
    assert.equal(await openSecretAsString(candidateResult.ring, agent, sealed), "0xdeadbeef");
  });

  it("stops the enrollment when the digits do not match", async () => {
    const { ring, owner } = await ownedRing();
    const agent = initMemberCredentials();
    let url: string | undefined;

    const hostSide = runEnrollmentHost({
      relayUrl: relay.url,
      ring,
      credentials: owner,
      onEnrollmentUrl: (u) => {
        url = u;
      },
      onDisplayDigits: () => {},
      timeoutMs: 10_000,
    });

    const candidateSide = (async () => {
      await waitFor(() => url !== undefined);
      return enrollThisHost({
        url: url!,
        credentials: agent,
        name: "vps-1",
        provideDigits: () => "999999",
        timeoutMs: 10_000,
      });
    })();

    await assert.rejects(() => hostSide, InvalidDigits);
    await assert.rejects(() => candidateSide, InvalidDigits);
    assert.equal((await ring.members()).length, 1, "a failed handshake must not add a member");
  });

  it("hands the candidate the blocks and nothing else — never the ring key", async () => {
    // Asserted on the payload, not on the frame. Asserting on the frame proves
    // only that AES works: any secret put inside the envelope would pass.
    const { ring, owner } = await ownedRing();
    const agent = initMemberCredentials();
    const withAgent = await ring.addMember(owner, {
      id: agent.pubkey,
      name: "vps-1",
      permissions: Permissions.OWNER,
    });
    const payload = addedMemberPayload(withAgent);

    assert.deepEqual(Object.keys(payload).sort(), ["blocks", "ring"]);
    assert.deepEqual(Object.keys(payload.ring).sort(), ["applicationPath", "rootId"]);

    const serialized = JSON.stringify(payload);
    const ringKey = Buffer.from(await withAgent.ringKey(owner)).toString("hex");
    assert.ok(!serialized.includes(ringKey), "the ring key is in the enrollment payload");
    assert.ok(!serialized.includes(owner.privatekey), "the owner private key is in the payload");
    assert.ok(!serialized.includes(agent.privatekey), "the agent private key is in the payload");
  });

  it("gives the relay ciphertext only", async () => {
    const { ring, owner } = await ownedRing();
    const agent = initMemberCredentials();
    const frames: string[] = [];

    // A relay that keeps everything it forwards, which is what a hostile one
    // would do. It must learn nothing: not who is enrolling, not under what
    // name, not the ring id.
    const nosy = await startRelayRecording(frames);
    let url: string | undefined;
    let digits: string | undefined;

    const hostSide = runEnrollmentHost({
      relayUrl: nosy.url,
      ring,
      credentials: owner,
      onEnrollmentUrl: (u) => {
        url = u;
      },
      onDisplayDigits: (d) => {
        digits = d;
      },
    });

    const candidateSide = (async () => {
      await waitFor(() => url !== undefined);
      return enrollThisHost({
        url: url!,
        credentials: agent,
        name: "vps-1",
        provideDigits: async () => {
          await waitFor(() => digits !== undefined);
          return digits!;
        },
      });
    })();

    const [, candidateResult] = await Promise.all([hostSide, candidateSide]);
    await nosy.close();

    const wire = frames.join("\n");
    assert.ok(frames.length >= 4, `expected a full handshake, saw ${frames.length} frames`);
    assert.ok(wire.includes("RingShareCredential"), "no credential frame was captured");
    assert.ok(!wire.includes(agent.pubkey), "the enrolling identity crossed the relay in clear");
    assert.ok(!wire.includes("vps-1"), "the member name crossed the relay in clear");
    assert.ok(!wire.includes(ring.rootId), "the ring id crossed the relay in clear");
    assert.ok(!wire.includes(digits!), "the handshake digits crossed the relay in clear");
    assert.ok(!wire.includes(owner.privatekey));
    assert.ok(!wire.includes(agent.privatekey));
    assert.equal((await candidateResult.ring.ringKey(agent)).length, 32);
  });

  it("builds and reads back the URL the operator carries", () => {
    const key = initMemberCredentials().pubkey;
    const url = enrollmentUrl("http://relay.example:8080", key);
    assert.ok(url.startsWith("ws://relay.example:8080/v1/enroll?host="));
    assert.equal(hostKeyFromUrl(url), key);
    assert.throws(() => hostKeyFromUrl("ws://relay.example/v1/enroll"));
  });

  it("fails the candidate rather than hanging when the other side never appears", async () => {
    const orphan = await startRelay();
    const url = enrollmentUrl(orphan.url, initMemberCredentials().pubkey);
    await assert.rejects(
      () =>
        enrollThisHost({
          url,
          credentials: initMemberCredentials(),
          name: "vps-1",
          provideDigits: () => "000",
          timeoutMs: 600,
        }),
      /did not complete/,
    );
    await orphan.close();
  });
});

/** A relay that keeps a copy of every frame it forwards. */
async function startRelayRecording(frames: string[]): Promise<Relay> {
  const relay = await startRelay();
  const { WebSocket } = await import("ws");
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (this: WebSocket, ...args: unknown[]) {
    frames.push(String(args[0]));
    return (send as (...a: unknown[]) => void).apply(this, args);
  } as typeof WebSocket.prototype.send;
  const close = relay.close.bind(relay);
  return {
    ...relay,
    async close() {
      WebSocket.prototype.send = send;
      await close();
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the other side");
    await new Promise((r) => setTimeout(r, 5));
  }
}
