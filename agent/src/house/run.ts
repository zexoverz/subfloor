import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readIndex, IndexRateLimited, type IndexView } from "../market/index-reads.ts";
// From config.ts, never loop.ts: loop.ts imports this file while its own top-level await is pending,
// and importing it back deadlocked the service on start (#269).
import { configFromEnv } from "../policy/config.ts";
import { dockCalldata } from "../vault/ship.ts";
import { plan, type HouseConfig, type StoredMandate, type VaultChain } from "./house.ts";

/// The house agent's loop: read the index once, read the mandates, plan, send.
///
/// Started by `policy/loop.ts` when `SUBFLOOR_DELEGATE_KEY` is set, so the Railway service needs one
/// secret to go from watching to trading and nothing else about it changes.
///
/// It fails closed in the direction that matters. If the index cannot be read for longer than the
/// silence bound it docks every book it last saw, because a book quoting into a market nobody here
/// can see is exactly what the policy loop was written not to allow. If the mandates cannot be read
/// it does nothing new, which only ever means not trading.

const VAULT_ABI = [
  { type: "function", name: "mandateRevoked", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "committed", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const REGISTRY_ABI = [
  { type: "function", name: "floor", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "address" }],
    outputs: [{ name: "configured", type: "bool" }, { name: "maxAdverseBps", type: "uint16" }, { name: "absoluteRate", type: "uint232" }] },
] as const;

const MAX_BACKOFF_MS = 600_000;

