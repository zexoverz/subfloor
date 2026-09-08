import { useEffect, useMemo, useState } from 'react';
import { encodeErrorResult } from 'viem';
import { SETTLED_BELOW_FLOOR } from './refusal.ts';
import { USDC, WETH } from './tokens.ts';
import { bpsAbove, floorPriceFromBps, priceToRate } from './rate.ts';
import type { DataSource, TapeEntry, VaultState } from '../types.ts';

/**
 * A dev-only stand-in for the agent trading. Nothing is deployed, so nothing produces fills, and a
 * live view that never moves cannot be judged as one.
 *
 * Two rules this feed obeys, because the product's whole claim is that its numbers are checkable:
 *
 *  1. It never runs in a production build (`import.meta.env.DEV`), and while it runs the number
 *     strip says "simulated feed" instead of "live". A screen that cannot tell you where its
 *     numbers came from is the thing this project exists to argue against.
 *  2. Refusals are generated as real encoded revert data and go through `decodeRefusal` like any
 *     other, so this exercises the Sep 9 path rather than faking around it.
 */
const TICK_MS = 4_000;
const REFUSAL_IN = 7; // one tick in seven
const MAX_ROWS = 24;

const now = () =>
  new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

const stamp = () => Math.floor(Date.now() / 1000);

function fill(state: VaultState, seq: number): TapeEntry {
  const { reference, floor } = state;
  const floorPrice = floorPriceFromBps(reference.price, floor.maxAdverseBps);
  // Quoting both sides around the reference, a few tens of bps wide, with drift.
  const price = reference.price * (1 + (Math.random() - 0.45) * 0.004);
  return {
    kind: 'fill',
    ts: stamp(),
    time: now(),
    side: Math.random() > 0.5 ? 'sold' : 'bought',
    amount: Number((0.02 + Math.random() * 0.05).toFixed(3)),
    price: Number(price.toFixed(2)),
    bpsAboveFloor: bpsAbove(price, floorPrice),
    // The simulator knows the reference it priced against, so it can fill this in honestly. A real
    // fill only gets this column once the reference at that block has been read.
    vsReferenceBps: bpsAbove(price, reference.price),
    // Markout only exists 30s after the fill; the simulator stands in for that wait.
    markout30sBps: Math.round((Math.random() - 0.35) * 24),
    tx: `0x${seq.toString(16).padStart(4, '0')}`,
  };
}

function refusal(state: VaultState, seq: number): TapeEntry {
  const { reference, floor, pair } = state;
  const floorPrice = floorPriceFromBps(reference.price, floor.maxAdverseBps);
  // A poisoned agent dumping under the floor: the case the venue has to refuse. Kept in the range
  // a real injected sell lands in (tens to a few hundred bps through), not an absurd one — a
  // refusal that could only ever be obvious proves less than one that is merely bad.
  const attempted = floorPrice * (1 - (0.006 + Math.random() * 0.024));
  return {
    kind: 'refusal',
    ts: stamp(),
    time: now(),
    tx: `0x${seq.toString(16).padStart(4, '0')}`,
    data: encodeErrorResult({
      abi: [SETTLED_BELOW_FLOOR],
      args: [
        state.addresses.vault ?? '0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a',
        WETH,
        USDC,
        priceToRate(attempted, pair.baseDecimals, pair.quoteDecimals),
        priceToRate(floorPrice, pair.baseDecimals, pair.quoteDecimals),
      ],
    }),
    referencePrice: reference.price,
  };
}

/**
 * The state the screens render, with the simulated tape folded in and the stats recomputed, plus
 * where it all came from. `chain` is returned by nothing yet — it arrives with the readers.
 */
export function useSimulatedFeed(base: VaultState): { state: VaultState; source: DataSource } {
  // Deployed builds have no dev mode, so a shared link would otherwise show four frozen rows.
  // VITE_DATA_SOURCE lets an environment ask for the feed explicitly; dev defaults to it, and
  // anything else falls back to fixtures. Whatever it says, the badge says the same thing — the
  // point of the switch is which honest state the page is in, never whether it tells you.
  const configured = import.meta.env?.VITE_DATA_SOURCE as DataSource | undefined;
  const simulated = configured === 'simulated' || (configured === undefined && import.meta.env.DEV);
  const [extra, setExtra] = useState<TapeEntry[]>([]);

  useEffect(() => {
    if (!simulated) return;
    let seq = 0x9d03;
    const id = setInterval(() => {
      seq += 1;
      const entry = seq % REFUSAL_IN === 0 ? refusal(base, seq) : fill(base, seq);
      setExtra((rows) => [entry, ...rows].slice(0, MAX_ROWS));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [base, simulated]);

  const state = useMemo(() => {
    if (!simulated || extra.length === 0) return base;
    const tape = [...extra, ...base.tape].slice(0, MAX_ROWS);
    const fills = tape.filter((e) => e.kind === 'fill');
    return {
      ...base,
      tape,
      // The fuzz counter is deliberately NOT simulated. It is sourced from a file in the public
      // repo, and a number anyone can check is the one number this feed has no business moving.
      stats: {
        ...base.stats,
        fills: base.stats.fills + extra.filter((e) => e.kind === 'fill').length,
        refused: base.stats.refused + extra.filter((e) => e.kind === 'refusal').length,
        /*
         * Only fills whose distance from the floor is known. A fill the index recorded without a
         * floor is not a fill at zero — including it as one would report the worst possible
         * execution on a row that never said anything about the floor at all.
         */
        worstFillAboveFloorBps: (() => {
          const known = fills.map((e) => e.bpsAboveFloor).filter((b): b is number => b !== undefined);
          return known.length ? Math.min(...known) : base.stats.worstFillAboveFloorBps;
        })(),
      },
    };
  }, [base, extra, simulated]);

  return { state, source: simulated ? 'simulated' : 'fixtures' };
}
