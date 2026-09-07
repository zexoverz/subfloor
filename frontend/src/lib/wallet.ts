import { useCallback, useEffect, useRef, useState } from 'react';
import { createPublicClient, formatUnits, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { TOKENS } from './tokens.ts';
import { MOCK_ADDRESS, mocked } from './mock.ts';
import type { Holding } from '../types.ts';

/**
 * The owner's wallet, behind one interface so no screen knows which connector library is under it —
 * which is what let the injected-provider version become AppKit without a screen changing.
 *
 * Connecting is a prerequisite, not a step in the ceremony: §10 collapses deposit, mandate and
 * first floor into one signature, and a connection that happens before any of that is not part of
 * it. The screen reads inventory "from wallet", which is only true once this exists.
 */
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

/** Public by design: it identifies the app to Reown's relay, it authorises nothing. */
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID ?? '';

export type Wallet = {
  address: Address | null;
  available: boolean;
  connecting: boolean;
  error: string | null;
  /** Real balances for the mandate's token set, or null until an address exists. */
  holdings: Holding[] | null;
  connect: () => void;
  disconnect: () => void;
};

export function useWallet(): Wallet {
  const [address, setAddress] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const unwatch = useRef<(() => void) | null>(null);

  const connect = useCallback(async () => {
    // Mock mode skips the modal entirely: redesigning a five-step flow should not cost five
    // wallet approvals, and the screen says it is mocked either way.
    if (mocked) {
      setAddress(MOCK_ADDRESS);
      setHoldings([
        { symbol: 'WETH', amount: 0.18 },
        { symbol: 'USDC', amount: 512 },
      ]);
      return;
    }
    if (!projectId) return;
    setConnecting(true);
    setError(null);
    try {
      // The heavy import happens here and nowhere else.
      const [{ startAppKit }, { watchAccount }] = await Promise.all([
        import('./appkit.ts'),
        import('@wagmi/core'),
      ]);
      const { modal, config } = startAppKit();

      unwatch.current?.();
      unwatch.current = watchAccount(config, {
        onChange: (account) => setAddress((account.address as Address | undefined) ?? null),
      });

      await modal.open({ view: 'Connect' });
    } catch {
      setError('could not open the wallet modal');
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setAddress(null);
    setHoldings(null);
    const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
    await core.disconnect(startAppKit().config).catch(() => {});
  }, []);

  useEffect(() => () => unwatch.current?.(), []);

  // Balances are read on chain rather than assumed, so "from wallet" is a fact on the screen.
  useEffect(() => {
    if (!address || mocked) return;
    let live = true;

    (async () => {
      const balances = await Promise.all(
        Object.entries(TOKENS).map(async ([token, meta]) => {
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

  return {
    address,
    available: mocked || Boolean(projectId),
    connecting,
    error: mocked || projectId ? error : 'wallet connection needs a Reown project id',
    holdings,
    connect: () => void connect(),
    disconnect: () => void disconnect(),
  };
}
