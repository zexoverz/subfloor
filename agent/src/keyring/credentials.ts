import { crypto } from "./lkrp.ts";
import type { MemberCredentials } from "./types.ts";

/**
 * Generate this host's member credentials.
 *
 * This is the whole of step 1 of no-USB enrollment, and it needs nothing: no
 * device, no cable, no network, no Ledger account. It is a secp256k1 keypair.
 *
 * Verified against the SDK rather than assumed: `SDK.initMemberCredentials`
 * (node_modules/@ledgerhq/ledger-key-ring-protocol/src/sdk.ts:97-100) is
 * `crypto.randomKeypair()` and a hex conversion, with no device provider on the
 * path. We call the same primitive directly so that a host with no Ledger
 * backend account can still produce its identity.
 */
export function initMemberCredentials(): MemberCredentials {
  const kp = crypto.randomKeypair();
  return {
    pubkey: crypto.to_hex(kp.publicKey),
    privatekey: crypto.to_hex(kp.privateKey),
  };
}

/** The half of the credentials that is safe to publish, print or paste. */
export function publicIdentity(credentials: MemberCredentials, name: string): {
  id: string;
  name: string;
} {
  return { id: credentials.pubkey, name };
}

export function toKeyPair(credentials: MemberCredentials): {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
} {
  return {
    publicKey: crypto.from_hex(credentials.pubkey),
    privateKey: crypto.from_hex(credentials.privatekey),
  };
}

/** Cheap shape check for anything arriving off a wire or out of a file. */
export function assertMemberCredentials(value: unknown): asserts value is MemberCredentials {
  const v = value as Partial<MemberCredentials> | null;
  if (!v || typeof v.pubkey !== "string" || typeof v.privatekey !== "string") {
    throw new Error("not member credentials: expected { pubkey, privatekey } as hex strings");
  }
  if (!/^[0-9a-fA-F]{66}$/.test(v.pubkey)) {
    throw new Error("member pubkey is not a 33-byte compressed secp256k1 point");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(v.privatekey)) {
    throw new Error("member private key is not 32 bytes");
  }
}
