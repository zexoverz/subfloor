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
  factory: (import.meta.env?.VITE_VAULT_FACTORY ?? '') as Address | '',
  aqua: (import.meta.env?.VITE_AQUA ?? '') as Address | '',
  /// Testnet only. Absent on a mainnet build, and the button that uses it is absent with it.
  faucet: (import.meta.env?.VITE_FAUCET ?? '') as Address | '',
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
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'to', type: 'address' }], outputs: [] },
  { type: 'function', name: 'setDelegate', stateMutability: 'nonpayable', inputs: [{ name: 'newDelegate', type: 'address' }], outputs: [] },
  { type: 'function', name: 'setGuardian', stateMutability: 'nonpayable', inputs: [{ name: 'newGuardian', type: 'address' }], outputs: [] },
  /** Whether the owner or the guardian revoked this nonce. Since #253 using a mandate does not spend it. */
  { type: 'function', name: 'mandateRevoked', stateMutability: 'view', inputs: [{ name: 'nonce', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  /*
   * The same mapping under the name it had before #253. Vaults deployed against the old bytecode —
   * including the ones live on Base Sepolia today — answer this and revert on the one above, and
   * the interface has to read whichever the vault in front of it actually has.
   */
  { type: 'function', name: 'mandateUsed', stateMutability: 'view', inputs: [{ name: 'nonce', type: 'uint256' }], outputs: [{ type: 'bool' }] },
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
export function asVault(vault: Address, callData: `0x${string}`) {
  return {
    address: vault,
    abi: vaultAbi,
    functionName: 'execute' as const,
    args: [addresses.registry as Address, 0n, callData] as const,
  };
}

export function raiseFloorAsVault(vault: Address, base: Address, quote: Address, maxAdverseBps: number, absoluteRate: bigint) {
  return asVault(
    vault,
    encodeFunctionData({ abi: registryAbi, functionName: 'raiseFloor', args: [base, quote, maxAdverseBps, absoluteRate] }),
  );
}

/** The registry's guardian is recipient-keyed and write-once, so this is the vault's one shot. */
export function setRegistryGuardianAsVault(vault: Address, guardian: Address) {
  return asVault(vault, encodeFunctionData({ abi: registryAbi, functionName: 'setGuardian', args: [guardian] }));
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

/**
 * EIP-712 for lowering a floor, matching `_FLOOR_LOWERING_TYPEHASH` field for field.
 *
 * The registry hashes `FloorLowering(address recipient,address base,address quote,uint16
 * maxAdverseBps,uint256 absoluteRate,uint256 nonce,uint256 deadline)` and recovers the guardian
 * from it. A signature over anything else is refused — which is the whole asymmetry §5.1 is built
 * on, and the reason this cannot be approximated from what the screen happens to display.
 */
export const loweringTypes = {
  FloorLowering: [
    { name: 'recipient', type: 'address' },
    { name: 'base', type: 'address' },
    { name: 'quote', type: 'address' },
    { name: 'maxAdverseBps', type: 'uint16' },
    { name: 'absoluteRate', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** `EIP712("SUBFLOOR FloorRegistry", "1")`, and the verifying contract is the registry itself. */
export const loweringDomain = (chainId: number, registry: Address) => ({
  name: 'SUBFLOOR FloorRegistry',
  version: '1',
  chainId,
  verifyingContract: registry,
});

export const mandateDomain = (chainId: number, vault: Address) => ({
  name: 'SUBFLOOR AquaGuardVault',
  version: '1',
  chainId,
  verifyingContract: vault,
});

/**
 * The factory from #132. It deploys a vault owned by whoever asks and keeps nothing: it cannot
 * act on what it creates, which is the point — a factory that could would put a trusted party
 * back into a design whose whole argument is that there is not one.
 */
/**
 * Drawing test tokens, so the first step is not asking us for them.
 *
 * The fund step used to end at "fund the wallet first", which is a dead end on a testnet where the
 * tokens have no market. The faucet is on chain and permissionless; the cooldown is the only thing
 * it asks about.
 */
export const faucetAbi = [
  { type: 'function', name: 'draw', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'nextDrawAt', stateMutability: 'view', inputs: [{ name: 'who', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'error', name: 'TooSoon', inputs: [{ name: 'nextAllowedAt', type: 'uint256' }] },
] as const;

export const vaultFactoryAbi = [
  { type: 'function', name: 'createVault', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'vault', type: 'address' }] },
  /*
   * The overload that deploys and configures in one transaction.
   *
   * The factory owns the vault for the length of the call and hands it over before returning, which
   * is what lets it set the delegate, both guardians and every floor without the owner signing six
   * times. The one it is easiest to be glad of is the registry-side guardian: skipping that one is
   * completely silent — the vault trades and `lowerFloor` reverts forever — and this project's own
   * first deployment shipped exactly that way.
   *
   * The old no-argument overload stays because vaults created through it still exist and still have
   * to be configured step by step.
   */
  {
    type: 'function',
    name: 'createVault',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'setup',
        type: 'tuple',
        components: [
          { name: 'delegate', type: 'address' },
          { name: 'guardian', type: 'address' },
          { name: 'registry', type: 'address' },
          { name: 'base', type: 'address[]' },
          { name: 'quote', type: 'address[]' },
          { name: 'maxAdverseBps', type: 'uint16[]' },
          { name: 'absoluteRate', type: 'uint256[]' },
        ],
      },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  { type: 'function', name: 'vaultsOfOwner', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'address[]' }] },
  { type: 'event', name: 'VaultCreated', inputs: [{ name: 'owner', type: 'address', indexed: true }, { name: 'vault', type: 'address', indexed: true }, { name: 'index', type: 'uint256', indexed: false }] },
] as const;
