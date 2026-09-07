import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, custom, formatUnits, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { TOKENS } from './tokens.ts';
import type { Holding } from '../types.ts';

/**
 * The owner's wallet. It is a prerequisite, not a step in the ceremony: §10 collapses deposit,
 * mandate and first floor into one signature, and a connection that happens before any of that is
 * not part of it. The screen reads inventory "from wallet", which is only true once this exists.
 *
 * Injected provider only, deliberately. WalletConnect and a connector library are a dependency and
 * a modal for a run with one owner on one machine; add them when a second person needs to connect.
 */
type Injected = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

const injected = (): Injected | undefined => (globalThis as { ethereum?: Injected }).ethereum;

const publicClient = createPublicClient({ chain: base, transport: http() });

const BALANCE_OF = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export type Wallet = {
  address: Address | null;
  available: boolean;
  connecting: boolean;
  error: string | null;
  /** Real balances for the mandate's token set, or null until an address exists. */
  holdings: Holding[] | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

export function useWallet(): Wallet {
  const [address, setAddress] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);

  const connect = useCallback(async () => {
    const provider = injected();
    if (!provider) {
      setError('no wallet found in this browser');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const client = createWalletClient({ chain: base, transport: custom(provider) });
      const [account] = await client.requestAddresses();
      setAddress(account ?? null);
    } catch {
      // A declined connection is a choice, not a failure, and is worded as one.
      setError('you declined the connection');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setHoldings(null);
  }, []);

  // Balances are read on chain rather than assumed, so "from wallet" is a fact on the screen.
  useEffect(() => {
    if (!address) return;
    let live = true;

    (async () => {
      const entries = Object.entries(TOKENS);
      const balances = await Promise.all(
        entries.map(async ([token, meta]) => {
          try {
            const raw = await publicClient.readContract({
              address: token as Address,
              abi: BALANCE_OF,
              functionName: 'balanceOf',
              args: [address],
            });
            return { symbol: meta.symbol, amount: Number(formatUnits(raw as bigint, meta.decimals)) };
          } catch {
            // A read that failed is not a zero balance, and must not be rendered as one.
            return { symbol: meta.symbol, amount: Number.NaN };
          }
        }),
      );
      if (live) setHoldings(balances);
    })();

    return () => {
      live = false;
    };
  }, [address]);

  // A wallet switched or locked in another tab is a disconnection here too.
  useEffect(() => {
    const provider = injected() as (Injected & { on?: Function; removeListener?: Function }) | undefined;
    if (!provider?.on) return;
    const onAccounts = (accounts: string[]) => setAddress((accounts[0] as Address) ?? null);
    provider.on('accountsChanged', onAccounts);
    return () => provider.removeListener?.('accountsChanged', onAccounts);
  }, []);

  return { address, available: Boolean(injected()), connecting, error, holdings, connect, disconnect };
}
