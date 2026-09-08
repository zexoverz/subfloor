import { createPublicClient, createWalletClient, decodeErrorResult, http, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { AGGREGATOR_ABI, AQUA_ABI, ERC20_ABI, ROUTER_ABI } from "./abi.ts";
import { decodeShipped, isAToB } from "./order.ts";
import { hyperSyncFromEnv, logsSince } from "./hypersync.ts";
import { buildTakerData } from "./takerTraits.ts";

/// The self-operated taker.
///
/// §8 requires this and requires it disclosed: organic takers will not find a nine-day-old Aqua app,
/// so the venue's fills come from a bot we run from a separate funded key. It is not a market
/// participant and nothing here pretends otherwise. What it produces is real: real transfers, real
/// gas, real adverse selection — which is what makes the execution-quality dataset a measurement
/// rather than a claim.
///
/// It takes when the vault's quote is better for the taker than the reference price, which is the
/// same condition a real arbitrageur would use, and it records refusals as first-class outcomes
/// rather than as errors. A refusal is the product working.

export interface Config {
  rpcUrl: string;
  router: Address;
  aqua: Address;
  vault: Address;
  aggregator: Address;
  /// Which token the bot spends on each pass. It alternates, so the book gets taken on both sides.
  tokens: { weth: Address; quote: Address };
  sizes: { weth: bigint; quote: bigint };
  /// Take only when the quote beats the reference by at least this, in bps. Zero takes anything
  /// at or better than reference.
  edgeBps: number;
  intervalMs: number;
  /// Where to start looking for the vault's Shipped events. The contracts' creation block.
  fromBlock: bigint;
}

export interface Outcome {
  kind: "filled" | "refused" | "no-quote" | "skipped";
  tokenIn: Address;
  amountIn: bigint;
  amountOut?: bigint;
  rate?: bigint;
  referenceRate?: bigint;
  edgeBps?: number;
  hash?: Hex;
  floor?: { executionRate: bigint; floorRate: bigint };
  reason?: string;
}

const ONE = 10n ** 18n;
const BPS = 10_000n;

/// `received * 1e18 / given`, in raw units, from the taker's point of view. The same convention the
/// registry uses, which is why its floors read as 2.45e9 and 4e26 rather than as anything human.
export function rateOf(received: bigint, given: bigint): bigint {
  if (given === 0n) throw new Error("a rate over zero given is not a rate");
  return (received * ONE) / given;
}

export function edgeBpsOf(rate: bigint, reference: bigint): number {
  if (reference === 0n) return 0;
  return Number(((rate - reference) * BPS) / reference);
}

/// The reference rate for spending `tokenIn`, in the same raw convention as the quote.
///
/// The feed prices ETH in USD at its own decimals. Spending the quote token buys WETH, so the rate
/// is WETH-raw per quote-raw and the feed has to be inverted; spending WETH is the other way round.
export function referenceRateFor(
  spendingWeth: boolean,
  answer: bigint,
  feedDecimals: number,
  wethDecimals: number,
  quoteDecimals: number,
): bigint {
  const scale = 10n ** BigInt(feedDecimals);
  const wethUnit = 10n ** BigInt(wethDecimals);
  const quoteUnit = 10n ** BigInt(quoteDecimals);

  return spendingWeth
    // give 1 WETH-raw, receive answer/scale quote units
    ? (answer * quoteUnit * ONE) / (scale * wethUnit)
    // give 1 quote-raw, receive scale/answer WETH units
    : (scale * wethUnit * ONE) / (answer * quoteUnit);
}

/// Inferred from the factory rather than declared. viem's client types are generic over chain,
/// transport and account, and a hand-written annotation produces a type that is structurally
/// identical to the real one and which TypeScript still treats as unrelated.
function makeClients(cfg: Config, account: PrivateKeyAccount) {
  const transport = http(cfg.rpcUrl);
  return {
    pub: createPublicClient({ chain: baseSepolia, transport }),
    wallet: createWalletClient({ account, chain: baseSepolia, transport }),
    account,
  };
}

export type Clients = ReturnType<typeof makeClients>;

export function clientsFromEnv(cfg: Config): Clients {
  const key = process.env.TAKER_PRIVATE_KEY as Hex | undefined;
  if (!key) {
    throw new Error(
      "TAKER_PRIVATE_KEY is not set. The taker signs its own transactions from its own funded key, " +
        "separate from the owner's — that separation is the point, so there is no fallback here.",
    );
  }
  return makeClients(cfg, privateKeyToAccount(key));
}

export function configFromEnv(): Config {
  return {
    rpcUrl: process.env.RPC_URL ?? "https://sepolia.base.org",
    router: process.env.SUBFLOOR_ROUTER as Address,
    aqua: process.env.SUBFLOOR_AQUA as Address,
    vault: process.env.SUBFLOOR_VAULT as Address,
    aggregator: process.env.SUBFLOOR_AGGREGATOR as Address,
    tokens: {
      weth: (process.env.SUBFLOOR_WETH ?? "0x4200000000000000000000000000000000000006") as Address,
      quote: process.env.SUBFLOOR_QUOTE as Address,
    },
    sizes: {
      weth: BigInt(process.env.TAKER_SIZE_WETH ?? "300000000000000"),
      quote: BigInt(process.env.TAKER_SIZE_QUOTE ?? "1500000"),
    },
    edgeBps: Number(process.env.TAKER_EDGE_BPS ?? "-50"),
    intervalMs: Number(process.env.TAKER_INTERVAL_MS ?? "45000"),
    fromBlock: BigInt(process.env.SUBFLOOR_FROM_BLOCK ?? "46513825"),
  };
}

/// The live order, read off the chain rather than rebuilt.
///
/// `Shipped` carries `abi.encode(order)` and Aqua keys inventory by the hash of exactly those bytes,
/// so rebuilding it off-chain means matching it byte for byte. Reading it removes that whole class
/// of mistake, and a rebuild that differs quotes zero — which looks like an empty book rather than
/// like a bug, and cost an hour finding out.
/// Topic hashes from `docs/event-map.md`, computed with `cast keccak` rather than copied.
const SHIPPED_TOPIC0 = "0xdc3622e06fb145651f567d421c9ef261d71d43e3778b761907bc0d70d42e52b0" as Hex;
const DOCKED_TOPIC0 = "0xd173a1d140c154eb1ce9298d251d5eb8c4089cc2d16e70f1067bdc810c6fe004" as Hex;

/// The live order, read off the chain rather than rebuilt.
///
/// `Shipped` carries `abi.encode(order)` and Aqua keys inventory by the hash of exactly those bytes,
/// so rebuilding it off-chain means matching it byte for byte. Reading it removes that whole class
/// of mistake, and a rebuild that differs quotes zero — which looks like an empty book rather than
/// like a bug.
///
/// Through HyperSync, never `eth_getLogs`: the vault ships rarely, so the live strategy sits
/// thousands of blocks back, and a span that wide is exactly what the public RPC refuses.
export async function liveOrder(c: Clients, cfg: Config) {
  const hs = hyperSyncFromEnv();
  const logs = await logsSince(hs, cfg.fromBlock, [cfg.aqua], [SHIPPED_TOPIC0, DOCKED_TOPIC0]);

  const docked = new Set<string>();
  const shipped: { strategy: Hex; strategyHash: Hex; maker: Address }[] = [];

  for (const l of logs) {
    // Neither event has indexed parameters, so both decode out of `data`: maker, app, strategyHash,
    // then the strategy blob's offset and length for Shipped.
    const word = (i: number) => l.data.slice(2 + i * 64, 2 + (i + 1) * 64);
    const maker = (`0x${word(0).slice(24)}`) as Address;
    const strategyHash = (`0x${word(2)}`) as Hex;

    if (l.topic0.toLowerCase() === DOCKED_TOPIC0) {
      docked.add(strategyHash.toLowerCase());
      continue;
    }
    const at = Number(BigInt(`0x${word(3)}`)) / 32;
    const len = Number(BigInt(`0x${word(at)}`));
    const strategy = (`0x${l.data.slice(2 + (at + 1) * 64, 2 + (at + 1) * 64 + len * 2)}`) as Hex;
    shipped.push({ strategy, strategyHash, maker });
  }

  const mine = shipped
    .filter((s) => s.maker.toLowerCase() === cfg.vault.toLowerCase() && !docked.has(s.strategyHash.toLowerCase()))
    .at(-1);

  if (!mine) return null;
  return { ...decodeShipped(mine.strategy), strategyHash: mine.strategyHash };
}

export async function reference(c: Clients, cfg: Config) {
  const [round, decimals] = await Promise.all([
    c.pub.readContract({ address: cfg.aggregator, abi: AGGREGATOR_ABI, functionName: "latestRoundData" }),
    c.pub.readContract({ address: cfg.aggregator, abi: AGGREGATOR_ABI, functionName: "decimals" }),
  ]);
  return { answer: round[1] as bigint, decimals: Number(decimals), updatedAt: round[3] as bigint };
}

/// One pass: quote, decide, and take if the quote is good enough.
///
/// A revert is not a failure of the bot. `SettledBelowFloor` is the mechanism working, and it is
/// returned as an outcome so the caller can count it — refusals are the product's proudest number.
export async function pass(c: Clients, cfg: Config, spendWeth: boolean): Promise<Outcome> {
  const tokenIn = spendWeth ? cfg.tokens.weth : cfg.tokens.quote;
  const amountIn = spendWeth ? cfg.sizes.weth : cfg.sizes.quote;

  const order = await liveOrder(c, cfg);
  if (!order) return { kind: "skipped", tokenIn, amountIn, reason: "no live strategy shipped by the vault" };

  const aToB = isAToB(order.data, tokenIn);
  const takerData = buildTakerData({ isAToB: aToB });
  const tuple = { maker: order.maker, traits: order.traits, data: order.data };

  let amountOut: bigint;
  try {
    const q = await c.pub.readContract({
      address: cfg.router, abi: ROUTER_ABI, functionName: "quote",
      args: [tuple, amountIn, takerData],
    });
    amountOut = (q as readonly [bigint, bigint, Hex])[1];
  } catch (err) {
    return { kind: "no-quote", tokenIn, amountIn, reason: (err as Error).message.split("\n")[0] };
  }
  if (amountOut === 0n) return { kind: "no-quote", tokenIn, amountIn, reason: "quote returned zero" };

  const ref = await reference(c, cfg);
  const wethDecimals = 18;
  const quoteDecimals = Number(
    await c.pub.readContract({ address: cfg.tokens.quote, abi: ERC20_ABI, functionName: "decimals" }),
  );
  const referenceRate = referenceRateFor(spendWeth, ref.answer, ref.decimals, wethDecimals, quoteDecimals);
  const rate = rateOf(amountOut, amountIn);
  const edge = edgeBpsOf(rate, referenceRate);

  if (edge < cfg.edgeBps) {
    return { kind: "skipped", tokenIn, amountIn, amountOut, rate, referenceRate, edgeBps: edge,
      reason: `edge ${edge} bps below threshold ${cfg.edgeBps}` };
  }

  const allowance = await c.pub.readContract({
    address: tokenIn, abi: ERC20_ABI, functionName: "allowance", args: [c.account.address, cfg.router],
  });
  if ((allowance as bigint) < amountIn) {
    const h = await c.wallet.writeContract({
      address: tokenIn, abi: ERC20_ABI, functionName: "approve", args: [cfg.router, amountIn * 1000n],
      account: c.account, chain: baseSepolia,
    } as never);
    await c.pub.waitForTransactionReceipt({ hash: h });
  }

  try {
    // `as never` because viem types writeContract against the client's bound chain and account, and
    // this client is constructed generically. The ABI and args above are the checked part.
    const hash = await c.wallet.writeContract({
      address: cfg.router, abi: ROUTER_ABI, functionName: "swap",
      args: [tuple, amountIn, takerData], account: c.account, chain: baseSepolia,
    } as never);
    await c.pub.waitForTransactionReceipt({ hash });
    return { kind: "filled", tokenIn, amountIn, amountOut, rate, referenceRate, edgeBps: edge, hash };
  } catch (err) {
    const floor = decodeFloorRevert(err);
    if (floor) return { kind: "refused", tokenIn, amountIn, rate, referenceRate, edgeBps: edge, floor };
    throw err;
  }
}

/// Pulls the floor's own numbers out of a revert, so a refusal is recorded with what it refused
/// rather than as an opaque failure.
export function decodeFloorRevert(err: unknown): Outcome["floor"] | null {
  const data = findRevertData(err);
  if (!data) return null;
  try {
    const d = decodeErrorResult({ abi: ROUTER_ABI, data });
    if (d.errorName !== "SettledBelowFloor") return null;
    const a = d.args as readonly [Address, Address, Address, bigint, bigint];
    return { executionRate: a[3], floorRate: a[4] };
  } catch {
    return null;
  }
}

/// A revert the taker can read, for the log.
///
/// viem puts the useful part on the second line: the first says only that the call "reverted with
/// the following signature", and the selector is underneath it. Logging `message.split("\n")[0]`
/// therefore printed the sentence and threw away the answer, which is how the bot spent an evening
/// reporting errors nobody could act on.
///
/// The custom errors below are the ones a taker can actually provoke. Anything else is reported by
/// selector, which is still enough to look up.
const TAKER_VISIBLE_ERRORS: Record<string, string> = {
  "0x027e4c46": "SettledBelowFloor",
  "0x50ee0156": "StaleReference",
  "0xa6fba094": "NoReferenceFeed",
  "0x488c6ada": "BadReferenceAnswer",
};

export function describeError(err: unknown): string {
  const data = findRevertData(err);
  if (data) {
    const selector = data.slice(0, 10).toLowerCase();
    const name = TAKER_VISIBLE_ERRORS[selector];
    return name ? `reverted ${name} (${selector})` : `reverted, unknown selector ${selector}`;
  }
  const msg = (err as Error).message ?? String(err);
  // Two lines, because the first alone is never the answer.
  return msg.split("\n").slice(0, 2).map((l) => l.trim()).filter(Boolean).join(" ");
}

function findRevertData(err: unknown): Hex | null {
  let e = err as { data?: unknown; cause?: unknown } | undefined;
  for (let i = 0; i < 8 && e; i++) {
    const d = e.data;
    if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) return d as Hex;
    if (d && typeof d === "object" && typeof (d as { data?: string }).data === "string") {
      return (d as { data: Hex }).data;
    }
    e = e.cause as typeof e;
  }
  return null;
}
