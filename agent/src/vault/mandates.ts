import { hashTypedData, type Address, type Hex } from "viem";
import type { Mandate } from "./ship.ts";

/// A book of pre-signed mandates, so an agent can re-quote without a device in the room.
///
/// `_consumeMandate` marks `mandateUsed[nonce]`, so **one mandate authorises exactly one ship**. A
/// market maker re-quotes every few minutes; asking the owner to approve each one on hardware is not
/// a product, it is a person sitting next to a laptop.
///
/// The pattern that works, and the one this implements: the owner signs a batch once, on the device,
/// and the agent burns them one at a time. Nothing is weakened by it — each mandate still names the
/// tokens, still caps the amount per token, and still expires. What the owner chooses is *how many*
/// re-quotes to authorise and for how long, which is a decision they can actually reason about.
///
/// When the book runs out the agent stops. That is the whole point of it being finite: an agent that
/// could mint its own authorisation would not need the device at all.

export const MANDATE_TYPES = {
  Mandate: [
    { name: "delegate", type: "address" },
    { name: "app", type: "address" },
    { name: "tokens", type: "address[]" },
    { name: "maxAmounts", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export interface SignedMandate {
  mandate: Mandate;
  signature: Hex;
}

export class MandatesExhausted extends Error {}

/// The EIP-712 digest a device signs. Domain values are the vault's own, so a mandate signed for one
/// vault cannot be replayed against another, or onto another chain.
export function mandateDigest(vault: Address, chainId: number, mandate: Mandate): Hex {
  return hashTypedData({
    domain: { name: "SUBFLOOR AquaGuardVault", version: "1", chainId, verifyingContract: vault },
    types: MANDATE_TYPES,
    primaryType: "Mandate",
    message: {
      delegate: mandate.delegate,
      app: mandate.app,
      tokens: mandate.tokens,
      maxAmounts: mandate.maxAmounts,
      nonce: mandate.nonce,
      expiry: mandate.expiry,
    },
  });
}

/// The mandates to hand the device, for a batch starting at `firstNonce`.
///
/// Nonces need not be contiguous — the vault only requires that one has not been used — but a
/// contiguous range is what makes a batch legible to the person approving it: "fifty re-quotes,
/// these tokens, these caps, until Friday" is a sentence. Scattered nonces are not.
export function issueBatch(
  template: Omit<Mandate, "nonce">,
  firstNonce: bigint,
  count: number,
): Mandate[] {
  if (count <= 0) throw new Error("a batch of no mandates authorises nothing");
  return Array.from({ length: count }, (_, i) => ({ ...template, nonce: firstNonce + BigInt(i) }));
}

/// Holds a signed batch and hands out the next unused one.
///
/// `used` is supplied by the caller from the chain — `mandateUsed(nonce)` — rather than tracked
/// here. A local counter drifts the moment a ship lands and the process restarts, and the failure is
/// a revert on a nonce that was already burned.
export class MandateBook {
  private readonly signed: SignedMandate[];

  constructor(signed: SignedMandate[]) {
    if (signed.length === 0) throw new Error("an empty mandate book authorises nothing");
    this.signed = signed;
  }

  get size(): number {
    return this.signed.length;
  }

  /// How many remain, given what the chain says is used and the time now.
  remaining(isUsed: (nonce: bigint) => boolean, now: bigint): number {
    return this.signed.filter((s) => !isUsed(s.mandate.nonce) && s.mandate.expiry > now).length;
  }

  /// The next mandate to spend, or a throw.
  ///
  /// Throws rather than returning null because every caller's correct response is the same — stop —
  /// and an optional return invites a caller to carry on with `undefined`.
  next(isUsed: (nonce: bigint) => boolean, now: bigint): SignedMandate {
    const live = this.signed.filter((s) => !isUsed(s.mandate.nonce) && s.mandate.expiry > now);
    if (live.length === 0) {
      const expired = this.signed.filter((s) => s.mandate.expiry <= now).length;
      throw new MandatesExhausted(
        `no mandate left to spend: ${this.signed.length} in the book, ${expired} expired, the rest used. ` +
          "Sign a new batch on the device. The agent stops until then, which is the point of the book being finite.",
      );
    }
    // Lowest nonce first, so the batch is spent in the order it was approved.
    return live.reduce((a, b) => (a.mandate.nonce < b.mandate.nonce ? a : b));
  }
}
