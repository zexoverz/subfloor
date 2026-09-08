import { formatUnits, type Address } from 'viem';
import { useEffect, useState } from 'react';
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
    const json = (await response.json()) as { data?: T; errors?: unknown[]; message?: string };
    /*
     * The status alone proves nothing here, twice over. A GraphQL error arrives with HTTP 200, and
     * an unpublished Studio version answers 200 with `{"message":"Not found"}` and no `data` at
     * all — which is how a pinned version that has been republished looks from the outside. Both
     * are "no answer", and the board stays on fixtures rather than rendering an empty one as live.
     */
    if (json.errors?.length || json.message) return null;
    return json.data ?? null;
  } catch {
    return null;
  }
}

const FILLS = `
  query Fills {
    fillQualities(first: 24, orderBy: timestamp, orderDirection: desc) {
      id
      executionRate
      referencePrice
      adverseDeviationBps
      floorAtFill
      timestamp
      swap { hash tokensIn amountsIn tokensOut amountsOut }
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

/**
 * A refusal as `/api/refusals` reports it: recovered from transaction status, then the revert
 * payload replayed one block earlier to get the arguments back. The endpoint reads the chain, so
 * it survives the index being behind, republished, or missing the entity entirely.
 */
type RefusalRow = {
  hash: string;
  ts: number;
  attemptedRate: string;
  floorRate: string;
  base: { id: string };
  quote: { id: string };
};

type RefusalsBody = {
  floorRefusals: number;
  fills: number;
  recent: {
    hash: string;
    blockNumber: string;
    reason: string;
    tokenIn: string;
    tokenOut: string;
    executionRate: string;
    floorRate: string;
    timestamp?: number;
  }[];
};

async function askRefusals(): Promise<{ count: number; fills: number; recent: RefusalRow[] } | null> {
  try {
    // No query string: the endpoint's own default returns more rows than this tape shows.
    const response = await fetch('/api/refusals');
    if (!response.ok) return null;
    const body = (await response.json()) as RefusalsBody;
    return {
      count: body.floorRefusals ?? 0,
      fills: body.fills ?? 0,
      recent: (body.recent ?? [])
        // Only the floor's own refusal belongs on this tape. Another revert is a different story.
        .filter((r) => r.reason === 'SettledBelowFloor')
        .map((r) => ({
          hash: r.hash,
          // No timestamp on the record, so the block stands in for one and the tape still sorts.
          ts: r.timestamp ?? Number(r.blockNumber),
          attemptedRate: r.executionRate,
          floorRate: r.floorRate,
          base: { id: r.tokenIn },
          quote: { id: r.tokenOut },
        })),
    };
  } catch {
    return null;
  }
}

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

export function useIndex(vault: Address | null): IndexData {
  const [data, setData] = useState<IndexData>({ source: 'fixtures', tape: null, stats: null });

  useEffect(() => {
    if (!ENDPOINT || !vault) return;
    let live = true;

    (async () => {
      /*
       * Two sources, because a refusal cannot come from the index at all. It is a reverted
       * transaction; reverts emit no logs; a subgraph handler is log-driven. The Refusal entity
       * was removed upstream for exactly that reason, and asking for it here failed the whole
       * query and took the fills down with it. Refusals come from the endpoint that reads
       * transaction status instead.
       */
      const [result, refused] = await Promise.all([
        ask<{
          fillQualities: FillRow[];
          executionQualityDailySnapshots: { fills: number; refusals: number; adverseDeviationP50Bps: number }[];
        }>({ query: FILLS }),
        askRefusals(),
      ]);

      if (!live) return;

      const fills = result?.fillQualities ?? [];
      const refusals = refused?.recent ?? [];

      // Nothing indexed yet is not "live and empty". The screens stay on fixtures and keep saying so.
      if (fills.length === 0 && refusals.length === 0) return;

      const tape: TapeEntry[] = [
        ...fills.map((fill: FillRow) => {
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
        ...refusals.map((refusal: RefusalRow) => ({
          kind: 'refusal' as const,
          ts: refusal.ts,
          time: clock(String(refusal.ts)),
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

      const snapshot = result?.executionQualityDailySnapshots?.[0];

      /*
       * The refusal count never comes from the snapshot. Its `refusals` field is structurally
       * zero — the index cannot see a reverted transaction — so taking it would publish a zero
       * that means "not visible from here" as though it meant "never happened", on the one number
       * this product is judged by.
       */
      setData({
        source: 'chain',
        tape,
        stats: {
          fills: snapshot?.fills ?? refused?.fills ?? fills.length,
          refused: refused?.count ?? refusals.length,
          ...(snapshot ? { medianVsMidBps: snapshot.adverseDeviationP50Bps } : {}),
        },
      });
    })();

    return () => {
      live = false;
    };
  }, [vault]);

  return data;
}
