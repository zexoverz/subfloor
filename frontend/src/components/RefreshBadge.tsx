import { Clock, Layers, RotateCw, Timer } from 'lucide-react';
import { copy } from '../copy.ts';
import { Hoverable } from './Hoverable.tsx';

/**
 * Whether what you are looking at is current, and a way to ask again.
 *
 * The board polls quietly, which asks the reader to trust a claim it never makes. The icon turns
 * while a read is in flight, so freshness is something you watch rather than assume — and the
 * hover says what the last read actually saw.
 *
 * The block is the honest half of that. A clock says when we asked; the block the index had
 * reached says what we got, which is the number that decides whether a fill from a minute ago is
 * on this screen yet.
 */
export function RefreshBadge({
  fetching,
  block,
  fetchedAt,
  onRefresh,
}: {
  fetching: boolean;
  block: number | null;
  fetchedAt: number | null;
  onRefresh: () => void;
}) {
  const ago = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : null;

  return (
    <Hoverable
      content={
        <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[12px]">
          <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
            <Layers size={12} strokeWidth={1.9} />
            {copy.desk.refreshBlock}
          </dt>
          <dd className="m-0 text-right font-mono font-medium">
            {block === null ? '—' : block.toLocaleString('en-US')}
          </dd>
          <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
            <Clock size={12} strokeWidth={1.9} />
            {copy.desk.refreshRead}
          </dt>
          <dd className="m-0 text-right font-medium">
            {ago === null ? copy.desk.refreshNever : `${ago}s ${copy.desk.refreshAgo}`}
          </dd>
          <dt className="flex items-center gap-2 whitespace-nowrap text-faint">
            <Timer size={12} strokeWidth={1.9} />
            {copy.desk.refreshNext}
          </dt>
          <dd className="m-0 text-right font-medium">{copy.desk.refreshInterval}</dd>
          <dd className="col-span-2 m-0 mt-1 border-t border-rule/60 pt-2.5 text-[11.5px] leading-relaxed text-faint">
            {copy.desk.refreshWhyBlock}
          </dd>
        </dl>
      }
    >
      <button
        type="button"
        onClick={onRefresh}
        disabled={fetching}
        aria-label={copy.desk.refresh}
        className="grid size-[26px] shrink-0 place-items-center rounded-lg border border-rule bg-sunken text-faint transition-colors hover:border-floor hover:text-floor disabled:cursor-wait disabled:opacity-55"
      >
        <RotateCw size={12} strokeWidth={2} className={fetching ? 'animate-spin' : ''} />
      </button>
    </Hoverable>
  );
}
