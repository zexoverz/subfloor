import { ArrowRight } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Act, Ghost } from '../Button.tsx';
import { PriceLadder } from '../PriceLadder.tsx';
import type { Screen } from '../../types.ts';

/**
 * The front door. It argues in the price register and never the permission one, and it makes its
 * case by letting the reader move the fill themselves rather than by asserting that the settlement
 * function refuses.
 *
 * Two sections here are not optional and are not marketing: the prior-art paragraph naming CoW
 * Protocol, and the venue-scope paragraph. A judge who knows this space will check both, and a
 * project caught overstating the one claim it is built on loses more than the sentence bought.
 */
export function Landing({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="mx-auto max-w-[900px] px-[clamp(18px,4vw,36px)] pt-[clamp(48px,8vw,88px)] pb-24">
      <header className="max-w-[63ch]">
        <p className="m-0 text-[11px] font-semibold tracking-[0.17em] text-faint uppercase">
          {copy.landing.eyebrow}
        </p>
        <h1 className="mt-3 mb-0 text-[clamp(30px,5.2vw,46px)] leading-[1.1] font-semibold tracking-[-0.02em] text-balance">
          {copy.onboarding.title}
          <br />
          <span className="text-faint">{copy.onboarding.lede}</span>
        </h1>
        <p className="serif mt-4 max-w-[40ch] text-[clamp(17px,2.4vw,21px)] leading-snug font-light text-muted">
          {copy.landing.standfirst}
        </p>
      </header>

      <section className="mt-10" aria-label="interactive fill">
        <PriceLadder />
      </section>

      <Section title={copy.landing.whereTitle}>
        <p className="serif text-[16px] leading-relaxed text-muted">{copy.landing.whereBody}</p>
        <pre className="mt-4 overflow-x-auto rounded-[3px] border border-rule bg-sunken px-4 py-4 text-[12.5px] leading-[1.75] whitespace-pre">
          <span className="text-faint">{'// GuardedSwapVM.swap()'}</span>
          {'\n'}
          {'(amountIn, amountOut) = _run(order, program);   '}
          <span className="text-faint">{'// amounts final · nothing moved'}</span>
          {'\n'}
          <span className="font-semibold text-brass">{'_checkFloor(to,             tokenIn,  tokenOut);'}</span>
          {'\n'}
          <span className="font-semibold text-brass">{'_checkFloor(order.receiver, tokenOut, tokenIn );'}</span>
          {'\n'}
          {'IERC20(tokenIn ).transferFrom(msg.sender,  order.receiver, amountIn );\n'}
          {'IERC20(tokenOut).transferFrom(order.maker, to,             amountOut);'}
        </pre>
        <p className="serif mt-4 text-[16px] leading-relaxed text-muted">{copy.landing.whereAfter}</p>
      </Section>

      <Section title={copy.landing.slippageTitle}>
        <p className="serif text-[16px] leading-relaxed text-muted">{copy.landing.slippageBody}</p>
      </Section>

      <Section title={copy.landing.legsTitle}>
        <div className="grid gap-px border border-rule bg-rule sm:grid-cols-3">
          {copy.landing.legs.map((leg) => (
            <div key={leg.mode} className="flex flex-col gap-2 bg-surface p-5">
              <span className="text-[10.5px] font-semibold tracking-[0.13em] text-brass uppercase">{leg.mode}</span>
              <h3 className="m-0 text-[14px] font-semibold tracking-tight">{leg.title}</h3>
              <p className="serif m-0 text-[15px] leading-snug text-muted">{leg.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Mandatory, and deliberately placed above the call to action rather than in a footnote. */}
      <Section title={copy.landing.priorTitle}>
        <p className="serif text-[16px] leading-relaxed text-muted">{copy.landing.priorBody}</p>
        <h2 className="mt-6 mb-3 border-b border-rule pb-2.5 text-[13px] font-semibold tracking-[0.14em] text-faint uppercase">
          {copy.landing.scopeTitle}
        </h2>
        <p className="serif text-[16px] leading-relaxed text-muted">{copy.landing.scopeBody}</p>
        <p className="serif mt-3 text-[16px] text-ink">{copy.scope}.</p>
      </Section>

      <div className="mt-12 flex flex-wrap items-center gap-4">
        <div className="w-full max-w-[260px]">
          <Act primary onClick={() => onNavigate('onboarding')}>
            <span className="flex items-center justify-center gap-2">
              {copy.landing.launch}
              <ArrowRight size={14} strokeWidth={1.8} />
            </span>
          </Act>
        </div>
        <Ghost onClick={() => onNavigate('public')}>{copy.landing.seePublic}</Ghost>
      </div>

      <footer className="mt-12 border-t border-rule pt-5">
        <p className="serif m-0 max-w-[70ch] text-[13.5px] leading-relaxed text-faint">
          {copy.landing.disclosure}
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 max-w-[63ch]">
      <h2 className="mb-3.5 border-b border-rule pb-2.5 text-[13px] font-semibold tracking-[0.14em] text-faint uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
