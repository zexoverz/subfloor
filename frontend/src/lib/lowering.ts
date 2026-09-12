import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import type { Address } from 'viem';
import { publicClient } from './client.ts';
import { chain } from './chain.ts';
import { addresses, loweringDomain, loweringTypes, registryAbi } from './contracts.ts';
import { priceToRate } from './rate.ts';
import { ACTIVE_TOKENS } from './tokens.ts';

/**
 * Lowering a floor: what the device signs, and what carries it to the registry.
 *
 * There was nothing here, and that is why the Ledger never lit up. One route passed
 * `typedData={null}`; the other passed the *display rows* — the strings on screen — to the signer.
 * Neither is EIP-712, so the device was either never asked or asked for nothing, and the screen
 * waited on hardware that had been told nothing. The same shape as the mandate bug recorded in
 * `mandate.ts`.
 *
 * Every field comes from the contract rather than from the screen. `_FLOOR_LOWERING_TYPEHASH` is
 * what `FloorRegistry` recovers the guardian from, so a signature over a faithful rendering of the
 * same numbers is still refused — on chain, after a transaction, as `BadGuardianSignature`.
 */
export interface Lowering {
  /** Null until there is something to sign: no vault, no nonce, or no registry in this build. */
  typedData: object | null;
  /** The registry's next nonce for this recipient, read on chain. */
  nonce: bigint | null;
  error: string | null;
  /**
   * Send the signed lowering. True when the registry accepted it.
   *
   * Signing and sending are separate because the authorities are separate: the device says the
   * floor may move, and whoever pays the gas makes it move. `lowerFloor` takes the recipient as an
   * argument and recovers the guardian from the signature, so the owner's wallet can carry a
   * signature the device gave — which is what lets the device stay a device rather than having to
   * become a funded account.
   */
  send: (signature: string) => Promise<boolean>;
  sending: boolean;
}

/** An hour. Long enough for a device in a drawer, short enough that a stray signature expires. */
const DEADLINE_SECONDS = 3600;

export function useLowering(vault: Address | null, maxAdverseBps: number, absolutePrice: number): Lowering {
  const [nonce, setNonce] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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
         * `WrongNonce` on chain, so a guess costs a transaction to discover, and the ceremony is
         * better not offered than offered over one.
         */
        if (live) setError((cause as Error).message.split('\n')[0] ?? 'the registry did not answer');
      }
    })();
    return () => {
      live = false;
    };
  }, [vault, maxAdverseBps]);

  const [base, quote] = ACTIVE_TOKENS;
  const rate = base && quote ? priceToRate(absolutePrice, base.decimals, quote.decimals) : 0n;

  /*
   * One deadline, computed once, used by both halves.
   *
   * Derived inline it would be a different instant in the payload and in the transaction, and the
   * registry hashes it — so the device would approve one struct and the chain would be handed
   * another, recovering a signer that is not the guardian. Exactly the mandate's `expiry` bug
   * (#218) in a second place, which is why it is a memo and not an expression.
   */
  const deadline = useMemo(
    () => BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS),
    [vault, maxAdverseBps, nonce],
  );

  const ready = Boolean(vault && nonce !== null && addresses.registry && base && quote);

  const send = async (signature: string): Promise<boolean> => {
    if (!ready) return false;
    setSending(true);
    try {
      const [{ startAppKit }, core] = await Promise.all([import('./appkit.ts'), import('@wagmi/core')]);
      const config = startAppKit().config;
      const hash = await core.writeContract(config, {
        address: addresses.registry as Address,
        abi: registryAbi,
        functionName: 'lowerFloor',
        args: [vault as Address, base!.address, quote!.address, maxAdverseBps, rate, nonce as bigint, deadline, signature as `0x${string}`],
        chainId: chain.id,
      });
      const receipt = await core.waitForTransactionReceipt(config, { hash, chainId: chain.id });
      if (receipt.status !== 'success') throw new Error('the registry refused the lowering');
      // What was asked for, not what now holds: what holds is read back from the registry, and that
      // read is what the screen goes on to show. Same rule as the raise path.
      toast.success('floor lowered');
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.error(message.split('\n')[0]?.slice(0, 140) ?? 'the floor was not lowered');
      return false;
    } finally {
      setSending(false);
    }
  };

  if (!ready) return { typedData: null, nonce, error, send, sending };

  return {
    nonce,
    error,
    send,
    sending,
    typedData: {
      domain: loweringDomain(chain.id, addresses.registry as Address),
      types: loweringTypes,
      primaryType: 'FloorLowering' as const,
      /*
       * Decimal strings, not bigints, for the reason the mandate already records: the device kit
       * serialises this payload on its way to the hardware and `JSON.stringify` throws on a BigInt
       * — inside an observable that then never emits, so the screen waits forever on a device that
       * was never asked. That bug is not being reintroduced here.
       */
      message: {
        recipient: vault as Address,
        base: base!.address,
        quote: quote!.address,
        maxAdverseBps: String(maxAdverseBps),
        absoluteRate: rate.toString(),
        nonce: (nonce as bigint).toString(),
        deadline: deadline.toString(),
      },
    },
  };
}
