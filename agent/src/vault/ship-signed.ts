/// Ship a book against a mandate that was signed somewhere else — the interface, a device, a queue.
///
/// The forge scripts cannot do this. `ShipTestnetBook.s.sol` and `ShipComposedProgram.s.sol` both
/// build the mandate themselves with hardcoded caps (`1e18` / `1_000_000e6`), so they can only spend
/// a signature over *their* struct. A mandate signed in the interface carries `maxAmounts` equal to
/// the vault's inventory at signing time, which is a different struct and therefore a different
/// digest. This takes the mandate as it was signed and ships that.
///
/// The signature is checked against the vault's guardian before anything is broadcast: recovering
/// locally costs nothing, and a bad one otherwise burns a transaction to learn `BadMandateSignature`.
import { createPublicClient, createWalletClient, http, verifyTypedData, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { composeBook } from "../compose/book.ts";
import { readIndex } from "../market/index-reads.ts";
import { shipCalldata, type Mandate } from "./ship.ts";
import { MANDATE_TYPES } from "./mandates.ts";

const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

/// The stored shape the interface writes to `localStorage` under `subfloor.mandate`.
interface StoredMandate {
  vault: Address;
  delegate: Address;
  nonce: string;
  signature: Hex;
  message: {
    delegate: Address;
    app: Address;
    tokens: Address[];
    maxAmounts: string[];
    nonce: string;
    expiry: string;
  };
}

const VAULT_ABI = [
  { type: "function", name: "guardian", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "mandateUsed",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export async function run(): Promise<void> {
  const stored = JSON.parse(need("SUBFLOOR_STORED_MANDATE")) as StoredMandate;
  const rpc = process.env.SUBFLOOR_RPC ?? "https://sepolia.base.org";
  const account = privateKeyToAccount(need("SUBFLOOR_DELEGATE_KEY") as Hex);

  const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(rpc) });

  const vault = stored.vault;
  const mandate: Mandate = {
    delegate: stored.message.delegate,
    app: stored.message.app,
    tokens: stored.message.tokens,
    maxAmounts: stored.message.maxAmounts.map(BigInt),
    nonce: BigInt(stored.message.nonce),
    expiry: BigInt(stored.message.expiry),
  };

  // The delegate in the mandate is compared against `msg.sender`, so a mismatch here is a revert
  // that costs a transaction to discover.
  if (mandate.delegate.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`the mandate names delegate ${mandate.delegate}, but this key is ${account.address}`);
  }

  const guardian = await client.readContract({ address: vault, abi: VAULT_ABI, functionName: "guardian" });
  const valid = await verifyTypedData({
    address: guardian,
    domain: { name: "SUBFLOOR AquaGuardVault", version: "1", chainId: baseSepolia.id, verifyingContract: vault },
    types: MANDATE_TYPES,
    primaryType: "Mandate",
    message: mandate,
    signature: stored.signature,
  });
  if (!valid) throw new Error(`the signature does not recover to the vault's guardian ${guardian}`);
  console.log(`[mandate] valid, signed by the guardian ${guardian}, nonce ${mandate.nonce}`);

  if (await client.readContract({ address: vault, abi: VAULT_ABI, functionName: "mandateUsed", args: [mandate.nonce] })) {
    throw new Error(`mandate nonce ${mandate.nonce} is already used; one mandate is one ship`);
  }

  /*
   * The reference, in raw quote units per raw base unit — the convention the curve works in, see
   * policy/loop.ts.
   *
   * `SUBFLOOR_REFERENCE_RAW` is an override for this manual tool and nothing else. It exists because
   * Studio rate-limits, and a hand-run ship that cannot read the index should say where it got its
   * number rather than fail or, worse, quietly reach for a second source. The policy loop has no
   * such door: when the index is unreadable it docks, and that must stay true — the whole argument
   * for putting the index in the trading path is that its absence stops trading rather than
   * degrading into a version nobody tested.
   */
  const override = process.env.SUBFLOOR_REFERENCE_RAW;
  let referencePrice: bigint;
  if (override) {
    referencePrice = BigInt(override);
    console.log(`[reference] OVERRIDE ${referencePrice} — supplied by hand, not read from the index`);
  } else {
    const index = await readIndex(need("SUBFLOOR_SUBGRAPH"));
    if (!index.reference) throw new Error("the index has no reference answer; refusing to centre a book on a guess");
    referencePrice = (index.reference.answer * 10n ** 6n) / 10n ** 8n;
    console.log(`[index] reference ${index.reference.answer} -> raw ${referencePrice}`);
  }

  const program = composeBook({
    referencePrice,
    spreadBps: Number(process.env.POLICY_SPREAD_BPS ?? 50),
    feeBps: Number(process.env.POLICY_FEE_BPS ?? 3000),
    decayPeriodSeconds: Number(process.env.POLICY_DECAY_SECONDS ?? 600),
    salt: BigInt(process.env.SUBFLOOR_SALT ?? Math.floor(Date.now() / 1000)),
  });
  console.log(`[compose] ${program}`);

  // Ship inside the caps rather than at them: the mandate authorises the inventory, and shipping
  // every last unit leaves nothing for the approval accounting to round against.
  const amounts = mandate.tokens.map((_, i) => (mandate.maxAmounts[i] * 8n) / 10n);

  const calldata = shipCalldata({
    app: mandate.app,
    tokens: [...mandate.tokens],
    amounts,
    mandate,
    signature: stored.signature,
    maker: vault,
    tokenA: mandate.tokens[0],
    tokenB: mandate.tokens[1],
    program,
    useAquaInsteadOfSignature: true,
  });

  const hash = await wallet.sendTransaction({ to: vault, data: calldata });
  console.log(`[ship] ${hash}`);
  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log(`[ship] status ${receipt.status}, gas ${receipt.gasUsed}, block ${receipt.blockNumber}`);
  if (receipt.status !== "success") throw new Error("the ship reverted");
}

if (process.argv[1]?.endsWith("ship-signed.ts")) await run();
