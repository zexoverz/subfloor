import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import type { Address } from 'viem';
import type { Ledger } from './ledger.ts';
import type { Wallet } from './wallet.ts';

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
 * The connected account, as a signer.
 *
 * One wallet at a time, and that is the browser's rule rather than ours. An extension holds one
 * selected account per origin and broadcasts every change of it to all connections on that origin —
 * so a second wallet attached for signing alone still re-identified this page, closed the sheet
 * under the owner and moved their account. A guardian that is not the connected account is signed
 * for by connecting that account instead.
 */
export function walletSigner(wallet: Wallet): Signer {
  return {
    kind: 'wallet',
    address: wallet.address,
    ready: Boolean(wallet.address),
    connecting: wallet.connecting,
    error: wallet.error,
    connect: async () => {
      if (wallet.address) return wallet.address;
      wallet.connect();
      return null;
    },
    /* The step callback belongs to the device kit; a browser wallet reports no progress. */
    signTypedData: (typedData) => wallet.signTypedData(typedData),
  };
}

/**
 * Report what the key said, once, and not on the page.
 *
 * A refusal is a moment, not a state. As a red line under the button it sat there after the owner
 * had moved on, and it was the widest thing on a panel whose subject is four rows of transaction
 * detail — the failure of one press outweighing the thing being signed.
 *
 * Only on a change, and never the value that was already there when this mounted. Both hooks keep
 * their last error for the life of the session, so toasting whatever is present on mount would
 * announce a refusal from ten minutes ago every time the sheet is opened.
 */
export function useSignerError(error: string | null): void {
  const seen = useRef(error);
  useEffect(() => {
    if (error && error !== seen.current) toast.error(error);
    seen.current = error;
  }, [error]);
}
