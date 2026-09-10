import { copy } from '../copy.ts';
import { fixtures } from '../fixtures.ts';
import { Tape } from './Tape.tsx';
import { Tile, Tiles } from './Tiles.tsx';
import { formatBps } from '../lib/rate.ts';
import { useIndex } from '../lib/subgraph.ts';

/**
 * The product, running, inside a window — not a screenshot of it.
 *
 * A marketing page that shows a picture of an interface is asking to be believed. This renders the
 * same components the desk renders, so what a visitor sees on the landing page is the thing itself,
 * including a refusal decoded from real revert data.
 *
 * It reads the venue, not a file. Same query the board runs, on the public scope — every fill this
 * deployment has actually settled and every one it refused. Where the index has answered, that is
 * what is on the landing page; where it has not, the fixtures stand in and the line underneath says
 * which of the two you are looking at, in those words.
 *
 * The alternative was leaving hand-written rows under a browser chrome on the one page whose whole
 * argument is that the numbers are real.
 */
export function ProductShot() {
  const index = useIndex(null, 'public');
  const live = index.status === 'live' && index.tape !== null && index.stats !== null;
  const stats = index.stats ?? fixtures.stats;
  const tape = index.tape ?? fixtures.tape;

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
        {/* Window chrome, so it reads as an application rather than a diagram. */}
        <div className="flex items-center gap-2 border-b border-rule bg-sunken px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="size-2 rounded-full bg-refuse/50" />
            <span className="size-2 rounded-full bg-floor/50" />
            <span className="size-2 rounded-full bg-settle/50" />
          </span>
          <span className="mx-auto rounded-xl border border-rule bg-surface px-3 py-0.5 text-[11.5px] text-faint">
            subfloor.vercel.app
          </span>
        </div>

        <div className="px-4 pt-4 pb-2">
          <Tiles>
            <Tile
              label={copy.desk.fills}
              value={stats.fills}
              sub={live ? copy.desk.fillsSub : copy.desk.fillsSubPending}
            />
            <Tile
              label={copy.desk.notional}
              value={stats.notionalUsd}
              format={(n) => `$${n.toLocaleString('en-US')}`}
              sub={copy.desk.notionalSub}
            />
            <Tile
              label={copy.desk.worst}
              value={stats.worstFillAboveFloorBps}
              format={formatBps}
              sub={copy.desk.worstSub}
            />
            <Tile
              label={copy.desk.refused}
              value={stats.refused}
              sub={copy.desk.refusedSub}
              tone="refuse"
            />
          </Tiles>

          <div className="mt-2 overflow-hidden rounded-xl border border-rule">
            <Tape entries={tape} pair={fixtures.pair} status={index.status === 'loading' ? 'loading' : 'live'} />
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11.5px] text-faint">{live ? copy.landing.shotLive : copy.landing.shotNote}</p>
    </div>
  );
}
