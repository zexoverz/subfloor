import { useState } from 'react';
import { ChartLine, ExternalLink, Receipt } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Card, CardHead, Chip } from '../Card.tsx';
import { Act } from '../Button.tsx';
import { Tile, Tiles } from '../Tiles.tsx';
import { Tape } from '../Tape.tsx';
import { PriceChart } from '../PriceChart.tsx';
import { RollingNumber } from '../RollingNumber.tsx';
import { formatBps } from '../../lib/rate.ts';
import { addressUrl } from '../../lib/chain.ts';
import { addresses } from '../../lib/contracts.ts';
import type { DataSource, Screen, VaultState } from '../../types.ts';

/**
 * What a stranger meets: a board, not a document.
 *
 * Every figure names the query behind it, so the page argues by provenance rather than by prose —
 * a paragraph explaining that the numbers are checkable is weaker than a button that shows the
 * query. The reading is left to the landing page; this one is for looking things up.
 *
 * A stranger never sees inventory, floor levels keyed to a recipient, or anything mapping an
 * address to a position size. No page may publish an identifying list of exposed positions.
 */
const QUERIES = {
  fills: '{ fills(where: { vault: $vault }) { totalCount } }',
  notional: '{ fills(where: { vault: $vault }) { amountUSD } }',
  markout: '{ fills(where: { vault: $vault }) { markout30sBps markout5mBps markout1hBps } }',
  worst: '{ fills(where: { vault: $vault }, orderBy: bpsAboveFloor, first: 1) { bpsAboveFloor tx } }',
  refused: '# a refusal is a revert and emits no log — Substreams reads transaction status instead',
} as const;

export function PublicPage({
  state,
  source,
  onNavigate,
}: {
  state: VaultState;
  source: DataSource;
  onNavigate: (s: Screen) => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const live = source === 'chain';

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-rule pb-3">
        <h1 className="m-0 text-[13px] font-semibold tracking-[0.14em] text-faint uppercase">
          {copy.landing.publicEyebrow}
        </h1>
        <Chip live={live}>{live ? copy.live.live : copy.live.fixtures}</Chip>
        <span className="text-[11.5px] text-faint">
          {state.pair.base} / {state.pair.quote} · Base · {state.addresses.chainId}
        </span>
        <span className="ml-auto text-[11.5px] text-faint">
          {live ? copy.desk.everyRowLive : copy.desk.everyRowSample}
        </span>
      </div>

      <Tiles>
        <Tile
          label={copy.desk.fills}
          value={state.stats.fills}
          sub={live ? `${copy.desk.fillsSub} · ${state.stats.since}` : copy.desk.fillsSubPending}
          onQuery={() => setQuery(QUERIES.fills)}
        />
        <Tile
          label={copy.desk.notional}
          value={state.stats.notionalUsd}
          format={(n) => `$${n.toLocaleString('en-US')}`}
          sub={copy.desk.notionalSub}
          onQuery={() => setQuery(QUERIES.notional)}
        />
        <Tile
          label={copy.desk.markout}
          value={state.stats.markout.s30}
          format={formatBps}
          sub={`${formatBps(state.stats.markout.s30)} / ${formatBps(state.stats.markout.m5)} / ${formatBps(state.stats.markout.h1)}`}
          tone="settle"
          onQuery={() => setQuery(QUERIES.markout)}
        />
        <Tile
          label={copy.desk.worst}
          value={state.stats.worstFillAboveFloorBps}
          format={formatBps}
          sub={copy.desk.worstSub}
          onQuery={() => setQuery(QUERIES.worst)}
        />
        <Tile
          label={copy.desk.refused}
          value={state.stats.refused}
          sub={copy.desk.refusedSub}
          tone="refuse"
          onQuery={() => setQuery(QUERIES.refused)}
        />
      </Tiles>

      {query && (
        <pre className="mb-4 overflow-x-auto rounded-[3px] border border-rule bg-sunken px-4 py-3 text-[12px] whitespace-pre text-muted">
          {query}
        </pre>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHead
              icon={ChartLine}
              left={`${state.pair.base} / ${state.pair.quote} · fills against the floor`}
              right={`reference ${state.reference.name}`}
            />
            <PriceChart state={state} />
          </Card>

          <Card className="flex h-[460px] flex-col">
            <CardHead icon={Receipt} left={copy.desk.tape} right={`${state.stats.refused} refused`} />
            <Tape entries={state.tape} pair={state.pair} />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHead left={copy.publicPage.programsExecuted} />
            <div className="p-5">
              <div className="text-[34px] leading-none font-semibold tracking-tight">
                <RollingNumber value={state.fuzz.programs} />
              </div>
              <p className="mt-2 text-[11.5px] text-faint">
                <b className="font-semibold text-settle">{state.fuzz.settledBelowFloor}</b>{' '}
                {copy.publicPage.settledBelowFloor} · counted by CI
              </p>
            </div>
          </Card>

          {addresses.registry && (
            <Card>
              <CardHead left="Contracts" right="Base Sepolia" />
              <ul className="m-0 list-none p-4 text-[11.5px]">
                {(
                  [
                    ['FloorRegistry', addresses.registry],
                    ['FloorRouter', addresses.router],
                    ['AquaGuardVault', addresses.vault],
                    ['Aqua', addresses.aqua],
                  ] as const
                ).map(([name, address]) =>
                  address ? (
                    <li key={name} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="text-faint">{name}</span>
                      <a
                        href={addressUrl(address)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 hover:text-brass"
                      >
                        {address.slice(0, 6)}…{address.slice(-4)}
                        <ExternalLink size={10} strokeWidth={1.7} className="text-faint" />
                      </a>
                    </li>
                  ) : null,
                )}
              </ul>
            </Card>
          )}

          <Card>
            <CardHead left={copy.landing.publicOwnTitle} />
            <div className="p-4">
              <Act primary onClick={() => onNavigate('onboarding')}>
                {copy.wallet.connect}
              </Act>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
