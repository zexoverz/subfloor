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
