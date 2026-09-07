import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { encodeFunctionData, type Address } from 'viem';
import { erc20Abi, vaultAbi } from './contracts.ts';
import { ACTIVE_TOKENS } from './tokens.ts';
import { chain } from './chain.ts';

/**
 * Stopping the agent, and getting the money out.
 *
 * §10 fixes the order and the reason: `dock()` through canonical Aqua first, because it works even
 * if the modified router is compromised or bricked, and only then ring revocation, which bricks the
 * delegate's secrets remotely. Docking can only stop trading and never worsen a price, which is why
 * no device stands in this path — a panic control that needs hardware fails exactly when the device
 * is in a drawer somewhere else.
 *
 * ponytail: ring revocation is an off-chain call against the agent's host and has no endpoint yet
 * (#48). The docking half is real; the revocation half reports honestly that it is pending rather
 * than claiming a credential is dead when it is not.
 */
export type PanicState = {
  stage: 'idle' | 'docking' | 'stopped';
  error: string | null;
  stop: (app: Address, strategyHash: `0x${string}`) => Promise<void>;
  withdraw: () => Promise<void>;
};

/**
 * Wallet errors arrive as sentences meant for a developer. This keeps the first line, which is the
 * part that says what happened, and names the one case a reader will otherwise never work out: a
 * read-only session cannot sign, and impersonation is read-only.
 */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('eth_sendTransaction')) return 'this wallet cannot sign, only read';
  return message.split('\n')[0]?.slice(0, 140) ?? 'the transaction was not sent';
}

export function usePanic(owner: Address | null, vault: Address | null): PanicState {
  const [stage, setStage] = useState<PanicState['stage']>('idle');
  const [error, setError] = useState<string | null>(null);

  /**
   * Submitted is not done.
   *
   * `sendTransaction` resolves the moment the wallet accepts it, which is before it is in a block
   * and before anyone knows whether it succeeded. Returning there let the panic path report
   * "withdrawn" for transactions that had not landed, and left every balance the screen re-read
   * afterwards showing the state before the money moved. Both halves of that are the same mistake:
   * claiming an outcome nobody has checked.
   */
  const send = useCallback(async (to: Address, data: `0x${string}`) => {
    const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
    const config = startAppKit().config;
    const hash = await core.sendTransaction(config, { to, data, chainId: chain.id });
    const receipt = await core.waitForTransactionReceipt(config, { hash, chainId: chain.id });
    if (receipt.status !== 'success') throw new Error('the transaction reverted');
    return hash;
  }, []);

  const stop = useCallback(
    async (app: Address, strategyHash: `0x${string}`) => {
      if (!vault) return;
      setStage('docking');
      setError(null);
      try {
        await send(
          vault,
          encodeFunctionData({
            abi: vaultAbi,
            functionName: 'dock',
            args: [app, strategyHash, ACTIVE_TOKENS.map((t) => t.address)],
          }),
        );
        setStage('stopped');
        toast.success('Docked. Every strategy is stopped.');
      } catch (e) {
        // A refused signature leaves the agent running, and the screen must not pretend otherwise.
        setStage('idle');
        const message = reason(e);
        setError(message);
        toast.error(`The agent is still running — ${message}`);
      }
    },
    [send],
  );

  const withdraw = useCallback(async () => {
    if (!vault || !owner) return;
    try {
      for (const token of ACTIVE_TOKENS) {
        const balance = await import('viem').then(async ({ createPublicClient, http }) =>
          createPublicClient({ chain, transport: http() }).readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [vault],
          }),
        );
        if ((balance as bigint) === 0n) continue;
        await send(
          vault,
          encodeFunctionData({
            abi: vaultAbi,
            functionName: 'withdraw',
            args: [token.address, balance as bigint, owner],
          }),
        );
      }
      toast.success('Withdrawn to your address.');
    } catch (e) {
      const message = reason(e);
      setError(message);
      toast.error(`Nothing was withdrawn — ${message}`);
    }
  }, [owner, send]);

  return { stage, error, stop, withdraw };
}
