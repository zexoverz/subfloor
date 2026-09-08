import { useRef, useState } from 'react';
import { OctagonX } from 'lucide-react';
import { copy } from '../copy.ts';

const HOLD_MS = 1500;

/**
 * Reachable in one gesture from anywhere, impossible to fire by accident: press-and-hold with a
 * visible fill, not a confirmation dialog — a scared owner should not have to read a modal, and a
 * stray click should not be able to fire it.
 *
 * No device in this path by design. Docking can only stop trading, never worsen a price, and a
 * panic control that needs hardware fails exactly when the device is in a drawer somewhere else.
 */
export function PanicButton({ onFire }: { onFire: () => void }) {
  const [arming, setArming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = () => {
    setArming(false);
    if (timer.current) clearTimeout(timer.current);
  };

  const arm = () => {
    setArming(true);
    timer.current = setTimeout(() => {
      disarm();
      onFire();
    }, HOLD_MS);
  };

  return (
    <button
      onPointerDown={arm}
      onPointerUp={disarm}
      onPointerLeave={disarm}
      // Dragging off cancels, and so does the system taking the gesture away — a touch that turns
      // into a scroll fires cancel and never fires up, which would otherwise leave the button
      // armed and the timer running with nobody holding it.
      onPointerCancel={disarm}
      data-armed={arming}
      title={copy.panic.hint}
      className="pushable relative mb-1.5 cursor-pointer overflow-hidden rounded-lg px-3 py-[5px] text-[11.5px] font-semibold tracking-[0.1em] uppercase select-none"
    >
      {/*
        * The hold, drawn as it fills — in the button's own pressed colour, so the bar is the face
        * becoming fully depressed rather than a second colour arriving from somewhere.
        *
        * It was a white wash first and that failed where it mattered most: at 25% white the label
        * drops to 3.73 against its own bar, and the moment it fails is exactly the second and a
        * half the owner is watching it. Darkening instead of lightening puts the label at 9.4.
        */}
      <span
        className="absolute inset-y-0 left-0 bg-[var(--c-panic-side)] ease-linear"
        style={{ width: arming ? '100%' : 0, transition: `width ${arming ? HOLD_MS : 0}ms linear` }}
      />
      <span className="relative flex items-center gap-1.5">
        <OctagonX size={12} strokeWidth={1.8} />
        {copy.panic.label}
      </span>
    </button>
  );
}
