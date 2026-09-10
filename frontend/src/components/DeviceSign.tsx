import { useState } from 'react';
import { Usb } from 'lucide-react';
import { copy } from '../copy.ts';
import { Act, Ghost } from './Button.tsx';
import { Card, CardBody, CardHead } from './Card.tsx';
import { DeviceReview } from './DeviceReview.tsx';
import { DeviceScreen } from './DeviceScreen.tsx';
import type { Ledger } from '../lib/ledger.ts';

export type SignPurpose = 'mandate' | 'lower';

type Stage = 'pre' | 'waiting' | 'signed' | 'declined' | 'absent' | 'scheduled';

/**
 * The device signature, wherever it is asked for.
 *
 * §10 puts the whole of setup on one screen ending in one signature, and sending the owner to a
 * separate route to sign broke that: the sheet they had been filling in vanished, and the thing
 * they were authorising was no longer on screen beside the device asking them to authorise it.
 * So this is a panel rather than a page, and the sheet hosts it in place.
 *
 * The rows are the payload as the device will render it. Screen and device disagreeing is the one
 * bug this component exists to make impossible, which is why both read from the same array.
 */
export function DeviceSign({
  rows,
  expect,
  purpose,
  payloadLine,
  standing,
  scheduledAt,
  typedData,
  ledger,
  onSigned,
  onDone,
  onBack,
}: {
  rows: [string, string][];
  /**
   * The device the registry has on file, when there is one.
   *
   * A mandate signed by the wrong Ledger is not refused here — it is a signature the vault will not
   * honour, discovered the first time the agent tries to ship. The moment to catch that is while
   * the device is still in the owner's hand.
   */
  expect?: `0x${string}` | null;
  purpose: SignPurpose;
  /** The call being built, spelled out while the device is thinking. */
  payloadLine: string;
  /**
   * The EIP-712 object the device is actually asked to sign.
   *
   * Separate from `rows`, which is what the screen shows, and that separation is the risk this
   * component exists to manage: the two must describe the same thing. Until a descriptor generates
   * both (#36) they are written together and reviewed together.
   *
   * Null when the payload cannot be built yet — an unset delegate, an unread nonce — in which case
   * there is nothing to ask the device and the panel says so rather than sending it noise.
   */
  typedData: object | null;
  /** The floor that still holds if this is declined — the reassurance a decline needs. */
  standing: string;
  /** Set when the registry delays lowerings, in which case signing schedules rather than applies. */
  scheduledAt?: number | null;
  /*
   * Passed in, never created here. useLedger keeps the paired session in a ref, so a second
   * instance is a second session — and it is always the empty one. The owner paired on the sheet
   * and this panel then asked a different, unpaired hook to sign, which returned null without ever
   * reaching the device: nothing appeared on the Ledger and the screen called it a decline.
   */
  ledger: Ledger;
  /** Receives the signature, because producing one and dropping it is how the step never finished. */
  onSigned?: (signature: string) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  // Starts at 'pre' unless the browser cannot speak to a device at all, which is worth saying to
  // someone who has already completed a form.
  const [stage, setStage] = useState<Stage>(ledger.presence === 'unsupported' ? 'absent' : 'pre');
  /** Which device is attached, once asked. Null is "not asked", never "the wrong one". */
  const [attached, setAttached] = useState<`0x${string}` | null>(null);
  const mismatch = expect && attached ? attached.toLowerCase() !== expect.toLowerCase() : false;
  /** The kit's own step name, so a wait says what it is waiting on. */
  const [step, setStep] = useState<string | null>(null);
  /** Approved and applied, or approved and waiting out the registry's delay — both are a yes. */
  const answered = stage === 'signed' || stage === 'scheduled';

  return (
    <Card>
      <CardHead
        icon={Usb}
        left={`Ledger · ${purpose === 'lower' ? 'lower the floor' : 'authorise the agent'}`}
        right={stage === 'waiting' ? 'waiting for device' : stage}
      />
      <CardBody>
        <div className="grid grid-cols-[minmax(0,290px)_1fr] items-start gap-5.5 max-[620px]:grid-cols-1">
          <DeviceReview />

          <div>
            {stage === 'absent' ? (
              <p className="serif mt-0 text-[14.5px] text-muted">{copy.ceremony.absent}</p>
            ) : (
              <>
                <p className="serif mt-0 text-[14.5px] leading-relaxed text-muted">
                  The device spells the action out in words instead of raw calldata. Whoever presses Approve can read
                  the pair, the new floor and the price it binds at, on the device screen itself.
                </p>

                {/*
                  * What the device will display, verbatim and in order, before it lights up — and
                  * then the answer it gave, in the same place. §10 makes this the point of the
                  * screen: the habit it teaches is "confirm only if it matches", and there is
                  * nothing to match against if the strings are not here.
                  */}
                <div className="my-3">
                  <DeviceScreen
                    rows={rows}
                    waiting={stage === 'waiting'}
                    answer={stage === 'declined' ? 'rejected' : answered ? 'approved' : null}
                    device={{
                      paired: ledger.presence === 'paired',
                      hint: ledger.presence === 'paired' ? copy.ceremony.paired : copy.ceremony.unknownDevice,
                    }}
                  />
                </div>

                {mismatch && (
                  <p className="mb-3 text-[11.5px] leading-relaxed text-refuse">
                    {copy.ceremony.wrongDevice}
                    <span className="t-num mt-1 block text-faint">
                      {copy.ceremony.attached} {attached}
                      <br />
                      {copy.ceremony.registered} {expect}
                    </span>
                  </p>
                )}

                {/*
                  * One line, and it keeps its height. A status that grows the page moves the button
                  * under the reader's cursor at the moment they are deciding whether to press it.
                  */}
                <p className="serif mb-3 min-h-[3.4em] text-[14px] leading-relaxed text-muted">
                  {stage === 'waiting' ? (
                    <>
                      {step ? step.replace('signer.eth.steps.', '') : payloadLine} {copy.ceremony.takeYourTime}
                    </>
                  ) : stage === 'signed' ? (
                    <span className="text-settle">{copy.ceremony.signed}</span>
                  ) : stage === 'scheduled' ? (
                    <>
                      {copy.ceremony.scheduled}{' '}
                      <b className="font-mono font-semibold text-floor tabular-nums">
                        {new Date((scheduledAt ?? 0) * 1000).toLocaleTimeString('en-US')}
                      </b>
                      . Until then the standing floor of{' '}
                      <b className="font-mono font-semibold text-ink tabular-nums">{standing}</b> is what settlement
                      uses.
                    </>
                  ) : stage === 'declined' ? (
                    <>
                      {copy.ceremony.declined} Your floor is still{' '}
                      <b className="font-mono font-semibold text-floor tabular-nums">{standing}</b>.
                    </>
                  ) : (
                    copy.ceremony.onlyIfMatches
                  )}
                </p>

                {stage === 'signed' || stage === 'scheduled' ? (
                  <Ghost onClick={onDone}>continue</Ghost>
                ) : stage === 'declined' ? (
                  <Ghost onClick={onBack}>back</Ghost>
                ) : (
                  <Act
                    primary
                    busy={stage === 'waiting'}
                    busyLabel="awaiting approval on device"
                    disabled={ledger.presence === 'unsupported'}
                    onClick={async () => {
                      setStage('waiting');
                      // The real thing: the device renders the payload and answers. A decline and
                      // an unreachable device are both ordinary outcomes, not errors.
                      /*
                       * Read the device before asking it for anything. `connect()` returns what it
                       * read rather than only storing it — `ledger.address` here is a render behind,
                       * so checking it would check the previous device.
                       */
                      const at = ledger.address ?? (await ledger.connect());
                      setAttached(at);
                      if (expect && at && at.toLowerCase() !== expect.toLowerCase()) {
                        setStage('pre');
                        return;
                      }
                      // `rows` is what the screen renders; this is what the device verifies. They
                      // must describe the same thing, and only one of them can be signed.
                      const signature = await ledger.signTypedData(typedData, setStep);
                      if (signature) onSigned?.(signature);
                      setStage(signature ? (scheduledAt ? 'scheduled' : 'signed') : 'declined');
                    }}
                  >
                    {copy.ceremony.continue}
                  </Act>
                )}

                {/*
                  * No spinner beyond the button, no countdown, and nothing here cancels the
                  * ceremony. The device is allowed to be slow, and someone comparing eight lines of
                  * text on a small screen is not to be hurried. In development only, stand-ins for
                  * the two answers a device gives, so the states can be built without hardware.
                  */}
                {import.meta.env?.DEV && stage === 'waiting' && (
                  <div className="mt-3 flex gap-2">
                    <Ghost onClick={() => (scheduledAt ? setStage('scheduled') : setStage('signed'))}>
                      approved
                    </Ghost>
                    <Ghost onClick={() => setStage('declined')}>rejected</Ghost>
                    <Ghost onClick={() => setStage('absent')}>no device</Ghost>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
