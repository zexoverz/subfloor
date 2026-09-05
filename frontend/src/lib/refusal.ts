import { decodeErrorResult, type Address, type Hex } from 'viem';
import { rateToPrice } from './rate.ts';
import { tokenMeta } from './tokens.ts';

/**
 * A refusal is a revert, so it is decoded from transaction revert data — never read from an event.
 * `SettledBelowFloor` emits nothing, produces no logs, and is invisible to a subgraph; see
 * docs/event-map.md. This module is the one place that revert data becomes numbers a screen can
 * render, so the refusal card is right on the first mainnet revert rather than during a hotfix.
 */
export const SETTLED_BELOW_FLOOR = {
  type: 'error',
  name: 'SettledBelowFloor',
  inputs: [
    { name: 'recipient', type: 'address' },
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'executionRate', type: 'uint256' },
    { name: 'floorRate', type: 'uint256' },
  ],
} as const;

/** Verified with `cast keccak` against the signature, not copied. */
export const SETTLED_BELOW_FLOOR_SELECTOR = '0x027e4c46';

export type DecodedRefusal = {
  recipient: Address;
  /** what this recipient would have given up, and what it would have received */
  gave: Address;
  got: Address;
  gaveSymbol: string;
  gotSymbol: string;
  /** the realised price of the attempted fill, in `got` units per one `gave` unit */
  attemptedPrice: number;
  floorPrice: number;
  /** how far under the floor the attempt landed. Derivable from the revert alone; vs-reference is not. */
  bpsBelowFloor: number;
  executionRate: bigint;
  floorRate: bigint;
};

/**
 * The orientation that has to survive: `tokenIn` is what *this recipient gave*, `tokenOut` what it
 * received (`FloorRegistry._checkFill(recipient, base, quote, given, received)`). A settlement
 * scores both parties, and `checkSettlement` passes the maker the pair the other way round — so a
 * maker-side refusal arrives with the tokens swapped relative to the taker's. Reading decimals
 * from the decoded addresses rather than from a fixed pair is what keeps that card upright.
 *
 * Returns null for anything that is not this error: a revert this decoder does not recognise is a
 * different failure, and rendering it as a refusal would claim the floor held when it did not.
 */
export function decodeRefusal(data: Hex): DecodedRefusal | null {
  if (!data.startsWith(SETTLED_BELOW_FLOOR_SELECTOR)) return null;

  let args: readonly unknown[] | undefined;
  try {
    ({ args } = decodeErrorResult({ abi: [SETTLED_BELOW_FLOOR], data }));
  } catch {
    return null;
  }
  if (!args || args.length !== 5) return null;

  const [recipient, gave, got, executionRate, floorRate] = args as [Address, Address, Address, bigint, bigint];
  const gaveMeta = tokenMeta(gave);
  const gotMeta = tokenMeta(got);
  if (!gaveMeta || !gotMeta) return null;

  const attemptedPrice = rateToPrice(executionRate, gaveMeta.decimals, gotMeta.decimals);
  const floorPrice = rateToPrice(floorRate, gaveMeta.decimals, gotMeta.decimals);

  return {
    recipient,
    gave,
    got,
    gaveSymbol: gaveMeta.symbol,
    gotSymbol: gotMeta.symbol,
    attemptedPrice,
    floorPrice,
    bpsBelowFloor: Math.round((Number(floorRate - executionRate) / Number(floorRate)) * 10_000),
    executionRate,
    floorRate,
  };
}
