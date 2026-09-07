import type { Address, Hex } from "viem";

/// Builds the taker's half of a swap, matching `src/libs/TakerTraits.sol::build`.
///
/// Only the shape an externally owned account can use. The contract tests take with a
/// pre-transfer-in callback, which needs the taker to be a contract; an EOA has
/// `useTransferFromAndAquaPush`, where the router pulls `amountIn` with `transferFrom` after an
/// approval and pushes it to Aqua itself.
///
/// The layout is ten `uint16` slice indexes, then a `uint16` of flags, then the optional slices in
/// order. With no threshold, no custom `to`, no deadline and no hook or callback data, every index
/// is zero — so the whole thing is twenty zero bytes followed by the flags.
///
/// **The taker address is not in here.** `args.taker` is only used to decide whether `to` needs
/// writing; the taker at settlement is `msg.sender`. Encoding an address into these bytes produces
/// something that decodes as slice indexes pointing far past the end.

const IS_EXACT_IN = 0x0001;
const SHOULD_UNWRAP = 0x0002;
const HAS_PRE_TRANSFER_IN_CALLBACK = 0x0004;
const HAS_PRE_TRANSFER_OUT_CALLBACK = 0x0008;
const IS_STRICT_THRESHOLD = 0x0010;
const IS_FIRST_TRANSFER_FROM_TAKER = 0x0020;
const USE_TRANSFER_FROM_AND_AQUA_PUSH = 0x0040;
const IS_A_TO_B = 0x0080;
const ALLOW_PARTIAL_FILL = 0x0100;

export interface TakerArgs {
  isAToB: boolean;
  isExactIn?: boolean;
  allowPartialFill?: boolean;
}

export function buildTakerData(args: TakerArgs): Hex {
  let flags = USE_TRANSFER_FROM_AND_AQUA_PUSH;
  if (args.isExactIn ?? true) flags |= IS_EXACT_IN;
  if (args.isAToB) flags |= IS_A_TO_B;
  if (args.allowPartialFill) flags |= ALLOW_PARTIAL_FILL;

  const indexes = "00".repeat(20);
  return `0x${indexes}${flags.toString(16).padStart(4, "0")}` as Hex;
}

export const FLAGS = {
  IS_EXACT_IN,
  SHOULD_UNWRAP,
  HAS_PRE_TRANSFER_IN_CALLBACK,
  HAS_PRE_TRANSFER_OUT_CALLBACK,
  IS_STRICT_THRESHOLD,
  IS_FIRST_TRANSFER_FROM_TAKER,
  USE_TRANSFER_FROM_AND_AQUA_PUSH,
  IS_A_TO_B,
  ALLOW_PARTIAL_FILL,
};

export type { Address };
