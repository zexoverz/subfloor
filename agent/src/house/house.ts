import type { Address, Hex } from "viem";
import { decide, type Action } from "../policy/decide.ts";
import { composeBook } from "../compose/book.ts";
import { dockCalldata, shipCalldata, updateQuoteCalldata, type Mandate } from "../vault/ship.ts";
import type { IndexView, OpenStrategy } from "../market/index-reads.ts";

/// The house agent: one delegate for every vault that names it.
///
/// A first-run user has no agent, and until this existed the only one that could trade for them was
/// a script someone ran by hand with a mandate copied out of a browser. Spec §10 settled the answer —
/// offer ours as the default, bounded by the mandate they sign — and this is ours.
///
/// What makes it safe to run for strangers is not in this file. Its key can reach four calls, every
/// ship spends a mandate the vault's guardian signed, and settlement refuses any fill below the
/// vault's floor whatever this decides. So the job here is narrower than "trade well": it is to keep
/// each vault's one book near the reference and to stop when it cannot see.
///
/// `plan` decides and `run.ts` sends. Kept apart so every decision is testable without a key.

/// The shape `/api/mandates` hands back.
export interface StoredMandate {
  vault: Address;
  signature: Hex;
  message: { delegate: Address; app: Address; tokens: Address[]; maxAmounts: string[]; nonce: string; expiry: string };
}

export interface HouseConfig {
  delegate: Address;
  router: Address;
  maxReferenceAgeSeconds: number;
  maxIndexLagBlocks: number;
  recenterBps: number;
  spreadBps: number;
  feeBps: number;
  decayPeriodSeconds: number;
  /// Share of each token's available amount a book commits. Below 100 so a re-centre never needs
  /// more than the vault holds while the old book's pull is still settling.
  shipPercent: number;
}

export interface VaultChain {
  used(vault: Address, nonce: bigint): Promise<boolean>;
  balances(vault: Address, tokens: Address[]): Promise<bigint[]>;
}

