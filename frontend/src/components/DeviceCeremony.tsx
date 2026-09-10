import { useState } from 'react';
import { copy } from '../copy.ts';
import { Act, Ghost } from './Button.tsx';
import { DeviceReview } from './DeviceReview.tsx';
import { DeviceScreen } from './DeviceScreen.tsx';
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
  expect,
  payloadLine,
  standingLine,
  onDone,
  onBack,
}: {
  /** Exactly what the device will render, in its order. */
  rows: [string, string][];
  /**
   * The device the registry has on file for this vault, when there is one.
   *
   * Checked before anything is signed, because a signature from the wrong Ledger is not a failure
   * the owner finds out about here — it is a transaction that reverts later, or a mandate the vault
   * will not honour, and either way the moment to catch it is while the device is in their hand.
   * A signature is cheap to produce and expensive to discover was worthless.
   */
  expect?: `0x${string}` | null;
  payloadLine: string;
  /** What remains true if they decline — the reassurance that makes rejection safe to choose. */
  standingLine: string;
  onDone: () => void;
  onBack?: () => void;
}) {
  const ledger = useLedger();
  const [stage, setStage] = useState<Stage>(ledger.presence === 'unsupported' ? 'absent' : 'pre');
  /**
   * Which device is actually attached, once it has been asked.
   *
   * Null until the read happens — and null is not "the wrong one". Everything below distinguishes
   * the three states, because treating "not asked yet" as a mismatch would refuse a correct device
   * and treating it as a match would defeat the check entirely.
   */
  const [attached, setAttached] = useState<`0x${string}` | null>(null);
  const mismatch =
    expect && attached ? attached.toLowerCase() !== expect.toLowerCase() : false;

  return (
    <div className="grid items-start gap-5 md:grid-cols-[minmax(0,300px)_1fr]">
      <DeviceReview />

      <div>
        {stage === 'pre' && (
          <>
            <p className="serif mt-0 text-[14px] leading-relaxed text-muted">
              The device spells the action out in words instead of raw calldata. Whoever presses Approve can read it
              on the device screen itself.
            </p>
            {/*
              * What the device will display, verbatim and in order, before it lights up. It used to
              * be a drawn screen; it is the same strings either way, and the rule §10 sets is about
              * the strings matching rather than about the picture.
              */}
            <div className="mb-3 text-[11.5px] leading-[1.9] text-muted">
              <DeviceScreen rows={rows} waiting={false} />
            </div>
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
                /*
                 * Read the device before asking it for anything. `connect()` returns the address it
                 * read rather than only storing it, because the state from this render is a render
                 * behind — reading `ledger.address` here would check the previous device.
                 */
                const at = ledger.address ?? (await ledger.connect());
                setAttached(at);
                if (expect && at && at.toLowerCase() !== expect.toLowerCase()) return;
                setStage('waiting');
                const signature = await ledger.signTypedData({ rows });
                setStage(signature ? 'signed' : 'declined');
              }}
            >
              {copy.ceremony.continue}
            </Act>
            {/*
              * Named, not just refused. "Wrong device" leaves the owner guessing which of theirs it
              * is; the two addresses side by side answer it without them going to look.
              */}
            {mismatch && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-refuse">
                {copy.ceremony.wrongDevice}
                <span className="t-num mt-1 block text-faint">
                  {copy.ceremony.attached} {attached}
                  <br />
                  {copy.ceremony.registered} {expect}
                </span>
              </p>
            )}
            <p className="mt-2 text-[11.5px] text-faint">{copy.ceremony.onlyIfMatches}</p>
          </>
        )}

        {stage === 'waiting' && (
          <>
            <div className="text-[11.5px] leading-[1.9] text-muted">
              {/* The same rows again while it waits, so the device and the screen can be compared
                  without the reader having to remember what was there a moment ago. */}
              <DeviceScreen rows={rows} waiting={stage === 'waiting'} />
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
