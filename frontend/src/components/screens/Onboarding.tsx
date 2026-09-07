import { useState } from 'react';
import { isAddress } from 'viem';
import { ArrowRight, Check, KeyRound, Wallet as WalletIcon } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Act, Ghost } from '../Button.tsx';
import { floorPriceFromBps, formatPrice } from '../../lib/rate.ts';
import { useCeremony } from '../../lib/ceremony.ts';
import { mocked } from '../../lib/mock.ts';
import { AddressField, AmountRow, MandateSummary } from '../StepForms.tsx';
import { FloorControl } from '../FloorControl.tsx';
import { withTransition } from '../../lib/transition.ts';
import type { Wallet } from '../../lib/wallet.ts';
import type { Screen, VaultState } from '../../types.ts';

/**
 * First run has no chrome: no tabs, no chips, no panic control. There is nothing on this page to
 * navigate to and nothing to panic about yet, and §10's test is that the screen must not make the
 * owner think about anything except the one number — a nav bar full of screens they cannot use is
 * exactly that kind of thinking.
 *
 * One step at a time, and the screen says which one. The remaining steps are listed underneath in
 * the faintest weight the palette has: enough to see the shape of what is coming, not enough to
 * compete with the thing to do now.
 */
export function Onboarding({
  state,
  wallet,
  onSign,
  onNavigate,
}: {
  state: VaultState;
  wallet: Wallet;
  onSign: () => void;
  onNavigate: (s: Screen) => void;
}) {
  const { pair, floor, mandate } = state;
  const connected = Boolean(wallet.address);
  const holdings = wallet.holdings ?? state.inventory;
  const ceremony = useCeremony(wallet.address, holdings.filter((h) => h.amount > 0).length);

  // Three facts across the whole ceremony: how much goes in, which device guards it, which agent
  // trades it. Everything else on these screens is derived.
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [guardian, setGuardian] = useState('');
  const [floorBps, setFloorBps] = useState(floor.maxAdverseBps);
  const [delegate, setDelegate] = useState('');

  // The current step is the first one not done — read from chain, so this survives a reload and a
  // step someone completed from a script.
  const stepIndex = ceremony.steps.findIndex((s) => !s.done);
  const current = ceremony.steps[stepIndex];
  const blocked = !ceremony.deployed ? copy.wallet.notDeployed : ceremony.isOwner === false ? copy.wallet.notOwner : null;

  return (
    <div className="grid min-h-screen place-items-center px-6 py-16">
      <div className="w-full max-w-[440px]">
        <div className="mb-10 text-center">
          <div className="text-[15px] font-semibold tracking-[0.3em]">{copy.brand}</div>
          {/* A mock that does not say so is how a mock ends up in a screenshot. */}
          {mocked && (
            <span className="mt-3 inline-block rounded-[2px] border border-brass/40 bg-brass-wash px-2 py-[3px] text-[10px] tracking-[0.12em] text-brass uppercase">
              {copy.live.mock}
            </span>
          )}
          <p className="serif mx-auto mt-3 max-w-[34ch] text-[15px] leading-snug text-muted">
            {copy.onboarding.title} {copy.onboarding.lede}
          </p>
        </div>

        {/*
          * One height for every step. The floor step carries a price block the others do not, and a
          * card that resizes under the cursor makes a five-step flow feel like five different
          * screens. The content centres inside the fixed frame instead.
          */}
        <div className="step-card flex min-h-[370px] flex-col rounded-[3px] border border-rule bg-surface p-6 shadow-card">
          {!connected ? (
            <div className="flex flex-1 flex-col justify-center">
              <h1 className="m-0 text-center text-[17px] font-semibold">{copy.wallet.step1}</h1>
              <p className="serif mx-auto mt-2 mb-6 max-w-[32ch] text-center text-[13.5px] leading-relaxed text-muted">
                {copy.wallet.why}
              </p>
              <Act
                primary
                onClick={() => withTransition(wallet.connect)}
                disabled={wallet.connecting || !wallet.available}
              >
                <span className="flex items-center justify-center gap-2">
                  <WalletIcon size={14} strokeWidth={1.7} />
                  {wallet.connecting ? copy.wallet.connecting : copy.wallet.connect}
                </span>
              </Act>
              {wallet.error && <p className="mt-3 text-center text-[11.5px] text-refuse">{wallet.error}</p>}
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-center justify-between border-b border-rule pb-4 text-[11.5px]">
                <span className="flex items-center gap-2 text-muted">
                  <span className="size-[6px] rounded-full bg-settle" />
                  {wallet.address?.slice(0, 6)}…{wallet.address?.slice(-4)}
                </span>
                <Ghost onClick={() => withTransition(wallet.disconnect)}>{copy.wallet.disconnect}</Ghost>
              </div>

              {/*
                * Where you are, without words. Five titles would compete with the one thing to do
                * now — the segments carry position, the label carries the count, and the names stay
                * behind the hover.
                */}
              {!blocked && (
                <div className="mb-5 flex gap-1.5" aria-hidden>
                  {ceremony.steps.map((step, i) => (
                    <span
                      key={step.id}
                      className={`h-[3px] flex-1 rounded-full transition-colors ${
                        step.done ? 'bg-settle' : i === stepIndex ? 'bg-brass' : 'bg-rule'
                      }`}
                    />
                  ))}
                </div>
              )}

              <div className="flex flex-1 flex-col justify-center">
              {blocked ? (
                <p className="serif text-center text-[14px] leading-relaxed text-muted">{blocked}</p>
              ) : current ? (
                <>
                  {/*
                    * The whole plan on hover, not on the page. Five titles sitting under the card
                    * compete with the one thing to do now, and §10's test is that nothing on this
                    * screen should make the owner think about anything else. It floats, so
                    * revealing it never moves what is underneath.
                    */}
                  <div className="group relative mx-auto w-fit">
                    <button
                      type="button"
                      aria-label="show every step"
                      className="cursor-default text-[10.5px] tracking-[0.14em] text-faint uppercase underline decoration-dotted underline-offset-4 hover:text-muted focus-visible:text-muted"
                    >
                      step {stepIndex + 1} of {ceremony.steps.length}
                    </button>

                    <ol className="pointer-events-none absolute top-full left-1/2 z-20 mt-2 grid w-[240px] -translate-x-1/2 list-none gap-1.5 rounded-[3px] border border-rule bg-surface p-3 text-left text-[11.5px] opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      {ceremony.steps.map((step, i) => (
                        <li
                          key={step.id}
                          className={`flex items-center gap-2 ${
                            step.done ? 'text-settle' : i === stepIndex ? 'text-ink' : 'text-faint'
                          }`}
                        >
                          {step.done ? (
                            <Check size={12} strokeWidth={2.4} />
                          ) : (
                            <span className="grid size-3 place-items-center text-[9px]">{i + 1}</span>
                          )}
                          {step.title}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <h1 className="mt-2 flex items-center justify-center gap-2 text-center text-[17px] font-semibold">
                    {current.title}
                    {current.device && <KeyRound size={14} strokeWidth={1.7} className="text-brass" />}
                  </h1>
                  <p className="serif mx-auto mt-2 mb-5 max-w-[34ch] text-center text-[13.5px] leading-relaxed text-muted">
                    {current.detail}
                  </p>

                  {current.id === 'fund' && (
                    <div className="mb-5">
                      {holdings.map((h) => (
                        <AmountRow
                          key={h.symbol}
                          holding={h}
                          value={amounts[h.symbol] ?? ''}
                          onChange={(v) => setAmounts((a) => ({ ...a, [h.symbol]: v }))}
                        />
                      ))}
                    </div>
                  )}

                  {current.id === 'guardian' && (
                    <div className="mb-5">
                      <AddressField
                        label={copy.wallet.guardianLabel}
                        hint={copy.wallet.guardianHint}
                        value={guardian}
                        onChange={setGuardian}
                        // WebHID enumeration lands with the Ledger work (#35); until then the
                        // address is pasted, and the button says why it cannot read it.
                        action={{ label: copy.wallet.useDevice, onClick: () => {}, disabled: true }}
                      />
                    </div>
                  )}

                  {current.id === 'delegate' && (
                    <div className="mb-5">
                      <AddressField
                        label={copy.wallet.delegateLabel}
                        hint={copy.wallet.delegateHint}
                        value={delegate}
                        onChange={setDelegate}
                      />
                    </div>
                  )}

                  {current.id === 'mandate' && (
                    <div className="mb-5">
                      <MandateSummary
                        rows={[
                          ['agent', delegate ? `${delegate.slice(0, 6)}…${delegate.slice(-4)}` : mandate.delegateLabel],
                          ['tokens', holdings.map((h) => h.symbol).join(' · ')],
                          ['bound', holdings.map((h) => `${amounts[h.symbol] || 0} ${h.symbol}`).join(' · ')],
                          ['floor', `${formatPrice(floorPriceFromBps(state.reference.price, floorBps))} · −${floorBps} bps`],
                          ['expires', `${mandate.expiresInDays} days`],
                        ]}
                      />
                    </div>
                  )}

                  {/* The one number, set where it is the decision — not on another screen the
                    * owner has no way back from. */}
                  {current.id === 'floor' && (
                    <FloorControl
                      bps={floorBps}
                      referencePrice={state.reference.price}
                      base={pair.base}
                      quote={pair.quote}
                      onChange={setFloorBps}
                    />
                  )}

                  <Act
                    primary
                    disabled={
                      (current.id === 'fund' && !holdings.some((h) => Number(amounts[h.symbol]) > 0)) ||
                      (current.id === 'guardian' && !isAddress(guardian)) ||
                      (current.id === 'delegate' && !isAddress(delegate))
                    }
                    onClick={() => withTransition(current.id === 'mandate' ? onSign : ceremony.refresh)}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {current.id === 'mandate' ? copy.onboarding.action : current.title}
                      <ArrowRight size={14} strokeWidth={1.8} />
                    </span>
                  </Act>

                  {current.device && (
                    <p className="mt-3 text-center text-[11.5px] text-faint">{copy.onboarding.underAction}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="serif text-center text-[14px] text-muted">
                    Everything is set. The agent trades inside your floor for {mandate.expiresInDays} days.
                  </p>
                  <div className="mt-5">
                    <Act primary onClick={() => onNavigate('live')}>
                      Open the desk
                    </Act>
                  </div>
                </>
              )}
              </div>
            </>
          )}
        </div>

        {/* Skeleton-only, so the other screens stay reachable while there is no vault. */}
        <div className="mt-10 flex justify-center gap-4 text-[10.5px] tracking-[0.1em] text-faint uppercase">
          <span>{copy.preview}</span>
          {(['landing', 'live', 'floor', 'public'] as Screen[]).map((s) => (
            <button key={s} onClick={() => onNavigate(s)} className="cursor-pointer hover:text-muted">
              {copy.nav[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
