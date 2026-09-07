import { createPublicClient, http } from 'viem';
import { chain } from './chain.ts';

/**
 * One reader for the whole app, and the reason it is one.
 *
 * Every hook used to build its own client, so a single wallet connection fired a dozen separate
 * `eth_call`s at the public endpoint — nine for the ceremony, one for the factory, two for
 * balances. Base's public RPC answers a burst like that with 429, and each hook then reported its
 * own failure as if it were about the vault rather than about the node. That is what made
 * ownership look intermittent: not the chain disagreeing, the chain declining to answer.
 *
 * `batch.multicall` collapses reads issued in the same tick into one Multicall3 call, which turns
 * that dozen into roughly two. `VITE_RPC_URL` exists because a public endpoint is a shared
 * allowance and a demo should not be spending it — point it at a dedicated node and the ceiling
 * moves.
 */
export const publicClient = createPublicClient({
  chain,
  transport: http(import.meta.env?.VITE_RPC_URL || undefined, {
    // Three tries, spaced: a 429 is a request to come back, not a verdict.
    retryCount: 3,
    retryDelay: 300,
  }),
  batch: { multicall: { wait: 12 } },
});
