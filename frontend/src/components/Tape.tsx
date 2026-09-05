import { useState } from 'react';
import { copy } from '../copy.ts';
import { formatBps, formatPrice } from '../lib/rate.ts';
import { FillBar } from './FillBar.tsx';
import { RefusalCard } from './RefusalCard.tsx';
import { Ghost } from './Button.tsx';
import type { Pair, TapeEntry } from '../types.ts';

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
          <div key={entry.tx}>
            <div className="grid grid-cols-[52px_1fr_92px] items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-line/30">
              <span className="num text-dim">{entry.time}</span>
              <span className="text-dim">
                <b className="font-semibold text-ink">{copy.refusal.heading}</b> — a fill at{' '}
                <span className="num">{formatPrice(entry.attempted)}</span> was refused
              </span>
              <span className="text-right">
                <Ghost onClick={() => setOpen(open === entry.tx ? null : entry.tx)}>
                  {copy.refusal.view}
                </Ghost>
              </span>
            </div>
            {open === entry.tx && <RefusalCard entry={entry} />}
          </div>
        ),
      )}
    </div>
  );
}
