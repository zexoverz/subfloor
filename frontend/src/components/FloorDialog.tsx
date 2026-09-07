import { useEffect, useRef, useState } from 'react';
import { copy } from '../copy.ts';
import { X } from 'lucide-react';
import { Act, Locked } from './Button.tsx';
import { FloorControl } from './FloorControl.tsx';
import { FloorHistogram } from './FloorHistogram.tsx';
import { DeviceCeremony } from './DeviceCeremony.tsx';
import { floorPriceFromBps, formatPrice } from '../lib/rate.ts';
import type { VaultState } from '../types.ts';

/**
 * Adjusting the floor without leaving the board.
 *
 * Native <dialog>: focus trapping, Esc, the page behind going inert and the top layer are all the
 * browser's job, and every one of them is a thing a hand-rolled modal gets subtly wrong. A media
 * query turns it into a bottom sheet on a phone, where a centred modal would put the number you
 * are dragging directly under your own hand.
 *
 * The asymmetry is the whole design and it is enforced here too: tightening is one cheap
 * transaction, loosening needs the device, and the button changes rather than a warning appearing.
 */
export function FloorDialog({
  state,
  open,
  onClose,
  onLower,
  onRaise,
}: {
  state: VaultState;
  open: boolean;
  onClose: () => void;
  onLower: (bps: number) => void;
  onRaise: (bps: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Loosening finishes here too. Sending someone to another page to answer a device question loses
  // the fills the decision was made against.
  const [onDevice, setOnDevice] = useState(false);
  const current = state.floor.enforced ? state.floor.maxAdverseBps : state.calibration.houseDefaultBps;
  const [bps, setBps] = useState(current);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setBps(current);
      setOnDevice(false);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, current]);

  // A smaller tolerance is a stronger floor, so tightening is dragging toward the reference.
  const tightening = bps <= current;
  const price = floorPriceFromBps(state.reference.price, bps);
  const worstEver = Math.max(...state.calibration.fillsBps.map(Math.abs));
  /*
   * Nothing registered means there is nothing to tighten or loosen: the first entry is the whole
   * decision. On chain it is still raiseFloor -- an unconfigured pair reads as maximum tolerance,
   * so any number is an improvement on it -- but calling that "raise" to someone who has never set
   * one describes a comparison they cannot see.
   */
  const unset = !state.floor.enforced;
  const coldStart = state.calibration.sampleCount < 100;

  return (
    <dialog
      ref={ref}
      className={`sheet max-h-[86vh] overflow-x-hidden overflow-y-auto ${onDevice ? 'w-[min(680px,calc(100vw-32px))]' : ''}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="flex items-baseline justify-between border-b border-rule bg-sunken px-5 py-3">
        <h2 className="m-0 text-[10.5px] tracking-[0.11em] text-faint uppercase">
          {onDevice ? copy.ceremony.willDisplay : unset ? copy.onboarding.proposedPrice : copy.floor.title}
        </h2>
        <button
          onClick={onClose}
          aria-label="close"
          className="-mr-1 cursor-pointer p-1 text-faint transition-colors hover:text-ink"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>

      <div className="p-5">
        {onDevice ? (
          <DeviceCeremony
            rows={[
              ['Action', 'Lower price floor'],
              ['Pair', `${state.pair.base} / ${state.pair.quote}`],
              ['New floor', `−${bps} bps`],
              ['Binds at', `${formatPrice(price)} ${state.pair.quote}`],
            ]}
            payloadLine={`FloorLowering(${state.pair.base}, ${state.pair.quote}, ${bps}, nonce)`}
            standingLine={`Your floor is still ${formatPrice(floorPriceFromBps(state.reference.price, current))}.`}
            onDone={() => {
              onLower(bps);
              onClose();
            }}
            onBack={() => setOnDevice(false)}
          />
        ) : (
        <>
        <FloorControl
          bps={bps}
          referencePrice={state.reference.price}
          base={state.pair.base}
          quote={state.pair.quote}
                worstEverBps={Math.max(...state.calibration.fillsBps.map(Math.abs))}
          onChange={setBps}
        />

        {/*
          * The distribution, where the number is chosen. §10 makes this non-negotiable and gives the
          * reason: the human is not signing a guess. Putting it on a separate page meant the fills
          * the floor is judged against were never on screen at the moment of judging.
          */}
        <p className="mb-2 text-[11px] text-faint">
          {coldStart
            ? copy.floor.coldStart
            : `${state.calibration.sampleCount} fills on this venue, last ${state.calibration.windowDays} days`}
        </p>
        <FloorHistogram calibration={state.calibration} floorBps={bps} />

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-rule pt-3 text-[11px] text-faint">
          <span>
            {copy.floorControl.usually} <b className="font-semibold text-ink">{state.calibration.p50Bps}</b>
          </span>
          <span>
            {copy.floorControl.oneInHundred} <b className="font-semibold text-ink">{state.calibration.p99Bps}</b>
          </span>
          <span>
            {copy.floorControl.worstEver} <b className="font-semibold text-ink">−{worstEver}</b>
          </span>
          <span>
            now{' '}
            <b className="font-semibold text-brass">{unset ? copy.floor.notSet : `−${current} bps`}</b>
          </span>
        </div>

        <p className="mt-3 mb-4 text-[11px] leading-relaxed text-faint">
          {copy.floor.failClosed}
        </p>

        {unset || tightening ? (
          <>
            <Act primary disabled={!unset && bps === current} onClick={() => onRaise(bps)}>
              {unset ? copy.floor.set : copy.floor.raise}
            </Act>
            <p className="mt-2 text-center text-[11.5px] text-faint">
              {unset ? copy.floor.setHint : copy.floor.raiseHint}
            </p>
          </>
        ) : (
          <>
            <Locked onClick={() => setOnDevice(true)}>
              {copy.floor.lower} · {formatPrice(price)}
            </Locked>
            <p className="mt-2 text-[11.5px] text-faint">{copy.floor.lowerHint}</p>
          </>
        )}
        </>
        )}
      </div>
    </dialog>
  );
}
