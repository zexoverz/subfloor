/** One pair, fixed for the run. `base` is the token the recipient gives, `quote` what it receives. */
export type Pair = {
  base: string;
  quote: string;
  baseDecimals: number;
  quoteDecimals: number;
};

/** FloorRegistry.effectiveFloor + FloorRegistry.floor for one recipient and pair. */
export type Floor = {
  /** false when this recipient never opted in: there is no per-recipient default any more. */
  enforced: boolean;
  maxAdverseBps: number;
  /** the absolute backstop, as a rate: received_raw * 1e18 / given_raw */
  absoluteRate: bigint;
};

/** A weakening signed on the device and waiting out LOWERING_DELAY. Null when the delay is zero. */
export type PendingLowering = {
  maxAdverseBps: number;
  absoluteRate: bigint;
  effectiveAt: number;
} | null;

export type Reference = {
  name: string;
  /** The aggregator the registry consults, read from it rather than written down here. */
  feed?: `0x${string}` | null;
  price: number;
  ageSeconds: number;
  stalenessBoundSeconds: number;
  p50IntervalSeconds: number;
  maxIntervalSeconds: number;
  intervalSample: number;
};

/** Realized adverse deviation, from the subgraph through Graph Client. */
export type Calibration = {
  windowDays: number;
  sampleCount: number;
  p50Bps: number;
  p99Bps: number;
  houseDefaultBps: number;
  /** one bps figure per fill, negative = worse than reference */
  fillsBps: number[];
};

export type Stats = {
  fills: number;
  /** Notional traded, in dollars. "58 fills" is not a number a trading desk reads; volume is. */
  notionalUsd: number;
  medianVsMidBps: number;
  /** Markout at more than one horizon: one number cannot show whether a fill aged well. */
  markout: { s30: number; m5: number; h1: number };
  worstFillAboveFloorBps: number;
  /** from Substreams. A refused fill emits nothing, so this can never come from an event handler. */
  refused: number;
  /**
   * Floor-weakenings the registry refused, for want of the guardian's signature.
   *
   * Undefined where the deployment does not report it, which is not the same as none — the tile is
   * absent rather than showing a zero nobody measured.
   */
  weakeningsRefused?: number;
  since: string;
  live: boolean;
};

export type Fill = {
  kind: 'fill';
  time: string;
  /** Unix seconds. The chart needs an axis; the tape only ever shows `time`. */
  ts: number;
  side: 'sold' | 'bought';
  amount: number;
  price: number;
  /**
   * Undefined when the index recorded the fill without a floor to compare it against. The tape
   * shows a dash there rather than a number: a fill whose distance from the floor is unknown is
   * not a fill that was zero away from it.
   */
  bpsAboveFloor?: number;
  /**
   * The full transaction hash, when the row came from the chain.
   *
   * `tx` is a six-character stub for display and cannot be turned back into a link, so a reader who
   * wanted to check a row had nothing to check it with. Absent on sample rows, which is the point:
   * a row nobody can open is a row nobody has to believe.
   */
  hash?: string;
  /** The reference this fill was scored against, per fill rather than one flat line for all. */
  referencePrice?: number;
  /**
   * How old that reference was when the fill settled.
   *
   * The guard refuses when it cannot prove its input is fresh, so the age is part of what the
   * floor means — a fill cleared against a fifteen-minute-old answer cleared a different bar than
   * one cleared against a fresh one, and the board should not flatten that into the same row.
   */
  referenceAgeSeconds?: number;
  /** The counterparty. Present on indexed fills, absent on sample rows, which is the difference. */
  taker?: string;
  /**
   * Both sides of the swap, named.
   *
   * `side` alone said "sell WETH" and left the reader to work out what came back — which is one
   * inference too many on a row whose whole subject is an exchange. What was given and what was
   * received are the trade; everything else on the row is a judgement about it.
   */
  gave?: { amount: number; symbol: string };
  got?: { amount: number; symbol: string };
  /** Against the reference at that block. Undefined until that read exists — never guessed. */
  vsReferenceBps?: number;
  /** Markout: where the reference sat 30s after the fill. The honest measure of whether it was good. */
  markout30sBps?: number;
  /** Against a CEX mid at the same second. Needs the off-chain join; undefined until it exists. */
  vsCexMidBps?: number;
  tx: string;
};

