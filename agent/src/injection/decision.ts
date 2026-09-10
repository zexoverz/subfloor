import { Program, deadline, requireFreshReference, notionalThrottle, xycConcentrateSwap, feeFlatIn, type Hex } from "../../../sdk/src/index.ts";
import { bounds as boundsOf } from "../compose/book.ts";

/// What the agent decided to do, in the only vocabulary the composer accepts.
///
/// `omitRateConditions` is the field the attack is aiming at. The payload does not ask for a
/// transfer to an attacker address — that would be caught by the mandate, and a demo of the mandate
/// catching it proves only that allowlists work. It asks the agent to drop its own protections,
/// which is the request an obedient agent can actually carry out.
export interface Decision {
  action: "requote" | "sell_all" | "hold";
  omitRateConditions: boolean;
  /// Free text the model gave for why. Recorded, never executed.
  rationale: string;
}

export interface ComposeParams {
  /// Raw-unit reference the book is centred on, before any decision is applied.
  referencePrice: bigint;
  spreadBps: number;
  feeBps: number;
  deadlineAt: bigint;
  maxPerEpoch: bigint;
  /// How far below the reference `sell_all` centres the book, in bps. The payload says "at any
  /// available price", and this is what that becomes in a curve.
  dumpBps?: number;
}

/// The composer: a decision becomes SwapVM bytecode.
///
/// This is the whole hinge of the harness, so it is worth being exact about what it does and does
/// not do. It refuses nothing. There is no filter here that inspects the decision and declines a
/// dangerous one, because the argument SUBFLOOR is making is that such a filter is not what keeps
/// the money safe. A poisoned agent composes exactly the program it was told to compose, ships it,
/// and the fill is refused at settlement anyway.
///
/// So: `omitRateConditions` produces a program with an empty guard bank. Pricing opcodes only.
/// The program is well-formed, ships without complaint, and quotes. It simply cannot make the
/// settlement guard go away, because the floor was never one of its instructions.
export function compose(d: Decision, params: ComposeParams): Hex {
  const p = new Program();

  if (!d.omitRateConditions) {
    // The guard bank, 0x20–0x2f. Present on every strategy the agent composes when it has not been
    // told to drop them.
    p.push(deadline(params.deadlineAt));
    p.push(requireFreshReference(3600));
    p.push(notionalThrottle(3600, params.maxPerEpoch));
  }

  // Pricing, and this is the other half of the payload.
  //
  // "Sell all WETH immediately at any available price" is not a guard instruction, it is a price.
  // An earlier version of this composer read only `omitRateConditions` and priced `sell_all` exactly
  // like a normal requote — which produced a guard-free book that quoted sensibly, filled, and
  // demonstrated nothing. The harness could not produce the refusal it exists to show.
  //
  // A book centred below the reference is what dumping looks like on a curve: the maker offers fewer
  // quote units per base unit than the market says they are worth. Settlement then refuses it
  // against the floor **without anyone arming anything** — the attacker's own program is what fails,
  // which is a much better demo than a floor someone raised on cue.
  const centre =
    d.action === "sell_all"
      ? (params.referencePrice * BigInt(10_000 - (params.dumpBps ?? 500))) / BigInt(10_000)
      : params.referencePrice;

  const { lo, hi } = boundsOf(centre, params.spreadBps);
  p.push(xycConcentrateSwap(lo, hi));
  p.push(feeFlatIn(params.feeBps));

  return p.hex();
}

/// Guard opcodes occupy 0x20–0x2f. Reading them back off composed bytecode is how the harness shows
/// on camera that the guard bank is empty, rather than asserting it in a voiceover.
export function guardOpcodes(program: Hex): number[] {
  const bytes = Buffer.from(program.slice(2), "hex");
  const out: number[] = [];
  for (let i = 0; i < bytes.length; ) {
    const op = bytes[i];
    const len = bytes[i + 1];
    if (len === undefined) break;
    if (op >= 0x20 && op <= 0x2f) out.push(op);
    i += 2 + len;
  }
  return out;
}
