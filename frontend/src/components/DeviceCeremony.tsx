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
 *
 * **All four wear the same body.** The panel used to be swapped out on the click: the screen the
 * owner had been reading disappeared and a column of terminal lines took its place, so the moment
 * of pressing Approve on the device was the moment the thing being approved left the page. Now the
 * click only puts the button to work, and every state after it is reported on the screen and in one
 * status line, in the places those things already were.
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
        {stage === 'absent' ? (
          <p className="serif mt-0 text-[14px] leading-relaxed text-muted">{copy.ceremony.absent}</p>
        ) : (
          <>
            <p className="serif mt-0 text-[14px] leading-relaxed text-muted">
              The device spells the action out in words instead of raw calldata. Whoever presses Approve can read it
              on the device screen itself.
            </p>

            {/*
              * What the device will display, verbatim and in order, before it lights up — and then
              * the answer it gave, in the same place. It used to be a drawn screen; it is the same
              * strings either way, and the rule §10 sets is about the strings matching rather than
              * about the picture.
              */}
            <div className="my-3">
              <DeviceScreen
                rows={rows}
                waiting={stage === 'waiting'}
                answer={stage === 'signed' ? 'approved' : stage === 'declined' ? 'rejected' : null}
                device={{
                  paired: ledger.presence === 'paired',
                  hint: ledger.presence === 'paired' ? copy.ceremony.paired : copy.ceremony.unknownDevice,
                }}
              />
            </div>

            {/*
              * One line, four things it can say. Fixed height, because a status that changes the
              * page's height moves the button under the reader's cursor at the exact moment they
              * are deciding whether to press it again.
              */}
            <p className="serif mb-3 min-h-[3.4em] text-[13.5px] leading-relaxed text-muted">
              {stage === 'waiting' ? (
                <>
                  {payloadLine} {copy.ceremony.takeYourTime}
                </>
              ) : stage === 'signed' ? (
                <span className="text-settle">{copy.ceremony.signed}</span>
              ) : stage === 'declined' ? (
                <>
                  {copy.ceremony.declined} {standingLine}
                </>
              ) : (
                copy.ceremony.onlyIfMatches
              )}
            </p>

            {stage === 'signed' ? (
              <Act wide primary onClick={onDone}>
                continue
              </Act>
            ) : stage === 'declined' ? (
              <div className="flex gap-2">
                <Ghost onClick={() => setStage('pre')}>try again</Ghost>
                {onBack && <Ghost onClick={onBack}>back</Ghost>}
              </div>
            ) : (
              <Act
                wide
                primary
                busy={stage === 'waiting'}
                busyLabel="awaiting approval on device"
                disabled={ledger.presence === 'unsupported'}
                onClick={async () => {
                  setStage('waiting');
                  /*
                   * Read the device before asking it for anything. `connect()` returns the address
                   * it read rather than only storing it, because the state from this render is a
                   * render behind — reading `ledger.address` here would check the previous device.
                   */
                  const at = ledger.address ?? (await ledger.connect());
                  setAttached(at);
                  if (expect && at && at.toLowerCase() !== expect.toLowerCase()) {
                    setStage('pre');
                    return;
                  }
                  const signature = await ledger.signTypedData({ rows });
                  setStage(signature ? 'signed' : 'declined');
                }}
              >
                {copy.ceremony.continue}
              </Act>
            )}

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

            {/* Stand-ins for the two answers a device gives, so the states can be built without one. */}
            {import.meta.env?.DEV && stage === 'waiting' && (
              <div className="mt-3 flex gap-2">
                <Ghost onClick={() => setStage('signed')}>approved</Ghost>
                <Ghost onClick={() => setStage('declined')}>rejected</Ghost>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
