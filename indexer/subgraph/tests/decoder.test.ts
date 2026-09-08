import { assert, describe, test } from "matchstick-as/assembly/index";
import { Bytes } from "@graphprotocol/graph-ts";
import { classify, decode, familiesOf, unwrapShipped } from "../src/decoder";
import { opcodeName } from "../src/opcodes";

/// The decoder is the piece of this index nobody else has, and its input is attacker-influenced:
/// `Shipped` carries whatever bytes a maker chose to ship. These pin both halves — that a real
/// program decodes to the right instructions, and that a malformed one is reported rather than
/// read past.

describe("opcode names come from the VM's own enum", () => {
  test("allocated slots resolve to the name the VM uses", () => {
    assert.stringEquals(opcodeName(0x51), "XYCConcentrateSwap");
    assert.stringEquals(opcodeName(0x9d), "TWAPSwap");
    assert.stringEquals(opcodeName(0x04), "Extruction");
    assert.stringEquals(opcodeName(0x21), "RequireFloor");
    assert.stringEquals(opcodeName(0x22), "RequireFreshReference");
  });

  test("an unallocated slot is named as unknown rather than silently blank", () => {
    // 0x2e is free in the guards bank as of this commit. If someone claims it upstream and this
    // starts failing, regenerate src/opcodes.ts — that is the point of the generator.
    assert.stringEquals(opcodeName(0x2e), "UNKNOWN");
    assert.stringEquals(opcodeName(0xff), "UNKNOWN");
    assert.stringEquals(opcodeName(300), "INVALID");
  });
});

describe("decode", () => {
  test("an empty program decodes to nothing and is not an error", () => {
    const p = decode(Bytes.fromHexString("0x"));
    assert.i32Equals(p.steps.length, 0);
    assert.stringEquals(p.error, "");
  });

  test("reads opcode, args length and args, in program order", () => {
    // Deadline(0x20) with 4 args bytes, then Stop(0x00) with none.
    const p = decode(Bytes.fromHexString("0x2004deadbeef0000"));
    assert.stringEquals(p.error, "");
    assert.i32Equals(p.steps.length, 2);
    assert.i32Equals(p.steps[0].opcode, 0x20);
    assert.stringEquals(p.steps[0].name, "Deadline");
    assert.stringEquals(p.steps[0].args.toHexString(), "0xdeadbeef");
    assert.i32Equals(p.steps[1].opcode, 0x00);
    assert.stringEquals(p.steps[1].name, "Stop");
    assert.i32Equals(p.steps[1].args.length, 0);
  });

  test("a declared args length running past the end is reported, not read past", () => {
    // Says 8 args bytes, supplies 2. runLoop reverts on this; so must the decoder.
    const p = decode(Bytes.fromHexString("0x2008dead"));
    assert.i32Equals(p.steps.length, 0);
    assert.assertTrue(p.error.length > 0);
  });

  test("an opcode with no args length byte after it is reported", () => {
    const p = decode(Bytes.fromHexString("0x20"));
    assert.assertTrue(p.error.length > 0);
  });

  test("everything decoded before a truncation is kept", () => {
    const p = decode(Bytes.fromHexString("0x00002008dead"));
    assert.i32Equals(p.steps.length, 1);
    assert.stringEquals(p.steps[0].name, "Stop");
    assert.assertTrue(p.error.length > 0);
  });
});

describe("classification", () => {
  test("a concentrated book with a TWAP exit reports both families and leads with the book", () => {
    // XYCConcentrateSwap, Decay, TWAPSwap — the shared-inventory shape.
    const p = decode(Bytes.fromHexString("0x51009c009d00"));
    const families = familiesOf(p.steps);
    assert.i32Equals(families.length, 2);
    assert.stringEquals(classify(families), "CONCENTRATED");
  });

  test("a dutch-auction-only program classifies as one", () => {
    const p = decode(Bytes.fromHexString("0x9400"));
    assert.stringEquals(classify(familiesOf(p.steps)), "DUTCH_AUCTION");
  });

  test("a program with no curve at all is UNKNOWN rather than mislabelled", () => {
    const p = decode(Bytes.fromHexString("0x20040000000000 00".replace(" ", "")));
    assert.stringEquals(classify(familiesOf(p.steps)), "UNKNOWN");
  });
});

const SHIPPED_BLOB = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000441ee52d939e46a33919c4295e88d3245879750340000000002800280028002800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000007d420000000000000000000000000000000000000690dcee47dc225832b8bbd7eb8eeac60766d2d1ad0208000000000000002a9c0202587003000bb85140000000000000000000000000000000000000000000000002b42709c936c81e09000000000000000000000000000000000000000000000002b79f382c074475a0000000",
);

const PROGRAM = "0x0208000000000000002a9c0202587003000bb85140000000000000000000000000000000000000000000000002b42709c936c81e09000000000000000000000000000000000000000000000002b79f382c074475a0";

describe("what Aqua actually ships", () => {
  // Produced by `contracts/test/subfloor/ShippedBlobVector.t.sol` —
  // `forge test --match-contract ShippedBlobVector -vv`. These are the bytes the chain emits, not
  // bytes this test wrote for itself, which is the whole point: the decoder was checked against its
  // own idea of the format and passed while reading the wrong thing.


  test("the program comes out of the Order, not off the front of the blob", () => {
    const shipped = unwrapShipped(SHIPPED_BLOB);
    assert.assertTrue(shipped.wrappedInOrder);
    assert.stringEquals(shipped.program.toHexString(), PROGRAM);
    assert.stringEquals(shipped.maker, "0x441ee52d939e46a33919c4295e88d32458797503");
  });

  test("the unwrapped program decodes to the book that was shipped", () => {
    const p = decode(unwrapShipped(SHIPPED_BLOB).program);
    assert.stringEquals(p.error, "");
    assert.stringEquals(p.steps[0].name, "Salt");
    assert.stringEquals(p.steps[1].name, "Decay");
    assert.stringEquals(p.steps[2].name, "FeeFlatIn");
    assert.stringEquals(p.steps[3].name, "XYCConcentrateSwap");
    assert.stringEquals(classify(familiesOf(p.steps)), "CONCENTRATED");
  });

  test("decoding the blob directly reads instructions nobody shipped", () => {
    // What the handler used to do. On this blob it happens to run off the end and report a
    // truncation, but that is luck rather than a safety net: before erroring it has already decoded
    // instructions out of the ABI header, none of which were shipped. A blob whose lengths happened
    // to line up would have produced a clean, entirely fictional program.
    const wrong = decode(SHIPPED_BLOB);
    assert.assertTrue(wrong.steps.length > 0);
    assert.stringEquals(wrong.steps[0].name, "Stop");
    assert.stringEquals(classify(familiesOf(wrong.steps)), "UNKNOWN");

    // And it is a different program from the real one, which is the thing that matters.
    const right = decode(unwrapShipped(SHIPPED_BLOB).program);
    assert.assertTrue(wrong.steps.length != right.steps.length);
    assert.stringEquals(right.steps[0].name, "Salt");
  });

  test("a maker that ships raw bytecode is still read, and says so", () => {
    const shipped = unwrapShipped(Bytes.fromHexString(PROGRAM));
    assert.assertTrue(!shipped.wrappedInOrder);
    assert.stringEquals(shipped.program.toHexString(), PROGRAM);
  });
});
