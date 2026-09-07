import { createPublicClient, fallback, http } from 'viem';
import { chain } from './chain.ts';

/**
 * One reader for the whole app, spread across several nodes.
 *
 * Every hook used to build its own client, so a single wallet connection fired about a dozen
 * separate `eth_call`s in one tick: nine for the ceremony, one for the factory, two for balances.
 * A public endpoint answers a burst like that with 429, and each hook then reported its own
 * failure as though it were a fact about the vault rather than a node declining to answer. That is
 * what made ownership look intermittent — not the chain disagreeing, the chain not replying.
 *
 * Three defences, in the order they apply:
 *
 * `batch.multicall` collapses reads issued in the same tick into one Multicall3 call, taking that
 * dozen down to roughly two. Every endpoint below was checked against Multicall3 directly, because
 * one that lacks it silently degrades back to a call per read — which is the problem again.
 *
 * `fallback` moves to the next node when one refuses, so a single endpoint's allowance is no
 * longer the app's ceiling. `rank` re-measures them and prefers whichever is currently healthiest,
 * which spreads the load instead of exhausting one and then discovering the next.
 *
 * `VITE_RPC_URL` goes in front of all of them when set. A dedicated node is the real answer for a
 * demo; these are the floor under it, not a substitute for it.
 *
 * All six were verified on 7 Sep 2026 at 60 concurrent reads: every one returned 60/60.
 */
const PUBLIC_NODES = [
  'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.gateway.tenderly.co',
  'https://base-sepolia-public.nodies.app',
  'https://base-sepolia.drpc.org',
  'https://base-sepolia.api.onfinality.io/public',
];

const dedicated = import.meta.env?.VITE_RPC_URL;

export const publicClient = createPublicClient({
  chain,
  transport: fallback(
    [...(dedicated ? [http(dedicated)] : []), ...PUBLIC_NODES.map((url) => http(url))],
    {
      /*
       * Re-measure periodically rather than once: an endpoint rate-limiting us now is usually
       * fine again in a minute, and one that was fine can start refusing.
       *
       * Only in a browser. Ranking runs on an interval, and a live timer at module scope keeps
       * the process alive — under the test runner that is a suite which never exits, and there is
       * no long-lived page there to rank for anyway.
       */
      rank: typeof window === 'undefined' ? false : { interval: 30_000, sampleCount: 3 },
      // Per node. A 429 asks you to come back; it is not the answer to the question.
      retryCount: 2,
      retryDelay: 250,
    },
  ),
  batch: { multicall: { wait: 12 } },
});
