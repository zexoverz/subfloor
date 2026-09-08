import { formatUnits, type Address } from 'viem';
import { useEffect, useState } from 'react';
import { publicClient } from './client.ts';
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
    if (json.errors?.length || json.message) {
      /*
       * Say what the index refused, rather than returning null and letting the board look like a
       * venue with no trades. Two of those in one day cost hours each: a field the schema had
       * dropped, and a required variable that was not being sent — both of which the endpoint
       * named precisely in a message nobody was printing.
       */
      console.error('[index] the query was rejected:', json.errors ?? json.message);
      return null;
    }
    return json.data ?? null;
  } catch {
    return null;
  }
}

/*
 * Maker-side, and filtered to this vault.
 *
 * The board is the owner's view and the owner is the maker, so every comparison has to be the
 * maker's. The index also publishes the taker's — and they are near mirror images: one fill here
 * is +91 bps to the taker and −90 to us. Reading the unprefixed field was showing the
 * counterparty's gain in the column labelled ours.
 *
 * `maker` also makes the filter possible. Without it the tape mixed every vault on the venue and
 * called the result this one's trading.
 */
const FILLS = `
  query Fills($maker: Bytes) {
    fillQualities(first: 24, orderBy: timestamp, orderDirection: desc, where: { maker: $maker }) {
      id
      maker
      taker
      executionRate
      makerExecutionRate
      makerAdverseDeviationBps
      makerFloorAtFill
      referencePrice
      referenceAgeSeconds
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

/**
 * Every field here is optional on purpose.
 *
 * GraphQL omits a null field from the response rather than sending `null`, so a column the index
 * has not filled in simply is not there — and reading `swap.tokensIn[0]` off an absent array threw
 * inside the async block, killed it, and left the board on fixtures with nothing on screen or in
 * the console to say why. The schema having a field is not a promise that a row carries it.
 */
type FillRow = {
  maker?: string;
  taker?: string;
  /** The pair price, the same number from either side, used for the price column. */
  executionRate: string;
  /** What the vault received per unit given. Every judgement below is made against this. */
  makerExecutionRate?: string | null;
  makerAdverseDeviationBps?: number | null;
  makerFloorAtFill?: string | null;
  referencePrice?: string;
  referenceAgeSeconds?: number | null;
  timestamp: string;
  swap: {
    hash: string;
    tokensIn?: string[] | null;
    amountsIn?: string[] | null;
    tokensOut?: string[] | null;
    amountsOut?: string[] | null;
  };
};

/**
 * A refusal as `/api/refusals` reports it: recovered from transaction status, then the revert
 * payload replayed one block earlier to get the arguments back. The endpoint reads the chain, so
 * it survives the index being behind, republished, or missing the entity entirely.
 */
type RefusalRow = {
  hash: string;
  from?: string;
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
    from?: string;
    recipient?: string;
    tokenIn: string;
    tokenOut: string;
    executionRate: string;
    floorRate: string;
    timestamp?: number;
  }[];
};

/** A block number is not a time. This turns one into the other, and says so when it cannot. */
async function blockTime(blockNumber: string): Promise<number> {
  try {
    const block = await publicClient.getBlock({ blockNumber: BigInt(blockNumber) });
    return Number(block.timestamp);
  } catch {
    // Rather than invent one: sorted last, and the row still carries its rates and its hash.
    return 0;
  }
}

/**
 * @param vault whose refusals to count, or null for every refusal on the venue.
 *
 * A refusal belongs to the recipient whose floor was hit, and the payload names it — so this
 * filters on that rather than on the sender, which is only who was turned away.
 */
async function askRefusals(
  vault: Address | null,
): Promise<{ fills: number; recent: RefusalRow[] } | null> {
  try {
    // No query string: the endpoint's own default returns more rows than this tape shows.
    const response = await fetch('/api/refusals');
    if (!response.ok) return null;
    const body = (await response.json()) as RefusalsBody;
    return {
      fills: body.fills ?? 0,
      // Only the floor's own refusal belongs on this tape. Another revert is a different story.
      recent: await Promise.all(
        (body.recent ?? [])
          .filter((r) => r.reason === 'SettledBelowFloor')
          .filter((r) => !vault || r.recipient?.toLowerCase() === vault.toLowerCase())
          .map(async (r) => ({
            hash: r.hash,
            from: r.from,
            /*
             * The block's own timestamp, fetched, because the record carries a block number and no
             * time. Using the block number as seconds put a refusal at 21:10 that happened at
             * 10:05 — a number that looked like a clock and was not one, on the row the whole
             * product is about.
             */
            ts: r.timestamp ?? (await blockTime(r.blockNumber)),
            attemptedRate: r.executionRate,
            floorRate: r.floorRate,
            base: { id: r.tokenIn },
            quote: { id: r.tokenOut },
          })),
      ),
    };
  } catch {
    return null;
  }
}

export type IndexData = {
  source: DataSource;
  /**
   * Which of four things is true, kept apart because three of them used to render identically.
   *
   * `loading` is not `empty`, and neither is `failed` — showing sample rows during any of them
   * puts invented trades on screen and calls the difference cosmetic. A board that cannot say
   * "asking" says "here is what happened" instead, which is the one thing it must never get wrong.
   */
  status: 'loading' | 'live' | 'empty' | 'failed';
  tape: TapeEntry[] | null;
  stats: Partial<Stats> | null;
};

const clock = (seconds: string) =>
  new Date(Number(seconds) * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

const decimalsOf = (address: string) => TOKENS[address.toLowerCase()]?.decimals ?? 18;

/** Same conversion as lib/rate, from the index's raw rate: received * 1e18 / given. */
const price = (rate: string, base: string, quote: string) =>
  (Number(rate) / 1e18) * 10 ** (decimalsOf(base) - decimalsOf(quote));

/**
 * @param vault the vault whose fills to read, or null for the venue as a whole.
 *
 * A null maker means no filter, which is the public tape: everything that settled here, whoever
 * made it. Passing a vault narrows it to that vault's own trading — and the two must never be
 * conflated, because one of them is a claim about this owner and the other is not.
 */
export function useIndex(vault: Address | null, scope: 'mine' | 'public' = 'mine'): IndexData {
  const [data, setData] = useState<IndexData>({ source: 'fixtures', status: 'loading', tape: null, stats: null });

  useEffect(() => {
    if (!ENDPOINT || (scope === 'mine' && !vault)) {
      // Nothing configured to ask. Not a load in progress, and not an empty venue either.
      setData({ source: 'fixtures', status: 'failed', tape: null, stats: null });
      return;
    }
    // Only the first pass may blank the tape. A poll that reset to `loading` would flash skeleton
    // rows over live ones every interval, which reads as the data disappearing and coming back.
    setData((current) => (current.status === 'live' ? current : { ...current, status: 'loading' }));
    let live = true;

    const read = async () => {
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
        }>({ query: FILLS, variables: { maker: scope === 'mine' ? vault?.toLowerCase() : null } }),
        askRefusals(scope === 'mine' ? vault : null),
      ]);

      if (!live) return;

      const fills = result?.fillQualities ?? [];
      const refusals = refused?.recent ?? [];

      // Answered, with nothing in it. A venue that has not traded is a fact, not a blank to fill.
      if (fills.length === 0 && refusals.length === 0) {
        setData({ source: 'chain', status: result ? 'empty' : 'failed', tape: [], stats: null });
        return;
      }

      const tape: TapeEntry[] = [
        ...fills.map((fill: FillRow) => {
          // The pair this deployment trades, when the row does not name one.
          const gave = fill.swap.tokensIn?.[0] ?? WETH;
          const got = fill.swap.tokensOut?.[0] ?? USDC;
          const amount = Number(formatUnits(BigInt(fill.swap.amountsIn?.[0] ?? '0'), decimalsOf(gave)));
          const received = Number(formatUnits(BigInt(fill.swap.amountsOut?.[0] ?? '0'), decimalsOf(got)));
          const rate = Number(fill.executionRate) / 1e18;
          /*
           * Both maker-side, and compared with each other. Mixing the maker's execution against a
           * taker's floor would produce a number that is not about anything.
           */
          const makerRate = Number(fill.makerExecutionRate ?? 0);
          const makerFloor = Number(fill.makerFloorAtFill ?? 0);
          return {
            kind: 'fill' as const,
            ts: Number(fill.timestamp),
            time: clock(fill.timestamp),
            side: gave.toLowerCase() === WETH.toLowerCase() ? ('sold' as const) : ('bought' as const),
            amount,
            price: rate * 10 ** (decimalsOf(gave) - decimalsOf(got)),
            /*
             * Undefined, not zero, when the index has no floor for the fill. Dividing by an absent
             * floor gives Infinity, and rendering that as "0 bps above your floor" would put the
             * worst possible number on the screen the product is named after.
             */
            bpsAboveFloor:
              makerFloor && makerRate
                ? Math.max(0, Math.round(((makerRate - makerFloor) / makerFloor) * 10_000))
                : undefined,
            // The vault's own deviation. Negative means the fill was adverse to the vault, which
            // it often is and is allowed to be — the floor is the bound, not the reference.
            vsReferenceBps: fill.makerAdverseDeviationBps ?? 0,
            tx: fill.swap.hash.slice(0, 6),
            hash: fill.swap.hash,
            referencePrice: fill.referencePrice ? Number(fill.referencePrice) / 1e6 : undefined,
            referenceAgeSeconds: fill.referenceAgeSeconds ?? undefined,
            taker: fill.taker ?? undefined,
            gave: { amount, symbol: TOKENS[gave.toLowerCase()]?.symbol ?? '?' },
            got: { amount: received, symbol: TOKENS[got.toLowerCase()]?.symbol ?? '?' },
          };
        }),
        // The decoder wants revert data; the index has the arguments already decoded, so the tape
        // takes them as they are and the card renders from the same five numbers either way.
        ...refusals.map((refusal: RefusalRow) => ({
          kind: 'refusal' as const,
          ts: refusal.ts,
          time: refusal.ts ? clock(String(refusal.ts)) : '—',
          tx: refusal.hash.slice(0, 6),
          hash: refusal.hash,
          from: refusal.from,
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
        status: 'live',
        tape,
        stats: {
          fills: snapshot?.fills ?? refused?.fills ?? fills.length,
          /*
           * The rows that survived the filter, never the endpoint's venue-wide total. On a vault's
           * own board those are different numbers, and the larger one would credit this vault with
           * refusals another vault's floor performed.
           */
          refused: refusals.length,
          ...(snapshot ? { medianVsMidBps: snapshot.adverseDeviationP50Bps } : {}),
        },
      });
    };

    read().catch((cause) => {
      /*
       * A throw in here used to end the effect and nothing else: no row, no message, no console
       * entry, and a board that looked exactly like one with no data. That is how a missing
       * `tokensIn` — a field the schema has and the row did not — kept the tape on fixtures while
       * the index was answering perfectly.
       */
      console.error('[index] the reader failed while shaping the response', cause);
      setData({ source: 'fixtures', status: 'failed', tape: null, stats: null });
    });

    /*
     * The venue keeps trading whether or not anyone is looking, so a board read once at mount goes
     * stale while it is being watched — the one screen where that matters.
     *
     * Twenty seconds, and only while the tab is visible: a hidden tab polling two services on a
     * timer spends someone's rate limit to update a picture nobody is looking at, and Base's public
     * endpoint has already refused us once today for less.
     */
    const tick = window.setInterval(() => {
      if (!document.hidden) void read().catch(() => {});
    }, 20_000);

    // Coming back to the tab should not mean waiting up to twenty seconds for the truth.
    const onVisible = () => {
      if (!document.hidden) void read().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      live = false;
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [vault, scope]);

  return data;
}
