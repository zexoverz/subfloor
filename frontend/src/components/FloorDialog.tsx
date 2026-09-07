import { useEffect, useRef, useState } from 'react';
import { copy } from '../copy.ts';
import { Act, Ghost, Locked } from './Button.tsx';
import { FloorControl } from './FloorControl.tsx';
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
  const current = state.floor.enforced ? state.floor.maxAdverseBps : state.calibration.houseDefaultBps;
  const [bps, setBps] = useState(current);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setBps(current);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, current]);

  // A smaller tolerance is a stronger floor, so tightening is dragging toward the reference.
  const tightening = bps <= current;
  const price = floorPriceFromBps(state.reference.price, bps);

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="flex items-baseline justify-between border-b border-rule bg-sunken px-5 py-3">
        <h2 className="m-0 text-[10.5px] tracking-[0.11em] text-faint uppercase">{copy.floor.title}</h2>
        <Ghost onClick={onClose}>close</Ghost>
      </div>

      <div className="p-5">
        <FloorControl
          bps={bps}
          referencePrice={state.reference.price}
          base={state.pair.base}
          quote={state.pair.quote}
          onChange={setBps}
        />

        <p className="mb-4 text-[11.5px] text-faint">
          now {formatPrice(floorPriceFromBps(state.reference.price, current))} · −{current} bps
        </p>

        {tightening ? (
          <>
            <Act primary disabled={bps === current} onClick={() => onRaise(bps)}>
              {copy.floor.raise}
            </Act>
            <p className="mt-2 text-center text-[11.5px] text-faint">{copy.floor.raiseHint}</p>
          </>
        ) : (
          <>
            <Locked onClick={() => onLower(bps)}>
              {copy.floor.lower} · {formatPrice(price)}
            </Locked>
            <p className="mt-2 text-[11.5px] text-faint">{copy.floor.lowerHint}</p>
          </>
        )}
      </div>
    </dialog>
  );
}
