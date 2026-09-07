import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, formatUnits, http, type Address } from 'viem';
import { chain } from './chain.ts';
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

const publicClient = createPublicClient({ chain, transport: http() });

export type CeremonyState = {
  deployed: boolean;
  isOwner: boolean | null;
  /** vault.delegate(), for the screens that must show the address rather than a nickname. */
  delegate: Address | null;
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
  steps: Step[];
  refresh: () => void;
};

export function useCeremony(address: Address | null, vault: Address | null): CeremonyState {
  /** Mock mode advances one step per press, so the whole flow is walkable with nothing deployed. */
  const [mockDone, setMockDone] = useState(0);
  const [owner, setOwner] = useState<Address | null>(null);
  const [floorsSet, setFloorsSet] = useState(false);
  /** The vault's own inventory. The wallet's holdings are not the vault's, and only one settles. */
  const [inventory, setInventory] = useState<Holding[] | null>(null);
  const [floor, setFloor] = useState<Floor | null>(null);
  const [feed, setFeed] = useState<Address | null>(null);
  const [guardian, setGuardian] = useState<Address | null>(null);
  const [delegate, setDelegate] = useState<Address | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    if (mocked) setMockDone((n) => n + 1);
    else setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!deployed || mocked || !vault) return;
    let live = true;

    (async () => {
      const registry = addresses.registry as Address;
      try {
        const [o, d, g, sell, buy, registryGuardian, configured, reference, held] = await Promise.all([
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

        const [feedAddress] = reference as [Address, boolean, number, number, bigint];
        setFeed(feedAddress === '0x0000000000000000000000000000000000000000' ? null : feedAddress);
      } catch {
        if (live) setOwner(null);
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
    floor,
    feed,
    inventory,
    steps,
    refresh,
  };
}

export { mandateDomain, mandateTypes, raiseFloorAsVault, setRegistryGuardianAsVault };
