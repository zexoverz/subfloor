import { useCallback, useRef, useState } from 'react';
import { copy } from '../copy.ts';
import { formatPrice } from '../lib/rate.ts';

/**
 * Drag the fill. Below the floor the venue refuses to settle.
 *
 * The whole argument in one control: no classifier, no verdict, no scoring — just a price and an
 * arithmetic bound, and you can feel where the bound is by moving the thing that crosses it. A
 * paragraph claiming "the settlement function refuses" is an assertion; this is a demonstration.
 *
 * The hatched band is the refusal zone. It is drawn under the floor rather than around the fill,
 * because the floor is the fixed thing here and the fill is what moves.
 */
const REFERENCE = 2470.1;
const FLOOR_BPS = 100;
const FLOOR = REFERENCE * (1 - FLOOR_BPS / 10_000);
const TOP = REFERENCE * 1.004;
const BOTTOM = FLOOR * 0.988;

const toY = (price: number) => ((TOP - price) / (TOP - BOTTOM)) * 100;
const fromY = (pct: number) => TOP - (pct / 100) * (TOP - BOTTOM);

const SCENARIOS = [
  { id: 'honest', label: 'Honest agent', price: REFERENCE * 0.9985 },
  { id: 'compromised', label: 'Compromised agent', price: FLOOR * 0.982 },
] as const;

