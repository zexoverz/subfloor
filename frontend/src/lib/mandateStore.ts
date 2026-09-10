import type { Address } from 'viem';
import type { MandateMessage } from './mandate.ts';

/**
 * Where a signed mandate is kept, and what keeping it does and does not prove.
 *
 * A mandate is a signature, not a transaction. The vault learns of it only when the agent ships
 * with it, and until then the chain has nothing to read — which is why the setup step could never
 * complete: it was waiting on evidence that does not exist yet.
 *
 * So the evidence is the artifact itself. Holding the signature is a fact about this browser, not
 * about the chain, and everything built on it says so: the step reads "signed, not yet used", and
 * `mandateUsed` is what turns that into "used". Losing local storage loses the signature, which is
 * correct — the owner would have to sign again, and that is honest rather than a claim that
 * survives its own evidence.
 *
 * **A batch, not one.** `_consumeMandate` marks `mandateUsed[nonce]`, so one signature authorises
 * exactly one ship. An agent that re-quotes every few minutes and holds a single mandate stops after
 * its first one — which looks like the agent breaking rather than the agent running out of what it
 * was given. The owner signs a run of nonces in one sitting and the agent spends them in order.
 *
 * Nothing is weakened by the batch. Each mandate still names the tokens, still caps the amount per
 * token, and still expires. What the owner chooses is how many re-quotes to authorise and until
 * when, which is a thing they can reason about: "fifty of these, until Friday" is a sentence.
 */
const KEY = 'subfloor.mandate';

/**
 * The signature travels with the struct it signed, because it is worthless without it.
 *
 * `_consumeMandate` recomputes the EIP-712 hash from every field of the mandate, so storing the
 * signature alone leaves something nobody can spend — not the agent, not us. `expiry` is the field
 * that makes this unrecoverable rather than merely inconvenient: `buildMandate` derives it from
 * `Date.now()` when the sheet rendered, which is a different instant from the `at` recorded when
 * the signature came back, so it cannot be reconstructed after the fact — only guessed at.
 */
export type StoredMandate = {
  vault: Address;
  delegate: Address;
  nonce: string;
  signature: string;
  at: number;
  message: MandateMessage;
};

/** A signed run of them, kept together because they were approved together. */
export type StoredBatch = { vault: Address; delegate: Address; expiry: string; at: number; signed: { nonce: string; signature: string }[] };

export function loadMandate(vault: Address | null): StoredMandate | null {
  if (!vault) return null;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMandate;
    // A mandate for a different vault is not this vault's mandate.
    if (parsed.vault?.toLowerCase() !== vault.toLowerCase()) return null;
    /*
     * An entry written before the struct was kept is a signature nobody can spend, so it is not a
     * mandate. Reading it as one leaves the step saying "signed, not yet used" about something that
     * can never be used.
     */
    return parsed.message?.expiry ? parsed : null;
  } catch {
    return null;
  }
}

export function saveMandate(entry: StoredMandate): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Private browsing, quota, a disabled store — the signature still exists on screen.
  }
}

const BATCH_KEY = 'subfloor.mandates';

export function loadBatch(vault: Address | null): StoredBatch | null {
  if (!vault) return null;
  try {
    const raw = globalThis.localStorage?.getItem(BATCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBatch;
    return parsed.vault?.toLowerCase() === vault.toLowerCase() ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBatch(entry: StoredBatch): void {
  try {
    globalThis.localStorage?.setItem(BATCH_KEY, JSON.stringify(entry));
  } catch {
    // Same as above: the signatures still exist on screen, and losing them means signing again.
  }
}

/**
 * The next mandate to spend, given what the chain says is already used.
 *
 * `isUsed` is asked rather than remembered. A local counter drifts the moment a ship lands and this
 * tab is closed, and the failure is a revert on a nonce that was already burned — which reads as a
 * broken agent rather than a stale browser.
 *
 * Returns null when the batch is spent or expired. That is not an error state to hide: the agent has
 * reached the end of what its owner authorised, and the screen's job is to say so and offer to sign
 * another run.
 */
export function nextUnused(
  batch: StoredBatch | null,
  isUsed: (nonce: bigint) => boolean,
  nowSeconds: bigint,
): { nonce: string; signature: string } | null {
  if (!batch) return null;
  if (BigInt(batch.expiry) <= nowSeconds) return null;
  return batch.signed.find((m) => !isUsed(BigInt(m.nonce))) ?? null;
}

/** How many are left, for the line on screen that says whether the agent can keep going. */
export function remainingInBatch(
  batch: StoredBatch | null,
  isUsed: (nonce: bigint) => boolean,
  nowSeconds: bigint,
): number {
  if (!batch || BigInt(batch.expiry) <= nowSeconds) return 0;
  return batch.signed.filter((m) => !isUsed(BigInt(m.nonce))).length;
}
