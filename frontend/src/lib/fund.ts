import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { parseUnits, type Address } from 'viem';
import { chain } from './chain.ts';
import { publicClient } from './client.ts';
import { erc20Abi } from './contracts.ts';
import { WETH } from './tokens.ts';

/**
 * Moving inventory into the vault.
 *
 * The vault is the maker — it is the address that settles, and the floor is keyed to it — so
 * tokens in the owner's wallet are not inventory. This step is the one that makes them so.
 *
 * WETH gets a wrap first when the wallet is short. Base's WETH is the standard predeploy, whose
 * `receive()` wraps, but a plain send to the *vault* does not: the vault is not WETH. So the
 * shortfall is wrapped in the owner's wallet and then transferred, which is two transactions and
 * cannot be collapsed into one without a contract to do it.
 */

const wethAbi = [
  { type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] },
] as const;

export type FundEntry = { symbol: string; address: Address; decimals: number; amount: string };

export type Funding = {
  sending: boolean;
  /** What it is doing right now, because two transactions per token needs narrating. */
  step: string | null;
  send: (entries: FundEntry[]) => Promise<void>;
};

export function useFund(vault: Address | null, owner: Address | null): Funding {
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<string | null>(null);

  const send = useCallback(
    async (entries: FundEntry[]) => {
      if (!vault || !owner) return;
      const wanted = entries.filter((e) => Number(e.amount) > 0);
      if (!wanted.length) return;

      setSending(true);
      try {
        const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
        const config = startAppKit().config;

        for (const entry of wanted) {
          const amount = parseUnits(entry.amount, entry.decimals);

          if (entry.address.toLowerCase() === WETH.toLowerCase()) {
            const held = (await publicClient.readContract({
              address: WETH,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [owner],
            })) as bigint;

            if (held < amount) {
              // Wrap only what is missing: someone who already holds WETH should not be asked to
              // wrap more ETH than they need, and gas has to be left behind either way.
              setStep(`wrapping ${entry.symbol}`);
              const wrap = await core.writeContract(config, {
                address: WETH,
                abi: wethAbi,
                functionName: 'deposit',
                value: amount - held,
                chainId: chain.id,
              });
              await core.waitForTransactionReceipt(config, { hash: wrap, chainId: chain.id });
            }
          }

          setStep(`sending ${entry.symbol} to the vault`);
          const hash = await core.writeContract(config, {
            address: entry.address,
            abi: erc20Abi,
            functionName: 'transfer',
            args: [vault, amount],
            chainId: chain.id,
          });
          const receipt = await core.waitForTransactionReceipt(config, { hash, chainId: chain.id });
          if (receipt.status !== 'success') throw new Error(`the ${entry.symbol} transfer failed`);
          toast.success(`${entry.amount} ${entry.symbol} is in the vault`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(
          message.includes('eth_sendTransaction')
            ? 'this wallet cannot sign, only read'
            : (message.split('\n')[0]?.slice(0, 140) ?? 'the transfer did not go through'),
        );
      } finally {
        setStep(null);
        setSending(false);
      }
    },
    [vault, owner],
  );

  return { sending, step, send };
}
