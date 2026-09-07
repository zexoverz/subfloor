import { formatUnits } from 'viem';
import { useEffect, useState } from 'react';
import { addresses } from './contracts.ts';
import { TOKENS, USDC, WETH } from './tokens.ts';
import type { DataSource, Stats, TapeEntry } from '../types.ts';

/**
 * The index, read the way the public page reads it.
 *
 * §10's rule for the live view is that every number on it comes from the subgraph — the same
 * queries a stranger runs — so the owner never sees a figure the index cannot prove. This is the
 * reader for that.
 *
 * It reports `chain` only when the index actually returned fills. An empty answer is not live data
 * with nothing in it: on a venue that has not traded yet, the honest state is still fixtures, and
 * the badge and every provenance line follow this value.
 */
const ENDPOINT = import.meta.env?.VITE_SUBGRAPH_URL ?? '';

type Query = { query: string; variables?: Record<string, unknown> };

async function ask<T>(body: Query): Promise<T | null> {
  if (!ENDPOINT) return null;
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as { data?: T; errors?: unknown[] };
    // A GraphQL error arrives with HTTP 200, so the status alone proves nothing.
    return json.errors?.length ? null : (json.data ?? null);
  } catch {
    return null;
  }
}

const FILLS = `
  query Fills($vault: Bytes!) {
    fillQualities(first: 24, orderBy: timestamp, orderDirection: desc) {
      id
      executionRate
      referencePrice
      adverseDeviationBps
      floorAtFill
      timestamp
      swap { hash tokensIn amountsIn tokensOut amountsOut }
    }
    refusals(first: 12, orderBy: timestamp, orderDirection: desc, where: { recipient: $vault }) {
      id
      hash
      attemptedRate
      floorRate
      timestamp
      base { id }
      quote { id }
    }
    executionQualityDailySnapshots(first: 1, orderBy: day, orderDirection: desc) {
      fills
      refusals
      adverseDeviationP50Bps
      adverseDeviationP99Bps
    }
  }
`;

type FillRow = {
  executionRate: string;
  referencePrice: string;
  adverseDeviationBps: number;
  floorAtFill: string;
  timestamp: string;
  swap: { hash: string; tokensIn: string[]; amountsIn: string[]; tokensOut: string[]; amountsOut: string[] };
};

type RefusalRow = {
  hash: string;
  attemptedRate: string;
  floorRate: string;
  timestamp: string;
  base: { id: string };
  quote: { id: string };
};

export type IndexData = {
  source: DataSource;
  tape: TapeEntry[] | null;
  stats: Partial<Stats> | null;
};

const clock = (seconds: string) =>
  new Date(Number(seconds) * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

const decimalsOf = (address: string) => TOKENS[address.toLowerCase()]?.decimals ?? 18;

/** Same conversion as lib/rate, from the index's raw rate: received * 1e18 / given. */
const price = (rate: string, base: string, quote: string) =>
  (Number(rate) / 1e18) * 10 ** (decimalsOf(base) - decimalsOf(quote));

export function useIndex(): IndexData {
  const [data, setData] = useState<IndexData>({ source: 'fixtures', tape: null, stats: null });

  useEffect(() => {
    if (!ENDPOINT || !addresses.vault) return;
    let live = true;

    (async () => {
      const result = await ask<{
        fillQualities: FillRow[];
        refusals: RefusalRow[];
        executionQualityDailySnapshots: { fills: number; refusals: number; adverseDeviationP50Bps: number }[];
      }>({ query: FILLS, variables: { vault: addresses.vault.toLowerCase() } });

      if (!live || !result) return;

      const fills = result.fillQualities ?? [];
      const refusals = result.refusals ?? [];

      // Nothing indexed yet is not "live and empty". The screens stay on fixtures and keep saying so.
      if (fills.length === 0 && refusals.length === 0) return;

      const tape: TapeEntry[] = [
        ...fills.map((fill) => {
          const gave = fill.swap.tokensIn[0] ?? WETH;
          const got = fill.swap.tokensOut[0] ?? USDC;
          const amount = Number(formatUnits(BigInt(fill.swap.amountsIn[0] ?? '0'), decimalsOf(gave)));
          const rate = Number(fill.executionRate) / 1e18;
          return {
            kind: 'fill' as const,
            ts: Number(fill.timestamp),
            time: clock(fill.timestamp),
            side: gave.toLowerCase() === WETH.toLowerCase() ? ('sold' as const) : ('bought' as const),
            amount,
            price: rate * 10 ** (decimalsOf(gave) - decimalsOf(got)),
            bpsAboveFloor: Math.max(0, Math.round(((Number(fill.executionRate) - Number(fill.floorAtFill)) / Number(fill.floorAtFill)) * 10_000)),
            vsReferenceBps: fill.adverseDeviationBps,
            tx: fill.swap.hash.slice(0, 6),
          };
        }),
        // The decoder wants revert data; the index has the arguments already decoded, so the tape
        // takes them as they are and the card renders from the same five numbers either way.
        ...refusals.map((refusal) => ({
          kind: 'refusal' as const,
          ts: Number(refusal.timestamp),
          time: clock(refusal.timestamp),
          tx: refusal.hash.slice(0, 6),
          data: '0x' as `0x${string}`,
          decoded: {
            attemptedPrice: price(refusal.attemptedRate, refusal.base.id, refusal.quote.id),
            floorPrice: price(refusal.floorRate, refusal.base.id, refusal.quote.id),
            bpsBelowFloor: Math.round(
              ((Number(refusal.floorRate) - Number(refusal.attemptedRate)) / Number(refusal.floorRate)) * 10_000,
            ),
            gaveSymbol: TOKENS[refusal.base.id.toLowerCase()]?.symbol ?? '?',
            gotSymbol: TOKENS[refusal.quote.id.toLowerCase()]?.symbol ?? '?',
          },
        })),
      ].sort((a, b) => b.ts - a.ts);

      const snapshot = result.executionQualityDailySnapshots?.[0];

      setData({
        source: 'chain',
        tape,
        stats: snapshot
          ? { fills: snapshot.fills, refused: snapshot.refusals, medianVsMidBps: snapshot.adverseDeviationP50Bps }
          : { fills: fills.length, refused: refusals.length },
      });
    })();

    return () => {
      live = false;
    };
  }, []);

  return data;
}
