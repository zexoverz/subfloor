import { useState } from 'react';
import { isAddress } from 'viem';
import { Check, KeyRound, Wallet as WalletIcon } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Act, Ghost } from '../Button.tsx';
import { AddressField, AmountRow } from '../StepForms.tsx';
import { FloorControl } from '../FloorControl.tsx';
import { LetterGlitch } from '../LetterGlitch.tsx';
import { floorPriceFromBps, formatPrice } from '../../lib/rate.ts';
import { useCeremony } from '../../lib/ceremony.ts';
import { useLedger } from '../../lib/ledger.ts';
import { mocked } from '../../lib/mock.ts';
import { withTransition } from '../../lib/transition.ts';
import type { Wallet } from '../../lib/wallet.ts';
import type { Screen, VaultState } from '../../types.ts';

/**
 * First run, and the empty state IS the onboarding.
 *
 * One screen whose entire job is the ceremony, and one primary action: money in, one worst price,
 * one signature, fourteen days. §10 is explicit that the deposit, the mandate and the first floor
 * collapse into a single device signature — an earlier version of this screen made them five
 * numbered steps, which turned four pieces of machinery into four decisions the owner had no basis
 * to make.
 *
 * What stays hidden: the token approvals, the mandate's notional bound, the EIP-712 structure, the
 * contract addresses. What is deliberately *not* hidden any more is the delegate address (#111):
 * the proof went green, so the agent's private key is published, and a judge cannot connect "this
 * key is public" to "this is the address the vault trades through" if the interface only ever shows
 * a nickname.
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
  const { pair, floor, mandate, reference } = state;
  const connected = Boolean(wallet.address);
  const holdings = wallet.holdings ?? state.inventory;
  const ceremony = useCeremony(wallet.address, holdings.filter((h) => h.amount > 0).length);
  const ledger = useLedger();

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [floorBps, setFloorBps] = useState(floor.maxAdverseBps);
  const [adjusting, setAdjusting] = useState(false);
  const [guardian, setGuardian] = useState('');
  const [delegate, setDelegate] = useState('');

  const funded = holdings.some((h) => Number(amounts[h.symbol]) > 0);
  const keysReady = isAddress(guardian) && isAddress(delegate);
  const blocked = !ceremony.deployed
    ? copy.wallet.notDeployed
    : ceremony.isOwner === false
      ? copy.wallet.notOwner
      : null;
  const ready = connected && !blocked && funded && keysReady;

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 opacity-[0.14]">
        <LetterGlitch />
      </div>

      <div className="relative w-full max-w-[520px]">
        <div className="mb-8 text-center">
          <div className="text-[15px] font-semibold tracking-[0.3em]">{copy.brand}</div>
          {mocked && (
            <span className="mt-3 inline-block rounded-[2px] border border-brass/40 bg-brass-wash px-2 py-[3px] text-[10px] tracking-[0.12em] text-brass uppercase">
              {copy.live.mock}
            </span>
          )}
          <p className="serif mx-auto mt-3 max-w-[34ch] text-[15px] leading-snug text-muted">
            {copy.onboarding.title} {copy.onboarding.lede}
          </p>
        </div>

        <div className="rounded-[3px] border border-rule bg-surface p-6 shadow-card">
          {!connected ? (
            <>
              <h1 className="m-0 text-center text-[17px] font-semibold">{copy.wallet.step1}</h1>
              <p className="serif mx-auto mt-2 mb-6 max-w-[32ch] text-center text-[13.5px] leading-relaxed text-muted">
                {copy.wallet.why}
              </p>
              <Act primary onClick={() => withTransition(wallet.connect)} disabled={wallet.connecting}>
                <span className="flex items-center justify-center gap-2">
                  <WalletIcon size={14} strokeWidth={1.7} />
                  {wallet.connecting ? copy.wallet.connecting : copy.wallet.connect}
                </span>
              </Act>
              {wallet.error && <p className="mt-3 text-center text-[11.5px] text-refuse">{wallet.error}</p>}

              <div className="my-4 flex items-center gap-3 text-[10.5px] tracking-[0.12em] text-faint uppercase">
                <span className="h-px flex-1 bg-rule" />
                {copy.wallet.or}
                <span className="h-px flex-1 bg-rule" />
              </div>

              <Act onClick={ledger.connect} disabled={ledger.connecting || !ledger.supported}>
                <span className="flex items-center justify-center gap-2">
                  <KeyRound size={14} strokeWidth={1.7} className="text-brass" />
                  {copy.wallet.connectLedger}
                </span>
              </Act>
              <p className="serif mx-auto mt-2 max-w-[34ch] text-center text-[12.5px] leading-relaxed text-faint">
                {ledger.error ?? (ledger.supported ? copy.wallet.ledgerWhy : copy.wallet.ledgerUnsupported)}
              </p>
            </>
          ) : blocked ? (
            <div className="text-center">
              <p className="serif m-0 text-[14px] leading-relaxed text-muted">{blocked}</p>
              {ceremony.isOwner === false && (
                <>
                  <p className="serif mx-auto mt-2 mb-5 max-w-[32ch] text-[13px] leading-relaxed text-faint">
                    {copy.wallet.notOwnerHint}
                  </p>
                  <Act primary onClick={() => onNavigate('live')}>
                    {copy.wallet.notOwnerAction}
                  </Act>
                </>
              )}
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

              <span className="text-[10.5px] tracking-[0.09em] text-faint uppercase">
                {copy.onboarding.inventory}
              </span>
              <div className="mt-1 mb-6">
                {holdings.map((h) => (
                  <AmountRow
                    key={h.symbol}
                    holding={h}
                    value={amounts[h.symbol] ?? ''}
                    onChange={(v) => setAmounts((a) => ({ ...a, [h.symbol]: v }))}
                  />
                ))}
              </div>

              <span className="text-[10.5px] tracking-[0.09em] text-faint uppercase">
                {copy.onboarding.worstPrice}
              </span>
              {adjusting ? (
                <FloorControl
                  bps={floorBps}
                  referencePrice={reference.price}
                  base={pair.base}
                  quote={pair.quote}
                  onChange={setFloorBps}
                />
              ) : (
                <div className="mt-1 mb-6">
                  <div className="text-[clamp(24px,6vw,32px)] leading-none font-semibold tracking-tight text-brass">
                    {formatPrice(floorPriceFromBps(reference.price, floorBps))}
                  </div>
                  <p className="mt-1.5 flex items-center gap-2 text-[11.5px] text-faint">
                    {pair.quote} per {pair.base} · {floorBps} bps below the live reference
                    <Ghost onClick={() => setAdjusting(true)}>{copy.onboarding.adjust}</Ghost>
                  </p>
                </div>
              )}

              {/* The one exception to hiding machinery, and the ticket that made it one. */}
              <details className="group mb-5 border-y border-rule py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] tracking-[0.08em] text-faint uppercase">
                  {copy.onboarding.advanced}
                  <span className="transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="serif mt-2 mb-3 text-[12.5px] leading-relaxed text-faint">
                  {copy.onboarding.advancedNote}
                </p>
                <div className="grid gap-3">
                  <AddressField
                    label={copy.wallet.guardianLabel}
                    hint={copy.wallet.guardianHint}
                    value={guardian}
                    onChange={setGuardian}
                    action={{ label: copy.wallet.useDevice, onClick: () => {}, disabled: ledger.presence !== 'paired' }}
                  />
                  <AddressField
                    label={copy.wallet.delegateLabel}
                    hint={copy.wallet.delegateHint}
                    value={delegate}
                    onChange={setDelegate}
                  />
                </div>
              </details>

              <p className="serif mb-4 text-[14px] text-muted">
                {copy.onboarding.runsFor.replace('{days}', String(mandate.expiresInDays))}
              </p>

              <Act primary disabled={!ready} onClick={onSign}>
                {copy.onboarding.action}
              </Act>
              <p className="mt-2 text-center text-[11.5px] text-faint">
                {!funded ? copy.onboarding.noInventory : copy.onboarding.underAction}
              </p>

              {/* Four transactions and one signature, listed rather than made into four decisions. */}
              <ol className="mt-4 grid list-none gap-1 border-t border-rule pt-3 p-0 text-[11px] text-faint">
                <li className="mb-0.5 tracking-[0.08em] uppercase">{copy.onboarding.doing}</li>
                {ceremony.steps.map((step) => (
                  <li key={step.id} className={`flex items-center gap-2 ${step.done ? 'text-settle' : ''}`}>
                    {step.done ? <Check size={11} strokeWidth={2.4} /> : <span className="w-[11px]">·</span>}
                    {step.title}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
