import type { Address, Hex } from "viem";

/// Log history goes through HyperSync. Never `eth_getLogs`.
///
/// The public Base RPC caps the block range and rate-limits under a walk, so an `eth_getLogs` that
/// spans the deployment works for an hour and then fails on every pass as the range grows. Chunking
/// it does not fix the rate limit, it just spreads it out. This is written in CLAUDE.md and was
/// ignored twice in one night — once here and once in the fills endpoint — with the same result
/// both times.

export interface HyperSyncLog {
  blockNumber: bigint;
  transactionHash: Hex;
  address: Address;
  topic0: Hex;
  data: Hex;
}

export interface HyperSyncConfig {
  url: string;
  token: string;
}

export function hyperSyncFromEnv(): HyperSyncConfig {
  const token = process.env.SUBFLOOR_HYPERSYNC_TOKEN;
  if (!token) {
    throw new Error(
      "SUBFLOOR_HYPERSYNC_TOKEN is not set. Log history goes through HyperSync, not eth_getLogs — " +
        "the public RPC caps the range and this fails once the chain moves past it.",
    );
  }
  return { url: process.env.SUBFLOOR_HYPERSYNC_URL ?? "https://base-sepolia.hypersync.xyz/query", token };
}

/// Paginates on `next_block` until it stops advancing, which is HyperSync's own contract. The
/// response returns `blocks` and `logs` as sibling arrays with log fields flat.
export async function logsSince(
  cfg: HyperSyncConfig,
  fromBlock: bigint,
  addresses: Address[],
  topic0s: Hex[],
  fetchImpl: typeof fetch = fetch,
): Promise<HyperSyncLog[]> {
  const out: HyperSyncLog[] = [];
  let from = Number(fromBlock);

  for (let page = 0; page < 100; page++) {
    const res = await fetchImpl(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({
        from_block: from,
        logs: [{ address: addresses.map((a) => a.toLowerCase()), topics: [topic0s] }],
        field_selection: { log: ["block_number", "transaction_hash", "address", "topic0", "data"] },
      }),
    });
    if (!res.ok) throw new Error(`hypersync HTTP ${res.status}`);

    const body = (await res.json()) as {
      data: { logs?: { block_number: number; transaction_hash: Hex; address: Address; topic0: Hex; data: Hex }[] }[];
      next_block: number;
    };

    for (const batch of body.data ?? []) {
      for (const l of batch.logs ?? []) {
        out.push({
          blockNumber: BigInt(l.block_number),
          transactionHash: l.transaction_hash,
          address: l.address,
          topic0: l.topic0,
          data: l.data,
        });
      }
    }

    if (!body.next_block || body.next_block <= from) break;
    from = body.next_block;
  }
  return out;
}
