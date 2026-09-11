import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { toFunctionSelector, type Address, type Hex } from "viem";
import { plan, type HouseConfig, type StoredMandate, type VaultChain } from "../src/house/house.ts";
import { centreFromXycArgs, type IndexView, type OpenStrategy } from "../src/market/index-reads.ts";
import { bounds, composeBook } from "../src/compose/book.ts";
import { shipCalldata } from "../src/vault/ship.ts";

const HOUSE = "0x28Fb6255eF523Ed5d8689dAa8384320A6AB7be36" as Address;
const ROUTER = "0x03189D102286fa8cDd0fBF3578B492e67e665A27" as Address;
const VAULT = "0xaf6b337440FFEa63c47f077eee2663987aEEc33f" as Address;
const OTHER = "0x5a436B0e8EFBe12E9068105eC4d650018817AD60" as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;
const TUSDC = "0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD" as Address;
const NOW = 1_800_000_000;
/// 2,435 USDC per WETH in raw units: tUSDC has 6 decimals, so 2435e6 per 1e18 wei, times 1e18 / 1e18.
const MID = 2_435_000_000n;
const SIG = `0x${"11".repeat(65)}` as Hex;

const CFG: HouseConfig = {
  delegate: HOUSE,
  router: ROUTER,
  maxReferenceAgeSeconds: 3600,
  maxIndexLagBlocks: 200,
  recenterBps: 50,
  spreadBps: 50,
  feeBps: 3000,
  decayPeriodSeconds: 600,
  shipPercent: 80,
};

const SHIP = toFunctionSelector("ship(address,bytes,address[],uint256[],(address,address,address[],uint256[],uint256,uint256),bytes)");
const UPDATE = toFunctionSelector("updateQuote(address,bytes32,address[],bytes,uint256[],(address,address,address[],uint256[],uint256,uint256),bytes)");
const DOCK = toFunctionSelector("dock(address,bytes32,address[])");

function mandate(nonce: number, over: Partial<StoredMandate["message"]> = {}): StoredMandate {
  return {
    vault: VAULT,
    signature: SIG,
    message: {
      delegate: HOUSE,
      app: ROUTER,
      tokens: [WETH, TUSDC],
      maxAmounts: ["4000000000000000", "10000000000"],
      nonce: String(nonce),
      expiry: String(NOW + 86_400),
      ...over,
    },
  };
}

function book(over: Partial<OpenStrategy> = {}): OpenStrategy {
  return {
    id: "0x1",
    classification: "CONCENTRATED",
    stepCount: 4,
    programWrappedInOrder: true,
    maker: VAULT.toLowerCase(),
    strategyHash: `0x${"ab".repeat(32)}`,
    app: ROUTER.toLowerCase(),
    shippedBlock: 100,
    centre: MID,
    ...over,
  };
}

function index(strategies: OpenStrategy[] = [], over: Partial<IndexView> = {}): IndexView {
  return {
    indexedBlock: 1000,
    hasIndexingErrors: false,
    strategies,
    quality: null,
    reference: { answer: MID * 100n, updatedAt: NOW - 60 },
    ...over,
  };
}

function chain(revoked: number[] = [], held: bigint[] = [10n ** 18n, 50_000_000_000n], live: bigint[] = [0n, 0n]): VaultChain {
  return { revoked: async (_v, n) => revoked.includes(Number(n)), balances: async () => held, committed: async () => live };
}

const run = (idx: IndexView, mandates: StoredMandate[], ch: VaultChain = chain(), pending = new Map<string, bigint>()) =>
  plan(CFG, idx, 1002, mandates, ch, pending, NOW);

