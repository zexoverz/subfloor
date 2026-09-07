import type { Address } from 'viem';

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

export type StoredMandate = { vault: Address; delegate: Address; nonce: string; signature: string; at: number };

export function loadMandate(vault: Address | null): StoredMandate | null {
  if (!vault) return null;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMandate;
    // A mandate for a different vault is not this vault's mandate.
    return parsed.vault?.toLowerCase() === vault.toLowerCase() ? parsed : null;
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
