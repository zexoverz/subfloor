import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import type { StoredMandate } from './mandateStore.ts';

/**
 * What the agent has actually done, read from the chain's own record rather than from its logs.
 *
 * The distinction is the product's, not a detail: §4 makes the index load-bearing because the party
 * that trades cannot be the auditor of its own trading. An agent page fed by the agent's stdout
 * would be exactly that — it would say whatever the agent said. Every line here is a book the chain
 * accepted, indexed by something that is not the agent, and checkable by anyone running the same
 * query.
 *
 * Which is why there is nothing here about what it is *thinking*. The policy loop prints its
 * reasoning and none of it is on this page: a decision is a claim, and a shipped book is a fact.
 */
export interface Book {
  strategyHash: string;
  classification: string;
  families: string[];
  stepCount: number;
  shippedTimestamp: number;
  dockedTimestamp: number | null;
  active: boolean;
  vault: Address;
}

export interface AgentLog {
  /** The vaults that have handed this agent a mandate it can still spend. */
  vaults: { vault: Address; expiry: number }[];
  books: Book[];
  status: 'loading' | 'ready' | 'failed';
}

const QUERY = `query AgentBooks($makers: [Bytes!]!) {
  strategies(first: 50, orderBy: shippedTimestamp, orderDirection: desc, where: { maker_in: $makers }) {
    strategyHash
    classification
    families
    stepCount
    shippedTimestamp
    dockedTimestamp
    active
    maker { id }
  }
}`;

export function useAgentLog(agent: Address | null): AgentLog {
  const [state, setState] = useState<AgentLog>({ vaults: [], books: [], status: 'loading' });

  useEffect(() => {
    if (!agent) return;
    let live = true;
    (async () => {
      try {
        // Which vaults first: the agent's reach is the set that has authorised it, and that is a
        // fact about the mandates held here rather than anything on chain.
        const res = await fetch('/api/mandates');
        const body = (await res.json()) as { mandates?: StoredMandate[] };
        const now = Math.floor(Date.now() / 1000);
        const vaults = (body.mandates ?? [])
          .filter((m) => m.message?.delegate?.toLowerCase() === agent.toLowerCase() && Number(m.message.expiry) > now)
          .map((m) => ({ vault: m.vault, expiry: Number(m.message.expiry) }));

        if (vaults.length === 0) {
          if (live) setState({ vaults: [], books: [], status: 'ready' });
          return;
        }

        const makers = vaults.map((v) => v.vault.toLowerCase());
        const g = await fetch('/api/subgraph', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: QUERY, variables: { makers } }),
        });
        const gj = (await g.json()) as {
          data?: {
            strategies?: {
              strategyHash: string;
              classification: string;
              families: string[];
              stepCount: number;
              shippedTimestamp: string;
              dockedTimestamp: string | null;
              active: boolean;
              maker: { id: string };
            }[];
          };
        };
        if (!live) return;
        setState({
          vaults,
          books: (gj.data?.strategies ?? []).map((s) => ({
            strategyHash: s.strategyHash,
            classification: s.classification,
            families: s.families ?? [],
            stepCount: s.stepCount,
            shippedTimestamp: Number(s.shippedTimestamp),
            dockedTimestamp: s.dockedTimestamp === null ? null : Number(s.dockedTimestamp),
            active: s.active,
            vault: s.maker.id as Address,
          })),
          status: 'ready',
        });
      } catch {
        // Failed is not empty. An agent that has shipped nothing and an index that did not answer
        // look identical on screen unless the page is told to say which it is.
        if (live) setState((c) => ({ ...c, status: 'failed' }));
      }
    })();
    return () => {
      live = false;
    };
  }, [agent]);

  return state;
}
