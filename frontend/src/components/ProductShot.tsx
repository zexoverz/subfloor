import { copy } from '../copy.ts';
import { fixtures } from '../fixtures.ts';
import { Tape } from './Tape.tsx';
import { Tile, Tiles } from './Tiles.tsx';
import { formatBps } from '../lib/rate.ts';

/**
 * The product, running, inside a window — not a screenshot of it.
 *
 * A marketing page that shows a picture of an interface is asking to be believed. This renders the
 * same components the desk renders, so what a visitor sees on the landing page is the thing itself,
 * including a refusal decoded from real revert data.
 *
 * It reads from fixtures and says so underneath, for the same reason every other surface does.
 */
export function ProductShot() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
        {/* Window chrome, so it reads as an application rather than a diagram. */}
        <div className="flex items-center gap-2 border-b border-rule bg-sunken px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="size-2 rounded-full bg-refuse/50" />
            <span className="size-2 rounded-full bg-floor/50" />
            <span className="size-2 rounded-full bg-settle/50" />
          </span>
          <span className="mx-auto rounded-lg border border-rule bg-surface px-3 py-0.5 text-[11.5px] text-faint">
            subfloor.vercel.app
          </span>
        </div>

        <div className="px-4 pt-4 pb-2">
          <Tiles>
            <Tile label={copy.desk.fills} value={fixtures.stats.fills} sub={copy.desk.fillsSubPending} />
            <Tile
              label={copy.desk.notional}
              value={fixtures.stats.notionalUsd}
              format={(n) => `$${n.toLocaleString('en-US')}`}
              sub={copy.desk.notionalSub}
            />
            <Tile
              label={copy.desk.worst}
              value={fixtures.stats.worstFillAboveFloorBps}
              format={formatBps}
              sub={copy.desk.worstSub}
            />
            <Tile
              label={copy.desk.refused}
              value={fixtures.stats.refused}
              sub={copy.desk.refusedSub}
              tone="refuse"
            />
          </Tiles>

          <div className="mt-2 overflow-hidden rounded-lg border border-rule">
            <Tape entries={fixtures.tape} pair={fixtures.pair} />
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11.5px] text-faint">{copy.landing.shotNote}</p>
    </div>
  );
}