describe("the house agent gives every vault that names it one book", () => {
  test("a vault with mandates and no book gets its first book, on the lowest nonce", async () => {
    const [s] = await run(index(), [mandate(1), mandate(0)]);
    assert.equal(s.kind, "ship");
    if (s.kind !== "ship") return;
    assert.equal(s.nonce, 0n);
    assert.equal(s.referencePrice, MID);
    assert.ok(s.data.startsWith(SHIP));
  });

  test("a revoked mandate is skipped, and the chain is what says it is revoked", async () => {
    const [s] = await run(index(), [mandate(0), mandate(1)], chain([0]));
    assert.equal(s.kind === "ship" && s.nonce, 1n);
  });

  test("the same mandate carries a re-centre after it has already shipped a book", async () => {
    // One signature, fourteen days: nonce 0 shipped the book that is now drifted, and nothing
    // stops it shipping the replacement too.
    const [s] = await run(index([book({ centre: (MID * 101n) / 100n })]), [mandate(0)]);
    assert.equal(s.kind === "recenter" && s.nonce, 0n);
  });

  test("a first ship leaves room for what the vault already has live under the cap", async () => {
    // WETH cap 4e15 with 1e15 already committed: room 3e15, and 80% of that is shipped.
    const [s] = await run(index(), [mandate(0)], chain([], [10n ** 18n, 50_000_000_000n], [1_000_000_000_000_000n, 0n]));
    assert.equal(s.kind, "ship");
    if (s.kind !== "ship") return;
    assert.ok(s.data.includes((2_400_000_000_000_000n).toString(16).padStart(64, "0")), "80% of the 3e15 of room");
  });

  test("it commits the smaller of the mandate cap and the balance, times its share", async () => {
    const [s] = await run(index(), [mandate(0)], chain([], [10n ** 18n, 5_000_000_000n]));
    assert.equal(s.kind, "ship");
    if (s.kind !== "ship") return;
    const m = mandate(0);
    const expected = shipCalldata({
      app: ROUTER,
      tokens: [WETH, TUSDC],
      // WETH capped by the mandate at 4e15, tUSDC capped by the balance at 5e9; 80% of each.
      amounts: [3_200_000_000_000_000n, 4_000_000_000n],
      mandate: { delegate: HOUSE, app: ROUTER, tokens: [WETH, TUSDC], maxAmounts: [4_000_000_000_000_000n, 10_000_000_000n], nonce: 0n, expiry: BigInt(m.message.expiry) },
      signature: SIG,
      maker: VAULT,
      tokenA: WETH,
      tokenB: TUSDC,
      program: composeBook({ referencePrice: MID, spreadBps: 50, feeBps: 3000, decayPeriodSeconds: 600, salt: BigInt(NOW) }),
      useAquaInsteadOfSignature: true,
    });
    assert.equal(s.data, expected);
  });

  test("a book inside its band holds, and needs no mandate to", async () => {
    const [s] = await run(index([book()]), [mandate(0)], chain([0]));
    assert.equal(s.kind, "hold");
  });

  test("a drifted book is re-centred in one call that replaces it", async () => {
    const [s] = await run(index([book({ centre: (MID * 101n) / 100n })]), [mandate(0)]);
    assert.equal(s.kind, "recenter");
    if (s.kind !== "recenter") return;
    assert.ok(s.data.startsWith(UPDATE));
    assert.ok(s.data.includes("ab".repeat(32)), "the old book's hash is what updateQuote docks");
  });

  test("with nothing left to spend when a trade is needed it says so and sends nothing", async () => {
    const [s] = await run(index(), [mandate(0, { expiry: String(NOW - 1) })]);
    assert.equal(s.kind, "unauthorised");
    assert.ok(!("data" in s));
  });

  test("somebody else's book is not this vault's book", async () => {
    const [s] = await run(index([book({ maker: OTHER.toLowerCase() })]), [mandate(0)]);
    assert.equal(s.kind, "ship");
  });

  test("a vault running several books has the oldest retired first", async () => {
    const [s] = await run(
      index([
        book({ shippedBlock: 300, strategyHash: `0x${"cc".repeat(32)}` }),
        book({ shippedBlock: 100, strategyHash: `0x${"aa".repeat(32)}` }),
        book({ shippedBlock: 200, strategyHash: `0x${"bb".repeat(32)}` }),
      ]),
      [mandate(0)],
    );
    assert.equal(s.kind, "dock");
    if (s.kind !== "dock") return;
    assert.equal(s.strategyHash, `0x${"aa".repeat(32)}`);
    assert.ok(s.data.startsWith(DOCK));
  });

  test("its own transaction, not yet indexed, leaves the vault alone rather than shipping twice", async () => {
    const pending = new Map([[VAULT.toLowerCase(), 1500n]]);
    const [waiting] = await run(index([], { indexedBlock: 1000 }), [mandate(0)], chain(), pending);
    assert.equal(waiting.kind, "waiting");
    const [after] = await run(index([], { indexedBlock: 1500 }), [mandate(0)], chain(), pending);
    assert.equal(after.kind, "ship");
    assert.equal(pending.size, 0);
  });

  test("a stale reference docks the live book", async () => {
    const [s] = await run(index([book()], { reference: { answer: MID * 100n, updatedAt: NOW - 7200 } }), [mandate(0)]);
    assert.equal(s.kind, "dock");
  });

  test("a stale reference with no book holds rather than docking nothing", async () => {
    const [s] = await run(index([], { reference: { answer: MID * 100n, updatedAt: NOW - 7200 } }), [mandate(0)]);
    assert.equal(s.kind, "hold");
  });

  test("mandates naming another delegate are not this agent's to spend", async () => {
    assert.deepEqual(await run(index(), [mandate(0, { delegate: OTHER })]), []);
  });
});

describe("a book's centre comes back off the index", () => {
  test("from the curve's own bounds, within a basis point of the reference it was built on", () => {
    const { lo, hi } = bounds(MID, 50);
    const args = `0x${lo.toString(16).padStart(64, "0")}${hi.toString(16).padStart(64, "0")}`;
    const c = centreFromXycArgs(args)!;
    const off = c > MID ? c - MID : MID - c;
    assert.ok(off * 10_000n <= MID, `centre ${c} is more than 1 bp from ${MID}`);
  });

  test("and is null for anything that is not the instruction's two words", () => {
    assert.equal(centreFromXycArgs(null), null);
    assert.equal(centreFromXycArgs("0x1234"), null);
  });
});
