import { Bytes, ethereum } from "@graphprotocol/graph-ts";
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
  /// True when the blob was an ABI-encoded `ISwapVM.Order` and the program came out of its `data`
  /// field; false when the blob was taken as raw bytecode.
  wrappedInOrder: bool;
  maker: string;

  constructor(program: Bytes, wrappedInOrder: bool, maker: string) {
    this.program = program;
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
  const decoded = ethereum.decode("(address,uint256,bytes)", blob);
  if (decoded != null) {
    const tuple = decoded.toTuple();
    if (tuple.length == 3) {
      return new Shipped(tuple[2].toBytes(), true, tuple[0].toAddress().toHexString());
    }
  }
  return new Shipped(blob, false, "");
}
