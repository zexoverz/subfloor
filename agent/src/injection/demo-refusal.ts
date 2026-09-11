import { createPublicClient, encodeFunctionData, http, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { buildOrder } from "../../../sdk/src/index.ts";
import { composeBook } from "../compose/book.ts";
import { readIndex } from "../market/index-reads.ts";
import { midOf, type StoredMandate } from "../house/house.ts";
import { shipCalldata } from "../vault/ship.ts";
import { ROUTER_ABI } from "../taker/abi.ts";
import { buildTakerData } from "../taker/takerTraits.ts";

/// The refusal demo, planned without a key.
///
/// It plays a compromised house agent: one that holds the delegate key and a live mandate, and has
/// been talked into selling "at any available price". It composes the book that decision becomes,
/// centred `DEMO_DISCOUNT_BPS` under the reference, and builds the fill a taker would jump at. The
/// book carries no guard instructions, and neither do the house agent's own: the floor is not in the
/// program, so there is nothing for an attacker to leave out.
///
/// It prints calldata and nothing else. `scripts/demo-refusal.sh` sends it from the keystores, so no
/// key is ever in this process, and both transactions that matter are ordinary: the delegate ships
/// under the mandate the guardian signed, and a taker asks for a fill. The floor is never touched.

const env = (k: string, d: string) => process.env[k] ?? d;
const RPC = env("SUBFLOOR_RPC", "https://sepolia.base.org");
const API = env("SUBFLOOR_API", "https://web-production-37798.up.railway.app").replace(/\/$/, "");
const SUBGRAPH = env("SUBFLOOR_SUBGRAPH", `${API}/api/subgraph`);
const VAULT = env("SUBFLOOR_VAULT", "0x1168C48a74055486BC4D1E7036d3b1aC4bb75586") as Address;
const ROUTER = env("SUBFLOOR_ROUTER", "0x03189D102286fa8cDd0fBF3578B492e67e665A27") as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;
const TUSDC = env("SUBFLOOR_TUSDC", "0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD") as Address;
// How far under the reference the compromised agent sells. The vault's floor is 100 bps, so 500 is
// well through it: the refusal is the attacker's own book failing, not a floor raised on cue.
const DISCOUNT_BPS = BigInt(env("DEMO_DISCOUNT_BPS", "500"));
// Small on purpose. The book has to be real enough to quote, and every unit shipped counts against
// the mandate's cap while it is live.
const SHIP_WETH = BigInt(env("DEMO_SHIP_WETH", "1000000000000000"));
const SHIP_TUSDC = BigInt(env("DEMO_SHIP_TUSDC", "2000000"));
// The taker spends the quote token, which is the side a book priced under the reference pays the
// vault too little on, and so the side the vault's floor has to refuse.
const AMOUNT_IN = BigInt(env("DEMO_AMOUNT_IN", "1000000"));

const VAULT_ABI = [
  { type: "function", name: "mandateRevoked", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "committed", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

function stop(why: string): never {
  console.error(`[demo-refusal] stopped: ${why}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const now = Math.floor(Date.now() / 1000);

  // The mandate the guardian signed, as the house agent holds it. Not a new one: the point is that a
  // compromised agent needs nothing it did not already have.
  const res = await fetch(`${API}/api/mandates?vault=${VAULT}`);
  if (!res.ok) stop(`/api/mandates answered HTTP ${res.status}`);
  const held = ((await res.json()) as { mandates: StoredMandate[] }).mandates
    .filter((m) => BigInt(m.message.expiry) > BigInt(now))
    .sort((a, b) => (BigInt(a.message.nonce) < BigInt(b.message.nonce) ? -1 : 1));
  let stored: StoredMandate | null = null;
  for (const m of held) {
    const revoked = await client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "mandateRevoked", args: [BigInt(m.message.nonce)] });
    if (!revoked) {
      stored = m;
      break;
    }
  }
  if (!stored) stop(`no unexpired, unrevoked mandate is held for ${VAULT}`);
  const mandate = {
    delegate: stored.message.delegate,
    app: stored.message.app,
    tokens: stored.message.tokens,
    maxAmounts: stored.message.maxAmounts.map(BigInt),
    nonce: BigInt(stored.message.nonce),
    expiry: BigInt(stored.message.expiry),
  };

  const index = await readIndex(SUBGRAPH);
  const mid = midOf(index);
  if (mid === null) stop("the index carries no reference, so there is nothing to price under");
  const hostile = (mid * (10_000n - DISCOUNT_BPS)) / 10_000n;

  const program = composeBook({ referencePrice: hostile, spreadBps: 50, feeBps: 3000, decayPeriodSeconds: 600, salt: BigInt(now) });

  // The cap binds what is live at once, and the house agent's own book is already live under it.
  const tokens = mandate.tokens;
  const amounts = tokens.map((t) => (t.toLowerCase() === WETH.toLowerCase() ? SHIP_WETH : SHIP_TUSDC));
  for (let i = 0; i < tokens.length; i++) {
    const committed = await client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "committed", args: [tokens[i]] });
    const cap = mandate.maxAmounts[i] ?? 0n;
    if (committed + amounts[i] > cap) stop(`${tokens[i]}: ${committed} already live plus ${amounts[i]} is above the cap ${cap}`);
  }

  // One order, built once, for both the ship and the fill. The router hashes the traits word, so a
  // fill built from a different tuple quotes zero and looks like an empty book.
  const [tokenA, tokenB] = WETH.toLowerCase() < TUSDC.toLowerCase() ? [WETH, TUSDC] : [TUSDC, WETH];
  const ship = shipCalldata({
    app: ROUTER,
    tokens: [...tokens],
    amounts,
    mandate,
    signature: stored.signature,
    maker: VAULT,
    tokenA,
    tokenB,
    program,
    useAquaInsteadOfSignature: true,
  });
  const order = buildOrder({ maker: VAULT, tokenA, tokenB, program, useAquaInsteadOfSignature: true });
  const tuple = { maker: order.maker as Address, traits: order.traits, data: order.data };
  const takerData = buildTakerData({ isAToB: tokenA.toLowerCase() === TUSDC.toLowerCase(), isExactIn: true });
  const swap: Hex = encodeFunctionData({ abi: ROUTER_ABI, functionName: "swap", args: [tuple, AMOUNT_IN, takerData] });

  console.log(
    JSON.stringify({
      vault: VAULT,
      router: ROUTER,
      delegate: mandate.delegate,
      nonce: mandate.nonce.toString(),
      reference: mid.toString(),
      hostileReference: hostile.toString(),
      discountBps: DISCOUNT_BPS.toString(),
      tokens,
      amounts: amounts.map(String),
      tokenIn: TUSDC,
      amountIn: AMOUNT_IN.toString(),
      program,
      ship,
      swap,
    }),
  );
}

await main();
