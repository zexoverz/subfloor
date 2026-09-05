import type { Address } from 'viem';

/**
 * Token metadata, keyed by address, because a refusal carries addresses and nothing else.
 *
 * Verified by `eth_call` on Base mainnet (`symbol()`, `decimals()`), 5 Sep 2026 — not copied from
 * a list. Anything added here gets the same treatment.
 */
export type TokenMeta = { symbol: string; decimals: number };

export const TOKENS: Record<string, TokenMeta> = {
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18 },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6 },
};

export const WETH = '0x4200000000000000000000000000000000000006' as Address;
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;

export function tokenMeta(address: Address): TokenMeta | null {
  return TOKENS[address.toLowerCase()] ?? null;
}
