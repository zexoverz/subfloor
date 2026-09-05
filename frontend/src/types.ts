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
  side: 'sold' | 'bought';
  amount: number;
  price: number;
  bpsAboveFloor: number;
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
  tx: string;
  data: `0x${string}`;
  referencePrice?: number;
};

export type TapeEntry = Fill | Refusal;

export type Mandate = { delegateLabel: string; expiresInDays: number };

export type Addresses = {
  floorRegistry: `0x${string}` | null;
  floorRouter: `0x${string}` | null;
  vault: `0x${string}` | null;
  chainId: number;
};

export type VaultState = {
  pair: Pair;
  wallet: { base: number; quote: number };
  inventory: { base: number; quote: number };
  floor: Floor;
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

export type Screen = 'onboarding' | 'floor' | 'live' | 'ceremony' | 'public';
