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
      <div className="overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
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
