import { RotateCw } from 'lucide-react';
import { copy } from '../copy.ts';

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
  const title = [
    block ? `${copy.desk.refreshBlock} ${block.toLocaleString('en-US')}` : copy.desk.refreshNoBlock,
    ago === null ? copy.desk.refreshNever : `${copy.desk.refreshRead} ${ago}s ${copy.desk.refreshAgo}`,
    copy.desk.refreshEvery,
  ].join('\n');

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={fetching}
      title={title}
      aria-label={copy.desk.refresh}
      className="grid size-7 shrink-0 place-items-center rounded-lg border border-rule bg-sunken text-faint transition-colors hover:border-floor hover:text-floor disabled:cursor-wait"
    >
      <RotateCw size={12} strokeWidth={2} className={fetching ? 'animate-spin' : ''} />
    </button>
  );
}
