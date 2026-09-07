import { useState } from 'react';
import { ChartLine, ExternalLink, Receipt, Wallet } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Card, CardHead, Note } from '../Card.tsx';
import { Act } from '../Button.tsx';
import { Tile, Tiles } from '../Tiles.tsx';
import { FuzzCounter } from '../FuzzCounter.tsx';
import { Tape } from '../Tape.tsx';
import { PriceChart } from '../PriceChart.tsx';
import { formatBps } from '../../lib/rate.ts';
import { addressUrl } from '../../lib/chain.ts';
import { addresses } from '../../lib/contracts.ts';
import type { DataSource, Screen, VaultState } from '../../types.ts';

/**
 * What a stranger meets. The same page in a second state, which is what keeps the two honest.
 *
 * A stranger does not see inventory, floor levels keyed to a recipient, or anything mapping an
 * address to an exposed position size. No page may ever publish an identifying list of exposed
 * positions — that is a target list, not a product.
 *
 * The organising idea is provenance: every figure names the query behind it, and the contracts are
 * linked so the reader can go and check rather than take our word.
 */
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
      <header className="mb-8 grid items-end gap-x-10 gap-y-4 border-b border-rule pb-6 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="m-0 text-[11px] font-semibold tracking-[0.17em] text-faint uppercase">
            {copy.landing.publicEyebrow}
          </p>
          <h1 className="mt-2.5 mb-0 max-w-[20ch] text-[clamp(22px,3.4vw,32px)] leading-[1.1] font-semibold tracking-tight text-balance">
            {copy.landing.publicTitle}
          </h1>
        </div>
        <p className="serif m-0 max-w-[46ch] text-[15px] leading-relaxed text-muted">
          {copy.landing.publicStandfirst}
        </p>
      </header>

      <Tiles>
        <Tile
          label={copy.desk.fills}
          value={state.stats.fills}
          sub={live ? `${copy.desk.fillsSub} · ${state.stats.since}` : copy.desk.fillsSubPending}
          onQuery={() => setQuery('{ fills(where: { vault: $vault }) { totalCount } }')}
        />
        <Tile
          label={copy.desk.notional}
          value={state.stats.notionalUsd}
          format={(n) => `$${n.toLocaleString('en-US')}`}
          sub={copy.desk.notionalSub}
          onQuery={() => setQuery('{ fills(where: { vault: $vault }) { amountUSD } }')}
        />
        <Tile
          label={copy.desk.markout}
          value={state.stats.markout.s30}
          format={formatBps}
          sub={`${formatBps(state.stats.markout.s30)} / ${formatBps(state.stats.markout.m5)} / ${formatBps(state.stats.markout.h1)} · ${copy.desk.horizons}`}
          tone="settle"
          onQuery={() => setQuery('{ fills(where: { vault: $vault }) { markout30sBps markout5mBps markout1hBps } }')}
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

      {/* The contracts, so "go and check" is an instruction rather than an invitation. */}
      {addresses.registry && (
        <section className="mt-8 border-t border-rule pt-5">
          <h2 className="mb-3 text-[10.5px] tracking-[0.11em] text-faint uppercase">Contracts</h2>
          <ul className="m-0 grid list-none gap-2 p-0 text-[12px] sm:grid-cols-2">
            {(
              [
                ['FloorRegistry', addresses.registry],
                ['FloorRouter', addresses.router],
                ['AquaGuardVault', addresses.vault],
                ['Aqua', addresses.aqua],
              ] as const
            ).map(([name, address]) =>
              address ? (
                <li key={name} className="flex items-baseline gap-2">
                  <span className="w-[112px] shrink-0 text-faint">{name}</span>
                  <a
                    href={addressUrl(address)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 break-all hover:text-brass"
                  >
                    {address}
                    <ExternalLink size={10} strokeWidth={1.7} className="shrink-0 text-faint" />
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}

      {/* The wallet is asked for here, where a reader has seen enough to want one. */}
      <section className="mt-8 flex flex-wrap items-center justify-between gap-5 rounded-lg border border-rule bg-surface p-6 shadow-card">
        <div>
          <h2 className="m-0 flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <Wallet size={15} strokeWidth={1.7} className="text-brass" />
            {copy.landing.publicOwnTitle}
          </h2>
          <p className="serif mt-1.5 mb-0 max-w-[52ch] text-[14.5px] leading-relaxed text-muted">
            {copy.landing.publicOwnBody}
          </p>
        </div>
        <div className="w-full max-w-[220px]">
          <Act primary onClick={() => onNavigate('onboarding')}>
            {copy.wallet.connect}
          </Act>
        </div>
      </section>
    </>
  );
}
