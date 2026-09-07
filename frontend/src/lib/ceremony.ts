import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import {
  addresses,
  deployed,
  mandateDomain,
  mandateTypes,
  raiseFloorAsVault,
  registryAbi,
  setRegistryGuardianAsVault,
  vaultAbi,
} from './contracts.ts';
import { USDC, WETH } from './tokens.ts';

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

const publicClient = createPublicClient({ chain: base, transport: http() });

export type CeremonyState = {
  deployed: boolean;
  isOwner: boolean | null;
  steps: Step[];
  refresh: () => void;
};

export function useCeremony(address: Address | null, fundedTokens: number): CeremonyState {
  const [owner, setOwner] = useState<Address | null>(null);
  const [floorsSet, setFloorsSet] = useState(false);
  const [guardian, setGuardian] = useState<Address | null>(null);
  const [delegate, setDelegate] = useState<Address | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!deployed) return;
    let live = true;

    (async () => {
      const vault = addresses.vault as Address;
      const registry = addresses.registry as Address;
      try {
        const [o, d, g, sell, buy, registryGuardian] = await Promise.all([
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'owner' }),
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'delegate' }),
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'guardian' }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'effectiveFloor', args: [vault, WETH, USDC] }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'effectiveFloor', args: [vault, USDC, WETH] }),
          publicClient.readContract({ address: registry, abi: registryAbi, functionName: 'guardian', args: [vault] }),
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
      } catch {
        if (live) setOwner(null);
      }
    })();

    return () => {
      live = false;
    };
  }, [address, tick]);

  const steps: Step[] = [
    {
      id: 'fund',
      title: 'Fund the vault',
      detail: 'move inventory in. An ordinary transfer — the vault holds it, you still own it.',
      done: fundedTokens > 0,
      device: false,
    },
    {
      id: 'floor',
      title: 'Set the floor, both directions',
      detail: 'registered for the vault, not for your address: the vault is what settles.',
      done: floorsSet,
      device: false,
    },
    {
      id: 'guardian',
      title: 'Register your device',
      detail: 'on the vault and on the registry. The registry entry can only be set once.',
      done: Boolean(guardian),
      device: false,
    },
    {
      id: 'delegate',
      title: 'Name the agent',
      detail: 'the key that may compose and ship strategies, and nothing else.',
      done: Boolean(delegate),
      device: false,
    },
    {
      id: 'mandate',
      title: 'Sign the mandate on your device',
      detail: 'not a transaction — a signature the agent carries and the vault checks on every ship.',
      done: false,
      device: true,
    },
  ];

  return {
    deployed,
    isOwner: owner && address ? owner.toLowerCase() === address.toLowerCase() : null,
    steps,
    refresh,
  };
}

export { mandateDomain, mandateTypes, raiseFloorAsVault, setRegistryGuardianAsVault };
