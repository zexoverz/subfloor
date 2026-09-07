import type { Address } from 'viem';

/**
 * Token metadata, keyed by address, because a refusal carries addresses and nothing else.
 *
 * Verified by `eth_call` on Base mainnet (`symbol()`, `decimals()`), 5 Sep 2026 — not copied from
 * a list. Anything added here gets the same treatment.
 */
export type TokenMeta = { symbol: string; decimals: number };

/** `import.meta.env` is undefined under plain node, where the unit tests run, hence the optional. */
const MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
/** Base Sepolia USDC. WETH is at the same predeploy address on both networks. */
const SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

export const WETH = '0x4200000000000000000000000000000000000006' as Address;
export const USDC = (import.meta.env?.VITE_CHAIN === 'base' ? MAINNET_USDC : SEPOLIA_USDC) as Address;

/**
 * Both USDC addresses, always. The decoder refuses to render a token it does not know, which is
 * correct — but it made a fixture recorded on one network vanish when the app was pointed at the
 * other, and a refusal silently missing from the tape is the worst possible way for that to show
 * up. Knowing an address is not the same as trading on it.
 */
export const TOKENS: Record<string, TokenMeta> = {
  [WETH.toLowerCase()]: { symbol: 'WETH', decimals: 18 },
  [MAINNET_USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
  [SEPOLIA_USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
};

export function tokenMeta(address: Address): TokenMeta | null {
  return TOKENS[address.toLowerCase()] ?? null;
}
