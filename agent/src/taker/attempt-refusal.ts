/// Attempt one fill against a book we shipped, and read what settlement says.
///
/// The taker bot discovers books from log history and takes the ones worth taking. This takes a
/// named one, on purpose, because the interesting case is a book that should *not* be fillable: the
/// injection harness's guard-free program quotes below the reference, and the floor is what refuses
/// it. The bot's own pieces do the work — `buildTakerData`, `ROUTER_ABI`, `decodeFloorRevert` — so
/// what is exercised here is the same path a real taker walks.
///
/// The transaction is sent with an explicit gas limit. Estimation reverts on a fill the floor will
/// refuse, and an unsent transaction proves nothing: the artifact is a mined transaction with status
/// 0 and the floor's own numbers in its revert data.
import { createPublicClient, createWalletClient, encodeFunctionData, http, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { buildOrder } from "../../../sdk/src/index.ts";
import { ROUTER_ABI, ERC20_ABI } from "./abi.ts";
import { buildTakerData } from "./takerTraits.ts";
import { decodeFloorRevert } from "./bot.ts";

const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

export async function run(): Promise<void> {
  const rpc = process.env.SUBFLOOR_RPC ?? "https://sepolia.base.org";
  const account = privateKeyToAccount(need("SUBFLOOR_TAKER_KEY") as Hex);
  const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpc) });

  const router = need("SUBFLOOR_ROUTER") as Address;
  const vault = need("SUBFLOOR_VAULT") as Address;
  const weth = need("SUBFLOOR_WETH") as Address;
  const quote = need("SUBFLOOR_TUSDC") as Address;
  const program = need("SUBFLOOR_PROGRAM") as Hex;
  const amountIn = BigInt(need("SUBFLOOR_AMOUNT_IN"));

  // The same order the ship built. Rebuilt from the same inputs rather than read back, because the
  // pair sorts and the traits word is what the router hashes — a hand-made tuple that differs
  // quotes zero and looks like an empty book rather than a mistake.
  const [tokenA, tokenB] = weth.toLowerCase() < quote.toLowerCase() ? [weth, quote] : [quote, weth];
  const order = buildOrder({ maker: vault, tokenA, tokenB, program, useAquaInsteadOfSignature: true });
  const tuple = { maker: order.maker as Address, traits: order.traits, data: order.data };

  /*
   * Which side the taker takes.
   *
   * Defaults to spending the quote token, because that is the direction the guard-free book prices
   * badly for the vault and so the direction its floor has to refuse. `SUBFLOOR_TOKEN_IN=weth` takes
   * the other side, which matters for more than symmetry: `checkSettlement` scores both recipients
   * against their own floors, and a tape with one direction in it has only ever exercised one of
   * them.
   */
  const tokenIn = (process.env.SUBFLOOR_TOKEN_IN ?? "quote").toLowerCase() === "weth" ? weth : quote;
  const isAToB = tokenA.toLowerCase() === tokenIn.toLowerCase();
  const takerData = buildTakerData({ isAToB, isExactIn: true });

  /*
   * The quote is asked first and is allowed to refuse.
   *
   * `quote()` moves no tokens and mirrors the settlement check, so a book the floor will not settle
   * is a book the quote already rejects — that mirror is the point of §5.2, and a quote that
   * answered where settlement would revert is the bug it exists to prevent. Recording it and going
   * on is deliberate: the artifact this run is for is a *mined* transaction with status 0, and a
   * refusal that only ever happened in a view call is not one.
   */
  try {
    const [, amountOut] = (await pub.readContract({
      address: router,
      abi: ROUTER_ABI,
      functionName: "quote",
      args: [tuple, amountIn, takerData],
    })) as [bigint, bigint, Hex];
    console.log(`[quote] ${amountIn} in -> ${amountOut} out`);
    if (amountOut === 0n) throw new Error("the book quotes zero; there is nothing to attempt");
  } catch (err) {
    const floor = decodeFloorRevert(err);
    if (!floor) throw err;
    console.log(`[quote] refused too — the mirror holds: attempted ${floor.executionRate}, floor ${floor.floorRate}`);
  }

  const allowance = (await pub.readContract({
    address: tokenIn,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, router],
  })) as bigint;
  if (allowance < amountIn) {
    const h = await wallet.writeContract({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [router, amountIn * 1000n],
    } as never);
    await pub.waitForTransactionReceipt({ hash: h });
    console.log(`[approve] ${h}`);
  }

  const data = encodeFunctionData({ abi: ROUTER_ABI, functionName: "swap", args: [tuple, amountIn, takerData] });
  // Explicit, because estimation reverts and an unsent transaction is not an artifact.
  const hash = await wallet.sendTransaction({ to: router, data, gas: 900_000n });
  console.log(`[swap] ${hash}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`[swap] status ${receipt.status}, gas ${receipt.gasUsed}, block ${receipt.blockNumber}`);

  if (receipt.status === "success") {
    console.log("[result] the fill went through — the book priced above the floor");
    return;
  }

  /*
   * A reverted transaction carries no logs, which is the whole reason a refusal cannot come from a
   * subgraph — §13 item 7. The numbers come from replaying the call and reading its revert data.
   *
   * Replayed at the failing block where the node will do it, and at the head where it will not:
   * `sepolia.base.org` answers a historical `eth_call` with "Requested resource not found", which is
   * an archive it does not keep rather than a call that succeeded. The head is the honest fallback
   * because the book is still shipped and still priced where it was; it is labelled as the head so
   * nobody reads a number from one block as a number from another.
   */
  try {
    try {
      await pub.call({ to: router, data, account: account.address, blockNumber: receipt.blockNumber });
    } catch (atBlock) {
      if (!/not found|missing trie|archive/i.test((atBlock as Error).message)) throw atBlock;
      console.log("[replay] no archive at that block; replaying at the head instead");
      await pub.call({ to: router, data, account: account.address });
    }
  } catch (err) {
    const floor = decodeFloorRevert(err);
    if (floor) {
      console.log(`[result] THE SUBFLOOR HELD`);
      console.log(`  attempted  ${floor.executionRate}`);
      console.log(`  the floor  ${floor.floorRate}`);
      return;
    }
    console.log(`[result] reverted, but not on the floor: ${(err as Error).message.split("\n").slice(0, 3).join(" | ")}`);
    return;
  }
  console.log("[result] reverted on chain but replayed clean — the state moved under it");
}

if (process.argv[1]?.endsWith("attempt-refusal.ts")) await run();
