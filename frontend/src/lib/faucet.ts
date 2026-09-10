import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import type { Address } from 'viem';
import { chain } from './chain.ts';
import { publicClient } from './client.ts';
import { addresses, faucetAbi } from './contracts.ts';

/**
 * Drawing test tokens, so the first step is not asking us for them.
 *
 * The fund step used to end at "fund the wallet first", which is a dead end on a testnet whose
 * tokens have no market — the only way through was to message someone. The faucet is on chain and
 * permissionless, and the only thing it asks about is a cooldown.
 *
 * Absent on a build with no faucet address, which is how a mainnet build behaves: no address, no
 * hook state, and the button that would have called it is not rendered.
 */
export type Faucet = {
  available: boolean;
  drawing: boolean;
  /** When this address may draw again, as a unix second. Null until asked, 0 when it may draw now. */
  nextAt: number | null;
  draw: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useFaucet(who: Address | null): Faucet {
  const [drawing, setDrawing] = useState(false);
  const [nextAt, setNextAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!addresses.faucet || !who) return;
    try {
      const at = (await publicClient.readContract({
        address: addresses.faucet as Address,
        abi: faucetAbi,
        functionName: 'nextDrawAt',
        args: [who],
      })) as bigint;
      setNextAt(Number(at));
    } catch {
      // A cooldown we cannot read is not a cooldown we should assert. The button stays offered and
      // the chain refuses if it is too soon, which is the honest order.
      setNextAt(null);
    }
  }, [who]);

  const draw = useCallback(async () => {
    if (!addresses.faucet || !who) return;
    setDrawing(true);
    try {
      const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
      const config = startAppKit().config;
      const hash = await core.writeContract(config, {
        address: addresses.faucet as Address,
        abi: faucetAbi,
        functionName: 'draw',
        chainId: chain.id,
      });
      const receipt = await core.waitForTransactionReceipt(config, { hash, chainId: chain.id });
      if (receipt.status !== 'success') throw new Error('the faucet did not pay out');
      toast.success('test tokens drawn');
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // `TooSoon` carries the timestamp, and the decoded name is more use than the raw revert.
      toast.error(
        message.includes('TooSoon')
          ? 'the faucet has a cooldown — try again later'
          : (message.split('\n')[0]?.slice(0, 140) ?? 'the faucet did not pay out'),
      );
    } finally {
      setDrawing(false);
    }
  }, [who, refresh]);

  return { available: Boolean(addresses.faucet && who), drawing, nextAt, draw, refresh };
}
