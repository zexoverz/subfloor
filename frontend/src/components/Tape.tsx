import { useState } from 'react';
import { decodeRefusal } from '../lib/refusal.ts';
import { copy } from '../copy.ts';
import { formatBps, formatPrice } from '../lib/rate.ts';
import { FillBar } from './FillBar.tsx';
import { RefusalCard } from './RefusalCard.tsx';
import { Ghost } from './Button.tsx';
import type { Pair, Refusal, TapeEntry } from '../types.ts';

/** Zone 2. Refusals enter the same tape as fills, framed identically. */
export function Tape({ entries, pair }: { entries: TapeEntry[]; pair: Pair }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="grid gap-0.5">
      {entries.map((entry) =>
        entry.kind === 'fill' ? (
          <div
            key={entry.tx}
            className="grid grid-cols-[52px_1fr_140px_92px] items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-line/30"
          >
            <span className="num text-dim">{entry.time}</span>
            <span>
              {entry.side} <span className="num">{entry.amount}</span> {pair.base}{' '}
              <span className="num text-dim">@ {formatPrice(entry.price)}</span>
            </span>
            <FillBar bpsAboveFloor={entry.bpsAboveFloor} />
            <span className="num text-right text-good">{formatBps(entry.bpsAboveFloor)}</span>
          </div>
        ) : (
          <RefusalRow
            key={entry.tx}
            entry={entry}
            open={open === entry.tx}
            onToggle={() => setOpen(open === entry.tx ? null : entry.tx)}
          />
        ),
      )}
    </div>
  );
}

/**
 * A revert this decoder does not recognise is not a refusal, and the tape does not claim it is:
 * an unrelated failure rendered as "the floor held" would be a lie in the owner's favour.
 */
function RefusalRow({ entry, open, onToggle }: { entry: Refusal; open: boolean; onToggle: () => void }) {
  const decoded = decodeRefusal(entry.data);
  if (!decoded) return null;

  return (
    <div>
      <div className="grid grid-cols-[52px_1fr_92px] items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-line/30">
        <span className="num text-dim">{entry.time}</span>
        <span className="text-dim">
          <b className="font-semibold text-ink">{copy.refusal.heading}</b> — a fill at{' '}
          <span className="num">{formatPrice(decoded.attemptedPrice)}</span> was refused
        </span>
        <span className="text-right">
          <Ghost onClick={onToggle}>{copy.refusal.view}</Ghost>
        </span>
      </div>
      {open && <RefusalCard entry={entry} decoded={decoded} />}
    </div>
  );
}
