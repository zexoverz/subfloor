import { useEffect, useRef, useState } from 'react';
import { isAddress } from 'viem';
import { Check, KeyRound, Wallet as WalletIcon, X } from 'lucide-react';
import { copy } from '../copy.ts';
import { Act, Ghost } from './Button.tsx';
import { AddressField, AmountRow } from './StepForms.tsx';
import { FloorControl } from './FloorControl.tsx';
import { useCeremony } from '../lib/ceremony.ts';
import { useLedger } from '../lib/ledger.ts';
import { withTransition } from '../lib/transition.ts';
import type { Wallet } from '../lib/wallet.ts';
import type { Screen, VaultState } from '../types.ts';

/**
 * Setting the vault up, in a sheet over the board.
 *
 * §10 wants the owner of an unconfigured vault to meet the ceremony rather than a board of zeros,
 * and this still opens on its own the first time. What it no longer does is trap them there: "not
 * now" closes it, the board is behind it, and a card in the owner's column brings it back. An
 * owner who wants to look before signing is not a case worth blocking.
 */
export function SetupDialog({
  state,
  wallet,
  open,
  onClose,
  onSign,
  onNavigate,
}: {
  state: VaultState;
  wallet: Wallet;
  open: boolean;
  onClose: () => void;
  onSign: () => void;
  onNavigate: (s: Screen) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { pair, floor, mandate, reference } = state;
  const connected = Boolean(wallet.address);
  const holdings = wallet.holdings ?? state.inventory;
  const ceremony = useCeremony(wallet.address, holdings.filter((h) => h.amount > 0).length);
  const ledger = useLedger();

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  /*
   * An unregistered pair returns 0 bps, which is not a floor of zero distance — it is no floor.
   * Opening the slider there proposes "settle at any price", and the reader has no way to know the
   * number came from an absence rather than from a choice.
   */
  const [floorBps, setFloorBps] = useState(
    floor.enforced && floor.maxAdverseBps > 0 ? floor.maxAdverseBps : state.calibration.houseDefaultBps,
  );
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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet max-h-[88vh] w-[min(520px,calc(100vw-32px))] overflow-y-auto"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="flex items-baseline justify-between border-b border-rule bg-sunken px-5 py-3">
        <h2 className="m-0 text-[10.5px] tracking-[0.11em] text-faint uppercase">{copy.onboarding.finishSetup}</h2>
        <button
          onClick={onClose}
          aria-label="close"
          className="-mr-1 cursor-pointer p-1 text-faint transition-colors hover:text-ink"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>

      <div className="p-5">
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

              {/* Each group is its own block. Three headings at the same weight with the same gap
                  between them read as one long column of text. */}
              <span className="text-[10.5px] font-semibold tracking-[0.11em] text-faint uppercase">
                {copy.onboarding.inventory}
              </span>
              <div className="mt-2 mb-7">
                {holdings.map((h) => (
                  <AmountRow
                    key={h.symbol}
                    holding={h}
                    value={amounts[h.symbol] ?? ''}
                    onChange={(v) => setAmounts((a) => ({ ...a, [h.symbol]: v }))}
                  />
                ))}
              </div>

              {/*
                * Before the registry has an entry, this figure is a proposal, and the heading says
                * so. Rendering it under "your worst price" made the fixture default look like a
                * setting the owner had already made — the same class of mistake as a fixture
                * labelled live, on the screen where the number is chosen.
                */}
              <span className="block border-t border-rule pt-5 text-[10.5px] font-semibold tracking-[0.11em] text-faint uppercase">
                {floor.enforced ? copy.onboarding.worstPrice : copy.onboarding.proposedPrice}
              </span>
              {/* Shown, not hidden behind a toggle: this is the decision the sheet exists for. */}
              <FloorControl
                bps={floorBps}
                referencePrice={reference.price}
                base={pair.base}
                quote={pair.quote}
                worstEverBps={Math.max(...state.calibration.fillsBps.map(Math.abs))}
                onChange={setFloorBps}
              />
              {!floor.enforced && (
                <p className="-mt-3 mb-5 text-[11px] text-faint">{copy.onboarding.proposedNote}</p>
              )}

              {/* The one exception to hiding machinery, and the ticket that made it one. */}
              {/*
                * Filled in, it collapses to one line. The addresses are set once and never looked
                * at again, and leaving two fields and two explanations open afterwards is most of
                * this sheet's height spent on a decision already made.
                */}
              <details open={!keysReady} className="group mt-2 mb-6 border-t border-rule pt-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[10.5px] font-semibold tracking-[0.11em] uppercase">
                  <span className={keysReady ? 'flex items-center gap-2 text-settle' : 'text-faint'}>
                    {keysReady && <Check size={11} strokeWidth={2.4} />}
                    {keysReady ? copy.onboarding.keysDone : copy.onboarding.advanced}
                  </span>
                  <span className="text-faint transition-transform group-open:rotate-45">+</span>
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

              <p className="serif mb-4 border-t border-rule pt-5 text-[14px] text-muted">
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
    </dialog>
  );
}
