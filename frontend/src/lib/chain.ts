import { base, baseSepolia } from 'viem/chains';

/**
 * Which chain everything reads from.
 *
 * This exists because getting it wrong is silent: point the app at the Sepolia deployment while the
 * client is still built on mainnet and every read returns nothing, with no error to notice. It
 * looks like the contracts are wrong when the network is.
 */
export const chain = import.meta.env?.VITE_CHAIN === 'base' ? base : baseSepolia;

export const explorer = chain.blockExplorers?.default.url ?? 'https://sepolia.basescan.org';

export const txUrl = (hash: string) => `${explorer}/tx/${hash}`;
export const addressUrl = (address: string) => `${explorer}/address/${address}`;
