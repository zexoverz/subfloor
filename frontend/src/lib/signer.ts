import type { Address } from 'viem';
import type { Ledger } from './ledger.ts';
import type { Wallet } from './wallet.ts';
import type { Guardian } from './guardian.ts';

/**
 * Whatever holds the guardian key, behind one shape.
 *
 * The mechanism does not care what signed the mandate — the vault recovers an address from the
 * struct and compares it to the guardian the registry has on file. A Ledger is what the design
 * argues for and what the demo shows, because the whole claim is a key split: the machine that
 * trades is never the machine that defines the worst price. But that split is about the *key* being
 * elsewhere, not about the plastic it lives in, and a guardian registered as a soft wallet is a
 * weaker version of the same arrangement rather than a different one.
 *
 * So this exists to let the ceremony ask the thing that actually holds the key, and to say which
 * one it asked rather than drawing a Ledger over a browser extension.
 */
export type Signer = {
  kind: 'device' | 'wallet';
  /** What is attached, once known. Null is "not asked yet", never "the wrong one". */
  address: Address | null;
  /** Whether it can be asked at all: no WebHID in this browser, or no wallet connected. */
  ready: boolean;
  connecting: boolean;
  error: string | null;
  /** Returns the address it read, because state from this render is a render behind. */
  connect: () => Promise<Address | null>;
  signTypedData: (typedData: unknown, onStep?: (step: string) => void) => Promise<string | null>;
};

export function deviceSigner(ledger: Ledger): Signer {
  return {
    kind: 'device',
    address: ledger.address,
    ready: ledger.presence !== 'unsupported',
    connecting: ledger.connecting,
    error: ledger.error,
    connect: ledger.connect,
    signTypedData: ledger.signTypedData,
  };
}

/**
 * One address the browser can sign with, and the way to ask it.
 *
 * Two kinds arrive here and the difference matters only inside `sign`: an account of the connection
 * this page is about, asked through wagmi, and a key attached for signing alone, asked through its
 * own provider. Everything above treats them as the same thing, which is the point — the vault
 * recovers an address and compares it to the guardian on file, and does not care which library
 * produced the signature.
 */
export type SignKey = {
  address: Address;
  /** Which wallet it came from, for a list where two rows are otherwise forty hex characters. */
  name: string;
  icon?: string;
  sign: (typedData: unknown) => Promise<string | null>;
};

/**
 * Everything signable right now, in the order it should be offered.
 *
 * The trading connection's accounts first, because most owners registered one of them, then the key
 * attached by hand. De-duplicated by address: attaching the account that is already connected is a
 * thing an owner will do, and it should not double the list.
 */
export function signingKeys(wallet: Wallet | undefined, guardian: Guardian): SignKey[] {
  const keys: SignKey[] = (wallet?.accounts ?? []).map((account) => ({
    address: account.address,
    name: account.name,
    sign: (typedData) => wallet!.signTypedData(typedData, account),
  }));

  const attached = guardian.key;
  if (attached && !keys.some((k) => k.address.toLowerCase() === attached.address.toLowerCase())) {
    keys.push({
      address: attached.address,
      name: attached.name,
      icon: attached.icon,
      sign: guardian.signTypedData,
    });
  }
  return keys;
}

/** The chosen key, as the ceremony's one signer. */
export function keySigner(key: SignKey | null, busy: boolean, error: string | null): Signer {
  return {
    kind: 'wallet',
    address: key?.address ?? null,
    ready: Boolean(key),
    connecting: busy,
    error,
    // Nothing to open: a key is on this list because it has already answered.
    connect: async () => key?.address ?? null,
    signTypedData: (typedData) => (key ? key.sign(typedData) : Promise.resolve(null)),
  };
}
