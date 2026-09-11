import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import type { StoredMandate } from './mandateStore.ts';

/**
 * The agent this deployment runs, and whether it can trade a given vault.
 *
 * Spec §10 settled that a first-run owner is not asked to choose a delegate — they have no agent,
 * and a 42-character field is a question they cannot answer. Ours is offered as the default,
 * bounded by the mandate they are about to sign. That was decided long before there was a house
 * agent to offer; there is one now, and nothing in the interface has ever mentioned it.
 *
 * Two things have to be true before it can trade a vault, and they are separate facts with separate
 * failure modes, so this reports them separately:
 *
 *   1. the vault's `delegate` is the house agent — on chain, an owner transaction
 *   2. a mandate the guardian signed for it is held here — off chain, a POST
 *
 * A vault with the first and not the second looks exactly like a working one until nothing ships.
 */
export interface HouseAgent {
  /** Null while unasked, or when this deployment runs no agent of its own. */
  address: Address | null;
  /** Whether a mandate for this vault, naming this agent, is held and unexpired. */
  holds: boolean;
  /** False until the endpoint has answered. `holds` is meaningless before this. */
  known: boolean;
  refresh: () => void;
}

export function useHouseAgent(vault: Address | null): HouseAgent {
  const [address, setAddress] = useState<Address | null>(null);
  const [holds, setHolds] = useState(false);
  const [known, setKnown] = useState(false);
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // Scoped to the vault, because the answer to "can it trade *this*" is not "it holds
        // mandates for somebody".
        const url = vault ? `/api/mandates?vault=${vault}` : '/api/mandates';
        const res = await fetch(url);
        const body = (await res.json()) as { houseAgent?: string | null; mandates?: StoredMandate[] };
        if (!live) return;
        const agent = (body.houseAgent ?? null) as Address | null;
        setAddress(agent);
        const now = Math.floor(Date.now() / 1000);
        setHolds(
          Boolean(
            agent &&
              (body.mandates ?? []).some(
                (m) =>
                  m.message?.delegate?.toLowerCase() === agent.toLowerCase() &&
                  Number(m.message.expiry) > now,
              ),
          ),
        );
        setKnown(true);
      } catch {
        /*
         * Not fatal, and not reported as an absence either. This endpoint is only how *our* agent
         * is reached; an owner running their own is unaffected by it being down, so a failure
         * leaves `known` false and every line that depends on it simply does not appear.
         */
        if (live) setKnown(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [vault, asked]);

  return { address, holds, known, refresh: () => setAsked((n) => n + 1) };
}

export type PostResult = { ok: true; accepted: number; rejected: string[] } | { ok: false; error: string };

/**
 * Hand a signed mandate to the house agent.
 *
 * The endpoint re-checks it against the chain — the delegate it names, the app, the expiry, the
 * guardian it recovers to, whether the nonce was revoked — and answers with what it refused and
 * why. That answer is the point: a mandate the agent cannot spend is worth knowing about here,
 * with a reason on screen, rather than days later as a revert on somebody else's gas.
 *
 * Failure is never thrown. The signature still exists in this browser and an agent the owner runs
 * themselves needs nothing from this endpoint at all.
 */
export async function handToHouseAgent(mandate: StoredMandate, fetchImpl: typeof fetch = fetch): Promise<PostResult> {
  try {
    const res = await fetchImpl('/api/mandates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([mandate]),
    });
    const body = (await res.json().catch(() => ({}))) as {
      accepted?: number;
      rejected?: { nonce: string | null; reason: string }[];
      error?: string;
    };
    // A 422 carrying reasons is an answer, not a failure — it names what it would not keep.
    if (typeof body.accepted === 'number') {
      return { ok: true, accepted: body.accepted, rejected: (body.rejected ?? []).map((r) => r.reason) };
    }
    return { ok: false, error: body.error ?? `the agent answered ${res.status}` };
  } catch (cause) {
    return { ok: false, error: (cause as Error).message };
  }
}
