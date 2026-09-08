import { concat, address as addressBytes, hex, ProgramError, type Hex } from "./program.ts";

/// Building a maker order, which is the half of the wire format the SDK was missing.
///
/// `sdk/program.ts` composes the bytecode and the taker bot decodes orders off the chain, but
/// nothing here could *make* one — so an agent that is not ours could compose a position and had no
/// way to ship it without writing Foundry scripts. This is the TypeScript side of
/// `contracts/src/libs/MakerTraits.sol:build`, and the tests check it against the traits word an
/// order actually carries on Base Sepolia rather than against another value this file produced.

/// Bit flags, from `MakerTraitsLib`. Only the ones a book needs are exposed; the hook flags exist in
/// the layout and are deliberately not surfaced, because a hook order needs the hook data laid out
/// in `data` too and half an implementation of that is worse than none.
const SHOULD_UNWRAP_WETH = 1n << 255n;
const USE_AQUA_INSTEAD_OF_SIGNATURE = 1n << 254n;
const ALLOW_ZERO_AMOUNT_IN = 1n << 253n;

const SLICE_INDEXES_OFFSET = 160n;

/// Where `data` starts carrying anything but the token pair. Twenty bytes each, and the program
/// follows immediately when there are no hooks.
const PAIR_BYTES = 40;

export interface Order {
  maker: Hex;
  traits: bigint;
  data: Hex;
}

export interface OrderArgs {
  maker: string;
  /// `tokenA` must sort below `tokenB`. The contract requires it and so does this, rather than
  /// sorting silently: a caller who passes them the wrong way round has a bug about which token is
  /// which, and reordering hides it.
  tokenA: string;
  tokenB: string;
  program: Hex;
  /// Defaults to the maker, which is what `address(0)` means on chain.
  receiver?: string;
  /// Aqua holds the inventory and authorises the fill, so no maker signature is checked. Every
  /// SUBFLOOR book sets this; an order with it unset ships and hashes fine and can never fill,
  /// because the router takes the signature path and finds no Aqua balance under a different hash.
  useAquaInsteadOfSignature?: boolean;
  shouldUnwrapWeth?: boolean;
  allowZeroAmountIn?: boolean;
}

export function buildOrder(args: OrderArgs): Order {
  const a = args.tokenA.toLowerCase();
  const b = args.tokenB.toLowerCase();
  if (a >= b) throw new ProgramError(`tokenA must sort below tokenB: ${args.tokenA} >= ${args.tokenB}`);
  if (!args.program.startsWith("0x")) throw new ProgramError("program must be 0x-prefixed");

  // No hooks, so every slice index is the end of the token pair and the program runs from there to
  // the end of `data`. Packed high to low: index3, index2, index1, index0.
  const idx = BigInt(PAIR_BYTES);
  const sliceIndexes = (idx << 48n) | (idx << 32n) | (idx << 16n) | idx;

  const receiver = BigInt(args.receiver ?? "0x0000000000000000000000000000000000000000");

  let traits = (sliceIndexes << SLICE_INDEXES_OFFSET) | receiver;
  if (args.useAquaInsteadOfSignature !== false) traits |= USE_AQUA_INSTEAD_OF_SIGNATURE;
  if (args.shouldUnwrapWeth) traits |= SHOULD_UNWRAP_WETH;
  if (args.allowZeroAmountIn) traits |= ALLOW_ZERO_AMOUNT_IN;

  const data = hex(
    concat([addressBytes(args.tokenA), addressBytes(args.tokenB), Uint8Array.from(Buffer.from(args.program.slice(2), "hex"))]),
  );

  return { maker: args.maker as Hex, traits, data };
}

/// Where the program starts inside `data`, read out of the traits the way `_getDataSlice` does.
///
/// Exposed because it is the one piece of this layout that cannot be assumed: an order built by hand
/// with `traits = 0` puts the program at zero, and both shapes are live on Base Sepolia.
export function programOffset(traits: bigint): number {
  return Number((traits >> (SLICE_INDEXES_OFFSET + 48n)) & 0xffffn);
}

export function programOf(order: Order): Hex {
  const offset = programOffset(order.traits);
  return (`0x${order.data.slice(2 + offset * 2)}`) as Hex;
}

/// The token pair, which sits in front of the program and is not part of it.
export function pairOf(order: Order): { tokenA: Hex; tokenB: Hex } {
  return {
    tokenA: (`0x${order.data.slice(2, 42)}`) as Hex,
    tokenB: (`0x${order.data.slice(42, 82)}`) as Hex,
  };
}
