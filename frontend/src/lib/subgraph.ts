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

/**
 * Same-origin first, because that is the only side the paid gateway key can live on.
 *
 * `/api/subgraph` tries the network gateway and falls back to Studio behind it (#257). The key is a
 * server secret and must stay one: a `VITE_` variable is compiled into a file the browser
 * downloads, so putting it there would publish it.
 *
 * Without this the board queried Studio directly and the gateway fix did not reach it — which is
 * the "half the tape" symptom, and it is worse than it reads. Under a 429 the refusals still render
 * (they come from `/api/refusals`, which asks the chain for transaction status) while the fills do
 * not, so a screen showing only refusals looks like a venue where nothing ever fills.
 *
 * `VITE_SUBGRAPH_URL` stays as the fallback for `vite dev`, where nothing serves `/api`.
 */
const PROXY = '/api/subgraph';

type Query = { query: string; variables?: Record<string, unknown> };

/** Set once the proxy has answered, or failed to exist, so the choice is made a single time. */
let proxyWorks: boolean | null = null;

async function ask<T>(body: Query): Promise<T | null> {
  if (!ENDPOINT && proxyWorks === false) return null;
  try {
    const viaProxy = proxyWorks !== false;
    const response = await fetch(viaProxy ? PROXY : ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    /*
     * A 404 means nothing is serving `/api` — `vite dev`, or a static host. Remember that and take
     * the direct endpoint from here on rather than paying a failed round trip per query.
     */
    if (viaProxy && response.status === 404) {
      proxyWorks = false;
      return ENDPOINT ? ask<T>(body) : null;
    }
    if (viaProxy) proxyWorks = true;
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
/*
 * Two queries rather than one with a nullable filter.
 *
 * `where: { maker: null }` does not mean "no filter" to The Graph — it means "maker equals null",
 * which nothing is, so the public tape came back empty while the venue had a hundred fills. A
 * filter that is sometimes absent has to be absent from the query, not present holding a null.
 */
const FILL_FIELDS = `
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
`;

const SNAPSHOT = `
    _meta { block { number } }
    executionQualityDailySnapshots(first: 1, orderBy: day, orderDirection: desc) {
      fills
      refusals
      adverseDeviationP50Bps
      adverseDeviationP99Bps
    }
`;

/*
 * Enough to cover the range control's longest window.
 *
 * The tape shows a screenful and scrolls; the chart draws all of them at once and offers to narrow
 * that by time, so the fetch has to hold more than the widest window it lets someone pick. The
 * venue has 237 fills over four hours today.
 */
const HISTORY = 300;

/** This vault's own trading. */
/*
 * The books this vault has live, in the register §10 asks for.
 *
 * `classification` and `families` are computed by the indexer from the program's own opcodes — the
 * agent zone used to print three fixture lines about a TWAP exit and an auction rebalance that no
 * vault here has ever run (#252). Asked only for the owner's own vault, because the public page has
 * no business naming what a stranger's strategies are.
 */
const STRATEGIES = `
    strategies(first: 10, orderBy: shippedBlock, orderDirection: desc, where: { maker: $maker, active: true }) {
      strategyHash
      classification
      families
      stepCount
    }`;

const MINE = `
  query Fills($maker: Bytes!) {
    fillQualities(first: ${HISTORY}, orderBy: timestamp, orderDirection: desc, where: { maker: $maker }) {
${FILL_FIELDS}    }
${STRATEGIES}
${SNAPSHOT}  }
`;

/**
 * Everything that settled here, whoever made it — and the owner's own books beside it.
 *
 * The scope switch is about the *tape*: "this vault's fills" or "every fill on the venue". It was
 * never about the agent card, which is always about the owner's own vault. Selecting the strategies
 * only in the vault-scoped query meant that switching the tape to the venue stopped asking what the
 * owner's agent had shipped — and the card, given nothing, said "no book is live" about a vault
 * with one live. Not asking and finding nothing are different answers and must not render alike.
 *
 * A stranger has no vault, so there is nothing to select and this collapses to the plain form.
 */
const EVERY = `
  query Fills {
    fillQualities(first: ${HISTORY}, orderBy: timestamp, orderDirection: desc) {
${FILL_FIELDS}    }
${SNAPSHOT}  }
`;

const EVERY_WITH_MINE = `
  query Fills($maker: Bytes!) {
    fillQualities(first: ${HISTORY}, orderBy: timestamp, orderDirection: desc) {
${FILL_FIELDS}    }
${STRATEGIES}
${SNAPSHOT}  }
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
  /**
   * Attempts to lower a floor without the guardian's signature, refused on chain.
   *
   * The other half of the claim, and the half nothing had evidence for. A refused fill shows the
   * agent cannot settle below the floor; a refused weakening shows it cannot move the floor either
   * — §5.1's asymmetry, which is the whole reason the guardian is a key the trading machine never
   * holds. Optional because an older deployment does not send it, and a missing field must not read
   * as a zero.
   */
  weakeningRefusals?: number;
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
): Promise<{ fills: number; weakeningRefusals?: number; recent: RefusalRow[] } | null> {
  try {
    // No query string: the endpoint's own default returns more rows than this tape shows.
    const response = await fetch('/api/refusals');
    if (!response.ok) return null;
    const body = (await response.json()) as RefusalsBody;
    return {
      fills: body.fills ?? 0,
      // Venue-wide and not filtered by vault, because a weakening is refused at the registry rather
      // than at a fill — passing it through undefined keeps "not reported" distinct from "none".
      weakeningRefusals: body.weakeningRefusals,
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

/** One live book, as the indexer decoded it. */
interface IndexedStrategy {
  strategyHash: string;
  classification: string;
  families?: string[] | null;
  stepCount?: number | null;
}

/**
 * A book in the register a person reads, per §10 zone 3: never bytecode, never opcode names.
 *
 * The indexer's `classification` is the primary curve family and `families` is every one present,
 * so a program running two shows both rather than being reported as only its first. The words are
 * the indexer's own; nothing here invents a strategy the program does not contain.
 */
function describeStrategy(s: IndexedStrategy): string {
  const families = (s.families ?? []).filter((f) => f && f !== s.classification);
  const also = families.length > 0 ? ` with ${families.join(' and ')}` : '';
  return `${s.classification}${also} · ${s.strategyHash.slice(0, 10)}`;
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
  /**
   * What the vault's live books are, in words, decoded by the indexer from their own opcodes.
   *
   * Null when nobody has asked or the index has not answered — which is not the same as a vault
   * with no books, and must not render as it (#252).
   */
  agent: string[] | null;
  /**
   * What the last read saw, so freshness is checkable rather than assumed.
   *
   * A board that polls silently asks to be trusted about how current it is. The block the index
   * had reached is the honest answer — a clock only says when we asked, not what we got.
   */
  block: number | null;
  fetchedAt: number | null;
  /** True while a read is in flight, including the ones nobody asked for. */
  fetching: boolean;
  refresh: () => void;
};

/**
 * The time of a row, and the date too whenever that is not today.
 *
 * A bare "11:29" means today to anyone reading it. This venue's last fill was two days old and the
 * whole tape still read as this morning's trading — every row quietly claiming a recency it did not
 * have, on the surface the product is judged from.
 *
 * Today keeps the bare time, because on a tape that is actually live the date on every row is noise
 * that pushes the numbers along.
 */
const clock = (seconds: string) => {
  const at = new Date(Number(seconds) * 1000);
  const time = at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const today = new Date();
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate();
  return sameDay ? time : `${at.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} ${time}`;
};

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
  const [data, setData] = useState<Omit<IndexData, 'refresh' | 'fetching'>>({
    source: 'fixtures',
    status: 'loading',
    tape: null,
    stats: null,
    agent: null,
    block: null,
    fetchedAt: null,
  });
  const [fetching, setFetching] = useState(false);
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    /*
     * The proxy is always worth asking, so a missing `VITE_SUBGRAPH_URL` is no longer "nothing to
     * ask" — on a deployment it is the normal case, because the endpoint lives on the server with
     * the key. Only a proxy already known to be absent *and* no direct endpoint is nothing.
     */
    if ((!ENDPOINT && proxyWorks === false) || (scope === 'mine' && !vault)) {
      // Nothing configured to ask. Not a load in progress, and not an empty venue either.
      setData((c) => ({ ...c, source: 'fixtures', status: 'failed', tape: null, stats: null, agent: null }));
      return;
    }
    // Only the first pass may blank the tape. A poll that reset to `loading` would flash skeleton
    // rows over live ones every interval, which reads as the data disappearing and coming back.
    setData((current) => (current.status === 'live' ? current : { ...current, status: 'loading' }));
    let live = true;

    const read = async () => {
      setFetching(true);
      try {
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
          _meta?: { block?: { number?: number } };
          executionQualityDailySnapshots: { fills: number; refusals: number; adverseDeviationP50Bps: number }[];
          // Only the vault-scoped query selects these, so the public scope leaves them undefined —
          // which is why it is optional here rather than an empty array.
          strategies?: IndexedStrategy[];
        }>(
          scope === 'mine'
            ? { query: MINE, variables: { maker: vault?.toLowerCase() } }
            : vault
              // The venue's tape, and still this vault's books: the switch moves the tape, not the
              // question the agent card asks.
              ? { query: EVERY_WITH_MINE, variables: { maker: vault.toLowerCase() } }
              : { query: EVERY },
        ),
        askRefusals(scope === 'mine' ? vault : null),
      ]);

      if (!live) return;

      const fills = result?.fillQualities ?? [];
      const refusals = refused?.recent ?? [];

      // Answered, with nothing in it. A venue that has not traded is a fact, not a blank to fill.
      if (fills.length === 0 && refusals.length === 0) {
        setData((c) => ({
          ...c,
          source: 'chain',
          agent: null,
          status: result ? 'empty' : 'failed',
          tape: [],
          stats: null,
          block: result?._meta?.block?.number ?? c.block,
          fetchedAt: Date.now(),
        }));
        return;
      }

      const tape: TapeEntry[] = [
        ...fills.map((fill: FillRow) => {
          /*
           * Which way round this fill went, inferred when the row does not say.
           *
           * `tokensIn`/`tokensOut` come back absent, and assuming every fill is WETH→quote was
           * survivable while one vault traded one direction. The public tape has both, and a
           * reverse fill read forwards produces a price of 4.01e20 — which the chart rejects
           * outright, taking the whole board down with it.
           *
           * The rate convention decides it: received × 1e18 ÷ given. Selling an 18-decimal token
           * for a 6-decimal one lands near 1e9; the other way round lands near 1e26. Nothing
           * either token could plausibly trade at falls between them.
           */
          const inverted = Number(fill.executionRate) > 1e18;
          const gave = fill.swap.tokensIn?.[0] ?? (inverted ? USDC : WETH);
          const got = fill.swap.tokensOut?.[0] ?? (inverted ? WETH : USDC);
          const amount = Number(formatUnits(BigInt(fill.swap.amountsIn?.[0] ?? '0'), decimalsOf(gave)));
          const received = Number(formatUnits(BigInt(fill.swap.amountsOut?.[0] ?? '0'), decimalsOf(got)));
          /*
           * One price scale for the pair, whichever way the fill went.
           *
           * A rate is quoted in received-per-given, so a reverse fill's is WETH per tUSDC — 0.0004,
           * which rounds to $0.00 in a price column and makes a real trade look like a free one.
           * A tape has one price for a pair; the direction belongs in the legs, not the price.
           */
          const asGiven = (raw: number) => (raw / 1e18) * 10 ** (decimalsOf(gave) - decimalsOf(got));
          const quotePerBase = (raw: number) => (inverted ? 1 / asGiven(raw) : asGiven(raw));
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
            price: quotePerBase(Number(fill.executionRate)),
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
            /*
             * Through the same conversion as the execution price. Dividing the raw answer by 1e6
             * assumed the forward direction, so a reverse fill reported a reference of four
             * hundred quintillion dollars.
             */
            referencePrice: fill.referencePrice ? quotePerBase(Number(fill.referencePrice)) : undefined,
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
      setData((c) => ({
        ...c,
        source: 'chain',
        status: 'live',
        block: result?._meta?.block?.number ?? c.block,
        fetchedAt: Date.now(),
        tape,
        /*
         * One line per live book, from the classification the indexer already computed. Absent from
         * the public query, so a stranger's board leaves this alone rather than describing a vault
         * that is not theirs.
         */
        agent: result?.strategies ? result.strategies.map(describeStrategy) : null,
        stats: {
          fills: snapshot?.fills ?? refused?.fills ?? fills.length,
          /*
           * The rows that survived the filter, never the endpoint's venue-wide total. On a vault's
           * own board those are different numbers, and the larger one would credit this vault with
           * refusals another vault's floor performed.
           */
          refused: refusals.length,
          /*
           * From the endpoint's own count rather than from `weakenings.length`: the array is the
           * recent window and the number is the total, and publishing a window as a total is how a
           * headline stat quietly shrinks.
           */
          weakeningsRefused: refused?.weakeningRefusals,
          ...(snapshot ? { medianVsMidBps: snapshot.adverseDeviationP50Bps } : {}),
        },
      }));
      } finally {
        if (live) setFetching(false);
      }
    };

    read().catch((cause) => {
      /*
       * A throw in here used to end the effect and nothing else: no row, no message, no console
       * entry, and a board that looked exactly like one with no data. That is how a missing
       * `tokensIn` — a field the schema has and the row did not — kept the tape on fixtures while
       * the index was answering perfectly.
       */
      console.error('[index] the reader failed while shaping the response', cause);
      setData((c) => ({ ...c, source: 'fixtures', status: 'failed', tape: null, stats: null, agent: null }));
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
  }, [vault, scope, asked]);

  return {
    ...data,
    fetching,
    // A press asks the same way the timer does, so nothing has two code paths to keep in step.
    refresh: () => setAsked((n) => n + 1),
  };
}
