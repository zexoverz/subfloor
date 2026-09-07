import { useState } from 'react';
import { Usb } from 'lucide-react';
import { copy } from '../copy.ts';
import { Act, Ghost } from './Button.tsx';
import { Card, CardBody, CardHead, Note } from './Card.tsx';
import { DeviceScreen } from './DeviceScreen.tsx';
import { useLedger } from '../lib/ledger.ts';

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
  purpose,
  payloadLine,
  standing,
  scheduledAt,
  onDone,
  onBack,
}: {
  rows: [string, string][];
  purpose: SignPurpose;
  /** The call being built, spelled out while the device is thinking. */
  payloadLine: string;
  /** The floor that still holds if this is declined — the reassurance a decline needs. */
  standing: string;
  /** Set when the registry delays lowerings, in which case signing schedules rather than applies. */
  scheduledAt?: number | null;
  onDone: () => void;
  onBack: () => void;
}) {
  const ledger = useLedger();
  // Starts at 'pre' unless the browser cannot speak to a device at all, which is worth saying to
  // someone who has already completed a form.
  const [stage, setStage] = useState<Stage>(ledger.presence === 'unsupported' ? 'absent' : 'pre');

  return (
    <Card>
      <CardHead
        icon={Usb}
        left={`Ledger · ${purpose === 'lower' ? 'lower the floor' : 'authorise the agent'}`}
        right={stage === 'waiting' ? 'waiting for device' : stage}
      />
      <CardBody>
        <div className="grid grid-cols-[auto_1fr] items-start gap-5.5 max-[620px]:grid-cols-1">
          <DeviceScreen rows={rows} waiting={stage === 'waiting'} />

          <div>
            {stage === 'pre' && (
              <>
                <p className="serif mt-0 text-[14.5px] leading-relaxed text-muted">
                  The device spells the action out in words instead of raw calldata. Whoever presses Approve can read
                  the pair, the new floor and the price it binds at, on the device screen itself.
                </p>
                <Note className="mb-3">{copy.ceremony.onlyIfMatches}</Note>
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
                  primary
                  disabled={ledger.presence === 'unsupported'}
                  onClick={async () => {
                    setStage('waiting');
                    // The real thing: the device renders the payload and answers. A decline and
                    // an unreachable device are both ordinary outcomes, not errors.
                    if (!ledger.address) await ledger.connect();
                    const signature = await ledger.signTypedData({ rows });
                    setStage(signature ? 'signed' : 'declined');
                  }}
                >
                  {copy.ceremony.continue}
                </Act>
              </>
            )}

            {stage === 'waiting' && (
              <>
                <div className="text-[11.5px] leading-[1.9] text-muted">
                  <div>
                    <b className="font-medium text-ink">›</b> building EIP-712 payload…
                  </div>
                  <div>
                    <b className="font-medium text-ink">›</b>{' '}
                    {payloadLine}
                  </div>
                  <div>
                    <b className="font-medium text-ink">›</b> awaiting approval on device{' '}
                    <span className="animate-pulse">▍</span>
                  </div>
                </div>
                <p className="serif mt-3 text-[14.5px] text-muted">{copy.ceremony.takeYourTime}</p>
                {/*
                  * No spinner, no countdown, and nothing here cancels the ceremony. The device is
                  * allowed to be slow, and someone comparing eight lines of text on a small
                  * screen is not to be hurried. In development only, stand-ins for the two
                  * answers a device gives, so the states can be built without hardware.
                  */}
                {import.meta.env?.DEV && (
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

            {stage === 'declined' && (
              <>
                <p className="serif mt-0 text-[14.5px] text-muted">
                  {copy.ceremony.declined} Your floor is still{' '}
                  <b className="font-mono font-semibold text-brass tabular-nums">{standing}</b>.
                </p>
                <Ghost onClick={onBack}>back</Ghost>
              </>
            )}

            {stage === 'absent' && <p className="serif mt-0 text-[14.5px] text-muted">{copy.ceremony.absent}</p>}

            {stage === 'signed' && (
              <>
                <p className="serif mt-0 text-[14.5px] text-muted">{copy.ceremony.signed}</p>
                <div className="mt-3">
                  <Ghost onClick={onDone}>continue</Ghost>
                </div>
              </>
            )}

            {stage === 'scheduled' && (
              <p className="serif mt-0 text-[14.5px] text-muted">
                {copy.ceremony.scheduled}{' '}
                <b className="font-mono font-semibold text-brass tabular-nums">
                  {new Date((scheduledAt ?? 0) * 1000).toLocaleTimeString('en-US')}
                </b>
                . Until then the standing floor of{' '}
                <b className="font-mono font-semibold text-ink tabular-nums">{standing}</b> is what settlement uses.
              </p>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
