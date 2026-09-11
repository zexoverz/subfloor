/// Switch the house agent on for one vault, from the terminal that holds the guardian's keystore.
///
/// Two things stand between a vault and the house agent trading it, and both need the guardian's key,
/// which is the one key no service here ever holds: a batch of signed mandates in `/api/mandates`, and,
/// on the live testnet vault, a backstop lowered from where it froze the selling side. This does both.
/// `cast` asks for the keystore password at every signature; nothing here reads, stores or passes it.
///
///     cd agent && node --experimental-strip-types src/house/switch-on.ts --dry-run   # checks only
///     cd agent && node --experimental-strip-types src/house/switch-on.ts             # signs and sends
///
/// Every digest is taken from the contracts themselves — the vault's `hashMandate` and both
/// `DOMAIN_SEPARATOR`s — and compared with viem's EIP-712 hash before anything is signed, and every
/// signature is recovered and compared with the guardian before anything is sent. A mismatch stops
/// the run: a signature over the wrong bytes costs nothing to catch here and a nonce to catch on chain.
///
/// The delegate key is the other half and is not this script's business. It goes into the Railway
/// `agent` service by hand, and this prints how to find it at the end.
import { spawnSync } from "node:child_process";
import { concat, createPublicClient, encodeAbiParameters, hashTypedData, http, keccak256, recoverAddress, toHex, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { MANDATE_TYPES } from "../vault/mandates.ts";

const env = (k: string, d: string) => process.env[k] ?? d;
const RPC = env("SUBFLOOR_RPC", "https://sepolia.base.org");
const API = env("SUBFLOOR_API", "https://web-production-37798.up.railway.app").replace(/\/$/, "");
const VAULT = env("SUBFLOOR_VAULT", "0xaf6b337440FFEa63c47f077eee2663987aEEc33f") as Address;
const REGISTRY = env("SUBFLOOR_REGISTRY", "0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123") as Address;
const ROUTER = env("SUBFLOOR_ROUTER", "0x03189D102286fa8cDd0fBF3578B492e67e665A27") as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;
const TUSDC = env("SUBFLOOR_TUSDC", "0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD") as Address;
const ACCOUNT = env("GUARDIAN_ACCOUNT", "subfloor-dev");
// One mandate covers every ship and re-quote until it expires, so one is the normal number to sign.
const COUNT = Number(env("MANDATE_COUNT", "1"));
const DAYS = Number(env("MANDATE_DAYS", "14"));
const LOWER_BACKSTOP = env("LOWER_BACKSTOP", "1") === "1";
const DRY_RUN = process.argv.includes("--dry-run");
const CHAIN_ID = baseSepolia.id;

const MANDATE_TUPLE = {
  type: "tuple",
  components: [
    { name: "delegate", type: "address" },
    { name: "app", type: "address" },
    { name: "tokens", type: "address[]" },
    { name: "maxAmounts", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

const VAULT_ABI = [
  { type: "function", name: "guardian", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "delegate", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "mandateRevoked", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "hashMandate", stateMutability: "pure", inputs: [MANDATE_TUPLE], outputs: [{ type: "bytes32" }] },
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

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const FLOOR_LOWERING_TYPEHASH = keccak256(
  toHex("FloorLowering(address recipient,address base,address quote,uint16 maxAdverseBps,uint256 absoluteRate,uint256 nonce,uint256 deadline)"),
);

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function stop(why: string): never {
  console.error(`\n[switch-on] stopped: ${why}`);
  process.exit(1);
}

/// `cast` signs the raw digest and asks for the password itself. `--no-hash` because the digest is
/// already the full EIP-712 hash; hashing it again would sign something no contract checks.
function castSign(digest: Hex): Hex {
  const passwordFile = process.env.KEYSTORE_PASSWORD_FILE;
  const args = ["wallet", "sign", "--no-hash", digest, "--account", ACCOUNT, ...(passwordFile ? ["--password-file", passwordFile] : [])];
  const out = spawnSync("cast", args, { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8" });
  if (out.status !== 0) stop(`cast wallet sign exited ${out.status}`);
  const sig = out.stdout.trim().split(/\s+/).pop() ?? "";
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) stop(`cast returned something that is not a signature: ${sig.slice(0, 20)}…`);
  return sig as Hex;
}

async function main(): Promise<void> {
  const client = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
  const read = <T>(address: Address, abi: readonly unknown[], functionName: string, args: unknown[] = []) =>
    client.readContract({ address, abi: abi as never, functionName: functionName as never, args: args as never }) as Promise<T>;

  // --- who is who, from the chain and from the service ----------------------------------------------
  const api = (await (await fetch(`${API}/api/mandates?vault=${VAULT}`)).json()) as {
    houseAgent: Address | null;
    mandates: { message: { nonce: string } }[];
  };
  if (!api.houseAgent) stop(`${API} names no house agent; SUBFLOOR_HOUSE_AGENT is unset on the web service`);
  const [delegate, guardian, registryGuardian] = await Promise.all([
    read<Address>(VAULT, VAULT_ABI, "delegate"),
    read<Address>(VAULT, VAULT_ABI, "guardian"),
    read<Address>(REGISTRY, REGISTRY_ABI, "guardian", [VAULT]),
  ]);
  if (!same(delegate, api.houseAgent)) stop(`the vault's delegate is ${delegate}, the house agent is ${api.houseAgent}`);
  console.log(`[switch-on] vault ${VAULT}\n  delegate ${delegate} (the house agent)\n  guardian ${guardian}, registry guardian ${registryGuardian}`);
  console.log(`  signing with keystore account "${ACCOUNT}"; it must be ${guardian}`);

  // --- the mandates ------------------------------------------------------------------------------------
  const held = new Set(api.mandates.map((m) => m.message.nonce));
  const nonces: bigint[] = [];
  for (let n = 0n; nonces.length < COUNT && n < 512n; n++) {
    if (held.has(n.toString())) continue;
    if (!(await read<boolean>(VAULT, VAULT_ABI, "mandateRevoked", [n]))) nonces.push(n);
  }
  if (nonces.length < COUNT) stop(`found only ${nonces.length} unused nonces below 512`);

  const caps = await Promise.all([WETH, TUSDC].map((t) => read<bigint>(t, ERC20_ABI, "balanceOf", [VAULT])));
  if (caps.every((c) => c === 0n)) stop("the vault holds nothing; fund it before authorising an agent over it");
  const expiry = BigInt(Math.floor(Date.now() / 1000) + DAYS * 86_400);
  const vaultSeparator = await read<Hex>(VAULT, VAULT_ABI, "DOMAIN_SEPARATOR");
  console.log(`  ${COUNT} mandates, nonces ${nonces.join(", ")}, caps ${caps.join(" / ")} (what the vault holds), for ${DAYS} days`);

  const planned: { message: { delegate: Address; app: Address; tokens: Address[]; maxAmounts: bigint[]; nonce: bigint; expiry: bigint }; digest: Hex }[] = [];
  for (const nonce of nonces) {
    const message = { delegate, app: ROUTER, tokens: [WETH, TUSDC], maxAmounts: caps, nonce, expiry };
    const structHash = await read<Hex>(VAULT, VAULT_ABI, "hashMandate", [message]);
    const onChain = keccak256(concat(["0x1901", vaultSeparator, structHash]));
    const local = hashTypedData({
      domain: { name: "SUBFLOOR AquaGuardVault", version: "1", chainId: CHAIN_ID, verifyingContract: VAULT },
      types: MANDATE_TYPES,
      primaryType: "Mandate",
      message,
    });
    if (onChain !== local) stop(`nonce ${nonce}: the vault hashes this mandate to ${onChain}, EIP-712 to ${local}`);
    planned.push({ message, digest: onChain });
  }
  console.log(`  every mandate digest agrees with the vault's own hash`);

  // --- the backstop --------------------------------------------------------------------------------------
  const [configured, bps, absolute] = await read<[boolean, number, bigint]>(REGISTRY, REGISTRY_ABI, "floor", [VAULT, WETH, TUSDC]);
  const lowering = LOWER_BACKSTOP && configured && absolute > 0n;
  let lowerDigest: Hex | null = null;
  let lowerNonce = 0n;
  let deadline = 0n;
  if (lowering) {
    lowerNonce = await read<bigint>(REGISTRY, REGISTRY_ABI, "nonces", [VAULT]);
    deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const structHash = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint16" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [FLOOR_LOWERING_TYPEHASH, VAULT, WETH, TUSDC, bps, 0n, lowerNonce, deadline],
      ),
    );
    const registrySeparator = await read<Hex>(REGISTRY, REGISTRY_ABI, "DOMAIN_SEPARATOR");
    lowerDigest = keccak256(concat(["0x1901", registrySeparator, structHash]));
    const local = hashTypedData({
      domain: { name: "SUBFLOOR FloorRegistry", version: "1", chainId: CHAIN_ID, verifyingContract: REGISTRY },
      types: {
        FloorLowering: [
          { name: "recipient", type: "address" },
          { name: "base", type: "address" },
          { name: "quote", type: "address" },
          { name: "maxAdverseBps", type: "uint16" },
          { name: "absoluteRate", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "FloorLowering",
      message: { recipient: VAULT, base: WETH, quote: TUSDC, maxAdverseBps: bps, absoluteRate: 0n, nonce: lowerNonce, deadline },
    });
    if (lowerDigest !== local) stop(`the registry's domain gives ${lowerDigest}, EIP-712 gives ${local}`);
    const gas = await client.getBalance({ address: registryGuardian });
    console.log(`  backstop: ${absolute} -> 0, keeping the ${bps} bps relative floor; digest agrees with the registry's domain`);
    console.log(`  the guardian sends that transaction and holds ${gas} wei of Base Sepolia ETH for it`);
    if (gas === 0n) stop("the guardian has no gas for the lowering; fund it from a faucet first");
  } else {
    console.log(`  backstop: ${LOWER_BACKSTOP ? `already ${absolute}, nothing to lower` : "left as it is (LOWER_BACKSTOP=0)"}`);
  }

  if (DRY_RUN) {
    console.log("\n[switch-on] dry run: every check passed and nothing was signed or sent.");
    return;
  }

  // --- sign, recover, send --------------------------------------------------------------------------------
  console.log(`\n[switch-on] ${planned.length + (lowering ? 1 : 0)} signatures follow; cast asks for the keystore password at each.`);
  const signed = [];
  for (const p of planned) {
    const signature = castSign(p.digest);
    const signer = await recoverAddress({ hash: p.digest, signature });
    if (!same(signer, guardian)) stop(`"${ACCOUNT}" is ${signer}, but the vault's guardian is ${guardian}; set GUARDIAN_ACCOUNT`);
    signed.push({
      vault: VAULT,
      signature,
      message: {
        delegate: p.message.delegate,
        app: p.message.app,
        tokens: p.message.tokens,
        maxAmounts: p.message.maxAmounts.map(String),
        nonce: p.message.nonce.toString(),
        expiry: p.message.expiry.toString(),
      },
    });
    console.log(`  nonce ${p.message.nonce} signed`);
  }

  const res = await fetch(`${API}/api/mandates`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signed) });
  const body = (await res.json()) as { accepted?: number; rejected?: { nonce: string | null; reason: string }[] };
  console.log(`[switch-on] /api/mandates: HTTP ${res.status}, accepted ${body.accepted ?? 0}`);
  for (const r of body.rejected ?? []) console.log(`  refused nonce ${r.nonce}: ${r.reason}`);
  if ((body.accepted ?? 0) === 0) stop("no mandate was accepted");

  if (lowering && lowerDigest) {
    const signature = castSign(lowerDigest);
    const signer = await recoverAddress({ hash: lowerDigest, signature });
    if (!same(signer, registryGuardian)) stop(`the lowering was signed by ${signer}, the registry guardian is ${registryGuardian}`);
    const passwordFile = process.env.KEYSTORE_PASSWORD_FILE;
    const sent = spawnSync(
      "cast",
      [
        "send", REGISTRY, "lowerFloor(address,address,address,uint16,uint256,uint256,uint256,bytes)",
        VAULT, WETH, TUSDC, String(bps), "0", lowerNonce.toString(), deadline.toString(), signature,
        "--rpc-url", RPC, "--account", ACCOUNT, ...(passwordFile ? ["--password-file", passwordFile] : []),
      ],
      { stdio: "inherit" },
    );
    if (sent.status !== 0) stop("the lowering transaction failed");
    const [floorRate] = await read<[bigint, boolean]>(REGISTRY, REGISTRY_ABI, "effectiveFloor", [VAULT, WETH, TUSDC]);
    console.log(`[switch-on] effective floor now ${floorRate} (the ${bps} bps relative floor alone)`);
  }

  const keystore = env("DELEGATE_ACCOUNT", "subfloor-delegate");
  console.log(`
[switch-on] done on the vault's side. The last step is the agent's key, by hand:
  1. check the keystore is the delegate:   cast wallet address --account ${keystore}
     (it must print ${delegate}; set DELEGATE_ACCOUNT if yours is named differently)
  2. print its private key:                cast wallet decrypt-keystore ${keystore}
  3. paste it into Railway -> agent -> Variables -> SUBFLOOR_DELEGATE_KEY
The agent restarts, finds these mandates, retires the vault's older books and recentres the newest.`);
}

await main();
