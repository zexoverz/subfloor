import { useEffect, useRef, useState } from 'react';
import { Expand } from 'lucide-react';
import { RollingNumber } from './RollingNumber.tsx';
import type { VaultState } from '../types.ts';

/**
 * The proof object as a headline. Fuzzing samples the program space and the symbolic proof closes
 * it; the counter is what makes that legible without reading either.
 */
export function FuzzCounter({ fuzz }: { fuzz: VaultState['fuzz'] }) {
  const previous = useRef(fuzz.programs);
  const [changed, setChanged] = useState(false);
  // Theater mode is one display state on the stat this page already carries, not a second screen:
  // the video's cold open wants this counter huge and nothing else on the frame.
  const [theater, setTheater] = useState(false);

  useEffect(() => {
    if (!theater) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTheater(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [theater]);

  useEffect(() => {
    if (previous.current === fuzz.programs) return;
    previous.current = fuzz.programs;
    setChanged(true);
    const id = setTimeout(() => setChanged(false), 900);
    return () => clearTimeout(id);
  }, [fuzz.programs]);

  if (theater) {
    return (
      <div
        onClick={() => setTheater(false)}
        className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 bg-ground px-8 text-center"
      >
        <div className="text-[clamp(40px,11vw,150px)] leading-none font-semibold tracking-tighter">
          <RollingNumber value={fuzz.programs} />
        </div>
        <p className="text-[clamp(12px,1.6vw,20px)] tracking-[0.18em] text-faint uppercase">programs executed</p>
        <p className="text-[clamp(24px,6vw,80px)] leading-none font-semibold text-settle">
          {fuzz.settledBelowFloor} settled below the floor
        </p>
        <p className="text-[11px] tracking-[0.1em] text-faint uppercase">click or press esc to exit</p>
      </div>
    );
  }

  return (
    <div className="group my-4.5 border-y border-rule py-4.5">
      <p className="serif m-0 text-[clamp(17px,2.4vw,21px)] leading-snug font-medium tracking-tight">
        <span className={`-mx-1 rounded-[2px] px-1 ${changed ? 'value-pulse' : ''}`}>
          <RollingNumber value={fuzz.programs} className="font-semibold" />
        </span>{' '}
        hostile programs thrown at this router.{' '}
        <button
          onClick={() => setTheater(true)}
          title="theater"
          className="cursor-pointer align-middle text-faint opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Expand size={14} strokeWidth={1.6} />
        </button>{' '}
        <b className="text-[1.18em] font-semibold text-settle">{fuzz.settledBelowFloor}</b> settled below the floor.
      </p>
      <p className="mt-2.5 mb-0 text-[11.5px] leading-relaxed text-faint">
        Randomly generated SwapVM bytecode, fired continuously by CI. Fuzzing found no counterexample; the symbolic
        proof is what says none exists.
      </p>
    </div>
  );
}
