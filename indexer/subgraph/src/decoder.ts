import { Bytes } from "@graphprotocol/graph-ts";
import { opcodeName } from "./opcodes";

/// Decodes a SwapVM program into its instructions.
///
/// The format is the run loop's own, read off `src/libs/VM.sol::runLoop`: one byte of opcode, one
/// byte of args length, then that many bytes of args, repeated to the end. `runLoop` reverts with
/// `RunLoopExceedProgramLength` when a length runs past the end, and this mirrors that rather than
/// reading whatever follows — a program the VM would refuse to run must not be rendered here as
/// though it were fine.

export class Step {
  opcode: i32;
  name: string;
  args: Bytes;

  constructor(opcode: i32, name: string, args: Bytes) {
    this.opcode = opcode;
    this.name = name;
    this.args = args;
  }
}

export class Program {
  steps: Step[];
  /// Empty when the whole program decoded. Set when the bytes ran out mid-instruction, in which case
  /// `steps` holds everything decoded before that point.
  error: string;

  constructor(steps: Step[], error: string) {
    this.steps = steps;
    this.error = error;
  }
}

export function decode(program: Bytes): Program {
  const steps: Step[] = [];
  let pc = 0;

  while (pc < program.length) {
    if (pc + 2 > program.length) {
      return new Program(steps, "truncated: opcode without an args length at byte " + pc.toString());
    }
    // `Bytes[i]` is a u8; widen both before any arithmetic, or the comparisons below mix widths.
    const opcode = program[pc] as i32;
    const argsLen = program[pc + 1] as i32;
    pc += 2;

    if (pc + argsLen > program.length) {
      return new Program(
        steps,
        "truncated: instruction at byte " +
          (pc - 2).toString() +
          " declares " +
          argsLen.toString() +
          " args bytes, " +
          (program.length - pc).toString() +
          " remain",
      );
    }

    const args = new Uint8Array(argsLen);
    for (let i = 0; i < argsLen; i++) args[i] = program[pc + i];
    pc += argsLen;

    steps.push(new Step(opcode, opcodeName(opcode), Bytes.fromUint8Array(args)));
  }

  return new Program(steps, "");
}

/// The curve families, in the words an interface shows a person. §10's live view names strategies
/// as "quoting both sides", "TWAP exit" and "auction rebalance" — never opcode names, never bytecode
/// — and this is where that translation is made once instead of in every consumer.
export function familiesOf(steps: Step[]): string[] {
  const families: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const op = steps[i].opcode;
    let f = "";
    if (op == 0x9d) f = "TWAP";
    else if (op == 0x94 || op == 0x95) f = "DUTCH_AUCTION";
    else if (op == 0x51) f = "CONCENTRATED";
    else if (op == 0x50) f = "XYC";
    else if (op == 0x53 || op == 0x54) f = "LIMIT";
    else if (op == 0x58) f = "PEGGED";
    if (f.length > 0 && families.indexOf(f) < 0) families.push(f);
  }

  return families;
}

/// The one family to lead with. A shared-inventory book runs several at once, so the order here is
/// the order a person would describe it in: the shape of the book first, the exit and healing
/// behaviours after.
export function classify(families: string[]): string {
  const order = ["CONCENTRATED", "XYC", "PEGGED", "LIMIT", "TWAP", "DUTCH_AUCTION"];
  for (let i = 0; i < order.length; i++) {
    if (families.indexOf(order[i]) >= 0) return order[i];
  }
  return "UNKNOWN";
}

/// What a `Shipped` blob turned out to be.
export class Shipped {
  program: Bytes;
  /// The ordered pair the order trades, from the first 40 bytes of `data`. Empty when the blob was
  /// taken as raw bytecode.
  pair: Bytes;
  /// True when the blob was an ABI-encoded `ISwapVM.Order` and the program came out of its `data`
  /// field; false when the blob was taken as raw bytecode.
  wrappedInOrder: bool;
  maker: string;

  constructor(program: Bytes, wrappedInOrder: bool, maker: string, pair: Bytes = Bytes.empty()) {
    this.program = program;
    this.pair = pair;
    this.wrappedInOrder = wrappedInOrder;
    this.maker = maker;
  }
}

