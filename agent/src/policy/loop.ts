import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { readIndex, IndexUnavailable, type IndexView } from "../market/index-reads.ts";
import { decide, type Action, type PolicyInputs } from "./decide.ts";
import { composeBook } from "../compose/book.ts";

/// The policy loop.
///
/// Every cycle reads the index first and prints what it read alongside the decision, because the
/// claim being made — that this loop genuinely consumes the index rather than fetching it for show —
/// is only checkable if the log shows the reads the decision rested on. A line that says "hold"
/// without the numbers behind it is indistinguishable from a loop that never looked.
///
/// When the index cannot be read the loop docks and keeps docking. It does not fall back to reading
/// the chain directly, which it could: the whole argument for putting the index in the trading path
/// is that its absence should stop trading rather than degrade quietly into a version of the loop
/// nobody tested.

export interface LoopConfig {
  subgraph: string;
  rpc: string;
  maxReferenceAgeSeconds: number;
  maxIndexLagBlocks: number;
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
    recenterBps: Number(process.env.POLICY_RECENTER_BPS ?? 50),
    spreadBps: Number(process.env.POLICY_SPREAD_BPS ?? 50),
    feeBps: Number(process.env.POLICY_FEE_BPS ?? 3000),
    decayPeriodSeconds: Number(process.env.POLICY_DECAY_SECONDS ?? 600),
    intervalMs: Number(process.env.POLICY_INTERVAL_MS ?? 30_000),
  };
}

/// One cycle: read, decide, report. Returns the action rather than acting on it, so the decision
/// path is testable without a key and the shipping path stays a separate, explicit step.
export async function cycle(
  cfg: LoopConfig,
  deps: {
    chainHead: () => Promise<number>;
    venueMid: () => Promise<bigint | null>;
    centredOn: () => bigint | null;
    now?: () => number;
    fetchImpl?: typeof fetch;
    log?: (s: string) => void;
  },
): Promise<Action> {
  const log = deps.log ?? console.log;
  const now = (deps.now ?? (() => Math.floor(Date.now() / 1000)))();

  let index: IndexView;
  try {
    index = await readIndex(cfg.subgraph, deps.fetchImpl);
  } catch (err) {
    if (err instanceof IndexUnavailable) {
      const action: Action = { kind: "dock", why: `index unreadable: ${err.message}` };
      log(`[policy] ${action.kind} — ${action.why}`);
      return action;
    }
    throw err;
  }

  const chainHead = await deps.chainHead();
  const venueMid = await deps.venueMid();

  const inputs: PolicyInputs = {
    index,
    chainHead,
    maxReferenceAgeSeconds: cfg.maxReferenceAgeSeconds,
    maxIndexLagBlocks: cfg.maxIndexLagBlocks,
    now,
    venueMid,
    centredOn: deps.centredOn(),
    recenterBps: cfg.recenterBps,
  };

  const action = decide(inputs);

  // The reads, then the decision. In that order, so the log reads as an argument rather than an
  // assertion.
  log(
    `[index] block ${index.indexedBlock} (head ${chainHead}, lag ${chainHead - index.indexedBlock})` +
      ` errors=${index.hasIndexingErrors}` +
      ` strategies=${index.strategies.length}` +
      (index.quality ? ` fills=${index.quality.fills} p50=${index.quality.p50Bps}bps p99=${index.quality.p99Bps}bps` : " fills=none") +
      (index.reference ? ` refAge=${now - index.reference.updatedAt}s` : " ref=none"),
  );
  log(`[policy] ${action.kind} — ${action.why}`);

  if (action.kind === "recenter") {
    const program = composeBook({
      referencePrice: action.referencePrice,
      spreadBps: cfg.spreadBps,
      feeBps: cfg.feeBps,
      decayPeriodSeconds: cfg.decayPeriodSeconds,
      salt: BigInt(now),
    });
    log(`[compose] ${program}`);
    log(`[compose] ship it with: SUBFLOOR_PROGRAM=${program} forge script script/ShipComposedProgram.s.sol --sig "run()" ...`);
  }

  return action;
}

export async function run(): Promise<void> {
  const cfg = configFromEnv();
  const client = createPublicClient({ chain: baseSepolia, transport: http(cfg.rpc) });

  let centre: bigint | null = null;

  for (;;) {
    const action = await cycle(cfg, {
      chainHead: async () => Number(await client.getBlockNumber()),
      venueMid: async () => {
        const v = await readIndex(cfg.subgraph).catch(() => null);
        if (!v?.reference) return null;
        // The reference, in the raw-unit convention the curve uses: an eight-decimal USD answer
        // becomes raw quote units per raw base unit. WETH is 18 decimals and tUSDC is 6, so the
        // scale is 1e18 * 1e6 / 1e18 / 1e8.
        return (v.reference.answer * 10n ** 6n) / 10n ** 8n;
      },
      centredOn: () => centre,
    });
    if (action.kind === "recenter") centre = action.referencePrice;
    await new Promise((r) => setTimeout(r, cfg.intervalMs));
  }
}

if (process.argv[1]?.endsWith("loop.ts")) await run();
