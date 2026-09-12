import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { publicClient } from './client.ts';
import { chain } from './chain.ts';
import { addresses, loweringDomain, loweringTypes, registryAbi } from './contracts.ts';
import { priceToRate } from './rate.ts';
import { ACTIVE_TOKENS } from './tokens.ts';

/**
 * What the device is asked to sign when a floor is lowered.
 *
 * There was nothing here, and that is why the Ledger never lit up: the lowering ceremony passed
 * `typedData={null}` from one route and the *display rows* from the other — the strings on screen,
 * handed to the device as though they were a payload. Neither is EIP-712, so the signer either
 * threw inside its own observable or was never asked, and the screen waited on a device that had
 * been told nothing. The same failure the mandate had, from a different direction.
 *
 * Every field comes from the contract rather than from the screen. `_FLOOR_LOWERING_TYPEHASH` is
 * what the registry recovers the guardian from, so a signature over anything else — including a
 * faithful rendering of the same numbers — is refused, and refused only after a transaction.
 */
export interface Lowering {
  /** Null until the nonce has been read; there is nothing to sign without it. */
  typedData: object | null;
  /** The registry's next nonce for this recipient, read on chain. */
  nonce: bigint | null;
  error: string | null;
}

/** An hour. Long enough for a device in a drawer, short enough that a stray signature expires. */
const DEADLINE_SECONDS = 3600;

export function useLowering(vault: Address | null, maxAdverseBps: number, absolutePrice: number): Lowering {
  const [nonce, setNonce] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vault || !addresses.registry) return;
    let live = true;
    (async () => {
      try {
        const n = await publicClient.readContract({
          address: addresses.registry as Address,
          abi: registryAbi,
          functionName: 'nonces',
          args: [vault],
        });
        if (live) {
          setNonce(n as bigint);
          setError(null);
        }
      } catch (cause) {
        /*
         * Reported rather than defaulted to zero. A lowering signed against the wrong nonce is
         * refused on chain — `WrongNonce` — so guessing costs a transaction to discover, and the
         * ceremony is better not offered than offered over a guess.
         */
        if (live) setError((cause as Error).message.split('\n')[0] ?? 'the registry did not answer');
      }
    })();
    return () => {
      live = false;
    };
  }, [vault, maxAdverseBps]);

  if (!vault || nonce === null || !addresses.registry) return { typedData: null, nonce, error };

  const [base, quote] = ACTIVE_TOKENS;
  if (!base || !quote) return { typedData: null, nonce, error };

  return {
    nonce,
    error,
    typedData: {
      domain: loweringDomain(chain.id, addresses.registry as Address),
      types: loweringTypes,
      primaryType: 'FloorLowering' as const,
      /*
       * Decimal strings, not bigints, for the reason recorded on the mandate: the device kit
       * serialises this payload on its way to the hardware and `JSON.stringify` throws on a BigInt
       * — inside an observable that then never emits, so the screen waits forever on a device that
       * was never asked. This is that same bug's other half, and it is not being reintroduced here.
       */
      message: {
        recipient: vault,
        base: base.address,
        quote: quote.address,
        maxAdverseBps: String(maxAdverseBps),
        absoluteRate: priceToRate(absolutePrice, base.decimals, quote.decimals).toString(),
        nonce: nonce.toString(),
        deadline: String(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS),
      },
    },
  };
}
