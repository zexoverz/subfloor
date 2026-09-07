import { Activity, ArrowDownToLine, Bot, ChartLine, ExternalLink, Pencil, Receipt, Wallet } from 'lucide-react';
import { useState } from 'react';
import { copy } from '../../copy.ts';
import { Card, CardBody, CardHead } from '../Card.tsx';
import { Ghost } from '../Button.tsx';
import { Tile, Tiles } from '../Tiles.tsx';
import { FuzzCounter } from '../FuzzCounter.tsx';
import { Tape } from '../Tape.tsx';
import { PriceChart } from '../PriceChart.tsx';
import { PublicAside } from '../PublicAside.tsx';
import { FloorDialog } from '../FloorDialog.tsx';
import { ChainlinkMark, TokenIcon } from '../TokenIcon.tsx';
import { Act } from '../Button.tsx';
import { formatBps, formatPrice, rateToPrice } from '../../lib/rate.ts';
import { addressUrl } from '../../lib/chain.ts';
import type { DataSource, Screen, VaultState } from '../../types.ts';

/**
 * The desk: the owner's home while the agent trades. One rule — every number here is read from the
 * index, the same queries the public page runs, so the owner never sees a figure a stranger cannot
 * check. Refusals are a headline tile, never buried: they are the product's proudest number.
 */
