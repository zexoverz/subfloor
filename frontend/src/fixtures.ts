import fuzzCounter from '../../docs/fuzz-counter.json';
import type { VaultState } from './types.ts';

/** The fixture tape is anchored to now so the chart has a sane axis before any live data exists. */
const t0 = Math.floor(Date.now() / 1000);

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

  // ERC20 balanceOf on the vault, one row per token in the mandate's set. Two tokens this week
  // because the run trades one pair — not because the vault or the mandate is limited to two.
  inventory: [
    { symbol: 'WETH', amount: 0.18, mandateMax: 0.5 },
    { symbol: 'USDC', amount: 512, mandateMax: 1500 },
  ],

  // FloorRegistry.effectiveFloor(recipient, base, quote) + FloorRegistry.floor(...)
  floor: { enforced: true, maxAdverseBps: 100, absoluteRate: 2_445_400_000n },

  // The (USDC, WETH) entry: the same protection for the side that buys WETH.
  floorBuy: { enforced: true, maxAdverseBps: 100, absoluteRate: 400_000_000_000_000_000_000_000_000n },

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
    notionalUsd: 14_200,
    markout: { s30: 9, m5: 6, h1: -2 },
    medianVsMidBps: 9,
    worstFillAboveFloorBps: 3,
    refused: 2,
    since: 'Sep 8',
    live: true,
  },

  // Fills from the subgraph. Refusals from Substreams, or from the receipt watcher on our own
  // transactions — the card's numbers are the decoded revert arguments either way.
  tape: [
    { kind: 'fill', ts: t0 - 60, time: '14:02', side: 'sold', amount: 0.05, price: 2463.1, bpsAboveFloor: 72, vsReferenceBps: -28, markout30sBps: 11, vsCexMidBps: 9, tx: '0x4c1a' },
    { kind: 'fill', ts: t0 - 180, time: '13:47', side: 'bought', amount: 0.04, price: 2468.9, bpsAboveFloor: 96, vsReferenceBps: -5, markout30sBps: 4, vsCexMidBps: 6, tx: '0x77de' },
    {
      kind: 'refusal',
      ts: t0 - 300,
      time: '13:31',
      tx: '0x9d02',
      // Real SettledBelowFloor revert data: a taker selling WETH for USDC at 2,391.6 against a
      // floor of 2,445.40. Produced with viem's encodeErrorResult against the contract's own error
      // ABI, so it is byte-identical to what Base will return on Sep 9.
      data: '0x027e4c460000000000000000000000001111113ccf1426a8e30e2bff5e005d929bf6a90a0000000000000000000000004200000000000000000000000000000000000006000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000000000000000000000000000000000008e8ceb800000000000000000000000000000000000000000000000000000000091c1d7c0',
      referencePrice: 2470.1,
    },
    { kind: 'fill', ts: t0 - 420, time: '13:12', side: 'sold', amount: 0.03, price: 2459.8, bpsAboveFloor: 58, vsReferenceBps: -42, markout30sBps: -3, vsCexMidBps: 2, tx: '0x2b91' },
  ],

  // Plain words, decoded from the strategy classification the subgraph computes off the Shipped
  // blob. Never bytecode, never opcode names.
  agent: ['quoting both sides ±35 bps, decaying', 'TWAP exit 0.4 WETH over 6h', 'auction rebalance idle'],

  // The mandate the guardian device signed, from AquaGuardVault.
  mandate: { delegateLabel: 'agent-7', expiresInDays: 14 },

  // vault.delegate(). Null until one is registered on chain.
  delegate: null,

  /**
   * Read from docs/fuzz-counter.json, which only the fuzz-cron workflow writes and which anyone
   * can open in the public repo. Every increment maps to a CI run someone can check, which is the
   * entire point of the number — a figure this page cannot source is worth less than a smaller one
   * it can, and one invented number would put every other number here in doubt.
   */
  fuzz: { programs: fuzzCounter.programs, settledBelowFloor: 0 },

  // Empty until the Sep 7 deploy (#38). Every screen must render with these unset.
  addresses: { floorRegistry: null, floorRouter: null, vault: null, chainId: 8453 },
};
