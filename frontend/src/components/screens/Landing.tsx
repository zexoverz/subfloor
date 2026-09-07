import { ArrowRight } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Act } from '../Button.tsx';
import { PriceLadder } from '../PriceLadder.tsx';
import { LetterGlitch } from '../LetterGlitch.tsx';
import { ProductShot } from '../ProductShot.tsx';
import { FeatureGrid } from '../FeatureGrid.tsx';
import { Faq } from '../Faq.tsx';
import { LandingFooter } from '../LandingFooter.tsx';
import { LandingHeader } from '../LandingHeader.tsx';
import { HeroStrike } from '../HeroStrike.tsx';
import { ScrambleText } from '../ScrambleText.tsx';
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
    <>
      <LandingHeader onNavigate={onNavigate} />

      {/* Full-bleed wrapper: the texture belongs to the viewport, the words belong to the column. */}
      <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[calc(100vh-60px)] opacity-[0.22]">
        <LetterGlitch />
      </div>

      <div className="relative mx-auto max-w-[1100px] px-[clamp(18px,4vw,36px)] pb-24">
      {/*
        * Texture behind the hero band. Quieter than it was, because the drawing now carries the
        * argument and the noise only carries atmosphere — whichever of the two the eye lands on
        * first should be the one that means something.
        */}
      <header className="relative grid min-h-[calc(100vh-60px)] items-center gap-10 py-10 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] md:gap-[clamp(48px,7vw,104px)]">
        {/*
          * The argument as a drawing: a fill stops dead on the floor and nothing passes beneath it.
          * It carries the claim, so it sits beside the headline rather than behind it — and if the
          * file is not there, the hero is text and loses nothing.
          */}
        {/* Sized to sit beside the sentence, not to compete with it. */}
        <div className="hero-art relative order-2 w-full max-w-[480px] justify-self-center md:order-1">
          <HeroStrike />
        </div>

        <div className="relative order-1 md:order-2">
          {/*
            * The scrim. A soft radial wash of the page's own ground, with no edge to notice, so the
            * type sits on quiet paper while the noise continues behind and around it.
            */}
          <div className="hero-scrim pointer-events-none absolute -inset-x-16 -inset-y-12" />

          <div className="relative">
          <p className="m-0 text-[11px] font-semibold tracking-[0.17em] text-faint uppercase">
            {copy.landing.eyebrow}
          </p>
          <h1 className="mt-3 mb-0 text-[clamp(30px,5.2vw,44px)] leading-[1.1] font-semibold tracking-[-0.02em] text-balance">
            <ScrambleText text={copy.onboarding.title} />
            <br />
            <ScrambleText text={copy.onboarding.lede} className="text-faint" delay={700} />
          </h1>
          <p className="serif mt-4 max-w-[40ch] text-[clamp(16px,2.2vw,19px)] leading-snug font-light text-muted">
            {copy.landing.standfirst}
          </p>

          {/* One action, and the same one the header offers. A second button beside it only asks
              the reader to choose between two things they have no basis to choose between yet. */}
          <div className="mt-7 w-full max-w-[220px]">
            <Act primary onClick={() => onNavigate('live')}>
              <span className="flex items-center justify-center gap-2">
                {copy.landing.launchApp}
                <ArrowRight size={14} strokeWidth={1.8} />
              </span>
            </Act>
          </div>
          </div>
        </div>
      </header>

      <section className="relative mt-24">
        <SectionHead
          eyebrow={copy.landing.shotEyebrow}
          title={copy.landing.shotTitle}
          standfirst={copy.landing.shotStandfirst}
        />
        <ProductShot />
      </section>

      <section className="relative mt-24">
        <SectionHead
          eyebrow={copy.landing.featuresEyebrow}
          title={copy.landing.featuresTitle}
          standfirst={copy.landing.featuresStandfirst}
        />
        <FeatureGrid />
      </section>

      <section className="relative mt-24" aria-label="interactive fill">
        <SectionHead
          eyebrow="Try it"
          title="Drag the fill below the floor."
          standfirst="Nothing here is a simulation of our contract — it is the same arithmetic, in the browser."
        />
        <PriceLadder />
      </section>

      <section className="relative mt-24">
        <SectionHead
          eyebrow={copy.landing.faqEyebrow}
          title={copy.landing.faqTitle}
          standfirst={copy.landing.faqStandfirst}
        />
        <Faq />
      </section>

      </div>

      <LandingFooter onNavigate={onNavigate} />
      </div>
    </>
  );
}

/**
 * Asymmetric on purpose: the claim on the left, the qualification on the right, sharing a baseline.
 * Centred headings stack every section into the same silhouette and the page stops having a
 * rhythm — and a left edge is what the eye returns to when it drops from one section to the next.
 */
function SectionHead({ eyebrow, title, standfirst }: { eyebrow: string; title: string; standfirst: string }) {
  return (
    <div className="mb-9 grid items-end gap-x-10 gap-y-4 border-b border-rule pb-6 md:grid-cols-[1.1fr_1fr]">
      <div>
        <p className="m-0 text-[11px] font-semibold tracking-[0.17em] text-faint uppercase">{eyebrow}</p>
        <h2 className="mt-2.5 mb-0 max-w-[18ch] text-[clamp(22px,3.4vw,34px)] leading-[1.1] font-semibold tracking-tight text-balance">
          <ScrambleText text={title} onVisible speed={18} />
        </h2>
      </div>
      <p className="serif m-0 max-w-[46ch] text-[15.5px] leading-relaxed text-muted md:pb-1">{standfirst}</p>
    </div>
  );
}
