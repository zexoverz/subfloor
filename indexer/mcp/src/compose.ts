import { composeBook, opcodesOf, bounds } from "../../../agent/src/compose/book.ts";

/// The tools that make a vault drivable rather than only readable.
///
/// Everything else this server exposes answers questions about the venue. These compose the bytes a
/// maker would ship, so an agent that is not ours can run a position without learning the wire
/// format or writing Solidity. That was the gap: the index was public and the venue was open, and
/// the only way to actually quote on it was to copy a Foundry script out of this repo.
///
/// **No key ever reaches this server.** These return bytes. Whoever holds the delegate key decides
/// whether to send them, which is also the only arrangement that makes sense — the delegate key is
/// the agent's, and an MCP server that held it would be a custody boundary nobody asked for.

export const COMPOSE_TOOLS = [
  {
    name: "compose_book",
    description:
      "Compose a concentrated two-sided book as SwapVM bytecode, ready to ship. Returns the program and the opcodes it contains, so the caller can see what it is about to put on chain rather than trusting a hex string. Prices are raw token units scaled by 1e18: WETH/USDC at 2500 is 2500e6 per wei, not 2500e18, because the curve works on raw balances and does not know the tokens have different decimals.",
    inputSchema: {
      type: "object",
      properties: {
        referencePrice: { type: "string", description: "Raw-unit reference, decimal string. WETH/tUSDC at 2478.67 is \"2478670000\"." },
        spreadBps: { type: "number", description: "Half-width of the range in bps. 50 is a half-percent either side." },
        feeBps: { type: "number", description: "Maker spread income on top of the curve, in the FeeFlatIn denomination." },
        decayPeriodSeconds: { type: "number", description: "Seconds over which the counter-swap offset decays." },
        salt: { type: "string", description: "Distinguishes two books with identical parameters. Without a distinct salt the second ship joins the first rather than standing beside it." },
      },
      required: ["referencePrice", "spreadBps"],
    },
  },
] as const;

export function composeTool(args: Record<string, unknown>) {
  const referencePrice = BigInt(String(args.referencePrice));
  const spreadBps = Number(args.spreadBps);
  const feeBps = args.feeBps === undefined ? 3000 : Number(args.feeBps);
  const decayPeriodSeconds = args.decayPeriodSeconds === undefined ? 600 : Number(args.decayPeriodSeconds);
  const salt = BigInt(String(args.salt ?? Math.floor(Date.now() / 1000)));

  const program = composeBook({ referencePrice, spreadBps, feeBps, decayPeriodSeconds, salt });
  const { lo, hi } = bounds(referencePrice, spreadBps);

  return {
    program,
    opcodes: opcodesOf(program).map((o) => `0x${o.toString(16).padStart(2, "0")}`),
    sqrtPriceMin: lo.toString(),
    sqrtPriceMax: hi.toString(),
    note:
      "These bytes are identical to what ConcentratedBook.build produces on chain for the same parameters, asserted against the program currently live on Base Sepolia. Ship them with AquaGuardVault.ship under a guardian-signed mandate; this server holds no key and sends nothing.",
  };
}