/// `key` arrives from `house/key.ts` when the policy loop starts this, and may have been opened from
/// the Key Ring. Run directly, this file reads the plain variable as it always has.
export async function runHouse(key: Hex | undefined = process.env.SUBFLOOR_DELEGATE_KEY as Hex | undefined): Promise<void> {
  if (!key) throw new Error("no delegate key; the house agent will not start without one");
  const account = privateKeyToAccount(key);
  const policy = configFromEnv();
  const api = (process.env.SUBFLOOR_API ?? "https://web-production-37798.up.railway.app").replace(/\/$/, "");
  const dryRun = process.env.SUBFLOOR_DRY_RUN === "1";

  const cfg: HouseConfig = {
    delegate: account.address,
    router: (process.env.SUBFLOOR_ROUTER ?? "0x03189D102286fa8cDd0fBF3578B492e67e665A27") as Address,
    registry: (process.env.SUBFLOOR_REGISTRY ?? "0x47c7AbB1FfbF37eD4bCFCB20f6648B5c0cC86123") as Address,
    maxReferenceAgeSeconds: policy.maxReferenceAgeSeconds,
    maxIndexLagBlocks: policy.maxIndexLagBlocks,
    recenterBps: policy.recenterBps,
    spreadBps: policy.spreadBps,
    feeBps: policy.feeBps,
    decayPeriodSeconds: policy.decayPeriodSeconds,
    shipPercent: Number(process.env.HOUSE_SHIP_PERCENT ?? 80),
  };

  const client = createPublicClient({ chain: baseSepolia, transport: http(policy.rpc) });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http(policy.rpc) });
  const chain: VaultChain = {
    revoked: (vault, nonce) => client.readContract({ address: vault, abi: VAULT_ABI, functionName: "mandateRevoked", args: [nonce] }),
    committed: (vault, tokens) =>
      Promise.all(tokens.map((t) => client.readContract({ address: vault, abi: VAULT_ABI, functionName: "committed", args: [t] }))),
    balances: (vault, tokens) =>
      Promise.all(tokens.map((t) => client.readContract({ address: t, abi: ERC20_ABI, functionName: "balanceOf", args: [vault] }))),
    // floor[recipient][given][received]: the first entry is the vault giving tokens[0].
    floorBps: async (vault, [a, b]) =>
      Promise.all([[a, b], [b, a]].map(async ([given, received]) => {
        const [configured, bps] = await client.readContract({ address: cfg.registry, abi: REGISTRY_ABI, functionName: "floor", args: [vault, given, received] });
        return configured && bps > 0 ? bps : null;
      })),
  };

  console.log(`[house] delegate ${account.address}, router ${cfg.router}, mandates from ${api}${dryRun ? ", DRY RUN" : ""}`);

  const pending = new Map<string, bigint>();
  let lastGood: { view: IndexView; at: number } | null = null;
  let lastMandates: StoredMandate[] = [];
  let backoffMs = 0;

  const send = async (vault: Address, data: Hex, label: string) => {
    if (dryRun) {
      console.log(`[house] ${vault} ${label} (dry run) ${data.slice(0, 10)}…`);
      return;
    }
    const hash = await wallet.sendTransaction({ to: vault, data });
    const receipt = await client.waitForTransactionReceipt({ hash });
    console.log(`[house] ${vault} ${label} ${hash} status ${receipt.status} block ${receipt.blockNumber}`);
    if (receipt.status === "success") pending.set(vault.toLowerCase(), receipt.blockNumber);
  };

  for (;;) {
    const now = Math.floor(Date.now() / 1000);
    try {
      let index: IndexView | null = null;
      try {
        index = await readIndex(policy.subgraph);
        lastGood = { view: index, at: now };
        backoffMs = 0;
      } catch (err) {
        const retry = err instanceof IndexRateLimited ? err.retryAfterSeconds : null;
        backoffMs = retry !== null ? Math.min(retry * 1000, MAX_BACKOFF_MS) : Math.min(Math.max(backoffMs * 2, policy.intervalMs), MAX_BACKOFF_MS);
        const silence = lastGood ? now - lastGood.at : null;
        if (silence === null || silence > policy.maxIndexSilenceSeconds) {
          console.log(`[house] index unreadable (${(err as Error).message}) for ${silence ?? "the whole run"}s; docking every book last seen`);
          for (const m of dedupeVaults(lastMandates)) {
            for (const s of (lastGood?.view.strategies ?? []).filter((s) => s.maker === m.vault.toLowerCase() && s.app === cfg.router.toLowerCase())) {
              await send(m.vault, dockCalldata(cfg.router, s.strategyHash as Hex, m.message.tokens), `dock ${s.strategyHash.slice(0, 10)}`).catch((e) =>
                console.log(`[house] ${m.vault} dock failed: ${(e as Error).message}`),
              );
            }
          }
        } else {
          console.log(`[house] hold, index unreadable (${(err as Error).message}); last good read ${silence}s ago`);
        }
      }

      if (index) {
        const res = await fetch(`${api}/api/mandates`);
        if (!res.ok) throw new Error(`mandates HTTP ${res.status}`);
        lastMandates = ((await res.json()) as { mandates: StoredMandate[] }).mandates;

        const head = Number(await client.getBlockNumber());
        const steps = await plan(cfg, index, head, lastMandates, chain, pending, now);
        if (steps.length === 0) console.log("[house] no vault has handed this agent a mandate yet");
        for (const s of steps) {
          if (s.kind === "ship" || s.kind === "recenter" || s.kind === "dock") {
            console.log(`[house] ${s.vault} ${s.kind} — ${s.why}`);
            await send(s.vault, s.data, s.kind).catch((e) => console.log(`[house] ${s.vault} ${s.kind} failed: ${(e as Error).message}`));
          } else {
            console.log(`[house] ${s.vault} ${s.kind} — ${s.why}`);
          }
        }
      }
    } catch (err) {
      // A cycle that throws does nothing new, which only ever means not trading. The next one retries.
      console.log(`[house] cycle failed: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, Math.max(policy.intervalMs, backoffMs)));
  }
}

function dedupeVaults(list: StoredMandate[]): StoredMandate[] {
  const seen = new Map<string, StoredMandate>();
  for (const m of list) if (!seen.has(m.vault.toLowerCase())) seen.set(m.vault.toLowerCase(), m);
  return [...seen.values()];
}

if (process.argv[1]?.endsWith("house/run.ts")) await runHouse();
