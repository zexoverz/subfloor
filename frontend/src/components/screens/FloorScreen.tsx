import { useState } from 'react';
import { ArrowDownToLine, ChartColumn, KeyRound } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Card, CardBody, CardHead, Note, Todo } from '../Card.tsx';
import { Act, Ghost, Locked, Stepper } from '../Button.tsx';
import { FloorHistogram } from '../FloorHistogram.tsx';
import { floorPriceFromBps, formatPrice, rateToPrice } from '../../lib/rate.ts';
import type { VaultState } from '../../types.ts';

const MIN_SAMPLE = 100;
const DETENT_BPS = 25;

/**
 * The heart of the product: a distribution becomes one number, and the number a human signs is
 * calibrated from realized fills rather than guessed.
 *
 * The absolute price is the headline and the bps figure the subtitle — a non-quant chooses a price,
 * not a deviation. Tighten and loosen are two different controls, never an explanation: the
 * asymmetry is the design, and the screen teaches it by behaving differently.
 */
export function FloorScreen({
  state,
  onLower,
  onRaise,
}: {
  state: VaultState;
  onLower: (bps: number) => void;
  onRaise: (bps: number) => void;
}) {
  const { pair, floor, reference, calibration } = state;
  const [detail, setDetail] = useState(false);
  const current = floor.enforced ? floor.maxAdverseBps : calibration.houseDefaultBps;
  const [draftBps, setDraftBps] = useState(current - DETENT_BPS);

  const coldStart = calibration.sampleCount < MIN_SAMPLE;
  const currentPrice = floorPriceFromBps(reference.price, current);
  const draftPrice = floorPriceFromBps(reference.price, draftBps);
  const loosened = Math.max(500, current + 400);
  const loosenedPrice = floorPriceFromBps(reference.price, loosened);
  const worstEver = Math.max(...calibration.fillsBps.map(Math.abs));

  return (
    <>
      <Card>
        <CardHead
          icon={ArrowDownToLine}
          left={`Your floor · ${pair.base} → ${pair.quote}`}
          right={state.addresses.vault ? `recipient ${state.addresses.vault.slice(0, 6)}…` : 'recipient pending'}
        />
        <CardBody>
          <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2">
            <span className="text-[clamp(28px,5vw,40px)] font-semibold tracking-[-0.03em] text-brass">
              −{current} bps
            </span>
            <span className="serif max-w-[44ch] text-[15px] text-muted">
              Nothing of yours sells below{' '}
              <b className="font-mono font-semibold text-ink tabular-nums">{formatPrice(currentPrice)}</b>{' '}
              {pair.quote}. The reference is {formatPrice(reference.price)} right now.
            </span>
          </div>

          {/*
            * Both floor forms are on screen at once: the reference-relative one is the number the
            * owner moves, the absolute backstop is the quiet line under it — reassurance rather
            * than a second decision.
            */}
          <p className="mt-3 text-[12px] text-muted">
            <b className="font-semibold text-ink">
              {formatPrice(rateToPrice(floor.absoluteRate, pair.baseDecimals, pair.quoteDecimals))}
            </b>{' '}
            {copy.floorControl.backstopHolds}
          </p>
          <p className="mt-1 text-[12px] text-muted">
            {copy.floor.failClosed} <Ghost onClick={() => setDetail(!detail)}>{copy.floor.detail}</Ghost>
          </p>
          {detail && (
            <Note className="mt-2 text-faint">
              the reference typically updates about every {Math.round(reference.p50IntervalSeconds / 6) / 10} min
              (p50 {reference.p50IntervalSeconds}s over {reference.intervalSample} measured intervals); the longest
              quiet spell measured was {reference.maxIntervalSeconds}s, and the registry's bound is{' '}
              {reference.stalenessBoundSeconds}s.
            </Note>
          )}

          <div className="mt-6 mb-2.5 flex flex-wrap items-center gap-3">
            <p className="serif m-0 text-[15px] text-muted">
              {coldStart ? copy.floor.coldStart : `${copy.floorControl.chartTitle} — ${calibration.sampleCount} fills`}
            </p>
            <Ghost>{copy.floor.runQuery}</Ghost>
          </div>
          <FloorHistogram calibration={calibration} floorBps={current} />
          <p className="serif mt-3 text-[13.5px] text-faint">{copy.floorControl.chartNote}</p>

          <div className="mt-4 flex flex-wrap gap-5.5 border-t border-rule pt-3.5 text-[11.5px] text-faint">
            <span>
              {copy.floorControl.usually} <b className="text-[12.5px] font-semibold text-ink">{calibration.p50Bps} bps</b>
            </span>
            <span>
              {copy.floorControl.oneInHundred}{' '}
              <b className="text-[12.5px] font-semibold text-ink">{calibration.p99Bps} bps</b>
            </span>
            <span>
              {copy.floorControl.worstEver} <b className="text-[12.5px] font-semibold text-ink">−{worstEver} bps</b>
            </span>
            <span>
              {copy.floorControl.yourFloor} <b className="text-[12.5px] font-semibold text-brass">−{current} bps</b>
            </span>
          </div>

          <Note className="mt-3.5">
            Your floor sits <b className="font-semibold text-brass">{current - worstEver} bps</b> past the worst fill you
            have ever taken — so it never gets in the way of normal trading, and a hijacked agent hits it immediately.
          </Note>
        </CardBody>
      </Card>

      <div className="mt-4.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4.5 max-[820px]:grid-cols-1">
        <Card>
          <CardHead icon={ChartColumn} left={copy.floorControl.tighten} />
          <CardBody>
            <Note className="mt-0">{copy.floorControl.tightenNote}</Note>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <Stepper
                value={draftBps}
                onChange={setDraftBps}
                step={DETENT_BPS}
                min={DETENT_BPS}
                max={current}
                format={(n) => `−${n}`}
              />
              <span className="text-[11px] text-faint">← safer · riskier →</span>
            </div>
            <div className="mt-3">
              <Act primary disabled={draftBps >= current} onClick={() => onRaise(draftBps)}>
                {copy.floorControl.tightenTo} −{draftBps} bps · {formatPrice(draftPrice)}
              </Act>
            </div>
            <p className="serif mt-3 border-l-2 border-brass bg-brass-wash px-3 py-2 text-[13.5px] leading-relaxed text-ink">
              {copy.floorControl.oneWay} Going back to{' '}
              <b className="font-mono font-semibold text-brass tabular-nums">−{current} bps</b> would need your device.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHead icon={KeyRound} left={copy.floorControl.loosen} />
          <CardBody>
            <Note className="mt-0">{copy.floorControl.loosenNote}</Note>
            <div className="mt-3">
              <Locked onClick={() => onLower(loosened)}>
                {copy.floorControl.loosenTo} −{loosened} bps
              </Locked>
            </div>
            <Note className="mt-2.5 text-faint">
              −{loosened} bps would let a fill through at {formatPrice(loosenedPrice)} — below every fill in the chart
              above. That is why it needs the device.
            </Note>
          </CardBody>
        </Card>
      </div>

      <Note className="serif mt-4.5 text-[14.5px]">{copy.floorControl.rebuilt}</Note>

      <Todo>
        skeleton: the distribution is fixture bps, not a subgraph query (#42), and a tighten must
        carry the absolute backstop through unchanged or the registry reverts NotARaise.
      </Todo>
    </>
  );
}
