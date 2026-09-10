import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import { chain } from './chain.ts';

/**
 * A second key, opened straight from the browser and kept out of wagmi entirely.
 *
 * This exists because routing it through wagmi did real damage. wagmi holds one `current`
 * connection and connecting makes the newcomer current — so attaching a guardian wallet
 * re-identified the whole page for as long as it took to switch back: balances, the ownership
 * check, and the address in the header all became the other account, the sheet un-rendered under
 * the owner because it is gated on ownership, and switching back after the fact was a race that
 * sometimes lost. Every one of those is a symptom of putting a signing key into the slot that says
 * who this page is about.
 *
 * It is not who the page is about. It signs one struct and it is done. So it is discovered through
 * EIP-6963 and asked directly, and the trading connection never moves.
 *
 * That also sidesteps the inert problem for free: there is no modal to open from inside a sheet,
 * only the wallet's own window, which the page does not own and `showModal()` cannot reach.
 */

/** A wallet this browser announced. Not connected, just present. */
export type BrowserWallet = { uuid: string; name: string; icon: string };

/** One address an opened wallet offered. A wallet usually offers several. */
export type GuardianKey = { address: Address; uuid: string; name: string; icon: string };

type Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
type Announcement = { detail: { info: BrowserWallet & { rdns: string }; provider: Provider } };

export type Guardian = {
  offers: BrowserWallet[];
  /** Every address the opened wallets are offering. */
  keys: GuardianKey[];
  connecting: boolean;
  error: string | null;
  /** Open a wallet and take everything it already offers. Returns what it added. */
  attach: (uuid: string) => Promise<GuardianKey[]>;
  signTypedData: (typedData: unknown, as: GuardianKey) => Promise<string | null>;
};

/**
 * `eth_signTypedData_v4` hashes the domain from the `EIP712Domain` entry in `types`, and every
 * library that hides this adds it for you. Sending the payload as written would sign a struct with
 * no domain — a valid signature over something the vault will not recognise, which is the worst of
 * the three possible outcomes because it looks like success.
 *
 * Derived from the domain's own fields rather than fixed, so a domain without a salt does not
 * declare one.
 */
const DOMAIN_FIELDS: [string, string][] = [
  ['name', 'string'],
  ['version', 'string'],
  ['chainId', 'uint256'],
  ['verifyingContract', 'address'],
  ['salt', 'bytes32'],
];

function withDomainType(typedData: Record<string, unknown>) {
  const types = (typedData.types ?? {}) as Record<string, unknown>;
  if (types.EIP712Domain) return typedData;
  const domain = (typedData.domain ?? {}) as Record<string, unknown>;
  return {
    ...typedData,
    types: {
      EIP712Domain: DOMAIN_FIELDS.filter(([field]) => domain[field] !== undefined).map(([name, type]) => ({
        name,
        type,
      })),
      ...types,
    },
  };
}

export function useGuardian(): Guardian {
  const [offers, setOffers] = useState<BrowserWallet[]>([]);
  const [keys, setKeys] = useState<GuardianKey[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Providers are objects, not data — they live in a ref so a re-render never loses the handle. */
  const providers = useRef(new Map<string, Provider>());

  useEffect(() => {
    const heard = new Map<string, BrowserWallet>();
    const onAnnounce = (event: Event) => {
      const { info, provider } = (event as unknown as Announcement).detail;
      providers.current.set(info.uuid, provider);
      heard.set(info.uuid, { uuid: info.uuid, name: info.name, icon: info.icon });
      setOffers([...heard.values()]);
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    // Wallets announce on request as well as on load, so asking is what finds the ones already up.
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
  }, []);

  const attach = useCallback(
    async (uuid: string) => {
      const provider = providers.current.get(uuid);
      const offer = offers.find((o) => o.uuid === uuid);
      if (!provider || !offer) return [];

      setConnecting(true);
      setError(null);
      try {
        /*
         * Silence first, and this is the whole fix.
         *
         * `eth_accounts` reads what the wallet already offers this origin without prompting and
         * without changing anything. Asking instead — `eth_requestAccounts`, or worse the account
         * chooser — moves the selected account inside the extension, and an extension broadcasts
         * that to every connection on the origin. Ours included: wagmi heard it, the page's address
         * changed, and the sheet un-rendered under the owner because it is gated on ownership. The
         * account the owner wanted was already on the list; the asking was the damage.
         *
         * The request below is for a wallet that has never been opened here, where there is nothing
         * to disturb because there is no connection yet.
         */
        let found = (await provider.request({ method: 'eth_accounts' })) as Address[];
        if (!found?.length) found = (await provider.request({ method: 'eth_requestAccounts' })) as Address[];
        if (!found?.length) {
          setError('that wallet is offering no account to this page');
          return [];
        }
        const added = found.map((address) => ({ address, uuid, name: offer.name, icon: offer.icon }));
        setKeys((was) => [
          ...was.filter((k) => !added.some((a) => a.address.toLowerCase() === k.address.toLowerCase())),
          ...added,
        ]);
        return added;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message.slice(0, 140) : 'that wallet did not open');
        return [];
      } finally {
        setConnecting(false);
      }
    },
    [offers],
  );

  const signTypedData = useCallback(async (typedData: unknown, as: GuardianKey) => {
    const provider = providers.current.get(as.uuid);
    if (!provider) {
      setError('that wallet is no longer here');
      return null;
    }
    if (!typedData) {
      setError('there is nothing to sign yet');
      return null;
    }
    try {
      /*
       * A wallet will not sign a domain for a chain it is not on, and its own refusal arrives as
       * something unreadable. Moving it to the chain this vault lives on is safe in a way that
       * moving the *account* is not: it is the chain the page is already using, so nothing about
       * who is here changes.
       */
      const on = (await provider.request({ method: 'eth_chainId' })) as string;
      if (Number.parseInt(on, 16) !== chain.id) {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chain.id.toString(16)}` }],
        });
      }
      const payload = JSON.stringify(withDomainType(typedData as Record<string, unknown>));
      const signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [as.address, payload],
      });
      return signature as string;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.slice(0, 140) : 'the wallet declined');
      return null;
    }
  }, []);

  return { offers, keys, connecting, error, attach, signTypedData };
}
