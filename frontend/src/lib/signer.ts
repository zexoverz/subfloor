import type { Address } from 'viem';
import type { Ledger } from './ledger.ts';
import type { Wallet, WalletAccount } from './wallet.ts';

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
 * @param as Which of the browser's addresses signs. Defaults to the one the page is about, which is
 * right only when the owner registered their trading account as the guardian — everyone else picks.
 */
export function walletSigner(wallet: Wallet, as?: WalletAccount | null): Signer {
  const account = as ?? wallet.accounts.find((a) => a.address === wallet.address) ?? null;
  return {
    kind: 'wallet',
    address: account?.address ?? wallet.address,
    ready: Boolean(account ?? wallet.address),
    connecting: wallet.connecting,
    error: wallet.error,
    /*
     * Already connected, or nothing to read yet. `wallet.connect()` opens a modal and returns
     * immediately — the address arrives through the account watcher on a later render — so there is
     * no address to hand back from this call and pretending otherwise would fail the guardian check
     * against null.
     */
    connect: async () => {
      if (account) return account.address;
      if (wallet.address) return wallet.address;
      wallet.connect();
      return null;
    },
    /* The step callback belongs to the device kit; a browser wallet reports no progress. */
    signTypedData: (typedData) => wallet.signTypedData(typedData, account ?? undefined),
  };
}
