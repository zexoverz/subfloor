import { Program, salt, decay, feeFlatIn, xycConcentrateSwap, type Hex } from "../../../sdk/src/index.ts";

/// The composer: live market state becomes shippable SwapVM bytecode.
///
/// It emits the same four instructions `ConcentratedBook.build` emits for these parameters, in the
/// same order, and there is a test that asserts the bytes rather than trusting the reading. That
/// check is worth having because the two are written in different languages against the same wire
/// format, and a disagreement between them is a disagreement about what the chain will run.
export interface BookParams {
  /// Raw-unit reference: how many raw quote units one raw base unit buys, times 1e18. WETH/tUSDC at
  /// 2500 is `2500e6`, not `2500e18` — the curve works on raw balances and does not know the tokens
  /// have different decimals.
  referencePrice: bigint;
  /// Half-width of the range, in bps.
  spreadBps: number;
  /// Maker spread income on top of the curve, taken in `tokenIn`.
  feeBps: number;
  /// Seconds over which the counter-swap offset decays.
  decayPeriodSeconds: number;
  /// Distinguishes two books with identical parameters.
  salt: bigint;
}

/// `sqrt(price * (1 ± spread))` in 1e18 fixed point, mirroring `ConcentratedBook.bounds`:
///
///     sqrtPriceMin = sqrt(mulDiv(referencePrice, (BPS - spreadBps) * ONE, BPS))
///
/// The scaling happens inside the multiplication, not after the division. Dividing first and then
/// multiplying by 1e18 throws away the remainder before it can be scaled up, and the composed
/// bounds come out a few thousand wei below the contract's — enough that the bytes differ and the
/// book the agent ships is not the book the contract would have built. Caught by comparing against
/// the program actually on chain rather than against another value this file produced.
export function bounds(referencePrice: bigint, spreadBps: number): { lo: bigint; hi: bigint } {
  const BPS = 10_000n;
  const ONE = 10n ** 18n;
  const s = BigInt(spreadBps);
  return {
    lo: isqrt((referencePrice * (BPS - s) * ONE) / BPS),
    hi: isqrt((referencePrice * (BPS + s) * ONE) / BPS),
  };
}

/// Floor of the integer square root, which is what OpenZeppelin's `Math.sqrt` returns. No floats
/// anywhere near a price: these values reach 1e45 before the root is taken.
function isqrt(x: bigint): bigint {
  if (x === 0n) return 0n;
  let z = x;
  let y = (z + 1n) / 2n;
  while (y < z) {
    z = y;
    y = (x / y + y) / 2n;
  }
  return z;
}

export function composeBook(p: BookParams): Hex {
  if (p.referencePrice <= 0n) throw new Error("referencePrice must be positive");
  if (p.spreadBps <= 0 || p.spreadBps >= 10_000) throw new Error("spreadBps out of range");

  const { lo, hi } = bounds(p.referencePrice, p.spreadBps);
  if (lo >= hi) throw new Error("empty range");

  // The order matters and is not cosmetic. Decay and the fee both wrap the rest of the program via
  // `runLoop`, so the offsets Decay stores have to be the amounts the taker actually moved, fee
  // included — which puts Decay outside FeeFlatIn, and both before the curve.
  return new Program()
    .push(salt(p.salt))
    .push(decay(p.decayPeriodSeconds))
    .push(feeFlatIn(p.feeBps))
    .push(xycConcentrateSwap(lo, hi))
    .hex();
}

/// The opcodes in a composed program, for the round-trip check the index performs independently.
export function opcodesOf(program: Hex): number[] {
  const b = Buffer.from(program.slice(2), "hex");
  const out: number[] = [];
  for (let i = 0; i + 1 < b.length; ) {
    out.push(b[i]);
    i += 2 + b[i + 1];
  }
  return out;
}
