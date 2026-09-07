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

const ROUTER_ABI = [
  {
    type: "event",
    name: "Swapped",
    inputs: [
      { name: "orderHash", type: "bytes32", indexed: false },
      { name: "maker", type: "address", indexed: false },
      { name: "taker", type: "address", indexed: false },
      { name: "tokenIn", type: "address", indexed: false },
      { name: "tokenOut", type: "address", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false },
    ],
  },
] as const;

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
    client.getLogs({ address: CHAIN.router, event: ROUTER_ABI[0], fromBlock: CHAIN.fromBlock, toBlock: "latest" }),
    client.readContract({ address: CHAIN.aggregator, abi: AGGREGATOR_ABI, functionName: "latestRoundData" }),
    client.getBlockNumber(),
  ]);

  const answer = (round as readonly [bigint, bigint, bigint, bigint, bigint])[1];

  const fills = logs.slice(-limit).reverse().map((l) => {
    const a = l.args as { tokenIn: Address; tokenOut: Address; amountIn: bigint; amountOut: bigint };
    const spendingWeth = a.tokenIn.toLowerCase() === CHAIN.weth.toLowerCase();
    const rate = a.amountIn === 0n ? 0n : (a.amountOut * ONE) / a.amountIn;
    const reference = referenceFor(spendingWeth, answer, 8, 6);
    return {
      hash: l.transactionHash!,
      blockNumber: l.blockNumber!.toString(),
      tokenIn: a.tokenIn,
      tokenOut: a.tokenOut,
      amountIn: a.amountIn.toString(),
      amountOut: a.amountOut.toString(),
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
