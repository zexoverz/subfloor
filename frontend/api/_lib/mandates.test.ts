import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { MANDATE_TYPES, MAX_PER_VAULT, fileStore, forVault, postMandates, type MandateReader, type MandateStore, type StoredMandate } from "./mandates.ts";

const HOUSE = "0x28Fb6255eF523Ed5d8689dAa8384320A6AB7be36" as Address;
const ROUTER = "0x03189D102286fa8cDd0fBF3578B492e67e665A27" as Address;
const VAULT = "0xaf6b337440FFEa63c47f077eee2663987aEEc33f" as Address;
const OTHER_VAULT = "0x5a436B0e8EFBe12E9068105eC4d650018817AD60" as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;
const TUSDC = "0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD" as Address;
const NOW = 1_800_000_000;
const guardian = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

async function signed(
  over: Partial<StoredMandate["message"]> = {},
  opts: { signer?: typeof guardian; vault?: Address; domainVault?: Address } = {},
): Promise<StoredMandate> {
  const vault = opts.vault ?? VAULT;
  const message = {
    delegate: HOUSE,
    app: ROUTER,
    tokens: [WETH, TUSDC],
    maxAmounts: ["4000000000000000", "10000000000"],
    nonce: "0",
    expiry: String(NOW + 86_400),
    ...over,
  };
  const signature = await (opts.signer ?? guardian).signTypedData({
    domain: { name: "SUBFLOOR AquaGuardVault", version: "1", chainId: 84532, verifyingContract: opts.domainVault ?? vault },
    types: MANDATE_TYPES,
    primaryType: "Mandate",
    message: { ...message, maxAmounts: message.maxAmounts.map(BigInt), nonce: BigInt(message.nonce), expiry: BigInt(message.expiry) },
  });
  return { vault, signature, message };
}

function reader(over: { delegate?: Address; revoked?: bigint[] } = {}): MandateReader {
  return {
    guardian: async () => guardian.address,
    delegate: async () => over.delegate ?? HOUSE,
    revoked: async (_v, n) => (over.revoked ?? []).includes(n),
  };
}

function memStore(): MandateStore & { all: StoredMandate[] } {
  const s = {
    all: [] as StoredMandate[],
    load: async () => [...s.all],
    save: async (all: StoredMandate[]) => {
      s.all = [...all];
    },
  };
  return s;
}

const deps = (over: Partial<Parameters<typeof postMandates>[1]> = {}) => ({
  houseAgent: HOUSE,
  router: ROUTER,
  chainId: 84532,
  reader: reader(),
  store: memStore(),
  now: NOW,
  ...over,
});

test("a batch the vault's guardian signed for the house agent is kept", async () => {
  const d = deps();
  const out = await postMandates(JSON.stringify([await signed({ nonce: "0" }), await signed({ nonce: "1" })]), d);
  assert.equal(out.status, 200);
  assert.equal(out.body.accepted, 2);
  assert.equal((d.store as ReturnType<typeof memStore>).all.length, 2);
});

test("the same mandate sent twice is held once", async () => {
  const d = deps();
  const m = await signed();
  await postMandates(JSON.stringify(m), d);
  await postMandates(JSON.stringify(m), d);
  assert.equal((d.store as ReturnType<typeof memStore>).all.length, 1);
});

const refusals: Array<[string, () => Promise<{ raw: string; d: ReturnType<typeof deps> }>, RegExp]> = [
  ["a mandate for another delegate", async () => ({ raw: JSON.stringify(await signed({ delegate: stranger.address })), d: deps() }), /only 0x28Fb/],
  ["a mandate for another app", async () => ({ raw: JSON.stringify(await signed({ app: WETH })), d: deps() }), /not the router/],
  ["an expired mandate", async () => ({ raw: JSON.stringify(await signed({ expiry: String(NOW - 1) })), d: deps() }), /expired/],
  ["a mandate the guardian did not sign", async () => ({ raw: JSON.stringify(await signed({}, { signer: stranger })), d: deps() }), /does not recover/],
  [
    "a signature made for another vault",
    async () => ({ raw: JSON.stringify(await signed({}, { domainVault: OTHER_VAULT })), d: deps() }),
    /does not recover/,
  ],
  ["a vault that delegated to somebody else", async () => ({ raw: JSON.stringify(await signed()), d: deps({ reader: reader({ delegate: stranger.address }) }) }), /could not spend/],
  ["a revoked mandate", async () => ({ raw: JSON.stringify(await signed({ nonce: "7" })), d: deps({ reader: reader({ revoked: [7n] }) }) }), /was revoked/],
];

for (const [name, make, reason] of refusals) {
  test(`${name} is refused, with the reason, and nothing is kept`, async () => {
    const { raw, d } = await make();
    const out = await postMandates(raw, d);
    assert.equal(out.status, 422);
    assert.match(out.body.rejected?.[0]?.reason ?? "", reason);
    assert.equal((d.store as ReturnType<typeof memStore>).all.length, 0);
  });
}

test("a batch keeps what is good and names what is not", async () => {
  const d = deps();
  const out = await postMandates(JSON.stringify([await signed({ nonce: "0" }), await signed({ nonce: "1", expiry: String(NOW) })]), d);
  assert.equal(out.status, 200);
  assert.equal(out.body.accepted, 1);
  assert.deepEqual(out.body.rejected?.map((r) => r.nonce), ["1"]);
});

test("no configured house agent refuses everything rather than holding signatures for nobody", async () => {
  const out = await postMandates(JSON.stringify(await signed()), deps({ houseAgent: "" }));
  assert.equal(out.status, 503);
});

test("a body that is not JSON is a 400, and one past the bound is a 413", async () => {
  assert.equal((await postMandates("{nope", deps())).status, 400);
  assert.equal((await postMandates(null, deps())).status, 413);
});

test("a batch longer than one vault may hold is refused whole", async () => {
  const many = Array.from({ length: MAX_PER_VAULT + 1 }, () => ({}));
  assert.equal((await postMandates(JSON.stringify(many), deps())).status, 422);
});

test("the agent reads one vault's mandates, lowest nonce first", async () => {
  const all = [await signed({ nonce: "2" }), await signed({ nonce: "0" }), await signed({ nonce: "1" }, { vault: OTHER_VAULT })];
  assert.deepEqual(forVault(all, VAULT.toLowerCase()).map((m) => m.message.nonce), ["0", "2"]);
  assert.equal(forVault(all, null).length, 3);
});

test("the file store survives a round trip and starts empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mandates-"));
  try {
    const store = fileStore(join(dir, "nested", "mandates.json"));
    assert.deepEqual(await store.load(), []);
    const m = await signed();
    await store.save([m]);
    assert.deepEqual(await store.load(), [m]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
