import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { publicClient } from './client.ts';
import { ACTIVE_TOKENS } from './tokens.ts';
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
const projectId = import.meta.env?.VITE_REOWN_PROJECT_ID ?? '';

export type Wallet = {
  address: Address | null;
  available: boolean;
  connecting: boolean;
  error: string | null;
  /** Real balances for the mandate's token set, or null until an address exists. */
  holdings: Holding[] | null;
  connect: () => void;
  disconnect: () => void;
  /** Re-read balances. Sending tokens out changes them, and nothing else would say so. */
  refresh: () => void;
  /**
   * Sign an EIP-712 payload with the connected account.
   *
   * The alternative to the Ledger, for a vault whose registered guardian is a soft wallet. It signs
   * with whatever is connected — there is one connection at a time — so it can only produce a
   * signature the vault will honour when the connected address *is* the guardian on file. The
   * ceremony checks that before it asks, rather than after the vault refuses.
   */
  signTypedData: (typedData: unknown) => Promise<string | null>;
};

export function useWallet(): Wallet {
  const [address, setAddress] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [balanceTick, setBalanceTick] = useState(0);
  const unwatch = useRef<(() => void) | null>(null);

  /** Attach the account watcher and take the current answer. Shared by connect and by restore. */
  const subscribe = useCallback(async () => {
    const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
    const { modal, config } = startAppKit();

    unwatch.current?.();
    unwatch.current = core.watchAccount(config, {
      onChange: (account) => setAddress((account.address as Address | undefined) ?? null),
    });

    return { modal, config, core };
  }, []);

  /**
   * A session survives a reload, and the page has to know that on load rather than the first time
   * someone opens the modal. AppKit stays lazy for a genuine first visit: wagmi's own persisted
   * state is read first, and the kit is only imported when it says there is something to restore.
   */
  useEffect(() => {
    if (mocked) return;
    let live = true;

    (async () => {
      try {
        const stored = globalThis.localStorage?.getItem('wagmi.store');
        if (!stored) return;
        const parsed = JSON.parse(stored) as { state?: { current?: string | null } };
        if (!parsed.state?.current) return;

        const { config, core } = await subscribe();
        if (!live) return;
        await core.reconnect(config);
      } catch {
        // A stored session that will not come back is not an error worth showing anyone.
      }
    })();

    return () => {
      live = false;
    };
  }, [subscribe]);

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
      // The heavy import happens here, or in the restore above, and nowhere else.
      const { modal } = await subscribe();
      await modal.open({ view: 'Connect' });
    } catch (cause) {
      // The reason, when there is one. A build with no project id says so rather than leaving the
      // owner to guess whether it is their wallet, their network, or us.
      setError(cause instanceof Error ? cause.message.slice(0, 140) : 'could not open the wallet modal');
    } finally {
      setConnecting(false);
    }
  }, [subscribe]);

  const signTypedData = useCallback(async (typedData: unknown) => {
    if (!typedData) {
      // Not a refusal. Nothing was asked, and reporting it as one teaches the owner that their
      // wallet turned down something it was never shown.
      setError('there is nothing to sign yet');
      return null;
    }
    try {
      const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
      return await core.signTypedData(startAppKit().config, typedData as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.slice(0, 140) : 'the wallet declined');
      return null;
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
        ACTIVE_TOKENS.map(async ({ address: token, ...meta }) => {
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
  }, [address, balanceTick]);

  return {
    address,
    available: mocked || Boolean(projectId),
    connecting,
    error: mocked || projectId ? error : 'wallet connection needs a Reown project id',
    holdings,
    connect: () => void connect(),
    disconnect: () => void disconnect(),
    refresh: () => setBalanceTick((t) => t + 1),
    signTypedData,
  };
}
