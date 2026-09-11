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

/**
 * An address as it is read rather than as it is stored.
 *
 * Six and four is the shape used across the board already — `AddressChip`, the tape, the account
 * menu — and matching it matters more than the exact count: an address truncated two different ways
 * on one screen reads as two addresses. Anything that is not one is returned untouched, so a label
 * like "agent-7" passes through as itself.
 */
export const shortAddress = (address: string) =>
  /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
