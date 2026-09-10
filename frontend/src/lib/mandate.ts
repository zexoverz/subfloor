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
/**
 * The struct itself, which is the half that has to survive the ceremony.
 *
 * `_consumeMandate` recomputes the hash from every field, so a stored signature without these is
 * unspendable — and `expiry` in particular cannot be recovered afterwards, because it is derived
 * from the instant this ran. See [[mandateStore]].
 */
export interface MandateMessage {
  delegate: Address;
  app: Address;
  tokens: readonly Address[];
  maxAmounts: string[];
  nonce: string;
  expiry: string;
}

export interface MandateTypedData {
  domain: ReturnType<typeof mandateDomain>;
  types: typeof mandateTypes;
  primaryType: 'Mandate';
  message: MandateMessage;
}

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
}): MandateTypedData | null {
  if (!vault || !isAddress(delegate) || !addresses.router) return null;

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
      /*
       * The router, not Aqua.
       *
       * `AquaGuardVault.ship` passes its own `app` argument to `_consumeMandate` and then straight
       * on to `AQUA.ship(app, ...)`, so the app in the struct is the contract the position is
       * shipped *to* — the router. This read `addresses.aqua`, which is the registry the router
       * ships through, and the two are different addresses: the signature verified, the struct was
       * well-formed, and the vault only compares them at ship time. So the ceremony completed, the
       * device approved, and the failure surfaced days later on another machine as
       * `MandateWrongApp`.
       *
       * §5.4 is why this is not a label: `Aqua.pull` keys off `msg.sender` as the app, so the
       * address named here is the only contract that can ever pull the shipped balance. The
       * guardian is approving it as much as the numbers.
       */
      app: addresses.router as Address,
      tokens: ACTIVE_TOKENS.map((t) => t.address),
      maxAmounts: held.map((amount) => amount.toString()),
      nonce: nonce.toString(),
      // Days, from now, as seconds. The device shows the span; the struct carries the instant.
      expiry: String(Math.floor(Date.now() / 1000) + expiresInDays * 86_400),
    },
  };
}
