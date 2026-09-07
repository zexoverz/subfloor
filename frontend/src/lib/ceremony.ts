import { useCallback, useEffect, useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { publicClient } from './client.ts';
import {
  addresses,
  erc20Abi,
  deployed,
  mandateDomain,
  mandateTypes,
  raiseFloorAsVault,
  registryAbi,
  setRegistryGuardianAsVault,
  vaultAbi,
} from './contracts.ts';
import { ACTIVE_TOKENS, USDC, WETH } from './tokens.ts';
import type { Floor, Holding } from '../types.ts';
import { mocked } from './mock.ts';

/**
 * The one-time setup, as state rather than a wizard.
 *
 * §10 collapses deposit, mandate and first floor into one ceremony ending in one device signature,
 * and that is exactly what this is: four ordinary owner transactions, then one signature. Only the
 * mandate needs the device, because only the mandate is the thing an attacker would want.
 *
 * Each step reads its own truth from the chain instead of tracking progress locally, so a half
 * finished setup resumes correctly and a step someone did from a script still shows as done.
 */
export type StepId = 'fund' | 'floor' | 'guardian' | 'delegate' | 'mandate';

export type Step = {
  id: StepId;
  title: string;
  detail: string;
  done: boolean;
  /** True only for the mandate: the one step the trading machine must never be able to perform. */
  device: boolean;
};


export type CeremonyState = {
  deployed: boolean;
  isOwner: boolean | null;
  /** vault.delegate(), for the screens that must show the address rather than a nickname. */
  delegate: Address | null;
  /** The registered device, so the field can show what is set rather than an empty box. */
  guardian: Address | null;
  /**
   * The floor as the registry has it, or null while nothing is deployed. Every screen reads this
   * rather than the fixture: a proposed number rendered where a configured one goes is the same
   * class of lie as a fixture labelled live.
   */
  floor: Floor | null;
  /** The reference feed the registry actually consults, so the link points at the real oracle. */
  feed: Address | null;
  /** What the vault itself holds. Null until read — never the owner's wallet, which is a different address. */
  inventory: Holding[] | null;
  /**
   * A mandate nonce that has not been spent.
   *
   * Mandates are single-use, so signing against a spent nonce produces a signature the vault will
   * reject — and it would look like a device fault rather than a stale number. Null until read,
   * because guessing zero is right exactly once.
   */
  nonce: bigint | null;
  steps: Step[];
  /**
   * Whether the read has come back at all — either way.
   *
   * `isOwner` being null cannot carry this: null means both "not asked yet" and "asked, and the
   * answer never arrived", and a screen that cannot tell them apart either hangs on a spinner or
   * calls the owner a stranger. Those were the same bug twice, in opposite directions.
   */
  settled: boolean;
  /** What stopped the read, so a failure can be shown rather than waited on forever. */
  error: string | null;
  refresh: () => void;
};

export function useCeremony(address: Address | null, vault: Address | null): CeremonyState {
  /** Mock mode advances one step per press, so the whole flow is walkable with nothing deployed. */
  const [mockDone, setMockDone] = useState(0);
  const [owner, setOwner] = useState<Address | null>(null);
  const [floorsSet, setFloorsSet] = useState(false);
  /** The vault's own inventory. The wallet's holdings are not the vault's, and only one settles. */
  const [inventory, setInventory] = useState<Holding[] | null>(null);
  const [nonce, setNonce] = useState<bigint | null>(null);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [feed, setFeed] = useState<Address | null>(null);
  const [guardian, setGuardian] = useState<Address | null>(null);
  const [delegate, setDelegate] = useState<Address | null>(null);
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (mocked) setMockDone((n) => n + 1);
    else setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    /*
     * Gated on the vault being read, not on the demo vault in the build's env. `deployed` requires
     * VITE_VAULT, which has nothing to do with a vault the visitor deployed themselves — with it
     * absent, an owner's own vault was never read at all, and the board called them a stranger.
     */
    if (mocked) return;
    if (!addresses.registry || !vault) {
      // Nothing to read is a settled answer too: it is not the owner's vault, and not a pending one.
      setSettled(true);
      setError(addresses.registry ? null : 'no registry address in this build');
      return;
    }
    setSettled(false);
    setError(null);
    let live = true;

    (async () => {
      const registry = addresses.registry as Address;
      try {
        const [o, d, g, sell, buy, registryGuardian, configured, reference, held, zeroSpent] = await Promise.all([
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'owner' }),
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'delegate' }),
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'guardian' }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'effectiveFloor', args: [vault, WETH, USDC] }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'effectiveFloor', args: [vault, USDC, WETH] }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'guardian', args: [vault] }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'floor', args: [vault, WETH, USDC] }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'referenceFeed', args: [WETH, USDC] }),
          Promise.all(
            ACTIVE_TOKENS.map((t) =>
              publicClient.readContract({ address: t.address, abi: erc20Abi, functionName: 'balanceOf', args: [vault] }),
            ),
          ),
          // Nonce 0 is the usual answer and the loop below only looks further if it is taken.
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'mandateUsed', args: [0n] }),
        ]);
        if (!live) return;
        setOwner(o as Address);
        setDelegate((d as Address) === '0x0000000000000000000000000000000000000000' ? null : (d as Address));
        // Both keys have to be the device: the vault's signs mandates, the registry's authorises
        // weakening. Either one left unset is a hole in the half of the claim the device carries.
        const vaultGuardian = g as Address;
        const regGuardian = registryGuardian as Address;
        const zero = '0x0000000000000000000000000000000000000000';
        setGuardian(vaultGuardian !== zero && regGuardian !== zero ? vaultGuardian : null);
        // A floor is only real when both directions have one. One side covered is an agent that
        // can still sell the other way at any price.
        setFloorsSet(Boolean((sell as [bigint, boolean])[1] && (buy as [bigint, boolean])[1]));

        const [isConfigured, bps, absolute] = configured as [boolean, number, bigint];
        setFloor({ enforced: isConfigured, maxAdverseBps: bps, absoluteRate: absolute });

        // Funded means the *vault* holds something. Reading the owner's wallet here ticked the
        // step green before a single token had moved.
        setInventory(
          ACTIVE_TOKENS.map((t, i) => ({
            symbol: t.symbol,
            amount: Number(formatUnits((held as bigint[])[i] ?? 0n, t.decimals)),
          })),
        );

        setNonce((zeroSpent as boolean) ? null : 0n);

        const [feedAddress] = reference as [Address, boolean, number, number, bigint];
        setFeed(feedAddress === '0x0000000000000000000000000000000000000000' ? null : feedAddress);
        setSettled(true);
      } catch (cause) {
        if (!live) return;
        setOwner(null);
        setError((cause instanceof Error ? cause.message : String(cause)).split('\n')[0]?.slice(0, 120) ?? 'the vault could not be read');
        setSettled(true);
      }
    })();

    return () => {
      live = false;
    };
  }, [address, vault, tick]);

  const steps: Step[] = [
    {
      id: 'fund',
      title: 'Fund the vault',
      detail: 'move inventory in. An ordinary transfer — the vault holds it, you still own it.',
      done: mocked ? mockDone > 0 : Boolean(inventory?.some((h) => h.amount > 0)),
      device: false,
    },
    {
      id: 'floor',
      title: 'Set the floor, both directions',
      detail: 'registered for the vault, not for your address: the vault is what settles.',
      done: mocked ? mockDone > 1 : floorsSet,
      device: false,
    },
    {
      id: 'guardian',
      title: 'Register your device',
      detail: 'on the vault and on the registry. The registry entry can only be set once.',
      done: mocked ? mockDone > 2 : Boolean(guardian),
      device: false,
    },
    {
      id: 'delegate',
      title: 'Name the agent',
      detail: 'the key that may compose and ship strategies, and nothing else.',
      done: mocked ? mockDone > 3 : Boolean(delegate),
      device: false,
    },
    {
      id: 'mandate',
      title: 'Sign the mandate on your device',
      detail: 'not a transaction — a signature the agent carries and the vault checks on every ship.',
      done: mocked ? mockDone > 4 : false,
      device: true,
    },
  ];

  return {
    deployed: mocked || deployed,
    isOwner: mocked ? true : owner && address ? owner.toLowerCase() === address.toLowerCase() : null,
    delegate,
    guardian,
    floor,
    feed,
    inventory,
    nonce,
    steps,
    settled: mocked || settled,
    error,
    refresh,
  };
}

export { mandateDomain, mandateTypes, raiseFloorAsVault, setRegistryGuardianAsVault };
