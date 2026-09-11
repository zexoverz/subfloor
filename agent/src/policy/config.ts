/// The policy loop's configuration, read from the environment.
///
/// Its own module because two entry points need it: `policy/loop.ts` and `house/run.ts`. It used to
/// live in `loop.ts`, and `house/run.ts` imported it from there. `loop.ts` starts with a top-level
/// `await run()` that imports `house/run.ts` when a delegate key is set, so that import waited on a
/// module whose evaluation was waiting on it. Node exits a cycle like that with "unsettled top-level
/// await" and nothing else, which is what the agent service did the first time the key was set.

export interface LoopConfig {
  subgraph: string;
  rpc: string;
  maxReferenceAgeSeconds: number;
  maxIndexLagBlocks: number;
  /// Seconds a rate-limited index may stay unread before the loop treats it as gone and docks.
  maxIndexSilenceSeconds: number;
  recenterBps: number;
  spreadBps: number;
  feeBps: number;
  decayPeriodSeconds: number;
  intervalMs: number;
}

export function configFromEnv(): LoopConfig {
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} is not set`);
    return v;
  };
  return {
    subgraph: need("SUBFLOOR_SUBGRAPH"),
    rpc: process.env.SUBFLOOR_RPC ?? "https://sepolia.base.org",
    maxReferenceAgeSeconds: Number(process.env.POLICY_MAX_REF_AGE ?? 3600),
    maxIndexLagBlocks: Number(process.env.POLICY_MAX_INDEX_LAG ?? 200),
    maxIndexSilenceSeconds: Number(process.env.POLICY_MAX_INDEX_SILENCE ?? 600),
    recenterBps: Number(process.env.POLICY_RECENTER_BPS ?? 50),
    spreadBps: Number(process.env.POLICY_SPREAD_BPS ?? 50),
    feeBps: Number(process.env.POLICY_FEE_BPS ?? 3000),
    decayPeriodSeconds: Number(process.env.POLICY_DECAY_SECONDS ?? 600),
    // Two minutes. The reference updates every few minutes (p50 660s on Base, docs/chainlink-gap.md)
    // and a re-centre is a band of 50 bps, so polling faster buys nothing but 429s.
    intervalMs: Number(process.env.POLICY_INTERVAL_MS ?? 120_000),
  };
}
