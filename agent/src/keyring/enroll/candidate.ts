import WebSocket from "ws";
import { crypto } from "../lkrp.ts";
import { sessionCipher } from "./cipher.ts";
import { Ring, SUBFLOOR_APPLICATION_ID, type RingBlocks } from "../ring.ts";
import type { MemberCredentials, RingDescriptor } from "../types.ts";
import {
  ENROLLMENT_PROTOCOL_VERSION as VERSION,
  EnrollmentFailure,
  failureFrom,
  hostKeyFromUrl,
  parseMessage,
  type EnrollmentMessage,
} from "./protocol.ts";

export type EnrollCandidateOptions = {
  /** the URL the operator carried over from the USB-attached machine */
  url: string;
  /** this host's own credentials, generated here and never sent */
  credentials: MemberCredentials;
  /** how this host will appear in `members` */
  name: string;
  /** supply the digits the other end is displaying */
  provideDigits: (config: { digits: number; connected: boolean }) => Promise<string> | string;
  applicationId?: number;
  timeoutMs?: number;
};

export type EnrollCandidateResult = {
  ring: Ring;
  blocks: RingBlocks;
  descriptor: RingDescriptor;
};

/**
 * The no-USB side.
 *
 * Everything this host contributes to the ring is a public key it generated
 * itself. It never sees a device, a cable, or the other host's private key, and
 * it never receives the ring encryption key — only the blocks, out of which it
 * unwraps its own copy with its own private key. That unwrap is verified here
 * before returning, so a host that "enrolled" but cannot actually derive the key
 * fails now rather than at the first decrypt in production.
 */
export function enrollThisHost(options: EnrollCandidateOptions): Promise<EnrollCandidateResult> {
  const {
    url,
    credentials,
    name,
    provideDigits,
    applicationId = SUBFLOOR_APPLICATION_ID,
    timeoutMs = 120_000,
  } = options;

  const hostPublicKey = crypto.from_hex(hostKeyFromUrl(url));
  const ephemeral = crypto.randomKeypair();
  const publisher = crypto.to_hex(ephemeral.publicKey);
  // The channel is pinned to the key that came in the URL. A relay that swapped
  // it would be talking to itself: it cannot produce blocks the ring accepts.
  const cipher = sessionCipher(crypto.ecdh(ephemeral, hostPublicKey));
  const ws = new WebSocket(url);

  let settled = false;

  return new Promise<EnrollCandidateResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      fail(new EnrollmentFailure("TIMEOUT", `enrollment did not complete within ${timeoutMs}ms`));
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
      ws.close();
    };
    const done = (r: EnrollCandidateResult) => finish(() => resolve(r));
    const fail = (e: Error) => finish(() => reject(e));

    const send = (message: EnrollmentMessage) => ws.send(JSON.stringify(message));

    ws.on("error", (e: Error) => fail(e));
    ws.on("close", () => {
      if (!settled) fail(new EnrollmentFailure("WS_CLOSED", "enrollment channel closed early"));
    });

    ws.on("open", () => {
      send({
        version: VERSION,
        publisher,
        message: "InitiateHandshake",
        payload: { ephemeral_public_key: publisher },
      });
    });

    ws.on("message", (raw: unknown) => {
      void (async () => {
        try {
          const data = parseMessage(raw);
          switch (data.message) {
            case "HandshakeChallenge": {
              const config = cipher.open<{ digits: number; connected: boolean }>(data);
              const digits = await provideDigits(config);
              send({
                version: VERSION,
                publisher,
                message: "CompleteHandshakeChallenge",
                payload: cipher.seal({ digits }),
              });
              return;
            }
            case "HandshakeCompletionSucceeded": {
              send({
                version: VERSION,
                publisher,
                message: "RingShareCredential",
                payload: cipher.seal({ id: credentials.pubkey, name }),
              });
              return;
            }
            case "RingAddedMember": {
              const { ring: descriptor, blocks } = cipher.open<{
                ring: RingDescriptor;
                blocks: RingBlocks;
              }>(data);
              const ring = Ring.fromBlocks(blocks, applicationId);
              if (ring.rootId !== descriptor.rootId) {
                throw new EnrollmentFailure(
                  "RING_MISMATCH",
                  "the blocks do not hash to the ring id the other end named",
                );
              }
              // Prove the enrollment rather than trust it: unwrap the key here.
              const key = await ring.ringKey(credentials);
              key.fill(0);
              done({ ring, blocks, descriptor: ring.descriptor() });
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
