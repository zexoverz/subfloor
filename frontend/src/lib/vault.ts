import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { createPublicClient, http, parseEventLogs, type Address } from 'viem';
import { chain } from './chain.ts';
import { addresses, vaultFactoryAbi } from './contracts.ts';

/**
 * Which vault this wallet is looking at.
 *
 * Until #132 there was one vault, ours, and a stranger's only option was to read it. The factory
 * changes that: anyone can deploy a vault they own, so the board has to answer "whose vault is
 * this" per wallet rather than once at build time.
 *
 * The rule is that a wallet's own vault always wins over the demo one. Showing someone our vault
 * after they deployed theirs would put another owner's floor and holdings on their screen, which
 * is the one confusion this whole design exists to prevent.
 */
const publicClient = createPublicClient({ chain, transport: http() });

const ZERO = '0x0000000000000000000000000000000000000000';

/**
 * Which of a wallet's vaults the board should show, and what to fall back to.
 *
 * Two rules, both of which have a wrong answer that looks reasonable. Someone who deployed twice
 * meant the second, not the first. And a wallet with none reads ours — but only once the factory
 * has *said* it has none: treating a failed read as "no vault" would silently show a stranger's
 * vault to someone who owns one.
 */
export function pickVault(owned: readonly Address[] | null, fallback: Address | null): Address | null {
  if (owned === null) return fallback;
  const latest = owned.filter((a) => a !== ZERO).at(-1) ?? null;
  return latest ?? fallback;
}

export type OwnVault = {
  /** Their vault, or null while unknown, not connected, or none deployed. */
  vault: Address | null;
  /** Null until the factory has actually answered, so "none" is never guessed from a failed read. */
  known: boolean;
  creating: boolean;
  create: () => Promise<void>;
};

export function useOwnVault(owner: Address | null): OwnVault {
  const [vault, setVault] = useState<Address | null>(null);
  const [known, setKnown] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!addresses.factory || !owner) {
      setVault(null);
      setKnown(false);
      return;
    }
    let live = true;

    (async () => {
      try {
        const owned = (await publicClient.readContract({
          address: addresses.factory as Address,
          abi: vaultFactoryAbi,
          functionName: 'vaultsOfOwner',
          args: [owner],
        })) as readonly Address[];
        if (!live) return;
        // The most recent one: someone who deployed twice meant the second.
        setVault(pickVault(owned, null));
        setKnown(true);
      } catch {
        // A failed read is not "you have no vault". It stays unknown and the screen says nothing.
        if (live) setKnown(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [owner]);

  const create = useCallback(async () => {
    if (!addresses.factory || !owner) return;
    setCreating(true);
    try {
      const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
      const config = startAppKit().config;
      const hash = await core.writeContract(config, {
        address: addresses.factory as Address,
        abi: vaultFactoryAbi,
        functionName: 'createVault',
        chainId: chain.id,
      });
      const receipt = await core.waitForTransactionReceipt(config, { hash, chainId: chain.id });
      if (receipt.status !== 'success') throw new Error('the vault was not deployed');
      /*
       * The address comes out of the receipt's own log, not from re-reading the factory.
       *
       * A write returns a hash rather than return data, so the address has to be recovered
       * somehow — but recovering it by reading `vaultsOfOwner` again races: the receipt resolves
       * against the wallet's RPC, while the read goes to ours, which may not have that block yet.
       * The answer comes back empty, and an empty answer is indistinguishable from "you own
       * nothing" — so the screen keeps offering to deploy a vault that already exists. The receipt
       * carries the log that names the vault, and it cannot disagree with itself.
       */
      const [created] = parseEventLogs({ abi: vaultFactoryAbi, eventName: 'VaultCreated', logs: receipt.logs });
      if (!created) throw new Error('the vault was deployed but the transaction did not say where');
      setVault(created.args.vault);
      setKnown(true);
      toast.success('vault deployed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(
        message.includes('eth_sendTransaction')
          ? 'this wallet cannot sign, only read'
          : (message.split('\n')[0]?.slice(0, 140) ?? 'the vault was not deployed'),
      );
    } finally {
      setCreating(false);
    }
  }, [owner]);

  return { vault, known, creating, create };
}