export function PriceLadder() {
  const rail = useRef<HTMLDivElement>(null);
  const [price, setPrice] = useState(SCENARIOS[0].price);
  const refused = price < FLOOR;

  const setFromPointer = useCallback((clientY: number) => {
    const box = rail.current?.getBoundingClientRect();
    if (!box) return;
    const pct = Math.min(100, Math.max(0, ((clientY - box.top) / box.height) * 100));
    setPrice(fromY(pct));
  }, []);

  return (
    <div className="relative grid gap-0 overflow-hidden rounded-xl border border-rule bg-surface shadow-card md:grid-cols-[minmax(280px,1fr)_minmax(260px,1fr)]">
      {/*
        * Rounded like the cards above it, because it is one of them: the only panel on this page
        * that was square-cornered, which read as a diagram dropped in rather than as part of the
        * set.
        */}


      {/*
        * Two grounds, split down the same rule the columns are.
        *
        * The picture belongs to the side that reads as a picture. On the left is a chart with an
        * axis, a draggable rail and a hatched refusal zone — every one of them a drawn thing, and a
        * drawn thing behind them is a fifth. So that half gets light rather than artwork: a wash
        * falling from the surface toward the deep, which is what the chart is about anyway.
        */}
      <div
        className="relative border-b border-rule p-6 md:border-r md:border-b-0"
        style={{
          background:
            'linear-gradient(to bottom, color-mix(in srgb, var(--c-surface-top) 55%, transparent) 0%, transparent 62%)',
        }}
      >
        <div
          ref={rail}
          role="slider"
          tabIndex={0}
          aria-label="fill price"
          aria-valuemin={Math.round(BOTTOM)}
          aria-valuemax={Math.round(TOP)}
          aria-valuenow={Math.round(price)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setFromPointer(e.clientY);
          }}
          onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && setFromPointer(e.clientY)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') setPrice((p) => Math.min(TOP, p + 2));
            if (e.key === 'ArrowDown') setPrice((p) => Math.max(BOTTOM, p - 2));
          }}
          className="relative ml-16 h-[300px] cursor-grab touch-none border-l border-rule outline-none focus-visible:ring-2 focus-visible:ring-floor active:cursor-grabbing"
        >
          {/* Everything under the floor is the zone that cannot settle. */}
          <div
            className="absolute inset-x-0 bottom-0 bg-refuse-wash"
            style={{
              top: `${toY(FLOOR)}%`,
              backgroundImage:
                'repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--c-refuse) 16%, transparent) 7px 8px)',
            }}
          />

          <Line price={REFERENCE} label="Reference" tone="reference" />
          <Line price={FLOOR} label={`Your floor · ${FLOOR_BPS} bps`} tone="floor" />

          <div
            className="absolute inset-x-0 transition-[top] duration-200"
            style={{ top: `${toY(price)}%` }}
          >
            <div className={`h-0 border-t-2 ${refused ? 'border-refuse' : 'border-settle'}`} />
            <span className="absolute top-0 left-2 -translate-y-1/2 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
              Fill
            </span>
            <span
              className={`absolute top-0 right-0 -translate-y-1/2 rounded-xl px-2 py-[3px] text-[12px] font-semibold text-surface ${
                refused ? 'bg-refuse' : 'bg-settle'
              }`}
            >
              {formatPrice(price)}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setPrice(s.price)}
              className="cursor-pointer rounded-xl border border-rule bg-surface px-2.5 py-1.5 text-[11.5px] text-muted transition-colors hover:border-floor hover:text-ink"
            >
              {s.label}
            </button>
          ))}
          <span className="self-center text-[11.5px] tracking-[0.08em] text-faint uppercase">
            drag · or ↑ ↓
          </span>
        </div>
      </div>

      <div className="relative flex flex-col gap-4 overflow-hidden p-6">
        {/*
          * The reef, on this half only, and the same treatment as the agent card's: behind the top
          * of it, masked out rather than dimmed with a colour over it — painting over the image to
          * hide it leaves a rectangle of the wrong shade halfway down the panel.
          *
          * 0.09 rather than that card's 0.12, and the difference is the ground. Its foot is darker;
          * this sits on `--c-surface`, where the artwork's brightest pixel — the anglerfish's
          * lantern — composites to #182d48 at this opacity. `text-faint` reads 4.54 there, and the
          * three labels in this column are faint. At 0.12 they fell to 4.13.
          */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-3/5 overflow-hidden" aria-hidden>
          <img
            src="/agent-banner.webp"
            alt=""
            draggable={false}
            className="h-full w-full origin-top scale-[1.02] object-cover object-center opacity-[0.09] select-none"
            style={{
              maskImage: 'linear-gradient(to bottom, black 0%, black 34%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 34%, transparent 100%)',
            }}
          />
        </div>

        <span
          className={`inline-flex w-fit items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[12px] font-semibold tracking-[0.12em] uppercase ${
            refused
              ? 'border-refuse/35 bg-refuse-wash text-refuse'
              : 'border-settle/35 bg-settle-wash text-settle'
          }`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {refused ? copy.landing.refused : copy.landing.settled}
        </span>

        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-[13px]">
          <dt className="text-[11px] tracking-[0.08em] text-faint uppercase">Fill</dt>
          <dd className="m-0 font-medium">{formatPrice(price)} USDC</dd>
          <dt className="text-[11px] tracking-[0.08em] text-faint uppercase">vs ref</dt>
          <dd className="m-0 font-medium">{Math.round(((price - REFERENCE) / REFERENCE) * 10_000)} bps</dd>
          <dt className="text-[11px] tracking-[0.08em] text-faint uppercase">Floor</dt>
          <dd className="m-0 font-medium text-floor">{formatPrice(FLOOR)} USDC</dd>
        </dl>

        {refused ? (
          <div className="border-l-2 border-refuse bg-refuse-wash px-3 py-2.5 text-[12px] leading-relaxed text-refuse">
            SettledBelowFloor(recipient, WETH, USDC,
            <br />
            executionRate, floorRate)
            <span className="mt-1.5 block text-ink">{copy.landing.unchanged}</span>
          </div>
        ) : (
          <p className="serif text-[14px] leading-relaxed text-muted">{copy.landing.settledNote}</p>
        )}
      </div>
    </div>
  );
}

function Line({ price, label, tone }: { price: number; label: string; tone: 'reference' | 'floor' }) {
  const floor = tone === 'floor';
  return (
    <div className="absolute inset-x-0" style={{ top: `${toY(price)}%` }}>
      <div className={floor ? 'h-0 border-t-[3px] border-floor' : 'h-0 border-t border-dashed border-faint'} />
      <span
        className={`absolute top-0 right-full -translate-y-1/2 pr-2 text-[12px] whitespace-nowrap ${
          floor ? 'font-semibold text-floor' : 'text-faint'
        }`}
      >
        {formatPrice(price)}
      </span>
      <span
        className={`absolute top-0 left-2 -translate-y-1/2 rounded-xl text-[11px] font-semibold tracking-[0.1em] uppercase ${
          floor ? 'bg-floor-wash px-1.5 py-0.5 text-floor' : 'text-faint'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
