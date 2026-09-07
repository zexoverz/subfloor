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
  medianVsMidBps: number;
  worstFillAboveFloorBps: number;
  /** from Substreams. A refused fill emits nothing, so this can never come from an event handler. */
  refused: number;
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
  bpsAboveFloor: number;
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
  data: `0x${string}`;
  referencePrice?: number;
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
  agent: string[];
  mandate: Mandate;
  fuzz: { programs: number; settledBelowFloor: number };
  addresses: Addresses;
};

/**
 * Where the numbers on screen came from. The badge reads this, never the build mode: a production
 * build of a page with no readers wired up is not "live", it is fixtures, and a stranger opening
 * the URL has no other way to tell.
 */
export type DataSource = 'fixtures' | 'simulated' | 'chain';

export type Screen = 'landing' | 'onboarding' | 'floor' | 'live' | 'ceremony' | 'public';
