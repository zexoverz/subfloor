import { useState } from 'react';
import { copy } from '../../copy.ts';
import { Panel, Label, Todo } from '../Panel.tsx';
import { Primary, Ghost } from '../Button.tsx';
import { floorPriceFromBps, formatPrice } from '../../lib/rate.ts';
import type { VaultState } from '../../types.ts';

type Stage = 'pre' | 'waiting' | 'declined' | 'absent' | 'scheduled';

/**
 * The two hardware moments: signing the mandate, and lowering a floor. Designed around the device
 * being slow and physical — that slowness is the feature, and the screen's job is to make the
 * wait read as deliberation instead of latency. No spinner, no countdown, no timeout.
 *
 * Rejection is a success of the system and is styled neutrally, never as an error.
 */
export function Ceremony({
  state,
  draftBps,
  onDone,
  onBack,
}: {
  state: VaultState;
  draftBps: number;
  onDone: () => void;
  onBack: () => void;
}) {
  const [stage, setStage] = useState<Stage>('pre');
  const { pair, reference, floor, mandate } = state;

  // What the device will render, from the same values the device is asked to sign. In the shipped
  // app both sides come from one ERC-7730 descriptor: a screen that disagrees with the device is
  // a stop-everything bug, and this string is the only reason clear-signing means anything.
  const deviceText = [
    `Lower ${pair.base}/${pair.quote} floor`,
    `to ${(draftBps / 100).toFixed(1)}% below reference`,
    `delegate: ${mandate.delegateLabel}`,
    `expires: ${mandate.expiresInDays}d`,
  ].join('\n');

  const standing = formatPrice(floorPriceFromBps(reference.price, floor.maxAdverseBps));

  return (
    <>
      {stage === 'pre' && (
        <Panel>
          <Label>{copy.ceremony.willDisplay}</Label>
          <pre className="num rounded-lg border border-line bg-bg px-5 py-4 text-sm whitespace-pre">
            {deviceText}
          </pre>
          <p className="my-4 text-sm text-dim">{copy.ceremony.onlyIfMatches}</p>
          <Primary device onClick={() => setStage('waiting')}>
            {copy.ceremony.continue}
          </Primary>
        </Panel>
      )}

      {stage === 'waiting' && (
        <Panel>
          <Label>{copy.ceremony.waiting}</Label>
          <pre className="num rounded-lg border border-line bg-bg px-5 py-4 text-sm whitespace-pre">
            {deviceText}
          </pre>
          <p className="my-4 text-sm text-dim">{copy.ceremony.takeYourTime}</p>
          <div className="flex gap-2">
            {/* Skeleton stand-ins for the device's two answers. */}
            <Ghost onClick={() => (state.pendingLowering ? setStage('scheduled') : onDone())}>confirmed</Ghost>
            <Ghost onClick={() => setStage('declined')}>declined</Ghost>
            <Ghost onClick={() => setStage('absent')}>no device</Ghost>
          </div>
        </Panel>
      )}

      {stage === 'declined' && (
        <Panel>
          <Label>declined</Label>
          <p className="text-sm">
            {copy.ceremony.declined} Your floor is still <span className="num">{standing}</span>.
          </p>
          <div className="mt-4">
            <Ghost onClick={onBack}>back</Ghost>
          </div>
        </Panel>
      )}

      {stage === 'absent' && (
        <Panel>
          <Label>no device</Label>
          <p className="text-sm">{copy.ceremony.absent}</p>
        </Panel>
      )}

      {stage === 'scheduled' && (
        <Panel>
          <Label>signed</Label>
          <p className="text-sm">
            {copy.ceremony.scheduled}{' '}
            <span className="num">
              {new Date((state.pendingLowering?.effectiveAt ?? 0) * 1000).toLocaleTimeString('en-US')}
            </span>
            . Until then the standing floor of <span className="num">{standing}</span> is what settlement uses.
          </p>
        </Panel>
      )}

      <Todo>
        skeleton: these strings are hand-written. They must be generated from the ERC-7730
        descriptor the device renders (#36), or screen and device can drift — which is the one bug
        this screen exists to make impossible. A deployed registry with LOWERING_DELAY &gt; 0 ends
        here in the scheduled state, not in a new floor.
      </Todo>
    </>
  );
}
