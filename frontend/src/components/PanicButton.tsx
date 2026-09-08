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
      title={copy.panic.hint}
      className="relative cursor-pointer overflow-hidden rounded-xl border border-refuse/40 bg-surface px-2.5 py-[3px] text-[11.5px] tracking-[0.1em] text-refuse uppercase select-none"
    >
      <span
        className="absolute inset-y-0 left-0 bg-refuse-wash ease-linear"
        style={{ width: arming ? '100%' : 0, transition: `width ${arming ? HOLD_MS : 0}ms linear` }}
      />
      <span className="relative flex items-center gap-1.5">
        <OctagonX size={12} strokeWidth={1.8} />
        {copy.panic.label}
      </span>
    </button>
  );
}
