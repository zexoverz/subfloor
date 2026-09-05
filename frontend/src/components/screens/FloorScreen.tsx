import { useState } from 'react';
import { copy } from '../../copy.ts';
import { Panel, Label, Note, Todo } from '../Panel.tsx';
import { Primary, Ghost } from '../Button.tsx';
import { FloorAxis } from '../FloorAxis.tsx';
import { floorPriceFromBps, formatPrice } from '../../lib/rate.ts';
import type { VaultState } from '../../types.ts';

const MIN_SAMPLE = 100;
const DETENT_BPS = 25;

/**
 * The heart of the product: a distribution becomes one number, and the number a human signs is
 * calibrated from realized fills rather than guessed.
 *
 * The absolute price is the headline and the bps figure the subtitle — a non-quant chooses a
 * price, not a deviation. The handle drags in bps because that is what the registry stores.
 *
 * Raise and lower are two different buttons, never an explanation: the asymmetry is the design,
 * and the screen teaches it by behaving differently.
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
  const [draftBps, setDraftBps] = useState(floor.enforced ? floor.maxAdverseBps : calibration.houseDefaultBps);
  const [detail, setDetail] = useState(false);

  const coldStart = calibration.sampleCount < MIN_SAMPLE;
  const draftPrice = floorPriceFromBps(reference.price, draftBps);
  // A smaller tolerance is a stronger floor, so raising is dragging toward the reference.
  const raising = !floor.enforced || draftBps <= floor.maxAdverseBps;

  return (
    <>
      <Panel>
        <Label>{copy.floor.title}</Label>
        <div className="num text-4xl tracking-tight">
          {formatPrice(draftPrice)} {pair.quote} per {pair.base}
        </div>
        <div className="mt-1 text-sm text-dim">{draftBps} bps below the live reference</div>
        {!floor.enforced && <Note className="mt-2">{copy.floor.notConfigured}</Note>}

        <div className="mt-6 flex items-center gap-3">
          <Note>
            {coldStart
              ? copy.floor.coldStart
              : `fills on this venue, last ${calibration.windowDays} days — ${calibration.sampleCount} fills, from the public index`}
          </Note>
          <Ghost>{copy.floor.runQuery}</Ghost>
        </div>

        <FloorAxis calibration={calibration} floorBps={draftBps} />

        <input
          type="range"
          min={DETENT_BPS}
          max={400}
          step={DETENT_BPS}
          value={draftBps}
          onChange={(e) => setDraftBps(Number(e.target.value))}
          className="w-full accent-floor"
        />
        <div className="flex justify-between text-xs text-dim">
          <span>
            {copy.floor.reference} {formatPrice(reference.price)} ({reference.name})
          </span>
          <span>{copy.floor.yourFloor}</span>
        </div>

        <div className="mt-5 space-y-2 border-t border-line pt-5 text-sm text-dim">
          {!coldStart && (
            <p>
              fewer than 1 in 100 past fills landed beyond p99; your floor sits{' '}
              {draftBps - Math.abs(calibration.p99Bps)} bps beyond that
            </p>
          )}
          <p>{formatPrice(draftPrice)} also holds on its own, whatever the reference does</p>
          <p>
            {copy.floor.failClosed} <Ghost onClick={() => setDetail(!detail)}>{copy.floor.detail}</Ghost>
          </p>
          {detail && (
            <Note>
              the reference typically updates about every {Math.round(reference.p50IntervalSeconds / 6) / 10} min
              (p50 {reference.p50IntervalSeconds}s over {reference.intervalSample} measured intervals); the longest
              quiet spell measured was {reference.maxIntervalSeconds}s.
            </Note>
          )}
        </div>

        <div className="mt-5">
          <Primary device={!raising} onClick={() => (raising ? onRaise(draftBps) : onLower(draftBps))}>
            {raising ? copy.floor.raise : copy.floor.lower}
          </Primary>
          <Note className="mt-2 text-center">{raising ? copy.floor.raiseHint : copy.floor.lowerHint}</Note>
        </div>
      </Panel>

      <Todo>
        skeleton: the cloud is fixture bps, not a subgraph query (#42), and a raise must carry the
        absolute backstop through unchanged or the registry reverts NotARaise.
      </Todo>
    </>
  );
}
