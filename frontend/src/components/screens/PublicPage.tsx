import { useState } from 'react';
import { ChartLine, Receipt } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Card, CardHead, Note, Todo } from '../Card.tsx';
import { Tile, Tiles } from '../Tiles.tsx';
import { FuzzCounter } from '../FuzzCounter.tsx';
import { Tape } from '../Tape.tsx';
import { PriceChart } from '../PriceChart.tsx';
import { formatBps } from '../../lib/rate.ts';
import type { DataSource, VaultState } from '../../types.ts';

/**
 * What a stranger meets: the same page in a second state, which is what keeps the two honest.
 *
 * A stranger does not see inventory, floor levels keyed to a recipient, or anything mapping an
 * address to an exposed position size. No page may ever publish an identifying list of exposed
 * positions — that is a target list, not a product.
 */
export function PublicPage({ state, source }: { state: VaultState; source: DataSource }) {
  const live = source === 'chain';
  const [query, setQuery] = useState<string | null>(null);

  return (
    <>
      <Tiles>
        <Tile
          label={copy.desk.fills}
          value={state.stats.fills}
          sub={live ? `${copy.desk.fillsSub} · ${state.stats.since}` : copy.desk.fillsSubPending}
          onQuery={() => setQuery('{ fills(where: { vault: $vault }) { totalCount } }')}
        />
        <Tile
          label={copy.desk.markout}
          value={state.stats.medianVsMidBps}
          format={formatBps}
          sub={copy.desk.markoutSub}
          tone="settle"
          onQuery={() => setQuery('{ fills(where: { vault: $vault }) { markout30sBps referenceBps } }')}
        />
        <Tile
          label={copy.desk.worst}
          value={state.stats.worstFillAboveFloorBps}
          format={formatBps}
          sub={copy.desk.worstSub}
          onQuery={() =>
            setQuery('{ fills(where: { vault: $vault }, orderBy: bpsAboveFloor, first: 1) { bpsAboveFloor tx } }')
          }
        />
        <Tile
          label={copy.desk.refused}
          value={state.stats.refused}
          sub={copy.desk.refusedSub}
          tone="refuse"
          onQuery={() =>
            setQuery('# a refusal is a revert and emits no log — Substreams reads transaction status instead')
          }
        />
      </Tiles>

      {query && (
        <pre className="mb-4.5 overflow-x-auto rounded-[3px] border border-rule bg-sunken px-4 py-3 text-[12px] whitespace-pre text-muted">
          {query}
        </pre>
      )}

      <FuzzCounter fuzz={state.fuzz} />

      <Card className="mb-4.5">
        <CardHead
          icon={ChartLine}
          left={`${state.pair.base} / ${state.pair.quote} · fills against the floor`}
          right="anyone can recompute this from chain data"
        />
        <PriceChart state={state} />
      </Card>

      <Card className="flex h-[520px] flex-col">
        <CardHead icon={Receipt} left={copy.desk.tape} right={`${state.pair.base} / ${state.pair.quote}`} />
        <Tape entries={state.tape} pair={state.pair} />
      </Card>

      <Note className="serif mt-4.5 text-[14.5px]">
        {live ? copy.desk.everyRowLive : copy.desk.everyRowSample}
      </Note>

      <Todo>
        skeleton: the queries above are the shapes these numbers will come from, not live ones —
        they run against the subgraph the moment it exists (#24, #42).
      </Todo>
    </>
  );
}
