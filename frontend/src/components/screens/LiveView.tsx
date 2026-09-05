import { Activity, ArrowDownToLine, Bot, ChartLine, Receipt, Wallet } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Card, CardBody, CardHead, Foot, Note } from '../Card.tsx';
import { Tile, Tiles } from '../Tiles.tsx';
import { FuzzCounter } from '../FuzzCounter.tsx';
import { Tape } from '../Tape.tsx';
import { PriceChart } from '../PriceChart.tsx';
import { formatBps, formatPrice, rateToPrice } from '../../lib/rate.ts';
import type { VaultState } from '../../types.ts';

/**
 * The desk: the owner's home while the agent trades. One rule — every number here is read from the
 * index, the same queries the public page runs, so the owner never sees a figure a stranger cannot
 * check. Refusals are a headline tile, never buried: they are the product's proudest number.
 */
export function LiveView({ state }: { state: VaultState }) {
  const { pair, stats, tape, agent, inventory, floor, floorBuy, reference, fuzz } = state;
  const sellFloor = rateToPrice(floor.absoluteRate, pair.baseDecimals, pair.quoteDecimals);
  const buyCeiling = 1 / rateToPrice(floorBuy.absoluteRate, pair.quoteDecimals, pair.baseDecimals);
  const feedFresh = reference.ageSeconds < reference.stalenessBoundSeconds;

  return (
    <>
      <Tiles>
        <Tile label={copy.desk.fills} value={stats.fills} sub={`${copy.desk.fillsSub} · ${stats.since}`} />
        <Tile
          label={copy.desk.markout}
          value={stats.medianVsMidBps}
          format={formatBps}
          sub={copy.desk.markoutSub}
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
          <p className="serif m-0 border-b border-rule px-4 py-3 text-[15px] leading-snug text-muted">
            The vault has been traded against <b className="font-medium text-ink">{stats.fills}</b> times. It refused{' '}
            <b className="font-medium text-refuse">{stats.refused}</b>. It has never once settled at a bad price.
          </p>
          <Tape entries={tape} pair={pair} />
        </Card>

        <div className="flex flex-col gap-4.5">
          <Card>
            <CardHead
              icon={Wallet}
              left={copy.desk.vault}
              right={`${inventory.length} under mandate`}
            />
            <CardBody>
              <dl className="m-0 text-[12.5px]">
                {inventory.map((h) => (
                  <div key={h.symbol} className="flex items-baseline justify-between gap-3 py-1">
                    <dt className="text-[10.5px] tracking-[0.08em] text-faint uppercase">{h.symbol}</dt>
                    <dd className="m-0 text-right font-medium">
                      {h.amount}
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
              <p className="mt-2 text-[11px] text-faint">
                each token bounded separately by the mandate — a summed bound is decimals-blind, and the
                agent would choose the split
              </p>
              <Foot>
                {reference.name}, updated <b className="font-medium text-ink">{reference.ageSeconds} s</b> ago —{' '}
                <span className={feedFresh ? 'text-settle' : 'text-refuse'}>
                  <span className="mr-1 inline-block size-[6px] rounded-full bg-current align-[1px]" />
                  {feedFresh ? copy.desk.fresh : copy.desk.stale}
                </span>
                . Past the staleness bound the vault stops trading rather than guess.
              </Foot>
            </CardBody>
          </Card>

          <Card>
            <CardHead icon={ArrowDownToLine} left={copy.desk.standing} />
            <CardBody className="py-1">
              {[
                [`${copy.desk.selling} ${pair.base}`, `${copy.desk.neverBelow} ${formatPrice(sellFloor)}`, `−${floor.maxAdverseBps} bps from the reference`],
                [`${copy.desk.buying} ${pair.base}`, `${copy.desk.neverAbove} ${formatPrice(buyCeiling)}`, `−${floorBuy.maxAdverseBps} bps from the reference`],
                [copy.desk.feedDies, `${copy.desk.neverBelow} ${formatPrice(sellFloor)}`, copy.desk.backstopNote],
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
      </div>

      <Note className="serif mt-4.5 text-[14.5px]">{copy.desk.everyRow}</Note>
      <Note className="serif text-[14.5px]">{copy.scope}</Note>
    </>
  );
}
