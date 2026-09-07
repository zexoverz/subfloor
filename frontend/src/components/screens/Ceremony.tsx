import { useState } from 'react';
import { Usb } from 'lucide-react';
import { useLedger } from '../../lib/ledger.ts';
import { copy } from '../../copy.ts';
import { Card, CardBody, CardHead, Note, Todo } from '../Card.tsx';
import { Act, Ghost } from '../Button.tsx';
import { DeviceScreen } from '../DeviceScreen.tsx';
import { floorPriceFromBps, formatPrice } from '../../lib/rate.ts';
import type { VaultState } from '../../types.ts';

type Stage = 'pre' | 'waiting' | 'declined' | 'absent' | 'scheduled' | 'signed';

/**
 * The two hardware moments: signing the mandate, and loosening a floor. Designed around the device
 * being slow and physical — that slowness is the feature, and the screen's job is to make the wait
 * read as deliberation rather than latency. No spinner, no countdown, no timeout that cancels.
 *
 * Rejection is a success of the system and is styled neutrally, never as an error.
 */
export function Ceremony({
  state,
  draftBps,
  purpose,
  onDone,
  onBack,
}: {
  state: VaultState;
  draftBps: number;
  /** Which of the two hardware moments this is. They sign different things and must say so. */
  purpose: 'mandate' | 'lower';
  onDone: () => void;
  onBack: () => void;
}) {
  const ledger = useLedger();
  // §10: the device-absent state is known before the ceremony is offered, never discovered by
  // someone who has already completed a form. Enumeration happens on load, in useLedger.
  const [stage, setStage] = useState<Stage>(ledger.presence === 'unsupported' ? 'absent' : 'pre');
  const { pair, reference, floor, mandate } = state;

  const bindsAt = floorPriceFromBps(reference.price, draftBps);
  const standing = formatPrice(floorPriceFromBps(reference.price, floor.maxAdverseBps));

  // What the device will render. In the shipped app both sides come from one ERC-7730 descriptor:
  // a screen that disagrees with the device is a stop-everything bug, and this correspondence is
  // the only reason clear-signing means anything at all.
  const rows: [string, string][] =
    purpose === 'lower'
      ? [
          ['Action', 'Lower price floor'],
          ['Pair', `${pair.base} / ${pair.quote}`],
          ['New floor', `−${draftBps} bps`],
          ['Binds at', `${formatPrice(bindsAt)} ${pair.quote}`],
          ['Delegate', mandate.delegateLabel],
        ]
      : [
          // The mandate is a different object entirely: it authorises an agent, it does not touch
          // the floor. Rendering the lowering payload here would teach the owner to approve the
          // wrong screen — on the one screen whose whole job is teaching them to compare.
          ['Action', 'Authorise agent'],
          ['Delegate', mandate.delegateLabel],
          ['Tokens', state.inventory.map((h) => h.symbol).join(' / ')],
          ['Expires', `${mandate.expiresInDays} days`],
        ];

  return (
    <>
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
                      {purpose === 'lower'
                        ? `FloorLowering(${pair.base}, ${pair.quote}, ${draftBps}, nonce)`
                        : `Mandate(delegate, app, tokens, maxAmounts, nonce, expiry)`}
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
                      <Ghost onClick={() => (state.pendingLowering ? setStage('scheduled') : setStage('signed'))}>
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
                    {new Date((state.pendingLowering?.effectiveAt ?? 0) * 1000).toLocaleTimeString('en-US')}
                  </b>
                  . Until then the standing floor of{' '}
                  <b className="font-mono font-semibold text-ink tabular-nums">{standing}</b> is what settlement uses.
                </p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Todo>
        skeleton: these rows are hand-written. They must be generated from the ERC-7730 descriptor
        the device renders (#36), or screen and device can drift — the one bug this screen exists to
        make impossible. A registry deployed with LOWERING_DELAY &gt; 0 ends here in the scheduled
        state, not in a new floor.
      </Todo>
    </>
  );
}