export function LiveView({
  state,
  source,
  owner,
  onNavigate,
  onLower,
  onRaise,
  onConnect,
  onWithdraw,
  onCreateVault,
  creatingVault,
  canCreateVault,
  vaultChecked,
  vaultError,
  onSetup,
  connected,
}: {
  state: VaultState;
  source: DataSource;
  /** True when the connected wallet owns the vault. False is what a stranger sees. */
  owner: boolean;
  onNavigate: (s: Screen) => void;
  onLower: (bps: number) => void;
  onRaise: (bps: number) => void;
  onConnect: () => void;
  /** Owner-only: the vault's withdraw, which is onlyOwner on chain too. */
  onWithdraw: () => void;
  onCreateVault: () => void;
  creatingVault: boolean;
  canCreateVault: boolean;
  vaultChecked: boolean;
  vaultError: string | null;
  connected: boolean;
  /** Null when the vault is configured; otherwise the way back into the ceremony. */
  onSetup: (() => void) | null;
}) {
  const [adjusting, setAdjusting] = useState(false);
  // One flag decides the badge and every provenance sentence on the screen, so the header and the
  // line under the tape can never again claim different things about the same rows.
  const live = source === 'chain';
  const { pair, stats, tape, agent, inventory, floor, floorBuy, reference, fuzz } = state;
  // An unregistered floor is not a floor of zero, and rendering 0.00 would read as one.
  const price = (value: number) => (floor.enforced ? formatPrice(value) : copy.floor.notSet);
  const sellFloor = rateToPrice(floor.absoluteRate, pair.baseDecimals, pair.quoteDecimals);
  const buyCeiling = 1 / rateToPrice(floorBuy.absoluteRate, pair.quoteDecimals, pair.baseDecimals);
  const feedFresh = reference.ageSeconds < reference.stalenessBoundSeconds;

  return (
    <>
      <Tiles>
        <Tile
          label={copy.desk.fills}
          value={stats.fills}
          sub={live ? `${copy.desk.fillsSub} · ${stats.since}` : copy.desk.fillsSubPending}
        />
        <Tile
          label={copy.desk.notional}
          value={stats.notionalUsd}
          format={(n) => `$${n.toLocaleString('en-US')}`}
          sub={copy.desk.notionalSub}
        />
        <Tile
          label={copy.desk.markout}
          value={stats.markout.s30}
          format={formatBps}
          sub={`${formatBps(stats.markout.s30)} / ${formatBps(stats.markout.m5)} / ${formatBps(stats.markout.h1)} · ${copy.desk.horizons}`}
          tone="settle"
        />
        <Tile
          label={copy.desk.worst}
          value={stats.worstFillAboveFloorBps}
          format={formatBps}
          sub={copy.desk.worstSub}
        />
        <Tile label={copy.desk.refused} value={stats.refused} sub={copy.desk.refusedSub} tone="refuse" />
      </Tiles>

      <FuzzCounter fuzz={fuzz} />

      <Card className="mb-4.5">
        <CardHead
          icon={ChartLine}
          left={`${pair.base} / ${pair.quote} · fills against your floor`}
          right={`reference ${formatPrice(reference.price)}`}
        />
        <PriceChart state={state} />
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4.5 max-[1000px]:grid-cols-1">
        {/*
          * No height of its own: it stretches to the row, which the column beside it defines. The
          * tape is the one thing here that changes without the owner doing anything, so its frame
          * has to be the one thing that does not move.
          */}
        <Card className="flex flex-col">
          <CardHead icon={Receipt} left={copy.desk.tape} right={`${pair.base} / ${pair.quote}`} />
          <Tape entries={tape} pair={pair} />
        </Card>

        {owner ? (
        <div className="flex flex-col gap-4.5">
          {onSetup && (
            <Card>
              <CardHead icon={ArrowDownToLine} left={copy.onboarding.finishSetup} />
              <CardBody>
                <p className="serif m-0 mb-3 text-[13.5px] leading-relaxed text-muted">
                  {copy.onboarding.finishSetupNote}
                </p>
                <Act primary onClick={onSetup}>
                  {copy.onboarding.finishSetup}
                </Act>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHead
              icon={Wallet}
              left={copy.desk.vault}
              // Nothing is "under mandate" until a delegate exists to hold one.
              right={state.delegate ? `${inventory.length} under mandate` : copy.wallet.noMandate}
            />
            <CardBody>
              <dl className="m-0 text-[12.5px]">
                {inventory.map((h) => (
                  <div key={h.symbol} className="flex items-baseline justify-between gap-3 py-1">
                    <dt className="flex items-center gap-2 text-[10.5px] tracking-[0.08em] text-faint uppercase">
                      <TokenIcon symbol={h.symbol} size={15} />
                      {h.symbol}
                    </dt>
                    <dd className="m-0 text-right font-medium">
                      {/* A read that failed is not a zero balance and must not be rendered as one. */}
                      {Number.isNaN(h.amount) ? '—' : h.amount}
                      {h.mandateMax !== undefined && (
                        <span className="ml-2 text-[10.5px] font-normal text-faint">of {h.mandateMax}</span>
                      )}
                    </dd>
                  </div>
                ))}
                <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-rule pt-2">
                  <dt className="text-[10.5px] tracking-[0.08em] text-faint uppercase">{copy.desk.marketPrice}</dt>
                  <dd className="m-0 text-right font-medium">{formatPrice(reference.price)}</dd>
                </div>
              </dl>
              {/*
                * The exit, next to the balance it applies to. Not the panic path — that docks the
                * strategy first and lives on its own screen. This is the ordinary owner right the
                * vault enforces as onlyOwner, and a vault whose owner cannot see how to empty it
                * is asking for trust it says it does not need.
                */}
              {inventory.some((h) => h.amount > 0) && (
                <div className="mt-3 border-t border-rule pt-3">
                  <Act onClick={onWithdraw}>{copy.wallet.withdraw}</Act>
                  <p className="mt-2 mb-0 text-[11px] leading-relaxed text-faint">{copy.wallet.withdrawHint}</p>
                </div>
              )}
              <p className="mt-3 flex items-center gap-2 border-t border-rule pt-3 text-[11px] text-faint">
                <ChainlinkMark />
                {/* Linked, because "the reference" is a claim until someone can open it. */}
                {reference.feed ? (
                  <a
                    href={addressUrl(reference.feed)}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-brass"
                  >
                    {reference.name}
                  </a>
                ) : (
                  reference.name
                )}
                · {reference.ageSeconds}s
                <span className={feedFresh ? 'text-settle' : 'text-refuse'}>
                  <span className="mr-1 inline-block size-[6px] rounded-full bg-current align-[1px]" />
                  {feedFresh ? copy.desk.fresh : copy.desk.stale}
                </span>
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHead
              icon={ArrowDownToLine}
              left={copy.desk.standing}
              // Adjusted in place: leaving the board to change one number loses the tape, the
              // freshness reading and the fills the number is being judged against.
              right={
                /*
                 * While setup is unfinished there is one task, not two entry points into it. A
                 * floor registered on a vault with no funds, no guardian and no delegate protects
                 * nothing, and half-configured is the state nobody wants to explain later.
                 */
                <Ghost onClick={() => (onSetup ? onSetup() : setAdjusting(true))}>
                  <span className="flex items-center gap-1.5">
                    <Pencil size={11} strokeWidth={1.8} />
                    {floor.enforced ? copy.onboarding.adjust : copy.floor.set}
                  </span>
                </Ghost>
              }
            />
            <CardBody className="py-1">
              {[
                [`${copy.desk.selling} ${pair.base}`, `${copy.desk.neverBelow} ${price(sellFloor)}`, floor.enforced ? `−${floor.maxAdverseBps} bps from the reference` : copy.floor.setHint],
                [`${copy.desk.buying} ${pair.base}`, `${copy.desk.neverAbove} ${price(buyCeiling)}`, floor.enforced ? `−${floorBuy.maxAdverseBps} bps from the reference` : copy.floor.setHint],
                [copy.desk.feedDies, `${copy.desk.neverBelow} ${price(sellFloor)}`, copy.desk.backstopNote],
              ].map(([label, value, note]) => (
                <div key={label} className="flex flex-col gap-0.5 border-b border-rule py-2.5 last:border-b-0">
                  <span className="text-[10.5px] tracking-[0.09em] text-faint uppercase">{label}</span>
                  <span className="serif text-[15px] text-muted">
                    {value?.split(' ').slice(0, -1).join(' ')}{' '}
                    <b className="font-mono text-base font-semibold text-brass tabular-nums">
                      {value?.split(' ').at(-1)}
                    </b>
                  </span>
                  <span className="text-[11px] text-faint">{note}</span>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHead icon={Bot} left={copy.live.agentNow} right={<Activity size={12} strokeWidth={1.6} />} />
            <CardBody>
              {/* #111: the address, not a nickname — the published key has to be checkable. */}
              {state.delegate && (
                <div className="mb-3 border-b border-rule pb-3">
                  <span className="text-[10.5px] tracking-[0.08em] text-faint uppercase">
                    {copy.wallet.agentAddress}
                  </span>
                  <a
                    href={addressUrl(state.delegate)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-medium break-all hover:text-brass"
                  >
                    {state.delegate}
                    <ExternalLink size={11} strokeWidth={1.7} className="shrink-0 text-faint" />
                  </a>
                </div>
              )}
              <ul className="m-0 list-none space-y-1.5 p-0 text-[12.5px]">
                {agent.map((line) => (
                  <li key={line} className="text-muted">
                    <span className="mr-2 text-brass">›</span>
                    <span className="text-ink">{line}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
        ) : (
          <PublicAside
            state={state}
            connected={connected}
            onConnect={onConnect}
            onCreateVault={onCreateVault}
            creatingVault={creatingVault}
            canCreateVault={canCreateVault}
            checked={vaultChecked}
            vaultError={vaultError}
          />
        )}
      </div>

      {owner && (
        <FloorDialog
          state={state}
          open={adjusting}
          onClose={() => setAdjusting(false)}
          onLower={(bps) => {
            setAdjusting(false);
            onLower(bps);
          }}
          onRaise={(bps) => {
            setAdjusting(false);
            onRaise(bps);
          }}
        />
      )}

      <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-faint">
        <span>{live ? copy.desk.everyRowLive : copy.desk.everyRowSample}</span>
        <span className="text-muted">{copy.scope}.</span>
      </p>
    </>
  );
}
