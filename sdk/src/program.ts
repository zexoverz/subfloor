/// Composes SwapVM programs.
///
/// The wire format is the run loop's, read off `src/libs/VM.sol::runLoop`: one byte of opcode, one
/// byte of args length, then that many bytes of args, repeated. Arguments are packed big-endian at
/// the widths each instruction declares — `InstructionBuilder.push(value, width)` on the Solidity
/// side — with no ABI padding anywhere.
///
/// Every encoder here is asserted byte-for-byte against output from the instruction libraries the VM
/// actually runs; see `program.test.ts` and `contracts/test/subfloor/EncodingVectors.t.sol`. An
/// encoder checked only against itself proves nothing about what the chain will accept.

export const MAX_ARGS = 255;

export class ProgramError extends Error {}

export type Hex = `0x${string}`;

function hex(bytes: Uint8Array): Hex {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s as Hex;
}

/// Big-endian, fixed width, no padding. Throws rather than truncating: a silently narrowed deadline
/// or fee is a program that does something other than what the caller asked for.
export function uint(value: bigint | number, widthBytes: number): Uint8Array {
  const v = BigInt(value);
  if (v < 0n) throw new ProgramError(`negative value ${v}`);
  const max = (1n << BigInt(widthBytes * 8)) - 1n;
  if (v > max) throw new ProgramError(`${v} does not fit in uint${widthBytes * 8}`);

  const out = new Uint8Array(widthBytes);
  let rest = v;
  for (let i = widthBytes - 1; i >= 0; i--) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

export function address(a: string): Uint8Array {
  const clean = a.startsWith("0x") ? a.slice(2) : a;
  if (clean.length !== 40) throw new ProgramError(`not an address: ${a}`);
  return uint(BigInt("0x" + clean), 20);
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/// One instruction: header plus args. The length byte is one byte, so an instruction cannot carry
/// more than 255 bytes of arguments — the same bound `InstructionBuilder.patchLength` enforces.
export function instruction(opcode: number, args: Uint8Array = new Uint8Array()): Uint8Array {
  if (opcode < 0 || opcode > 0xff) throw new ProgramError(`opcode out of range: ${opcode}`);
  if (args.length > MAX_ARGS) throw new ProgramError(`args length ${args.length} exceeds ${MAX_ARGS}`);
  return concat([Uint8Array.from([opcode, args.length]), args]);
}

export class Program {
  private readonly parts: Uint8Array[] = [];

  push(bytes: Uint8Array): this {
    this.parts.push(bytes);
    return this;
  }

  /// Guards first, then the curve, then fees — the order the VM executes in, and the order that
  /// makes a program readable to someone auditing it.
  bytes(): Uint8Array {
    return concat(this.parts);
  }

  hex(): Hex {
    return hex(this.bytes());
  }
}

// --- the instructions, with the opcode and width taken from each library's own `Encoding:` note ---

/// 0x02 Salt — [uint64 salt]
///
/// Two books with identical parameters are the same order and Aqua keys inventory by order hash, so
/// without a distinct salt the second ship silently joins the first rather than standing beside it.
export const salt = (value: bigint | number) => instruction(0x02, uint(value, 8));

/// 0x9c Decay — [uint16 period]
///
/// Charges the counter-swap: each fill raises an offset against the opposite direction which decays
/// over `period` seconds. Placed outside the fee in `ConcentratedBook`, because both wrap the rest
/// of the program and the offsets Decay stores have to be the amounts the taker actually moved.
export const decay = (periodSeconds: number) => instruction(0x9c, uint(periodSeconds, 2));

/// 0x30 JumpIfDirection — [bool swapDirection, uint16 nextPC]
///
/// `nextPC` must be an instruction-aligned offset in the program; the VM does not check it for you
/// and a misaligned target decodes the middle of an instruction as an opcode.
export const jumpIfDirection = (swapDirection: boolean, nextPC: number) =>
  instruction(0x30, concat([uint(swapDirection ? 1 : 0, 1), uint(nextPC, 2)]));

/// 0x20 Deadline — [uint40 deadline]
export const deadline = (unixSeconds: bigint | number) => instruction(0x20, uint(unixSeconds, 5));

/// 0x22 RequireFreshReference — [uint32 maxAge].
/// Do not pass a round-looking guess. The measured Base ETH/USD inter-round gaps are irregular and
/// a bound below them fails the vault closed through ordinary quiet periods.
export const requireFreshReference = (maxAgeSeconds: number) => instruction(0x22, uint(maxAgeSeconds, 4));

/// 0x27 NotionalThrottle — [uint32 epochLength][uint128 maxPerEpoch]
export const notionalThrottle = (epochLengthSeconds: number, maxPerEpoch: bigint) =>
  instruction(0x27, concat([uint(epochLengthSeconds, 4), uint(maxPerEpoch, 16)]));

/// 0x28 ApprovalGate — no args. The guardian signature travels in the taker's data, not the program.
export const approvalGate = () => instruction(0x28);

/// 0x48 ValidateSeriesEpoch — [uint32 seriesId][uint32 epoch]
export const validateSeriesEpoch = (seriesId: number, epoch: number) =>
  instruction(0x48, concat([uint(seriesId, 4), uint(epoch, 4)]));

/// 0x50 XYCSwap — no args
export const xycSwap = () => instruction(0x50);

/// 0x51 XYCConcentrateSwap — [uint256 sqrtPriceMin][uint256 sqrtPriceMax]
export const xycConcentrateSwap = (sqrtPriceMin: bigint, sqrtPriceMax: bigint) =>
  instruction(0x51, concat([uint(sqrtPriceMin, 32), uint(sqrtPriceMax, 32)]));

/// 0x70 FeeFlatIn — [uint24 feeBps]
export const feeFlatIn = (feeBps: number) => instruction(0x70, uint(feeBps, 3));

/// 0x71 FeeFlatOut — [uint24 feeBps]
export const feeFlatOut = (feeBps: number) => instruction(0x71, uint(feeBps, 3));

/// 0x90 StaticBalances — [uint256 balanceA][uint256 balanceB]
export const staticBalances = (balanceA: bigint, balanceB: bigint) =>
  instruction(0x90, concat([uint(balanceA, 32), uint(balanceB, 32)]));

/// 0x94 DutchAuctionBalanceIn — [uint40 start][uint16 duration][uint64 decay]
export const dutchAuctionBalanceIn = (start: bigint | number, duration: number, decay: bigint) =>
  instruction(0x94, concat([uint(start, 5), uint(duration, 2), uint(decay, 8)]));

/// 0x9d TWAPSwap
export const twapSwap = (args: Uint8Array = new Uint8Array()) => instruction(0x9d, args);

/// 0xb2 OraclePriceAdjuster — [uint64 maxPriceDecay][uint16 maxStaleness][uint8 oracleDecimals][address oracle]
export const oraclePriceAdjuster = (
  maxPriceDecay: bigint,
  maxStalenessSeconds: number,
  oracleDecimals: number,
  oracle: string,
) => instruction(0xb2, concat([uint(maxPriceDecay, 8), uint(maxStalenessSeconds, 2), uint(oracleDecimals, 1), address(oracle)]));
