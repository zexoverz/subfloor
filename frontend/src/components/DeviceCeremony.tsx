import { useState } from 'react';
import { copy } from '../copy.ts';
import { Act, Ghost } from './Button.tsx';
import { DeviceReview } from './DeviceReview.tsx';
import { useLedger } from '../lib/ledger.ts';

/**
 * The two hardware moments, as a body that can sit in a screen or in a sheet.
 *
 * Extracted because lowering a floor is decided on the board and should be finished there: sending
 * someone to another page to answer a device question loses the fills the decision was made
 * against. The mandate signature uses the same body during onboarding.
 *
 * Four states, per §10 and #129: what the device will show, waiting, declined, and device-absent —
 * and the absent one is known before this is offered, from enumeration on page load.
 */
type Stage = 'pre' | 'waiting' | 'declined' | 'signed' | 'absent';

export function DeviceCeremony({
  rows,
  payloadLine,
  standingLine,
  onDone,
  onBack,
}: {
  /** Exactly what the device will render, in its order. */
  rows: [string, string][];
  payloadLine: string;
  /** What remains true if they decline — the reassurance that makes rejection safe to choose. */
  standingLine: string;
  onDone: () => void;
  onBack?: () => void;
}) {
  const ledger = useLedger();
  const [stage, setStage] = useState<Stage>(ledger.presence === 'unsupported' ? 'absent' : 'pre');

  return (
    <div className="grid items-start gap-5 md:grid-cols-[minmax(0,300px)_1fr]">
      <DeviceReview rows={rows} waiting={stage === 'waiting'} />

      <div>
        {stage === 'pre' && (
          <>
            <p className="serif mt-0 text-[14px] leading-relaxed text-muted">
              The device spells the action out in words instead of raw calldata. Whoever presses Approve can read it
              on the device screen itself.
            </p>
            <p className="mb-3 text-[11.5px] text-faint">
              {ledger.presence === 'paired' ? (
                <span className="text-settle">
                  <span className="mr-1 inline-block size-[6px] rounded-full bg-current align-[1px]" />
                  {copy.ceremony.paired}
                </span>
              ) : (
                copy.ceremony.unknownDevice
              )}
            </p>
            <Act
              wide
              primary
              disabled={ledger.presence === 'unsupported'}
              onClick={async () => {
                setStage('waiting');
                if (!ledger.address) await ledger.connect();
                const signature = await ledger.signTypedData({ rows });
                setStage(signature ? 'signed' : 'declined');
              }}
            >
              {copy.ceremony.continue}
            </Act>
            <p className="mt-2 text-[11.5px] text-faint">{copy.ceremony.onlyIfMatches}</p>
          </>
        )}

        {stage === 'waiting' && (
          <>
            <div className="text-[11.5px] leading-[1.9] text-muted">
              <div>
                <b className="font-medium text-ink">›</b> {payloadLine}
              </div>
              <div>
                <b className="font-medium text-ink">›</b> awaiting approval on device{' '}
                <span className="animate-pulse">▍</span>
              </div>
            </div>
            {/* No spinner, no countdown, and nothing here cancels it. */}
            <p className="serif mt-3 text-[14px] text-muted">{copy.ceremony.takeYourTime}</p>
            {import.meta.env?.DEV && (
              <div className="mt-3 flex gap-2">
                <Ghost onClick={() => setStage('signed')}>approved</Ghost>
                <Ghost onClick={() => setStage('declined')}>rejected</Ghost>
              </div>
            )}
          </>
        )}

        {/* Rejection is a success of the system, and is styled as an ordinary outcome. */}
        {stage === 'declined' && (
          <>
            <p className="serif mt-0 text-[14px] text-muted">
              {copy.ceremony.declined} {standingLine}
            </p>
            <div className="mt-3 flex gap-2">
              <Ghost onClick={() => setStage('pre')}>try again</Ghost>
              {onBack && <Ghost onClick={onBack}>back</Ghost>}
            </div>
          </>
        )}

        {stage === 'signed' && (
          <>
            <p className="serif mt-0 text-[14px] text-muted">{copy.ceremony.signed}</p>
            <div className="mt-3">
              <Act primary onClick={onDone}>
                continue
              </Act>
            </div>
          </>
        )}

        {stage === 'absent' && <p className="serif mt-0 text-[14px] text-muted">{copy.ceremony.absent}</p>}
      </div>
    </div>
  );
}
