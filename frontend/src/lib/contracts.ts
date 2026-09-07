import { encodeFunctionData, type Address } from 'viem';

/**
 * Addresses and the call shapes the owner screens need.
 *
 * Empty until a deployment exists (#38, and the Base Sepolia script that has not been broadcast).
 * Every screen must render with these unset rather than pretend — an address the UI invents is a
 * floor set on nothing.
 */
export const addresses = {
  registry: (import.meta.env?.VITE_FLOOR_REGISTRY ?? '') as Address | '',
  router: (import.meta.env?.VITE_FLOOR_ROUTER ?? '') as Address | '',
  vault: (import.meta.env?.VITE_VAULT ?? '') as Address | '',
  aqua: (import.meta.env?.VITE_AQUA ?? '') as Address | '',
};

export const deployed = Boolean(addresses.registry && addresses.vault);

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

export const registryAbi = [
  { type: 'function', name: 'effectiveFloor', stateMutability: 'view', inputs: [{ name: 'recipient', type: 'address' }, { name: 'base', type: 'address' }, { name: 'quote', type: 'address' }], outputs: [{ name: 'floorRate', type: 'uint256' }, { name: 'enforced', type: 'bool' }] },
  { type: 'function', name: 'floor', stateMutability: 'view', inputs: [{ name: 'recipient', type: 'address' }, { name: 'base', type: 'address' }, { name: 'quote', type: 'address' }], outputs: [{ name: 'configured', type: 'bool' }, { name: 'maxAdverseBps', type: 'uint16' }, { name: 'absoluteRate', type: 'uint232' }] },
  { type: 'function', name: 'guardian', stateMutability: 'view', inputs: [{ name: 'recipient', type: 'address' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'referenceFeed', stateMutability: 'view', inputs: [{ name: 'base', type: 'address' }, { name: 'quote', type: 'address' }], outputs: [{ name: 'feed', type: 'address' }, { name: 'inverted', type: 'bool' }, { name: 'stalenessBound', type: 'uint32' }, { name: 'feedDecimals', type: 'uint8' }, { name: 'scale', type: 'uint256' }] },
  { type: 'function', name: 'nonces', stateMutability: 'view', inputs: [{ name: 'recipient', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'raiseFloor', stateMutability: 'nonpayable', inputs: [{ name: 'base', type: 'address' }, { name: 'quote', type: 'address' }, { name: 'newMaxAdverseBps', type: 'uint16' }, { name: 'newAbsoluteRate', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'setGuardian', stateMutability: 'nonpayable', inputs: [{ name: 'newGuardian', type: 'address' }], outputs: [] },
] as const;

export const vaultAbi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'delegate', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'guardian', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'setDelegate', stateMutability: 'nonpayable', inputs: [{ name: 'newDelegate', type: 'address' }], outputs: [] },
  { type: 'function', name: 'setGuardian', stateMutability: 'nonpayable', inputs: [{ name: 'newGuardian', type: 'address' }], outputs: [] },
  { type: 'function', name: 'execute', stateMutability: 'nonpayable', inputs: [{ name: 'target', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'data', type: 'bytes' }], outputs: [{ type: 'bytes' }] },
  { type: 'function', name: 'dock', stateMutability: 'nonpayable', inputs: [{ name: 'app', type: 'address' }, { name: 'strategyHash', type: 'bytes32' }, { name: 'tokens', type: 'address[]' }], outputs: [] },
] as const;

/**
 * The one thing this file exists to get right.
 *
 * At settlement the maker-side recipient is `order.traits.receiver(order.maker)`, and the maker is
 * the vault — so the floor has to be registered *for the vault*. `raiseFloor` keys off
 * `msg.sender`, so calling it from the owner's wallet would set a floor on an address that never
 * trades: the screen would say "floor set" while the vault settles unprotected. The owner reaches
 * the registry through the vault instead.
 */
export function asVault(callData: `0x${string}`) {
  return {
    address: addresses.vault as Address,
    abi: vaultAbi,
    functionName: 'execute' as const,
    args: [addresses.registry as Address, 0n, callData] as const,
  };
}

export function raiseFloorAsVault(base: Address, quote: Address, maxAdverseBps: number, absoluteRate: bigint) {
  return asVault(
    encodeFunctionData({ abi: registryAbi, functionName: 'raiseFloor', args: [base, quote, maxAdverseBps, absoluteRate] }),
  );
}

/** The registry's guardian is recipient-keyed and write-once, so this is the vault's one shot. */
export function setRegistryGuardianAsVault(guardian: Address) {
  return asVault(encodeFunctionData({ abi: registryAbi, functionName: 'setGuardian', args: [guardian] }));
}

/** EIP-712 types for the mandate. The signature IS the agent's connection; it is not a transaction. */
export const mandateTypes = {
  Mandate: [
    { name: 'delegate', type: 'address' },
    { name: 'app', type: 'address' },
    { name: 'tokens', type: 'address[]' },
    { name: 'maxAmounts', type: 'uint256[]' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
  ],
} as const;

export const mandateDomain = (chainId: number) => ({
  name: 'SUBFLOOR AquaGuardVault',
  version: '1',
  chainId,
  verifyingContract: addresses.vault as Address,
});
