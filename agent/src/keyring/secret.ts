import { crypto } from "./lkrp.ts";
import type { Ring } from "./ring.ts";
import type { MemberCredentials, SealedSecret } from "./types.ts";

/**
 * Seal a secret against the ring.
 *
 * This is the property the Ledger track is paying for: the agent host holds
 * ciphertext, not the delegate key. The key that opens it is not on the host
 * either — it is derived from the ring blocks and the host's member private key
 * each time, and a revoked host cannot derive it.
 *
 * The cipher is the SDK's own `encryptUserData` (AES-GCM under the ring key),
 * the same call `SDK.encryptUserData` makes at sdk.ts:359. We do not roll one.
 */
export async function sealSecret(
  ring: Ring,
  credentials: MemberCredentials,
  key: string,
  plaintext: string | Uint8Array,
): Promise<SealedSecret> {
  const ringKey = await ring.ringKey(credentials);
  const data = typeof plaintext === "string" ? new TextEncoder().encode(plaintext) : plaintext;
  const ciphertext = crypto.encryptUserData(ringKey, data);
  ringKey.fill(0);
  return {
    version: 1,
    ring: ring.descriptor(),
    sealedBy: credentials.pubkey,
    key,
    ciphertext: Buffer.from(ciphertext).toString("base64"),
    sealedAt: new Date().toISOString(),
  };
}

/**
 * Open a sealed secret.
 *
 * Fails closed in three separate ways, and each one matters:
 *  - wrong ring: the descriptor's rootId does not match, so we refuse before
 *    touching any key material rather than returning garbage;
 *  - stale branch: the secret was sealed on a branch that a ring revocation has
 *    since closed, so it must be re-sealed, and saying so is more useful than a
 *    decryption error;
 *  - not a member: `ring.ringKey` throws NotARingMember. This is the revoked
 *    agent's experience, and it is the kill switch working.
 */
export async function openSecret(
  ring: Ring,
  credentials: MemberCredentials,
  sealed: SealedSecret,
): Promise<Uint8Array> {
  if (sealed.version !== 1) {
    throw new Error(`unknown sealed-secret version ${String(sealed.version)}`);
  }
  const now = ring.descriptor();
  if (sealed.ring.rootId !== now.rootId) {
    throw new Error(
      `sealed against a different ring (${sealed.ring.rootId.slice(0, 8)}…), this host holds ${now.rootId.slice(0, 8)}…`,
    );
  }
  if (sealed.ring.applicationPath !== now.applicationPath) {
    throw new Error(
      `sealed on ${sealed.ring.applicationPath}, which a ring revocation has closed; ` +
        `the live branch is ${now.applicationPath} and the secret must be re-sealed on it`,
    );
  }
  const ringKey = await ring.ringKey(credentials);
  try {
    return crypto.decryptUserData(ringKey, Uint8Array.from(Buffer.from(sealed.ciphertext, "base64")));
  } finally {
    ringKey.fill(0);
  }
}

export async function openSecretAsString(
  ring: Ring,
  credentials: MemberCredentials,
  sealed: SealedSecret,
): Promise<string> {
  return new TextDecoder().decode(await openSecret(ring, credentials, sealed));
}

/**
 * Re-seal after a ring revocation.
 *
 * Revocation moves the ring to a new branch with a new key. Everything sealed
 * under the old key stays readable to anyone who cached that key, including the
 * host that was just revoked — the ring cannot reach into a machine it no
 * longer talks to. So a revocation is only half done until the surviving
 * secrets are re-sealed on the new branch and the old ciphertext is deleted.
 */
export async function resealSecret(
  oldRing: Ring,
  newRing: Ring,
  credentials: MemberCredentials,
  sealed: SealedSecret,
): Promise<SealedSecret> {
  const plaintext = await openSecret(oldRing, credentials, sealed);
  try {
    return await sealSecret(newRing, credentials, sealed.key, plaintext);
  } finally {
    plaintext.fill(0);
  }
}

export function assertSealedSecret(value: unknown): asserts value is SealedSecret {
  const v = value as Partial<SealedSecret> | null;
  if (
    !v ||
    v.version !== 1 ||
    typeof v.ciphertext !== "string" ||
    typeof v.key !== "string" ||
    !v.ring ||
    typeof v.ring.rootId !== "string" ||
    typeof v.ring.applicationPath !== "string"
  ) {
    throw new Error("not a sealed secret envelope");
  }
}
