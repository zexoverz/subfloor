import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import type { Address } from 'viem';
import { chain } from './chain.ts';
import { raiseFloorAsVault } from './contracts.ts';
import { USDC, WETH } from './tokens.ts';

/**
 * Setting the floor, which is the one thing this product claims.
 *
 * Two properties of `raiseFloor` shape everything here.
 *
 * It keys off `msg.sender`, so it has to be called *by the vault* — `raiseFloorAsVault` wraps it in
 * `vault.execute`. Called from the owner's wallet it would register a floor on an address that
 * never settles, and the screen would say "floor set" while the vault traded unprotected. That is
 * #130, and it is worth restating because the failure is invisible from the interface.
 *
 * It also only ever strengthens: the contract rejects a weaker tolerance outright. So this cannot
 * be the path for lowering, which needs the guardian's device, and nothing here should imply it is.
 *
 * Both directions, always. A floor on one side leaves an agent free to sell the other way at any
 * price, which is not a partial guarantee but the absence of one — the ceremony's own step only
 * counts as done when `effectiveFloor` is enforced both ways.
 */
export type FloorWrite = {
  sending: boolean;
  /** Which of the two directions is in flight, since this is two signatures. */
  step: string | null;
  raise: (maxAdverseBps: number) => Promise<void>;
};

export function useFloor(vault: Address | null): FloorWrite {
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  const raise = useCallback(
    async (maxAdverseBps: number) => {
      if (!vault) return;
      setSending(true);
      try {
        const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
        const config = startAppKit().config;

        /*
         * No absolute backstop from this control. The screen sets one number — a tolerance against
         * the reference — and inventing a second bound the owner never chose would be a floor they
         * did not set. `raiseFloor` requires the new absolute to be no weaker than the old, and
         * zero against zero satisfies that.
         */
        for (const [base, quote, label] of [
          [WETH, USDC, 'selling WETH'],
          [USDC, WETH, 'selling USDC'],
        ] as const) {
          setStep(label);
          const hash = await core.writeContract(config, {
            ...raiseFloorAsVault(vault, base, quote, maxAdverseBps, 0n),
            chainId: chain.id,
          });
          const receipt = await core.waitForTransactionReceipt(config, { hash, chainId: chain.id });
          if (receipt.status !== 'success') throw new Error(`the floor for ${label} was not set`);
        }
        // Deliberately says what was asked for, not what now holds. What holds is read back from
        // the registry by the ceremony, and that read is what the screen goes on to show.
        toast.success('floor raised, both directions');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(
          message.includes('eth_sendTransaction')
            ? 'this wallet cannot sign, only read'
            : (message.split('\n')[0]?.slice(0, 140) ?? 'the floor was not set'),
        );
      } finally {
        setStep(null);
        setSending(false);
      }
    },
    [vault],
  );

  return { sending, step, raise };
}
