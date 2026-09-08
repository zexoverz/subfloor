import { useState } from 'react';
import type { ReactNode } from 'react';
import { RowHint, type Hint } from './RowHint.tsx';

/**
 * Anything that explains itself in the app's own card rather than the browser's.
 *
 * A native `title` is free and wrong here: it waits a second before appearing, styles itself out
 * of our hands, cannot hold a figure worth reading, and looks like the operating system rather
 * than like this product. We already draw a card with the mascot on it for the tape — this is the
 * same card, made available to anything else that has something to say.
 */
export function Hoverable({ content, children }: { content: ReactNode; children: ReactNode }) {
  const [hint, setHint] = useState<Hint>(null);
  return (
    <span
      className="contents"
      onMouseMove={(e) => setHint({ content, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHint(null)}
    >
      {children}
      <RowHint hint={hint} />
    </span>
  );
}
