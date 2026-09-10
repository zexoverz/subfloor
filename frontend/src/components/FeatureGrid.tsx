import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { fixtures } from '../fixtures.ts';
import { Act, Locked } from './Button.tsx';
import { PanicButton } from './PanicButton.tsx';
import { RefusalDetail } from './RefusalCard.tsx';
import { RollingNumber } from './RollingNumber.tsx';
import { decodeRefusal } from '../lib/refusal.ts';

/**
 * Six cards, and each one runs the thing it describes rather than picturing it: the real buttons,
 * the real decoder, the real counter read from the CI file. A feature grid of screenshots asks to
 * be believed; this one can be poked.
 */
function Feature({
  label,
  title,
  art,
  children,
}: {
  label: string;
  title: string;
  /**
   * The drawing for this card, matched to what the card is about rather than picked for variety.
   *
   * Four of the six are the tiles' own: the mascot under a bar with down arrows is the floor, the
   * one holding a red cross is the refusal, the checklist is the count CI keeps, the chart is the
   * index. The other two are the nearest true thing — a mascot with a wrench for the key that
   * works, the alarmed one for the stop. A drawing that has nothing to do with its card is a
   * sticker, and this page cannot afford anything that only looks like it means something.
   */
  art?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-rule bg-surface p-5 shadow-card">
      {/*
        * Bottom right, behind everything, and sized like the tiles' so the two rows of cards on
        * this page read as one family. `overflow-hidden` on the card is what lets it bleed off the
        * corner instead of sitting in a box of its own.
        */}
      {art && (
        <img
          src={art}
          alt=""
          aria-hidden
          draggable={false}
          className="tile-art pointer-events-none absolute right-1 -bottom-1 h-[76px] w-auto max-w-[40%] object-contain object-right-bottom opacity-90 select-none"
        />
      )}
      <span className="relative text-[11.5px] font-semibold tracking-[0.13em] text-floor uppercase">{label}</span>
      <h3 className="relative m-0 max-w-[22ch] text-[17px] leading-snug font-semibold tracking-tight">{title}</h3>
      {children && <div className="relative mt-auto pt-2">{children}</div>}
    </div>
  );
}

export function FeatureGrid() {
  const refusal = fixtures.tape.find((e) => e.kind === 'refusal');
  const decoded = refusal ? decodeRefusal(refusal.data) : null;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Feature label={copy.landing.f1Label} title={copy.landing.f1Title} art="/tiles/worst.webp">
        <div className="flex flex-wrap gap-2">
          <Act primary>{copy.floor.raise}</Act>
          <Locked>{copy.floor.lower}</Locked>
        </div>
      </Feature>

      <Feature label={copy.landing.f2Label} title={copy.landing.f2Title} art="/tiles/refused.webp">
        {refusal && decoded && <RefusalDetail entry={refusal} decoded={decoded} />}
      </Feature>

      <Feature label={copy.landing.f3Label} title={copy.landing.f3Title} art="/mascot-setup.webp">
        <p className="mb-1.5 text-[11.5px] tracking-[0.08em] text-faint uppercase">{copy.landing.f3Surface}</p>
        <div className="flex flex-wrap gap-1.5 text-[11.5px]">
          {['compose', 'ship', 'dock', 'update-quote'].map((call) => (
            <span key={call} className="rounded-xl border border-rule bg-sunken px-2 py-1">
              {call}
            </span>
          ))}
        </div>
      </Feature>

      <Feature label={copy.landing.f4Label} title={copy.landing.f4Title} art="/tiles/fills.webp">
        <div className="text-[30px] leading-none font-semibold tracking-tight">
          <RollingNumber value={fixtures.fuzz.programs} />
        </div>
        <p className="mt-1.5 text-[11px] text-faint">{copy.landing.f4Sub}</p>
      </Feature>

      <Feature label={copy.landing.f5Label} title={copy.landing.f5Title} art="/tiles/markout.webp">
        <pre className="overflow-x-auto rounded-xl border border-rule bg-sunken px-3 py-2.5 text-[11px] whitespace-pre text-muted">
          {'{ fills(where: { vault }) {\n    price bpsAboveFloor\n} }'}
        </pre>
      </Feature>

      <Feature label={copy.landing.f6Label} title={copy.landing.f6Title} art="/mascot-alert.webp">
        <PanicButton onFire={() => {}} />
        <p className="mt-2 text-[11px] text-faint">{copy.landing.f6Sub}</p>
      </Feature>
    </div>
  );
}
