import { copy } from '../copy.ts';
import { fixtures } from '../fixtures.ts';
import { Tape } from './Tape.tsx';
import { useIndex } from '../lib/subgraph.ts';

/**
 * The tape, on the landing page, reading the venue.
 *
 * Not a screenshot and not a diagram: the same component the desk renders, running the same query
 * on the public scope — every fill this deployment has settled and every one it refused.
 *
 * It used to sit inside a drawn browser window above a row of summary tiles, and both went. The
 * chrome was asking to be believed, which is the opposite of what a live table does; and the tiles
 * were four aggregates in front of the rows they aggregate, on a page where the rows are the
 * argument. A refusal in the tape says more than a count of them ever will.
 *
 * Where the index has not answered the fixtures stand in, and the line underneath says which of the
 * two is on screen. The two sentences are deliberately not interchangeable.
 */
export function PublicTape() {
  const index = useIndex(null, 'public');
  const live = index.status === 'live' && index.tape !== null;

  return (
    <div className="relative">
      {/*
        * A height, and a flex column to hand it to the tape.
        *
        * The tape sizes itself with `flex-1` against a `min-h` floor, so in a box with no height of
        * its own it collapsed to that floor and showed three rows. Given one it fills it, and the
        * rows scroll inside rather than growing the section.
        *
        * Clamped rather than fixed: enough rows to read as a tape on a laptop, and never taller
        * than half the window on anything else.
        */}
      <div className="flex h-[clamp(360px,54vh,580px)] flex-col overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
        <Tape
          entries={index.tape ?? fixtures.tape}
          pair={fixtures.pair}
          status={index.status === 'loading' ? 'loading' : 'live'}
        />
      </div>

      <p className="mt-3 text-center text-[11.5px] text-faint">
        {live ? copy.landing.shotLive : copy.landing.shotNote}
      </p>
    </div>
  );
}