/**
 * A refusal as it actually arrives: the raw revert data of a failed transaction. Everything the
 * card shows is decoded from it (`src/lib/refusal.ts`), so a real mainnet revert renders on first
 * sight rather than being reshaped by hand.
 *
 * `referencePrice` is not in the revert and cannot be derived from it — the reference at that
 * block is a separate read. Undefined until that read exists, and the card simply omits the
 * vs-reference line rather than inventing one.
 */
export type Refusal = {
  kind: 'refusal';
  time: string;
  ts: number;
  tx: string;
  /** The full hash, so the refusal can be opened. This is the row people will want to check. */
  hash?: string;
  /** Who was turned away. On a refusal the counterparty is the sender the venue refused. */
  from?: string;
  data: `0x${string}`;
  referencePrice?: number;
  /**
   * Already decoded, when the index is the source. A refusal reaches this app two ways — decoded
   * from revert data we watched, or read from the Substreams module that watched the same
   * transaction — and both end at the same five numbers. Nothing downstream should have to know
   * which one it got.
   */
  decoded?: {
    attemptedPrice: number;
    floorPrice: number;
    bpsBelowFloor: number;
    gaveSymbol: string;
    gotSymbol: string;
  };
};

export type TapeEntry = Fill | Refusal;

export type Mandate = { delegateLabel: string; expiresInDays: number };

/**
 * One token the vault holds. The vault is multi-token by construction — a mandate carries a token
 * set with a per-token bound (`Mandate.tokens[]` / `maxAmounts[]`), deliberately not one summed
 * figure, because a single aggregate is decimals-blind and the delegate would choose the split.
 *
 * This week's run trades one pair, so this list is short; the shape is what the contract enforces,
 * and adding a token the mandate covers is one row.
 */
export type Holding = {
  symbol: string;
  amount: number;
  /** The mandate's bound for this token, in whole units. Undefined when it is outside the set. */
  mandateMax?: number;
};

export type Addresses = {
  floorRegistry: `0x${string}` | null;
  floorRouter: `0x${string}` | null;
  vault: `0x${string}` | null;
  chainId: number;
};

export type VaultState = {
  pair: Pair;
  wallet: { base: number; quote: number };
  inventory: Holding[];
  floor: Floor;
  /**
   * The other direction's entry. The registry keys floors by ordered pair, so buying WETH is a
   * second (quote, base) entry rather than a sign flip on this one.
   */
  floorBuy: Floor;
  pendingLowering: PendingLowering;
  reference: Reference;
  calibration: Calibration;
  stats: Stats;
  tape: TapeEntry[];
  /**
   * What the vault's live books are, in words — or null when nobody has been able to ask.
   *
   * Null and empty are different answers and the card renders them differently. Collapsing them is
   * how a 429 became the sentence "no book is live" on a vault with one live (#285 follow-on).
   */
  agent: string[] | null;
  mandate: Mandate;
  /** vault.delegate(). Shown in full, never as a nickname — see copy.wallet.agentAddressHint. */
  delegate: `0x${string}` | null;
  /** The device the registry has on file, so a ceremony can check the one in the owner's hand. */
  guardian?: `0x${string}` | null;
  /**
   * The two keys, kept apart, because two different contracts check two different ones.
   *
   * `AquaGuardVault.guardian` verifies a **mandate**; `FloorRegistry.guardian(vault)` verifies a
   * **lowering** and is the slot that is write-once. `guardian` above is the conflation of the two
   * and is only true when both hold the same key — which is what the setup check wants and what a
   * ceremony must never ask, because a vault with one of them set reported no guardian at all.
   */
  vaultGuardian?: `0x${string}` | null;
  registryGuardian?: `0x${string}` | null;
  fuzz: { programs: number; settledBelowFloor: number };
  addresses: Addresses;
};

/**
 * Where the numbers on screen came from. The badge reads this, never the build mode: a production
 * build of a page with no readers wired up is not "live", it is fixtures, and a stranger opening
 * the URL has no other way to tell.
 */
export type DataSource = 'fixtures' | 'simulated' | 'chain';

export type Screen = 'landing' | 'live' | 'ceremony' | 'agents';
