import { concat, createPublicClient, encodeAbiParameters, hashTypedData, http, keccak256, toHex, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";

/// Plans the one action the trading machine is never allowed to take: weakening a floor.
///
/// It reads the vault's current WETH→tUSDC floor, picks a weaker one, and produces the exact EIP-712
/// digest `FloorRegistry.lowerFloor` will check. The digest is verified against the registry's own
/// domain separator before it is printed, the same cross-check `switch-on.ts` makes, so a signature
/// over it is a signature the contract accepts or rejects for the one reason that matters — who
/// signed — and never because the bytes were wrong.
///
/// It signs nothing and sends nothing. `scripts/demo-lower-floor.sh` signs the digest twice: once
/// with the stolen agent key, which the registry rejects, and once with the guardian, which it
/// accepts. The rejection is the whole product: the key that trades cannot move the floor.

const env = (k: string, d: string) => process.env[k] ?? d;
const RPC = env("SUBFLOOR_RPC", "https://sepolia.base.org");
const REGISTRY = env("SUBFLOOR_REGISTRY", "0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123") as Address;
const VAULT = env("SUBFLOOR_VAULT", "0x1168C48a74055486BC4D1E7036d3b1aC4bb75586") as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;
const TUSDC = env("SUBFLOOR_TUSDC", "0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD") as Address;
// How much to widen the tolerance by, in bps. A weakening the guardian is allowed to make and the
// agent is not, small enough that the script can put it back in the next block.
const WEAKEN_BY_BPS = Number(env("DEMO_WEAKEN_BY_BPS", "100"));
const CHAIN_ID = baseSepolia.id;

const FLOOR_LOWERING_TYPEHASH = keccak256(
  toHex("FloorLowering(address recipient,address base,address quote,uint16 maxAdverseBps,uint256 absoluteRate,uint256 nonce,uint256 deadline)"),
);
const FLOOR_LOWERING_FIELDS = [
  { name: "recipient", type: "address" },
  { name: "base", type: "address" },
  { name: "quote", type: "address" },
  { name: "maxAdverseBps", type: "uint16" },
  { name: "absoluteRate", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

const REGISTRY_ABI = [
  { type: "function", name: "guardian", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  {
    type: "function",
    name: "floor",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "address" }],
    outputs: [{ type: "bool" }, { type: "uint16" }, { type: "uint232" }],
  },
  {
    type: "function",
    name: "effectiveFloor",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }, { type: "bool" }],
  },
] as const;

function stop(why: string): never {
  console.error(`[demo-lower] stopped: ${why}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const read = <T>(functionName: string, args: unknown[]) =>
    client.readContract({ address: REGISTRY, abi: REGISTRY_ABI, functionName: functionName as never, args: args as never }) as Promise<T>;

  const [configured, bps, absolute] = await read<[boolean, number, bigint]>("floor", [VAULT, WETH, TUSDC]);
  if (!configured) stop(`${VAULT} has no WETH->tUSDC floor to weaken`);
  const guardian = await read<Address>("guardian", [VAULT]);
  const nonce = await read<bigint>("nonces", [VAULT]);
  const [floorNow] = await read<[bigint, boolean]>("effectiveFloor", [VAULT, WETH, TUSDC]);

  // A higher tolerance is a weaker floor. Capped at the contract's 10_000, and it must actually move.
  const targetBps = Math.min(bps + WEAKEN_BY_BPS, 10_000);
  if (targetBps <= bps) stop(`the floor is already at ${bps} bps, the widest this demo would set`);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint16" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [FLOOR_LOWERING_TYPEHASH, VAULT, WETH, TUSDC, targetBps, absolute, nonce, deadline],
    ),
  );
  const domainSeparator = await read<Hex>("DOMAIN_SEPARATOR", []);
  const digest = keccak256(concat(["0x1901", domainSeparator, structHash]));
  const local = hashTypedData({
    domain: { name: "SUBFLOOR FloorRegistry", version: "1", chainId: CHAIN_ID, verifyingContract: REGISTRY },
    types: { FloorLowering: FLOOR_LOWERING_FIELDS },
    primaryType: "FloorLowering",
    message: { recipient: VAULT, base: WETH, quote: TUSDC, maxAdverseBps: targetBps, absoluteRate: absolute, nonce, deadline },
  });
  if (digest !== local) stop(`the registry's domain gives ${digest}, EIP-712 gives ${local}`);

  // The same message as typed data, for a Ledger. Signing the digest would show the device a hash;
  // signing this shows it the recipient, the pair and the new tolerance, which is what a person
  // approving a weaker floor has to be able to read.
  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      FloorLowering: FLOOR_LOWERING_FIELDS,
    },
    primaryType: "FloorLowering",
    domain: { name: "SUBFLOOR FloorRegistry", version: "1", chainId: CHAIN_ID, verifyingContract: REGISTRY },
    message: {
      recipient: VAULT,
      base: WETH,
      quote: TUSDC,
      maxAdverseBps: targetBps,
      absoluteRate: absolute.toString(),
      nonce: nonce.toString(),
      deadline: deadline.toString(),
    },
  };

  console.log(
    JSON.stringify({
      registry: REGISTRY,
      vault: VAULT,
      base: WETH,
      quote: TUSDC,
      guardian,
      currentBps: bps,
      targetBps,
      absoluteRate: absolute.toString(),
      nonce: nonce.toString(),
      deadline: deadline.toString(),
      floorNow: floorNow.toString(),
      digest,
      typedData,
    }),
  );
}

await main();
