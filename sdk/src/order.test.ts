import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildOrder, programOf, pairOf, programOffset } from "./order.ts";
import { ProgramError } from "./program.ts";

const WETH = "0x4200000000000000000000000000000000000006";
const TUSDC = "0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD";
const VAULT = "0xaf6b337440FFEa63c47f077eee2663987aEEc33f";

/// The program the chain is running, read out of the `Shipped` log at Base Sepolia block 46533422.
const PROGRAM =
  "0x020800000000000000019c0202587003000bb8514000000000000000000000000000000000000000000000000000002d2abf23404000000000000000000000000000000000000000000000000000002d64b4a3cf0d" as const;

/// The traits word that order actually carries. Checked against the chain rather than against
/// another value this file produced, because the point of the encoder is agreeing with Solidity
/// about a layout neither side owns.
const ON_CHAIN_TRAITS = 0x4000000000280028002800280000000000000000000000000000000000000000n;

describe("the maker order encoder agrees with the chain", () => {
  test("the traits word, exactly", () => {
    const o = buildOrder({ maker: VAULT, tokenA: WETH, tokenB: TUSDC, program: PROGRAM });
    assert.equal(o.traits, ON_CHAIN_TRAITS);
  });

  test("data is the pair then the program, which is what `data` means here", () => {
    const o = buildOrder({ maker: VAULT, tokenA: WETH, tokenB: TUSDC, program: PROGRAM });
    const pair = pairOf(o);
    assert.equal(pair.tokenA.toLowerCase(), WETH.toLowerCase());
    assert.equal(pair.tokenB.toLowerCase(), TUSDC.toLowerCase());
    assert.equal(programOf(o).toLowerCase(), PROGRAM.toLowerCase());
  });

  test("the program offset is read from the traits, not assumed to be forty", () => {
    const o = buildOrder({ maker: VAULT, tokenA: WETH, tokenB: TUSDC, program: PROGRAM });
    assert.equal(programOffset(o.traits), 40);
    // The hand-built shape that is also live on this deployment: every index zero, so the program
    // is the whole of `data`.
    assert.equal(programOffset(0n), 0);
  });
});

describe("what the encoder refuses", () => {
  test("unsorted tokens throw rather than being reordered", () => {
    assert.throws(
      () => buildOrder({ maker: VAULT, tokenA: TUSDC, tokenB: WETH, program: PROGRAM }),
      ProgramError,
    );
  });

  test("the Aqua flag is on unless it is explicitly turned off", () => {
    const on = buildOrder({ maker: VAULT, tokenA: WETH, tokenB: TUSDC, program: PROGRAM });
    const off = buildOrder({ maker: VAULT, tokenA: WETH, tokenB: TUSDC, program: PROGRAM, useAquaInsteadOfSignature: false });
    assert.ok((on.traits >> 254n) & 1n);
    assert.equal((off.traits >> 254n) & 1n, 0n);
  });

  test("a receiver lands in the low 160 bits, and zero means the maker", () => {
    const o = buildOrder({ maker: VAULT, tokenA: WETH, tokenB: TUSDC, program: PROGRAM, receiver: TUSDC });
    assert.equal(o.traits & ((1n << 160n) - 1n), BigInt(TUSDC));

    const d = buildOrder({ maker: VAULT, tokenA: WETH, tokenB: TUSDC, program: PROGRAM });
    assert.equal(d.traits & ((1n << 160n) - 1n), 0n);
  });

  test("a program without 0x is a mistake, not something to coerce", () => {
    assert.throws(
      () => buildOrder({ maker: VAULT, tokenA: WETH, tokenB: TUSDC, program: "0208" as `0x${string}` }),
      ProgramError,
    );
  });
});
