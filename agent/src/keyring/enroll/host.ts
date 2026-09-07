import WebSocket from "ws";
import { crypto } from "../lkrp.ts";
import { sessionCipher, type SessionCipher } from "./cipher.ts";
import { Permissions, type Ring, type RingBlocks } from "../ring.ts";
import type { MemberCredentials, RingDescriptor, RingMember } from "../types.ts";
import {
  ENROLLMENT_PROTOCOL_VERSION as VERSION,
  EnrollmentFailure,
  InvalidDigits,
  enrollmentUrl,
  failureFrom,
  parseMessage,
  type EnrollmentMessage,
} from "./protocol.ts";

export type EnrollmentHostOptions = {
  /** ws:// base URL of the relay both ends meet on */
  relayUrl: string;
  /** the ring this machine already holds */
  ring: Ring;
  /** this machine's member credentials; they sign the new member's block */
  credentials: MemberCredentials;
  /** hand this URL to the operator, who carries it to the agent host */
  onEnrollmentUrl: (url: string) => void;
  /** show these digits; the operator reads them into the agent host */
  onDisplayDigits: (digits: string) => void;
  /** permissions granted to the enrolling host */
  permissions?: number;
  digitCount?: number;
  timeoutMs?: number;
};

export type EnrollmentHostResult = {
  /** the ring after the new member is in it */
  ring: Ring;
  member: RingMember;
};

/**
 * The USB-attached side of no-USB enrollment.
 *
 * Note what this function does not do: it never opens a device. Adding a member
 * is a block signed by an existing member's software key, which is how the SDK
 * itself does it (`getSoftwareDevice(memberCredentials)`, sdk.ts:332). The
 * "USB-attached machine" in the name is a fact about where the ring was born,
 * not about what this call needs. It is called that because in practice it is
 * the operator's laptop, the machine that ran the device-gated `create`.
 */
export function runEnrollmentHost(
  options: EnrollmentHostOptions,
): Promise<EnrollmentHostResult> {
  const {
    relayUrl,
    ring,
    credentials,
    onEnrollmentUrl,
    onDisplayDigits,
    permissions = Permissions.OWNER,
    digitCount = 3,
    timeoutMs = 120_000,
  } = options;

  const ephemeral = crypto.randomKeypair();
  const publisher = crypto.to_hex(ephemeral.publicKey);
  const url = enrollmentUrl(relayUrl, publisher);
  const ws = new WebSocket(url);

  let cipher: SessionCipher | undefined;
  let expectedDigits: string | undefined;
  let settled = false;

  return new Promise<EnrollmentHostResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      fail(new EnrollmentFailure("TIMEOUT", `no host enrolled within ${timeoutMs}ms`));
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
      ws.close();
    };
    const done = (result: EnrollmentHostResult) => finish(() => resolve(result));
    const fail = (e: Error) => finish(() => reject(e));

    const send = (message: EnrollmentMessage) => ws.send(JSON.stringify(message));

    ws.on("open", () => onEnrollmentUrl(url));
    ws.on("error", (e: Error) => fail(e));
    ws.on("close", () => {
      if (!settled) fail(new EnrollmentFailure("WS_CLOSED", "enrollment channel closed early"));
    });

    ws.on("message", (raw: unknown) => {
      void (async () => {
        try {
          const data = parseMessage(raw);
          switch (data.message) {
            case "InitiateHandshake": {
              const candidateKey = crypto.from_hex(data.payload.ephemeral_public_key);
              cipher = sessionCipher(crypto.ecdh(ephemeral, candidateKey));
              expectedDigits = randomDigits(digitCount);
              onDisplayDigits(expectedDigits);
              send({
                version: VERSION,
                publisher,
                message: "HandshakeChallenge",
                payload: cipher.seal({ digits: digitCount, connected: false }),
              });
              return;
            }
            case "CompleteHandshakeChallenge": {
              const c = requireCipher(cipher);
              const { digits } = c.open<{ digits: string }>(data);
              if (digits !== expectedDigits) {
                // Do not leak the expected value in the failure we send back.
                send({
                  version: VERSION,
                  publisher,
                  message: "Failure",
                  payload: { type: "HANDSHAKE_COMPLETION_FAILED", message: "invalid digits" },
                });
                fail(new InvalidDigits("candidate returned the wrong digits"));
                return;
              }
              send({
                version: VERSION,
                publisher,
                message: "HandshakeCompletionSucceeded",
                payload: c.seal({}),
              });
              return;
            }
            case "RingShareCredential": {
              const c = requireCipher(cipher);
              const { id, name } = c.open<{ id: string; name: string }>(data);
              if (!/^[0-9a-fA-F]{66}$/.test(id)) {
                throw new EnrollmentFailure("BAD_CREDENTIAL", "candidate sent a malformed identity");
              }
              const member: RingMember = { id, name: String(name).slice(0, 64), permissions };
              const updated = await ring.addMember(credentials, member);
              send({
                version: VERSION,
                publisher,
                message: "RingAddedMember",
                payload: c.seal(addedMemberPayload(updated)),
              });
              done({ ring: updated, member });
              return;
            }
            case "Failure":
              fail(failureFrom(data.payload));
              return;
            default:
              return;
          }
        } catch (e) {
          fail(e instanceof Error ? e : new Error(String(e)));
        }
      })();
    });
  });
}

function requireCipher(cipher: SessionCipher | undefined): SessionCipher {
  if (!cipher) throw new EnrollmentFailure("NO_SESSION", "message before the handshake");
  return cipher;
}

function randomDigits(count: number): string {
  const bytes = crypto.randomBytes(count);
  let digits = "";
  for (let i = 0; i < count; i++) digits += ((bytes[i] ?? 0) % 10).toString();
  return digits;
}

/**
 * Everything the host tells the candidate, and it is a short list on purpose.
 *
 * Ledger's equivalent step hands over the resolved `trustchain`, which carries
 * `walletSyncEncryptionKey` — the ring key itself. Ours hands over the blocks,
 * out of which the candidate unwraps its own copy. Same outcome, except that no
 * copy of the key is ever produced outside the host that will use it, so a
 * revoked host has nothing cached to fall back on.
 *
 * Split out as a function so a test can assert on the payload rather than on
 * the ciphertext, which would tell it nothing.
 */
export function addedMemberPayload(ring: Ring): { ring: RingDescriptor; blocks: RingBlocks } {
  return { ring: ring.descriptor(), blocks: ring.toBlocks() };
}
