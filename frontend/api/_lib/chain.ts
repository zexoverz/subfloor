import { createPublicClient, http, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

/// Reads fills straight off the chain, without the index.
///
/// The index is the honest source and stays the one the submission points at: it is recomputed by
/// something other than us, which is the whole argument. This exists because the index is one
/// component and the interface should not go dark when a component does — during the build it did,
/// for a night, and the screens had nothing to render.
///
/// What it cannot do is the thing only Substreams can: a refused fill reverts and emits no logs, so
/// counting refusals is not possible from logs at all. That number comes from the index or from the
/// agent's own record, and this endpoint says so rather than reporting zero.


const AGGREGATOR_ABI = [
  {
    type: "function", name: "latestRoundData", stateMutability: "view", inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" }, { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" }, { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

const ONE = 10n ** 18n;
const BPS = 10_000n;

/// Log history goes through HyperSync, never `eth_getLogs`.
///
/// The public Base Sepolia RPC caps the block range and rate-limits under a walk, and this endpoint
/// spans every block since the contracts were deployed — so it worked for an hour and then began
/// returning `RPC Request failed` as the range grew. CLAUDE.md says this in as many words; this file
/// ignored it and got exactly the failure described.
export const HYPERSYNC = {
  url: process.env.SUBFLOOR_HYPERSYNC_URL ?? "https://base-sepolia.hypersync.xyz/query",
  token: process.env.SUBFLOOR_HYPERSYNC_TOKEN ?? "",
};

/// `Swapped(bytes32,address,address,address,address,uint256,uint256)`
const SWAPPED_TOPIC0 = "0x54bc5c027d15d7aa8ae083f994ab4411d2f223291672ecd3a344f3d92dcaf8b2";

export const CHAIN = {
  rpc: process.env.SUBFLOOR_RPC ?? "https://sepolia.base.org",
  router: (process.env.SUBFLOOR_ROUTER ?? "0xa2C76F6eF597B4E48d98A6085B9381C7b0fa0709") as Address,
  aggregator: (process.env.SUBFLOOR_AGGREGATOR ?? "0xa24A68DD788e1D7eb4CA517765CFb2b7e217e7a3") as Address,
  weth: (process.env.SUBFLOOR_WETH ?? "0x4200000000000000000000000000000000000006") as Address,
  quote: (process.env.SUBFLOOR_QUOTE ?? "0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD") as Address,
  fromBlock: BigInt(process.env.SUBFLOOR_FROM_BLOCK ?? "46513825"),
};

export interface Fill {
  hash: Hex;
  blockNumber: string;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  amountOut: string;
  /// `received * 1e18 / given`, raw units, the same convention the registry uses.
  rate: string;
  referenceRate: string;
  /// Positive means the fill beat the reference for the taker.
  edgeBps: number;
}

/// The reference in raw terms for whichever side was given.
function referenceFor(spendingWeth: boolean, answer: bigint, feedDecimals: number, quoteDecimals: number): bigint {
  const scale = 10n ** BigInt(feedDecimals);
  const wethUnit = 10n ** 18n;
  const quoteUnit = 10n ** BigInt(quoteDecimals);
  return spendingWeth
    ? (answer * quoteUnit * ONE) / (scale * wethUnit)
    : (scale * wethUnit * ONE) / (answer * quoteUnit);
}

export async function recentFills(limit = 25): Promise<{ fills: Fill[]; head: string; note: string }> {
  const client = createPublicClient({ chain: baseSepolia, transport: http(CHAIN.rpc) });

  const [logs, round, head] = await Promise.all([
    swappedLogs(),
    client.readContract({ address: CHAIN.aggregator, abi: AGGREGATOR_ABI, functionName: "latestRoundData" }),
    client.getBlockNumber(),
  ]);

  const answer = (round as readonly [bigint, bigint, bigint, bigint, bigint])[1];

  const fills = logs.slice(-limit).reverse().map((l) => {
    const spendingWeth = l.tokenIn.toLowerCase() === CHAIN.weth.toLowerCase();
    const rate = l.amountIn === 0n ? 0n : (l.amountOut * ONE) / l.amountIn;
    const reference = referenceFor(spendingWeth, answer, 8, 6);
    return {
      hash: l.hash,
      blockNumber: l.blockNumber.toString(),
      tokenIn: l.tokenIn,
      tokenOut: l.tokenOut,
      amountIn: l.amountIn.toString(),
      amountOut: l.amountOut.toString(),
      rate: rate.toString(),
      referenceRate: reference.toString(),
      edgeBps: reference === 0n ? 0 : Number(((rate - reference) * BPS) / reference),
    };
  });

  return {
    fills,
    head: head.toString(),
    note:
      "Read from Swapped logs directly, not from the index. Refusals cannot appear here at all: a refused fill reverts and emits no logs, which is why the index composition exists.",
  };
}

interface RawSwap {
  hash: Hex;
  blockNumber: bigint;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
}

/// Paginates on `next_block` until it stops advancing, which is HyperSync's own contract. The
/// response returns `blocks` and `logs` as sibling arrays with log fields flat.
async function swappedLogs(): Promise<RawSwap[]> {
  if (!HYPERSYNC.token) throw new Error("SUBFLOOR_HYPERSYNC_TOKEN is not set; log history needs HyperSync, not eth_getLogs");

  const out: RawSwap[] = [];
  let from = Number(CHAIN.fromBlock);

  for (let page = 0; page < 50; page++) {
    const res = await fetch(HYPERSYNC.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${HYPERSYNC.token}` },
      body: JSON.stringify({
        from_block: from,
        logs: [{ address: [CHAIN.router.toLowerCase()], topics: [[SWAPPED_TOPIC0]] }],
        field_selection: { log: ["block_number", "transaction_hash", "data"] },
      }),
    });
    if (!res.ok) throw new Error(`hypersync HTTP ${res.status}`);

    const body = (await res.json()) as {
      data: { logs?: { block_number: number; transaction_hash: Hex; data: Hex }[] }[];
      next_block: number;
    };

    for (const batch of body.data ?? []) {
      for (const l of batch.logs ?? []) out.push({ ...decodeSwapped(l.data), hash: l.transaction_hash, blockNumber: BigInt(l.block_number) });
    }

    if (!body.next_block || body.next_block <= from) break;
    from = body.next_block;
  }
  return out;
}

/// `Swapped` has no indexed parameters, so every field is in `data`, 32 bytes each in order:
/// orderHash, maker, taker, tokenIn, tokenOut, amountIn, amountOut.
function decodeSwapped(data: Hex): Omit<RawSwap, "hash" | "blockNumber"> {
  const word = (i: number) => data.slice(2 + i * 64, 2 + (i + 1) * 64);
  const addr = (i: number) => (`0x${word(i).slice(24)}`) as Address;
  const num = (i: number) => BigInt(`0x${word(i)}`);
  return { tokenIn: addr(3), tokenOut: addr(4), amountIn: num(5), amountOut: num(6) };
}
