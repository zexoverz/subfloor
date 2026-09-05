import { useRef, useState } from 'react';
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
      className="relative overflow-hidden rounded-lg border border-red-900/70 bg-red-950/30 px-3 py-1.5 text-xs text-red-200 select-none"
    >
      <span
        className="absolute inset-y-0 left-0 bg-red-900/60 transition-[width] ease-linear"
        style={{ width: arming ? '100%' : 0, transitionDuration: arming ? `${HOLD_MS}ms` : '0ms' }}
      />
      <span className="relative">{copy.panic.label}</span>
    </button>
  );
}
