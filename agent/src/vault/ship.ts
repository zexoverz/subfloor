import { encodeAbiParameters, encodeFunctionData, type Address, type Hex } from "viem";
import { buildOrder, type OrderArgs } from "../../../sdk/src/index.ts";

/// Shipping a position from TypeScript, which is what a vault owner's own agent needs and what this
/// repo only had in Foundry scripts.
///
/// `AquaGuardVault.ship` is one of four calls the delegate may make, and the only one that puts
/// inventory behind a quote. Everything it needs is here: the order encoded the way `Aqua.ship`
/// carries it, the token amounts, and the mandate the guardian signed on a device.
///
/// The mandate is the part worth understanding. The owner signs it once, bounding which tokens the
/// agent may commit and how much of each, with a nonce and an expiry. After that the agent holds
/// only the delegate key and that signature, and never needs the device again until the mandate is
/// used up. One device moment, then autonomy inside stated bounds.

export interface Mandate {
  delegate: Address;
  app: Address;
  tokens: Address[];
  maxAmounts: bigint[];
  nonce: bigint;
  expiry: bigint;
}

/// `abi.encode(order)` — a struct with a dynamic member, so the encoding leads with an offset word.
///
/// Reproduced here rather than assembled by hand because the subgraph's decoder was written against
/// a hand-made blob whose `data` had no token pair in front of it, and the two agreed with each
/// other while disagreeing with Aqua. The test pins this against a blob the chain emitted.
export function encodeShippedOrder(order: { maker: Hex; traits: bigint; data: Hex }): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "maker", type: "address" },
          { name: "traits", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    [{ maker: order.maker as Address, traits: order.traits, data: order.data }],
  );
}

const VAULT_SHIP_ABI = [
  {
    type: "function",
    name: "ship",
    stateMutability: "nonpayable",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategy", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
      {
        name: "mandate",
        type: "tuple",
        components: [
          { name: "delegate", type: "address" },
          { name: "app", type: "address" },
          { name: "tokens", type: "address[]" },
          { name: "maxAmounts", type: "uint256[]" },
          { name: "nonce", type: "uint256" },
          { name: "expiry", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "strategyHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "dock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "tokens", type: "address[]" },
    ],
    outputs: [],
  },
] as const;

export interface ShipArgs extends OrderArgs {
  app: Address;
  tokens: Address[];
  amounts: bigint[];
  mandate: Mandate;
  signature: Hex;
}

export class ShipError extends Error {}

/// The calldata for `vault.ship`. Returned rather than sent, so the caller decides how it is signed
/// — a bot with a hot key, a queue, or a human clicking a wallet all want the same bytes.
export function shipCalldata(args: ShipArgs): Hex {
  if (args.tokens.length !== args.amounts.length) {
    throw new ShipError(`tokens and amounts must be the same length: ${args.tokens.length} vs ${args.amounts.length}`);
  }
  if (args.mandate.tokens.length !== args.mandate.maxAmounts.length) {
    throw new ShipError("the mandate's tokens and maxAmounts must be the same length");
  }
  if (args.mandate.app.toLowerCase() !== args.app.toLowerCase()) {
    throw new ShipError(`the mandate authorises app ${args.mandate.app}, not ${args.app}`);
  }

  // Checked here rather than left to revert on chain: `AmountAboveMandate` after a broadcast costs a
  // transaction and a nonce, and the cap is knowable before sending.
  for (let i = 0; i < args.tokens.length; i++) {
    const j = args.mandate.tokens.findIndex((t) => t.toLowerCase() === args.tokens[i].toLowerCase());
    if (j === -1) throw new ShipError(`the mandate does not cover ${args.tokens[i]}`);
    if (args.amounts[i] > args.mandate.maxAmounts[j]) {
      throw new ShipError(`${args.tokens[i]}: ${args.amounts[i]} is above the mandate cap ${args.mandate.maxAmounts[j]}`);
    }
  }

  const order = buildOrder(args);
  return encodeFunctionData({
    abi: VAULT_SHIP_ABI,
    functionName: "ship",
    args: [args.app, encodeShippedOrder(order), args.tokens, args.amounts, args.mandate, args.signature],
  });
}

/// Stopping a strategy. Reachable by the delegate, a dock operator or the owner, because docking can
/// only stop trading and never worsen a price — the fail-safe direction, so software may hold it.
export function dockCalldata(app: Address, strategyHash: Hex, tokens: Address[]): Hex {
  return encodeFunctionData({ abi: VAULT_SHIP_ABI, functionName: "dock", args: [app, strategyHash, tokens] });
}
