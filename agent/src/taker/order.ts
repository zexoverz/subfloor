import { decodeAbiParameters, encodeAbiParameters, type Address, type Hex } from "viem";

/// Reading a live order off the chain instead of rebuilding it.
///
/// `Aqua.ship` emits the whole order in `Shipped.strategy` as `abi.encode(order)`, and Aqua keys
/// inventory by `keccak256` of exactly those bytes. Rebuilding the order off-chain means matching it
/// byte for byte — the traits word carries `tokenA`, `tokenB` and the Aqua flag, and the program has
/// to be regenerated with the same parameters. Getting any of it wrong produces an order that hashes
/// differently, finds no Aqua balance, and quotes zero. That happened, and it looked like an empty
/// book rather than like a bug.
///
/// So the taker does not rebuild anything. It takes the emitted blob, decodes enough to know what
/// pair it is looking at, and hands the same bytes back to `swap`.

/// `abi.encode(order)` encodes the struct as a **dynamic tuple**, so the blob opens with a head
/// offset (`0x20`) rather than with the maker. Decoding it as three flat parameters reads that
/// offset as the maker address and produces `0x…0020`, which is a plausible-looking address and not
/// a decoding error — the sort of wrong that reaches a dashboard.
export const ORDER_ABI = [
  {
    type: "tuple",
    components: [
      { type: "address", name: "maker" },
      { type: "uint256", name: "traits" },
      { type: "bytes", name: "data" },
    ],
  },
] as const;

/// Bit layout from `src/libs/MakerTraits.sol`. Only what the taker needs to read.
const USE_AQUA_FLAG = 1n << 254n;

export interface Order {
  maker: Address;
  traits: bigint;
  data: Hex;
}

export interface LiveOrder extends Order {
  /// Re-encoded exactly as emitted. This is what `swap` takes and what Aqua hashed.
  encoded: Hex;
  usesAqua: boolean;
}

export function decodeShipped(blob: Hex): LiveOrder {
  const [order] = decodeAbiParameters(ORDER_ABI, blob) as unknown as [
    { maker: Address; traits: bigint; data: Hex },
  ];
  return {
    maker: order.maker,
    traits: order.traits,
    data: order.data,
    encoded: encodeAbiParameters(ORDER_ABI, [order] as never),
    usesAqua: (order.traits & USE_AQUA_FLAG) !== 0n,
  };
}

/// `tokenA` and `tokenB` are the **first forty bytes of `data`**, not fields in the traits word —
/// `MakerTraitsLib.build` writes `abi.encodePacked(tokenA, tokenB)` at the front and the program
/// after it. The traits word's low 160 bits are the `receiver`, which is a different address
/// entirely and reads as a perfectly plausible token if you take it for one.
///
/// The curve reads direction from `tokenIn < tokenOut`, which is about the sorted pair rather than
/// which token a person would name first. Getting it backwards quotes the other side of the book,
/// and that reads as a pricing bug rather than as a decoding one.
export function pairOf(data: Hex): { tokenA: Address; tokenB: Address } {
  if (data.length < 2 + 80) throw new Error(`order data too short to carry a pair: ${data.length}`);
  return {
    tokenA: `0x${data.slice(2, 42)}` as Address,
    tokenB: `0x${data.slice(42, 82)}` as Address,
  };
}

export function isAToB(data: Hex, tokenIn: Address): boolean {
  return pairOf(data).tokenA.toLowerCase() === tokenIn.toLowerCase();
}
