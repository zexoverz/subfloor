import { isAddress, parseUnits, type Address } from 'viem';
import { chain } from './chain.ts';
import { addresses, mandateDomain, mandateTypes } from './contracts.ts';
import { ACTIVE_TOKENS } from './tokens.ts';
import type { Holding } from '../types.ts';

/**
 * The mandate, as the device is asked to sign it.
 *
 * Matches `AquaGuardVault.Mandate` field for field — delegate, app, tokens, maxAmounts, nonce,
 * expiry — because the vault recovers the signer from this exact struct and a mismatch is a
 * signature over something nobody agreed to.
 *
 * Returns null rather than a half-filled object. A mandate missing its delegate is not a mandate
 * with a blank in it; it is nothing to sign, and asking the device to render nothing is how an
 * owner learns to approve screens they have not read.
 */
export function buildMandate({
  vault,
  delegate,
  inventory,
  nonce,
  expiresInDays,
}: {
  vault: Address | null;
  delegate: string;
  inventory: Holding[];
  nonce: bigint;
  expiresInDays: number;
}): object | null {
  if (!vault || !isAddress(delegate) || !addresses.aqua) return null;

  /*
   * The ceiling is what the vault holds. A mandate for more than the inventory authorises the
   * agent over tokens that are not there, which reads as generosity and is really an authorisation
   * the owner cannot see the size of.
   */
  const held = ACTIVE_TOKENS.map((token) => {
    const amount = inventory.find((h) => h.symbol === token.symbol)?.amount ?? 0;
    return Number.isNaN(amount) ? 0n : parseUnits(String(amount), token.decimals);
  });

  /*
   * Decimal strings, not bigints.
   *
   * The device kit serialises the payload on its way to the hardware, and `JSON.stringify` throws
   * on a BigInt. That throw happened inside the action's observable, which then simply never
   * emitted — so the screen sat on "awaiting approval on device" forever while the Ledger had been
   * asked nothing. A uint256 as a decimal string is the ordinary EIP-712 encoding and hashes
   * identically.
   */
  return {
    domain: mandateDomain(chain.id, vault),
    types: mandateTypes,
    primaryType: 'Mandate' as const,
    message: {
      delegate: delegate as Address,
      app: addresses.aqua as Address,
      tokens: ACTIVE_TOKENS.map((t) => t.address),
      maxAmounts: held.map((amount) => amount.toString()),
      nonce: nonce.toString(),
      // Days, from now, as seconds. The device shows the span; the struct carries the instant.
      expiry: String(Math.floor(Date.now() / 1000) + expiresInDays * 86_400),
    },
  };
}