/// Pulls the program out of what `Aqua.ship` actually carries.
///
/// `AquaGuardVault.ship` sends `abi.encode(order)`, and `ISwapVM.Order` is
/// `(address maker, MakerTraits traits, bytes data)` — the program is in `data`. Decoding the blob
/// directly as `[opcode][argsLen][args]` reads the maker's address as the first two instructions
/// and produces a plausible-looking program nobody sent, which is worse than failing.
///
/// A maker that is not our vault may ship raw bytecode instead, so an unwrappable blob is taken at
/// face value rather than dropped — and which shape it was is recorded rather than guessed at.
export function unwrapShipped(blob: Bytes): Shipped {
  // Parsed by hand rather than through `ethereum.decode`.
  //
  // `abi.encode(order)` has a fixed shape and reading it directly is a dozen lines, whereas
  // `ethereum.decode` is a host function whose behaviour on a tuple containing dynamic `bytes`
  // differs between graph-node and the local test host — which is the worst possible place for a
  // difference, because it passes locally and strands the subgraph in production.
  //
  // The layout, from `abi.encode` of `(address maker, uint256 traits, bytes data)`:
  //
  //   [  0.. 32)  offset to the tuple, always 0x20
  //   [ 32.. 64)  maker, left-padded
  //   [ 64.. 96)  traits
  //   [ 96..128)  offset to `data`, relative to the tuple start at 32
  //   [128..160)  length of `data`          (when that offset is the usual 0x60)
  //   [160..   )  the program
  if (blob.length < 160) return new Shipped(blob, false, "");

  const tupleAt = readU32(blob, 0);
  if (tupleAt != 32) return new Shipped(blob, false, "");

  const dataAt = tupleAt + readU32(blob, tupleAt + 64);
  if (dataAt + 32 > blob.length) return new Shipped(blob, false, "");

  const length = readU32(blob, dataAt);
  if (dataAt + 32 + length > blob.length) return new Shipped(blob, false, "");

  // Where the program starts is not a constant, it is in the traits — and both shapes are on chain.
  //
  // `MakerTraitsLib` packs four 16-bit slice indexes starting at bit 160, and the program runs from
  // the fourth of them to the end of `data`. For an order built by the library that index is 40,
  // because `tokenA` and `tokenB` occupy the first forty bytes. For an order assembled by hand with
  // `traits = 0` every index is zero and `data` is the program alone.
  //
  // Both exist on this deployment: the book shipped before the builder was used has `traits = 0`,
  // and hardcoding either answer misreads the other. Bit 160 + 16*3 lands on bytes 4 and 5 of the
  // traits word, big-endian.
  const traitsAt = tupleAt + 32;
  const programStart: i32 = (i32(blob[traitsAt + 4]) << 8) | i32(blob[traitsAt + 5]);
  if (programStart > length) return new Shipped(blob, false, "");

  const programLength = length - programStart;
  const out = new Uint8Array(programLength);
  for (let i = 0; i < programLength; i++) out[i] = blob[dataAt + 32 + programStart + i];

  const pairLength: i32 = programStart >= 40 ? 40 : 0;
  const pairBytes = new Uint8Array(pairLength);
  for (let i = 0; i < pairBytes.length; i++) pairBytes[i] = blob[dataAt + 32 + i];

  let maker = "0x";
  for (let i = 12; i < 32; i++) {
    const b = blob[tupleAt + i];
    maker += (b < 16 ? "0" : "") + b.toString(16);
  }

  return new Shipped(Bytes.fromUint8Array(out), true, maker, Bytes.fromUint8Array(pairBytes));
}

/// Reads the low 32 bits of the 32-byte word at `at`. Every offset and length in this layout is far
/// below 2^32, and anything that is not is not an order we can read anyway.
function readU32(b: Bytes, at: i32): i32 {
  if (at + 32 > b.length) return -1;
  for (let i = 0; i < 28; i++) {
    if (b[at + i] != 0) return -1;
  }
  return (
    ((b[at + 28] as i32) << 24) |
    ((b[at + 29] as i32) << 16) |
    ((b[at + 30] as i32) << 8) |
    (b[at + 31] as i32)
  );
}
