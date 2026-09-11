import { createPublicClient, http, isAddress, isHex, verifyTypedData, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/// Signed mandates, handed from the interface to the house agent.
///
/// Until this existed the end of the ceremony was a copy box: the owner signed a batch, then had to
/// carry it out of the browser and into a script, which is where every walk of the e2e stopped. This
/// is the other end of that box.
///
/// Holding them is safe, and the reason is in the contract rather than in this file:
/// `_consumeMandate` requires `m.delegate == msg.sender`, so a mandate is spendable only by the
/// delegate it names. Anyone may read these and none of them can use one. What is checked on the way
/// in is therefore not secrecy but usefulness: a mandate this agent could never spend is refused
/// here, with the reason, rather than discovered later as a revert on somebody else's gas.

export const MANDATE_TYPES = {
  Mandate: [
    { name: "delegate", type: "address" },
    { name: "app", type: "address" },
    { name: "tokens", type: "address[]" },
    { name: "maxAmounts", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

/// The shape the interface already keeps under `subfloor.mandate`: the struct as signed, decimal
/// strings for every number, and the signature over it. Both halves travel, because the vault
/// rebuilds the hash from every field and a signature alone buys nothing.
export interface StoredMandate {
  vault: Address;
  signature: Hex;
  message: {
    delegate: Address;
    app: Address;
    tokens: Address[];
    maxAmounts: string[];
    nonce: string;
    expiry: string;
  };
}

export interface MandateReader {
  guardian(vault: Address): Promise<Address>;
  delegate(vault: Address): Promise<Address>;
  /// Withdrawn by the owner or the guardian. Use does not spend a mandate; only this, or expiry.
  revoked(vault: Address, nonce: bigint): Promise<boolean>;
}

export interface MandateStore {
  load(): Promise<StoredMandate[]>;
  save(all: StoredMandate[]): Promise<void>;
}

export class MandateRejected extends Error {}

/// A long batch, and the bound on what one vault can make this service hold.
export const MAX_PER_VAULT = 64;
/// And on what everyone together can.
export const MAX_TOTAL = 4096;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const UINT = /^\d{1,78}$/;

function shape(x: unknown): StoredMandate {
  const m = x as Partial<StoredMandate> | null;
  const msg = m?.message as Partial<StoredMandate["message"]> | undefined;
  if (!m || typeof m.vault !== "string" || !isAddress(m.vault)) throw new MandateRejected("no vault address");
  if (typeof m.signature !== "string" || !isHex(m.signature)) throw new MandateRejected("no signature");
  if (!msg || typeof msg.delegate !== "string" || !isAddress(msg.delegate) || typeof msg.app !== "string" || !isAddress(msg.app)) {
    throw new MandateRejected("the struct is missing its delegate or its app");
  }
  if (!Array.isArray(msg.tokens) || !Array.isArray(msg.maxAmounts) || msg.tokens.length === 0 || msg.tokens.length !== msg.maxAmounts.length) {
    throw new MandateRejected("tokens and maxAmounts must be non-empty and the same length");
  }
  if (!msg.tokens.every((t) => typeof t === "string" && isAddress(t))) throw new MandateRejected("a token is not an address");
  if (![...msg.maxAmounts, msg.nonce, msg.expiry].every((v) => typeof v === "string" && UINT.test(v))) {
    throw new MandateRejected("amounts, nonce and expiry must be decimal strings");
  }
  return {
    vault: m.vault,
    signature: m.signature,
    message: {
      delegate: msg.delegate,
      app: msg.app,
      tokens: [...msg.tokens],
      maxAmounts: [...msg.maxAmounts],
      nonce: msg.nonce as string,
      expiry: msg.expiry as string,
    },
  };
}

export interface CheckContext {
  houseAgent: Address;
  router: Address;
  chainId: number;
  now: number;
  reader: MandateReader;
}

/// Every reason the vault would refuse this at ship time, checked before it is kept. In the order
/// that costs least: the struct first, then what the chain has to answer.
export async function check(x: unknown, ctx: CheckContext): Promise<StoredMandate> {
  const m = shape(x);
  const msg = m.message;

  if (!same(msg.delegate, ctx.houseAgent)) {
    throw new MandateRejected(`it names delegate ${msg.delegate}, and only ${ctx.houseAgent} is served here`);
  }
  if (!same(msg.app, ctx.router)) throw new MandateRejected(`it authorises app ${msg.app}, not the router ${ctx.router}`);
  if (BigInt(msg.expiry) <= BigInt(ctx.now)) throw new MandateRejected("it has expired");

  // The vault's own delegate, because a mandate naming the house agent for a vault that delegated to
  // somebody else is a signature nobody here could ever spend.
  const vaultDelegate = await ctx.reader.delegate(m.vault);
  if (!same(vaultDelegate, ctx.houseAgent)) {
    throw new MandateRejected(`the vault's delegate is ${vaultDelegate}, so the house agent could not spend this`);
  }

  const guardian = await ctx.reader.guardian(m.vault);
  const valid = await verifyTypedData({
    address: guardian,
    domain: { name: "SUBFLOOR AquaGuardVault", version: "1", chainId: ctx.chainId, verifyingContract: m.vault },
    types: MANDATE_TYPES,
    primaryType: "Mandate",
    message: {
      delegate: msg.delegate,
      app: msg.app,
      tokens: msg.tokens,
      maxAmounts: msg.maxAmounts.map(BigInt),
      nonce: BigInt(msg.nonce),
      expiry: BigInt(msg.expiry),
    },
    signature: m.signature,
  }).catch(() => false);
  if (!valid) throw new MandateRejected(`the signature does not recover to the vault's guardian ${guardian}`);

  if (await ctx.reader.revoked(m.vault, BigInt(msg.nonce))) throw new MandateRejected(`nonce ${msg.nonce} was revoked`);
  return m;
}

/// One read per vault per request rather than per mandate: a batch of sixty-four for one vault is
/// sixty-four nonces but one guardian and one delegate.
function memo(reader: MandateReader): MandateReader {
  const guardians = new Map<string, Promise<Address>>();
  const delegates = new Map<string, Promise<Address>>();
  const once = (m: Map<string, Promise<Address>>, k: string, f: () => Promise<Address>) => {
    if (!m.has(k)) m.set(k, f());
    return m.get(k)!;
  };
  return {
    guardian: (v) => once(guardians, v.toLowerCase(), () => reader.guardian(v)),
    delegate: (v) => once(delegates, v.toLowerCase(), () => reader.delegate(v)),
    revoked: (v, n) => reader.revoked(v, n),
  };
}

const keyOf = (m: StoredMandate) => `${m.vault.toLowerCase()}:${m.message.nonce}`;

/// Load, merge, save, one request at a time. Two posts racing a read-modify-write would each save
/// over the other, and the mandates lost are signatures the owner believes the agent is holding.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(f: () => Promise<T>): Promise<T> {
  const run = queue.then(f, f);
  queue = run.catch(() => undefined);
  return run;
}

export interface PostDeps {
  houseAgent: string;
  router: Address;
  chainId: number;
  reader: MandateReader;
  store: MandateStore;
  now?: number;
}

export interface PostOutcome {
  status: number;
  body: { accepted?: number; rejected?: { nonce: string | null; reason: string }[]; error?: string };
}

/// The whole of `POST /api/mandates`, apart from reading the body, so it can be tested without a
/// socket. `raw` is null when the body passed its size bound.
export async function postMandates(raw: string | null, deps: PostDeps): Promise<PostOutcome> {
  if (raw === null) return { status: 413, body: { error: "too large for a batch of mandates" } };
  // Fail closed: a service that does not know which agent it serves must not keep anybody's
  // signatures on the assumption that somebody will spend them.
  if (!isAddress(deps.houseAgent)) return { status: 503, body: { error: "no house agent is configured here" } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: "the body is not JSON" } };
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (items.length === 0 || items.length > MAX_PER_VAULT) {
    return { status: 422, body: { error: `send between 1 and ${MAX_PER_VAULT} mandates at once` } };
  }

  const now = deps.now ?? Math.floor(Date.now() / 1000);
  const ctx: CheckContext = { houseAgent: deps.houseAgent, router: deps.router, chainId: deps.chainId, now, reader: memo(deps.reader) };

  const ok: StoredMandate[] = [];
  const rejected: { nonce: string | null; reason: string }[] = [];
  for (const item of items) {
    try {
      ok.push(await check(item, ctx));
    } catch (err) {
      if (!(err instanceof MandateRejected)) throw err;
      const nonce = (item as { message?: { nonce?: unknown } })?.message?.nonce;
      rejected.push({ nonce: typeof nonce === "string" ? nonce : null, reason: err.message });
    }
  }

  const accepted = await serial(async () => {
    if (ok.length === 0) return 0;
    // Expired mandates are dropped on every write; nothing can spend them, so holding them only
    // uses up the vault's share of the bound.
    const kept = (await deps.store.load()).filter((m) => BigInt(m.message.expiry) > BigInt(now));
    const merged = new Map(kept.map((m) => [keyOf(m), m]));
    let added = 0;
    for (const m of ok) {
      const vaultCount = [...merged.values()].filter((x) => same(x.vault, m.vault)).length;
      if (!merged.has(keyOf(m)) && (vaultCount >= MAX_PER_VAULT || merged.size >= MAX_TOTAL)) {
        rejected.push({ nonce: m.message.nonce, reason: "this vault already has as many mandates held as it may" });
        continue;
      }
      merged.set(keyOf(m), m);
      added++;
    }
    if (added > 0) await deps.store.save([...merged.values()]);
    return added;
  });

  return { status: accepted > 0 ? 200 : 422, body: { accepted, rejected } };
}

/// What the house agent reads: every mandate held for one vault, or for all of them. Spent ones are
/// not filtered here; the agent asks the chain, which is the only thing that knows.
export function forVault(all: StoredMandate[], vault: string | null): StoredMandate[] {
  const list = vault ? all.filter((m) => same(m.vault, vault)) : all;
  return [...list].sort((a, b) => (BigInt(a.message.nonce) < BigInt(b.message.nonce) ? -1 : 1));
}

/// A JSON file, written whole and renamed into place so a crash mid-write leaves the last good file
/// rather than half of one. Point `SUBFLOOR_MANDATES_PATH` at a volume, or it lives and dies with
/// the container.
export function fileStore(path: string): MandateStore {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, "utf8")) as StoredMandate[];
      } catch (err) {
        if ((err as { code?: string }).code === "ENOENT") return [];
        throw err;
      }
    },
    async save(all) {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      await writeFile(tmp, JSON.stringify(all));
      await rename(tmp, path);
    },
  };
}

const VAULT_ABI = [
  { type: "function", name: "guardian", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "delegate", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "mandateRevoked", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

/// Current state over `eth_call`, which is fine: this is about what the vault says now, not history.
export function chainReader(rpc: string): MandateReader {
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  return {
    guardian: (vault) => client.readContract({ address: vault, abi: VAULT_ABI, functionName: "guardian" }),
    delegate: (vault) => client.readContract({ address: vault, abi: VAULT_ABI, functionName: "delegate" }),
    revoked: (vault, nonce) => client.readContract({ address: vault, abi: VAULT_ABI, functionName: "mandateRevoked", args: [nonce] }),
  };
}
