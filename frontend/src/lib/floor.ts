import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import type { Address } from 'viem';
import { chain } from './chain.ts';
import { encodeFunctionData } from 'viem';
import { addresses, raiseFloorAsVault, registryAbi, vaultAbi } from './contracts.ts';
import { publicClient } from './client.ts';
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
         * The backstop is carried through, not set from here and not sent as zero.
         *
         * This control changes one number: the tolerance against the reference. The absolute
         * backstop is a second bound the owner did not touch, so it goes back exactly as it stands.
         *
         * It used to send zero, with a note reasoning that "zero against zero satisfies" the
         * contract's no-weaker rule. True only while the backstop *was* zero. `raiseFloor` requires
         * both components to be no weaker, and a vault created with a backstop — which the factory
         * now does — has one: tightening 400 bps to 25 while dropping 2371296000 to nothing is a
         * strengthening and a weakening in one call, and the registry refuses the pair. The raise
         * button was dead for every such vault, with nothing on screen to say why.
         */
        const directions = [
          [WETH, USDC, 'selling WETH'],
          [USDC, WETH, 'selling USDC'],
        ] as const;

        /*
         * Read per direction, because the two are separate entries and need not agree — a vault can
         * carry a backstop on one side and none on the other, and this one does.
         */
        setStep('reading the floors');
        const calls = await Promise.all(
          directions.map(async ([base, quote]) => {
            const [, , absolute] = (await publicClient.readContract({
              address: addresses.registry as Address,
              abi: registryAbi,
              functionName: 'floor',
              args: [vault, base, quote],
            })) as [boolean, number, bigint];
            /*
             * Encoded here rather than handed over as a wagmi config: `sendCalls` wants bytes, and
             * `raiseFloorAsVault` describes the call for `writeContract`. Same call either way —
             * the sequential path below reuses the same args, so the two cannot drift.
             */
            const call = raiseFloorAsVault(vault, base, quote, maxAdverseBps, absolute);
            return {
              to: call.address,
              data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }),
              args: call.args,
            };
          }),
        );

        /*
         * One press for both directions, where the wallet can do it.
         *
         * A floor is two entries and setting one without the other is not a partial guarantee but
         * the absence of one — so the owner was asked to approve twice for a single decision, and a
         * wallet dismissed between the two left a vault protected one way. EIP-5792 lets the two go
         * as one batch, which makes the pair atomic in the only place the owner can see.
         *
         * Fallen back from rather than detected: `getCapabilities` is itself unevenly implemented,
         * so asking whether a wallet can do this is about as reliable as trying. The sequential
         * path stays exactly as it was, and a wallet without 5792 notices nothing.
         */
        try {
          setStep('both directions');
          const { id } = await core.sendCalls(config, {
            // Only `to` and `data`: the union also accepts an abi form, and passing extra keys
            // beside `data` makes it ambiguous which member is meant.
            calls: calls.map(({ to, data }) => ({ to, data })),
            chainId: chain.id,
          });
          const status = await core.waitForCallsStatus(config, { id });
          if (status.status !== 'success') throw new Error('the batch did not complete');
        } catch {
          for (const [i, [, , label]] of directions.entries()) {
            setStep(label);
            const call = calls[i]!;
            const hash = await core.writeContract(config, {
              address: call.to,
              abi: vaultAbi,
              functionName: 'execute',
              args: call.args,
              chainId: chain.id,
            });
            const receipt = await core.waitForTransactionReceipt(config, { hash, chainId: chain.id });
            if (receipt.status !== 'success') throw new Error(`the floor for ${label} was not set`);
          }
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
