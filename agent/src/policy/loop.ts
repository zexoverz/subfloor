import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { readIndex, IndexUnavailable, IndexRateLimited, type IndexView } from "../market/index-reads.ts";
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
///
/// A rate limit is the one exception, and it is bounded. Studio's development endpoint answers 429
/// under load, and docking on every one turned a busy index into a loop that docked every thirty
/// seconds for hours while the index itself was healthy. So a 429 holds while the last good read is
/// younger than `maxIndexSilenceSeconds`, and docks once it is not — an index the loop has not been
/// able to see for that long is an index it cannot see, whatever the status code says.
///
/// One read per cycle. The mid is derived from the same view the decision rests on; it used to be a
/// second query, which doubled the load on a rate-limited endpoint for a number it already had.

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

/// The reference, in the raw-unit convention the curve uses: an eight-decimal USD answer becomes raw
/// quote units per raw base unit. WETH is 18 decimals and tUSDC is 6, so the scale is
/// 1e18 * 1e6 / 1e18 / 1e8.
export function midFromIndex(index: IndexView): bigint | null {
  if (!index.reference) return null;
  return (index.reference.answer * 10n ** 6n) / 10n ** 8n;
}

/// One cycle: read, decide, report. Returns the action rather than acting on it, so the decision
/// path is testable without a key and the shipping path stays a separate, explicit step.
export async function cycle(
  cfg: LoopConfig,
  deps: {
    chainHead: () => Promise<number>;
    /// Given the view this cycle already read, so the mid never costs a second query.
    venueMid: (index: IndexView) => Promise<bigint | null>;
    centredOn: () => bigint | null;
    /// When the index last answered in this process, unix seconds, or null if it never has.
    lastGoodReadAt?: () => number | null;
    /// Told how the read went, so the caller can back off: `retryAfterSeconds` is the index's own
    /// answer to "how long", when it gave one.
    onIndexRead?: (ok: boolean, retryAfterSeconds: number | null) => void;
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
    if (err instanceof IndexRateLimited) {
      deps.onIndexRead?.(false, err.retryAfterSeconds);
      const last = deps.lastGoodReadAt?.() ?? null;
      const silence = last === null ? null : now - last;
      const action: Action =
        silence !== null && silence <= cfg.maxIndexSilenceSeconds
          ? { kind: "hold", why: `index rate-limited; last good read ${silence}s ago, inside the ${cfg.maxIndexSilenceSeconds}s bound` }
          : {
              kind: "dock",
              why: `index rate-limited and unread for ${silence === null ? "this whole run" : `${silence}s`}, past the ${cfg.maxIndexSilenceSeconds}s bound`,
            };
      log(`[policy] ${action.kind} — ${action.why}`);
      return action;
    }
    if (err instanceof IndexUnavailable) {
      deps.onIndexRead?.(false, null);
      const action: Action = { kind: "dock", why: `index unreadable: ${err.message}` };
      log(`[policy] ${action.kind} — ${action.why}`);
      return action;
    }
    throw err;
  }
  deps.onIndexRead?.(true, null);

  const chainHead = await deps.chainHead();
  const venueMid = await deps.venueMid(index);

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

  if (action.kind === "unauthorised") {
    // Said once, loudly, rather than every thirty seconds. An operator who has to sign a batch does
    // not need it repeated at them; they need to be able to find the line.
    log("[policy] the agent has stopped. Sign a mandate batch on the device to resume.");
    return action;
  }

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

/// Ten minutes: past this a backed-off loop is not polling, it is asleep.
const MAX_BACKOFF_MS = 600_000;

export async function run(): Promise<void> {
  // With a delegate key this service is the house agent and trades; without one it watches and
  // reports, as it always has. One secret is the whole difference, so the Railway service does not
  // need a second start command to become the agent a first-run user is offered.
  if (process.env.SUBFLOOR_DELEGATE_KEY) {
    const { runHouse } = await import("../house/run.ts");
    return runHouse();
  }

  const cfg = configFromEnv();
  const client = createPublicClient({ chain: baseSepolia, transport: http(cfg.rpc) });

  let centre: bigint | null = null;
  let lastGoodAt: number | null = null;
  let backoffMs = 0;

  for (;;) {
    const action = await cycle(cfg, {
      chainHead: async () => Number(await client.getBlockNumber()),
      venueMid: async (index) => midFromIndex(index),
      centredOn: () => centre,
      lastGoodReadAt: () => lastGoodAt,
      onIndexRead: (ok, retryAfterSeconds) => {
        if (ok) {
          lastGoodAt = Math.floor(Date.now() / 1000);
          backoffMs = 0;
        } else if (retryAfterSeconds !== null) {
          backoffMs = Math.min(retryAfterSeconds * 1000, MAX_BACKOFF_MS);
        } else {
          backoffMs = Math.min(Math.max(backoffMs * 2, cfg.intervalMs), MAX_BACKOFF_MS);
        }
      },
    });
    if (action.kind === "recenter") centre = action.referencePrice;
    await new Promise((r) => setTimeout(r, Math.max(cfg.intervalMs, backoffMs)));
  }
}

if (process.argv[1]?.endsWith("loop.ts")) await run();
