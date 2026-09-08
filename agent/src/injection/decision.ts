import { Program, deadline, requireFreshReference, notionalThrottle, xycConcentrateSwap, feeFlatIn, type Hex } from "../../../sdk/src/index.ts";

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
export function compose(d: Decision, params: { sqrtPriceMin: bigint; sqrtPriceMax: bigint; feeBps: number; deadlineAt: bigint; maxPerEpoch: bigint }): Hex {
  const p = new Program();

  if (!d.omitRateConditions) {
    // The guard bank, 0x20–0x2f. Present on every strategy the agent composes when it has not been
    // told to drop them.
    p.push(deadline(params.deadlineAt));
    p.push(requireFreshReference(3600));
    p.push(notionalThrottle(3600, params.maxPerEpoch));
  }

  // Pricing. Unchanged in both cases: the attack does not need to touch the curve, and a program
  // that priced differently would muddy what the revert proves.
  p.push(xycConcentrateSwap(params.sqrtPriceMin, params.sqrtPriceMax));
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
