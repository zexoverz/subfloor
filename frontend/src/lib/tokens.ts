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
/**
 * What the testnet actually trades.
 *
 * Not Circle's USDC. Circle's testnet USDC is not permissionlessly mintable, so funding a
 * two-sided book meant their faucet by hand, per address, per top-up — which blocked the
 * interface on something with nothing to do with the mechanism. `tUSDC` is a six-decimal
 * stand-in, six on purpose so the decimal handling is exercised exactly as it will be on
 * mainnet. It does not exist there: mainnet uses real USDC.
 */
const SEPOLIA_USDC = '0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD';
/** Circle's, still recognised so a fill recorded against it decodes rather than vanishing. */
const CIRCLE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

export const WETH = '0x4200000000000000000000000000000000000006' as Address;
export const USDC = (import.meta.env?.VITE_CHAIN === 'base' ? MAINNET_USDC : SEPOLIA_USDC) as Address;
/** It is called tUSDC on the testnet, so the screen calls it that. Naming it USDC would be a
 *  small lie in the one place a reader checks a number against a block explorer. */
export const USDC_SYMBOL = import.meta.env?.VITE_CHAIN === 'base' ? 'USDC' : 'tUSDC';

/**
 * Both USDC addresses, always. The decoder refuses to render a token it does not know, which is
 * correct — but it made a fixture recorded on one network vanish when the app was pointed at the
 * other, and a refusal silently missing from the tape is the worst possible way for that to show
 * up. Knowing an address is not the same as trading on it.
 */
/**
 * The tokens this deployment actually trades, on the chain it is pointed at.
 *
 * Deliberately separate from TOKENS below. That map exists so the refusal decoder recognises an
 * address it meets; this list is what the vault holds and what balances are read for. Using one for
 * both put a mainnet USDC address into a Sepolia balance read, which has no contract behind it —
 * the read failed, and the vault card showed three tokens, one of them NaN.
 */
export const ACTIVE_TOKENS: { address: Address; symbol: string; decimals: number }[] = [
  { address: WETH, symbol: 'WETH', decimals: 18 },
  { address: USDC, symbol: USDC_SYMBOL, decimals: 6 },
];

export const TOKENS: Record<string, TokenMeta> = {
  [WETH.toLowerCase()]: { symbol: 'WETH', decimals: 18 },
  [CIRCLE_SEPOLIA_USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
  [SEPOLIA_USDC.toLowerCase()]: { symbol: 'tUSDC', decimals: 6 },
  [MAINNET_USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
  [SEPOLIA_USDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
};

export function tokenMeta(address: Address): TokenMeta | null {
  return TOKENS[address.toLowerCase()] ?? null;
}
