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
function Feature({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-5 shadow-card">
      <span className="text-[11.5px] font-semibold tracking-[0.13em] text-floor uppercase">{label}</span>
      <h3 className="m-0 max-w-[22ch] text-[17px] leading-snug font-semibold tracking-tight">{title}</h3>
      {children && <div className="mt-auto pt-2">{children}</div>}
    </div>
  );
}

export function FeatureGrid() {
  const refusal = fixtures.tape.find((e) => e.kind === 'refusal');
  const decoded = refusal ? decodeRefusal(refusal.data) : null;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Feature label={copy.landing.f1Label} title={copy.landing.f1Title}>
        <div className="flex flex-wrap gap-2">
          <Act primary>{copy.floor.raise}</Act>
          <Locked>{copy.floor.lower}</Locked>
        </div>
      </Feature>

      <Feature label={copy.landing.f2Label} title={copy.landing.f2Title}>
        {refusal && decoded && <RefusalDetail entry={refusal} decoded={decoded} />}
      </Feature>

      <Feature label={copy.landing.f3Label} title={copy.landing.f3Title}>
        <p className="mb-1.5 text-[11.5px] tracking-[0.08em] text-faint uppercase">{copy.landing.f3Surface}</p>
        <div className="flex flex-wrap gap-1.5 text-[11.5px]">
          {['compose', 'ship', 'dock', 'update-quote'].map((call) => (
            <span key={call} className="rounded-lg border border-rule bg-sunken px-2 py-1">
              {call}
            </span>
          ))}
        </div>
      </Feature>

      <Feature label={copy.landing.f4Label} title={copy.landing.f4Title}>
        <div className="text-[30px] leading-none font-semibold tracking-tight">
          <RollingNumber value={fixtures.fuzz.programs} />
        </div>
        <p className="mt-1.5 text-[11px] text-faint">{copy.landing.f4Sub}</p>
      </Feature>

      <Feature label={copy.landing.f5Label} title={copy.landing.f5Title}>
        <pre className="overflow-x-auto rounded-lg border border-rule bg-sunken px-3 py-2.5 text-[11px] whitespace-pre text-muted">
          {'{ fills(where: { vault }) {\n    price bpsAboveFloor\n} }'}
        </pre>
      </Feature>

      <Feature label={copy.landing.f6Label} title={copy.landing.f6Title}>
        <PanicButton onFire={() => {}} />
        <p className="mt-2 text-[11px] text-faint">{copy.landing.f6Sub}</p>
      </Feature>
    </div>
  );
}
