import { useState } from 'react';
import { OctagonX } from 'lucide-react';
import { copy } from '../copy.ts';
import { PanicDialog } from './PanicDialog.tsx';

/**
 * Reachable in one gesture from anywhere, and it cannot fire by accident.
 *
 * It used to be press-and-hold. It is now a click into a confirmation that has to be acknowledged,
 * and the reason for the change is in PanicDialog: the second of the two effects is irreversible,
 * and a hold protects against a stray click while saying nothing about what is about to be lost.
 *
 * No device in this path, and that part has not moved. Docking can only stop trading, never worsen
 * a price, and a panic control that needs hardware fails exactly when the device is in a drawer
 * somewhere else.
 */
export function PanicButton({ onFire }: { onFire: () => void }) {
  const [asking, setAsking] = useState(false);

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        title={copy.panic.hint}
        className="pushable push-panic relative mb-1.5 cursor-pointer rounded-lg px-3 py-[5px] text-[11.5px] font-semibold tracking-[0.1em] uppercase select-none"
      >
        <span className="relative flex items-center gap-1.5">
          <OctagonX size={12} strokeWidth={1.8} />
          {copy.panic.label}
        </span>
      </button>
      <PanicDialog
        open={asking}
        onClose={() => setAsking(false)}
        onFire={() => {
          setAsking(false);
          onFire();
        }}
      />
    </>
  );
}