export type Step =
  | { vault: Address; kind: "ship" | "recenter"; data: Hex; nonce: bigint; referencePrice: bigint; why: string }
  | { vault: Address; kind: "dock"; data: Hex; strategyHash: string; why: string }
  | { vault: Address; kind: "hold" | "unauthorised" | "waiting"; why: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/// The reference in raw quote units per raw base unit, as the curve wants it. WETH 18, tUSDC 6,
/// feed 8: `answer * 1e6 / 1e8`. The same conversion the policy loop makes.
export function midOf(index: IndexView): bigint | null {
  return index.reference ? (index.reference.answer * 10n ** 6n) / 10n ** 8n : null;
}

/// The lowest-nonce mandate that is unexpired and unspent, asking the chain rather than counting:
/// a local counter drifts the moment a ship lands and the process restarts.
async function nextMandate(list: StoredMandate[], chain: VaultChain, now: number): Promise<StoredMandate | null> {
  const live = list
    .filter((m) => BigInt(m.message.expiry) > BigInt(now))
    .sort((a, b) => (BigInt(a.message.nonce) < BigInt(b.message.nonce) ? -1 : 1));
  for (const m of live) {
    if (!(await chain.used(m.vault, BigInt(m.message.nonce)))) return m;
  }
  return null;
}

function mandateOf(m: StoredMandate): Mandate {
  return {
    delegate: m.message.delegate,
    app: m.message.app,
    tokens: m.message.tokens,
    maxAmounts: m.message.maxAmounts.map(BigInt),
    nonce: BigInt(m.message.nonce),
    expiry: BigInt(m.message.expiry),
  };
}

/// One cycle's plan: for every vault that handed this agent mandates, what to send, if anything.
///
/// `pending` holds, per vault, the block our last transaction landed in. Until the index has passed
/// it the vault is left alone: the index is a few blocks behind the chain, and a vault whose new book
/// is not indexed yet looks exactly like a vault with no book — which is how an agent ships twice.
export async function plan(
  cfg: HouseConfig,
  index: IndexView,
  chainHead: number,
  mandates: StoredMandate[],
  chain: VaultChain,
  pending: Map<string, bigint>,
  now: number,
): Promise<Step[]> {
  const byVault = new Map<string, StoredMandate[]>();
  for (const m of mandates) {
    if (!same(m.message.delegate, cfg.delegate)) continue;
    const k = m.vault.toLowerCase();
    byVault.set(k, [...(byVault.get(k) ?? []), m]);
  }

  const mid = midOf(index);
  const steps: Step[] = [];

  for (const [key, list] of byVault) {
    const vault = list[0].vault;
    const tokens = list[0].message.tokens;

    const waitFor = pending.get(key);
    if (waitFor !== undefined && BigInt(index.indexedBlock) < waitFor) {
      steps.push({ vault, kind: "waiting", why: `our transaction at block ${waitFor} is not indexed yet (index at ${index.indexedBlock})` });
      continue;
    }
    pending.delete(key);

    const live: OpenStrategy[] = index.strategies
      .filter((s) => s.programWrappedInOrder && same(s.maker, vault) && same(s.app, cfg.router))
      .sort((a, b) => b.shippedBlock - a.shippedBlock);
    const [book, ...older] = live;

    // One book per vault. Anything older is retired first, one per cycle, oldest first: a vault with
    // three live books quotes three prices, and the one a taker finds is not the one this agent is
    // keeping near the reference.
    if (older.length > 0) {
      const oldest = older[older.length - 1];
      steps.push({
        vault,
        kind: "dock",
        strategyHash: oldest.strategyHash,
        data: dockCalldata(cfg.router, oldest.strategyHash as Hex, tokens),
        why: `${live.length} books live; retiring the oldest so the vault runs one`,
      });
      continue;
    }

    const action: Action = decide({
      index: { ...index, strategies: book ? [book] : [] },
      chainHead,
      maxReferenceAgeSeconds: cfg.maxReferenceAgeSeconds,
      maxIndexLagBlocks: cfg.maxIndexLagBlocks,
      now,
      venueMid: mid,
      centredOn: book?.centre ?? null,
      recenterBps: cfg.recenterBps,
    });

    if (action.kind === "dock") {
      if (!book) {
        steps.push({ vault, kind: "hold", why: `${action.why}; nothing live to dock` });
        continue;
      }
      steps.push({ vault, kind: "dock", strategyHash: book.strategyHash, data: dockCalldata(cfg.router, book.strategyHash as Hex, tokens), why: action.why });
      continue;
    }
    if (action.kind === "hold" || action.kind === "unauthorised") {
      steps.push({ vault, kind: action.kind, why: action.why });
      continue;
    }

    // Only a trade needs authority. A book holding inside its band with no mandates left is fine;
    // it is the next re-centre that cannot happen, and that is when it gets said.
    const next = await nextMandate(list, chain, now);
    if (!next) {
      steps.push({ vault, kind: "unauthorised", why: `${action.why}, but no unexpired, unspent mandate is held for this vault` });
      continue;
    }

    const referencePrice = action.kind === "recenter" ? action.referencePrice : (mid as bigint);
    const mandate = mandateOf(next);
    const held = await chain.balances(vault, tokens);
    const amounts = tokens.map((_, i) => {
      const cap = mandate.maxAmounts[i];
      const available = held[i] < cap ? held[i] : cap;
      return (available * BigInt(cfg.shipPercent)) / 100n;
    });
    if (amounts.every((a) => a === 0n)) {
      steps.push({ vault, kind: "hold", why: "the vault holds nothing the mandate lets this agent commit" });
      continue;
    }

    const args = {
      app: cfg.router,
      tokens: [...tokens],
      amounts,
      mandate,
      signature: next.signature,
      maker: vault,
      tokenA: tokens[0],
      tokenB: tokens[1],
      program: composeBook({
        referencePrice,
        spreadBps: cfg.spreadBps,
        feeBps: cfg.feeBps,
        decayPeriodSeconds: cfg.decayPeriodSeconds,
        salt: BigInt(now),
      }),
      useAquaInsteadOfSignature: true,
    };

    if (book) {
      steps.push({
        vault,
        kind: "recenter",
        nonce: mandate.nonce,
        referencePrice,
        data: updateQuoteCalldata({ ...args, oldStrategyHash: book.strategyHash as Hex }),
        why: action.why,
      });
    } else {
      steps.push({ vault, kind: "ship", nonce: mandate.nonce, referencePrice, data: shipCalldata(args), why: action.why });
    }
  }

  return steps;
}
