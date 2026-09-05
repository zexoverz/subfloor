import type { VaultState } from './types.ts';

/**
 * The skeleton's data, and the contract between these screens and the real readers. Every field
 * is commented with where its reader will come from; nothing in a component fetches anything, so
 * swapping this module for live readers is the whole integration.
 *
 * See docs/frontend-integration.md.
 */
export const fixtures: VaultState = {
  pair: { base: 'WETH', quote: 'USDC', baseDecimals: 18, quoteDecimals: 6 },

  // ERC20 balanceOf, on the owner's wallet and on the vault.
  wallet: { base: 0.2, quote: 500 },
  inventory: { base: 0.18, quote: 512 },

  // FloorRegistry.effectiveFloor(recipient, base, quote) + FloorRegistry.floor(...)
  floor: { enforced: true, maxAdverseBps: 100, absoluteRate: 2_445_400_000n },

  // FloorRegistry.pendingLowering(...). Stays null while LOWERING_DELAY is zero.
  pendingLowering: null,

  // The feed's own price, plus FloorRegistry.referenceAge(base, quote). The interval figures come
  // from the gap sampler's report, never from a round-looking guess.
  reference: {
    name: 'Chainlink ETH/USD',
    price: 2470.1,
    ageSeconds: 74,
    stalenessBoundSeconds: 3600,
    p50IntervalSeconds: 150,
    maxIntervalSeconds: 1232,
    intervalSample: 91,
  },

  // Subgraph, through Graph Client. sampleCount < 100 flips the floor screen to its cold start.
  calibration: {
    windowDays: 7,
    sampleCount: 214,
    p50Bps: -6,
    p99Bps: -41,
    houseDefaultBps: 100,
    fillsBps: [
      -2, -3, -3, -4, -4, -5, -5, -5, -6, -6, -6, -7, -7, -8, -8, -9, -10, -11, -12, -14, -16, -19,
      -22, -27, -33, -41, -1, -2, -4, -6, -7, -9, -13, -18, -24, -30, -38, -2, -3, -5, -8, -11, -15,
      -21, -29, -3, -6, -10, -17, -25,
    ],
  },

  // Zone 1. Fills and markout from the subgraph; `refused` from Substreams.
  stats: {
    fills: 47,
    medianVsMidBps: 9,
    worstFillAboveFloorBps: 3,
    refused: 2,
    since: 'Sep 8',
    live: true,
  },

  // Fills from the subgraph. Refusals from Substreams, or from the receipt watcher on our own
  // transactions — the card's numbers are the decoded revert arguments either way.
  tape: [
    { kind: 'fill', time: '14:02', side: 'sold', amount: 0.05, price: 2463.1, bpsAboveFloor: 72, tx: '0x4c1a' },
    { kind: 'fill', time: '13:47', side: 'bought', amount: 0.04, price: 2468.9, bpsAboveFloor: 96, tx: '0x77de' },
    { kind: 'refusal', time: '13:31', attempted: 2391.6, floorPrice: 2445.4, attemptedBpsVsRef: -318, floorBps: -100, tx: '0x9d02' },
    { kind: 'fill', time: '13:12', side: 'sold', amount: 0.03, price: 2459.8, bpsAboveFloor: 58, tx: '0x2b91' },
  ],

  // Plain words, decoded from the strategy classification the subgraph computes off the Shipped
  // blob. Never bytecode, never opcode names.
  agent: ['quoting both sides ±35 bps, decaying', 'TWAP exit 0.4 WETH over 6h', 'auction rebalance idle'],

  // The mandate the guardian device signed, from AquaGuardVault.
  mandate: { delegateLabel: 'agent-7', expiresInDays: 14 },

  // From CI. Theater mode for the video is one display state on this stat.
  fuzz: { programs: 1_742_203, settledBelowFloor: 0 },

  // Empty until the Sep 7 deploy (#38). Every screen must render with these unset.
  addresses: { floorRegistry: null, floorRouter: null, vault: null, chainId: 8453 },
};
