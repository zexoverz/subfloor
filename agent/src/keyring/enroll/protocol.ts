import type { RingBlocks } from "../ring.ts";
import type { RingDescriptor } from "../types.ts";

/**
 * The enrollment wire protocol.
 *
 * Modelled directly on Ledger Sync's own cableless member-add, in
 * `@ledgerhq/ledger-key-ring-protocol/src/qrcode/index.ts`: an ephemeral
 * ECDH handshake over a relayed WebSocket, an out-of-band digit check to bind
 * the two ends to the same human, and then the credential exchange. The message
 * sequence below is theirs. Two things are ours.
 *
 * First, the out-of-band channel. Theirs is a QR code on a phone screen; a VPS
 * has no screen and no camera, so ours is the enrollment URL pasted over the
 * SSH session the operator already has. The URL carries the host's ephemeral
 * public key, so pasting it is what pins the channel — the same job the QR does.
 *
 * Second, and this is a deliberate divergence rather than a simplification:
 * Ledger's host replies with the whole `trustchain` object, which includes the
 * ring encryption key in cleartext inside the encrypted envelope. Ours replies
 * with the ring blocks and nothing else. The candidate unwraps its own copy of
 * the key from those blocks with its own private key. The key is never on the
 * wire, so there is no moment at which the agent host is handed a secret it
 * could cache past its revocation.
 */
export const ENROLLMENT_PROTOCOL_VERSION = 1;

export const ENROLLMENT_PATH = "/v1/enroll";

export type Encrypted<T> = { encrypted: string };

export type EnrollmentMessage =
  | {
      version: number;
      publisher: string;
      message: "InitiateHandshake";
      payload: { ephemeral_public_key: string };
    }
  | {
      version: number;
      publisher: string;
      message: "Failure";
      payload: { message: string; type: string };
    }
  | {
      version: number;
      publisher: string;
      message: "HandshakeChallenge";
      payload: Encrypted<{ digits: number; connected: boolean }>;
    }
  | {
      version: number;
      publisher: string;
      message: "CompleteHandshakeChallenge";
      payload: Encrypted<{ digits: string }>;
    }
  | {
      version: number;
      publisher: string;
      message: "HandshakeCompletionSucceeded";
      payload: Encrypted<Record<string, never>>;
    }
  | {
      version: number;
      publisher: string;
      message: "RingShareCredential";
      payload: Encrypted<{ id: string; name: string }>;
    }
  | {
      version: number;
      publisher: string;
      message: "RingAddedMember";
      payload: Encrypted<{ ring: RingDescriptor; blocks: RingBlocks }>;
    };

export type EnrollmentMessageName = EnrollmentMessage["message"];

export class EnrollmentFailure extends Error {
  type: string;
  constructor(type: string, message: string) {
    super(message);
    this.name = "EnrollmentFailure";
    this.type = type;
  }
}

export class InvalidDigits extends EnrollmentFailure {
  constructor(message: string) {
    super("HANDSHAKE_COMPLETION_FAILED", message);
    this.name = "InvalidDigits";
  }
}

export function parseMessage(raw: unknown): EnrollmentMessage {
  const text =
    typeof raw === "string"
      ? raw
      : Buffer.isBuffer(raw)
        ? raw.toString("utf8")
        : String(raw ?? "");
  const message: unknown = JSON.parse(text);
  if (!message || typeof message !== "object") throw new Error("invalid message");
  const m = message as Record<string, unknown>;
  if (m.version !== ENROLLMENT_PROTOCOL_VERSION) throw new Error("invalid version");
  if (typeof m.publisher !== "string") throw new Error("invalid publisher");
  if (typeof m.message !== "string") throw new Error("invalid message name");
  if (typeof m.payload !== "object" || m.payload === null) throw new Error("invalid payload");
  return message as EnrollmentMessage;
}

export function failureFrom(payload: { message: string; type: string }): Error {
  if (payload.type === "HANDSHAKE_COMPLETION_FAILED") return new InvalidDigits(payload.message);
  return new EnrollmentFailure(payload.type, payload.message);
}

/** Build the URL the operator carries from the USB machine to the agent host. */
export function enrollmentUrl(relayUrl: string, hostPublicKey: string): string {
  const base = relayUrl.replace(/^http/, "ws").replace(/\/+$/, "");
  return `${base}${ENROLLMENT_PATH}?host=${hostPublicKey}`;
}

export function hostKeyFromUrl(url: string): string {
  const m = /host=([0-9A-Fa-f]+)/.exec(url);
  if (!m) throw new Error("enrollment URL carries no host key");
  return m[1]!;
}
