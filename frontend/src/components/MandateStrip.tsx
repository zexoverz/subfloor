import { useEffect, useRef, useState } from 'react';
import { Check, OctagonX, ShieldCheck, X } from 'lucide-react';
import type { Address } from 'viem';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { DeviceSign } from './DeviceSign.tsx';
import { PanicDialog } from './PanicDialog.tsx';
import { buildMandate } from '../lib/mandate.ts';
import { loadMandate, saveMandate } from '../lib/mandateStore.ts';
import { floorPriceFromBps, formatPrice } from '../lib/rate.ts';
import type { Ledger } from '../lib/ledger.ts';
import type { Wallet } from '../lib/wallet.ts';
import type { VaultState } from '../types.ts';

/**
 * The mandate, on the card of the agent it authorises.
 *
 * It used to be the last step of a setup wizard, which put the one thing that decides what the
 * agent may do behind a sheet that reads as finished business. It is not finished business: the
 * mandate names a delegate, and `_consumeMandate` requires `m.delegate == msg.sender`, so pointing
 * the vault at a different agent — which is now an edit on this same card — silently makes the old
 * signature authorise nobody. The two belong next to each other because changing one invalidates
 * the other.
 *
 * What is checked here is the artifact, not the chain. A mandate is a signature; the vault learns
 * of it only when the agent ships with it, so waiting for on-chain evidence would be waiting for
 * something that does not exist yet. Holding the signature is a fact about this browser and the
 * wording says exactly that.
 */
export function MandateStrip({
  state,
  vault,
  nonce,
  wallet,
  ledger,
  onSigned,
  onPanic,
}: {
  state: VaultState;
  vault: Address | null;
  /** The vault's mandate nonce, read on chain. The signature is worthless against the wrong one. */
  nonce: bigint | null;
  wallet: Wallet;
  ledger: Ledger;
  onSigned: () => void;
  /**
   * Dock the vault and revoke the mandate.
   *
   * It sits in this block rather than under it because the two buttons are the two ends of one
   * authorisation: this strip is what grants the agent its licence, and stopping is what takes it
   * back. Side by side they read as a pair; stacked they read as two unrelated red and blue slabs.
   */
  onPanic: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const { mandate, inventory, reference, floor } = state;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const held = loadMandate(vault);
  /*
   * Held *for the agent the vault currently names*. A mandate signed for a delegate that has since
   * been replaced is not a weaker authorisation, it is none at all — so this must not report one.
   */
  const current = Boolean(held && state.delegate && held.delegate.toLowerCase() === state.delegate.toLowerCase());

  return (
    <div className="mt-4 border-t border-rule pt-3.5">
      <div className="flex items-center gap-2.5">
        <ShieldCheck
          size={14}
          strokeWidth={1.8}
          aria-hidden
          className={current ? 'shrink-0 text-settle' : 'shrink-0 text-faint'}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] tracking-[0.08em] text-muted uppercase">{copy.live.mandateLabel}</div>
          <div className="text-[12.5px] text-ink">
            {current ? copy.live.mandateHeld : held ? copy.live.mandateStale : copy.live.mandateNone}
          </div>
        </div>
        {current && <Check size={14} strokeWidth={2.4} className="shrink-0 text-settle" />}
      </div>

      {/* Halves rather than content-width: they are the two ends of one decision and neither is
          the default, so sizing them by their labels would make the longer one the bigger target. */}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <Act wide primary={!current} onClick={() => setOpen(true)} disabled={!vault}>
          {current ? copy.live.mandateAgain : copy.live.mandateSign}
        </Act>
        <button
          onClick={() => setAsking(true)}
          title={copy.panic.hint}
          className="pushable push-panic mb-1.5 w-full cursor-pointer rounded-xl px-3 py-2.5 text-xs font-semibold tracking-[0.06em] uppercase select-none"
        >
          <span className="flex items-center justify-center gap-2">
            <OctagonX size={13} strokeWidth={1.9} />
            {copy.panic.label}
          </span>
        </button>
      </div>

      <PanicDialog
        open={asking}
        onClose={() => setAsking(false)}
        onFire={() => {
          setAsking(false);
          onPanic();
        }}
      />

      <dialog
        ref={ref}
        className="sheet w-[min(760px,calc(100vw-32px))]"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
      >
        <div className="flex items-center justify-between border-b border-rule bg-sunken px-5 py-3">
          <h2 className="m-0 text-[11.5px] tracking-[0.11em] text-faint uppercase">{copy.live.mandateLabel}</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label={copy.panic.cancel}
            className="-mr-1 cursor-pointer p-1 text-faint transition-colors hover:text-ink"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>

        <div className="p-5">
          <DeviceSign
            expect={state.guardian ?? null}
            wallet={wallet}
            ledger={ledger}
            purpose="mandate"
            framed={false}
            rows={[
              ['Action', 'Authorise agent'],
              ['Delegate', state.delegate ?? mandate.delegateLabel],
              ['Tokens', inventory.map((h) => h.symbol).join(' / ')],
              ['Expires', `${mandate.expiresInDays} days`],
            ]}
            typedData={buildMandate({
              vault,
              delegate: state.delegate ?? '',
              inventory,
              nonce: nonce ?? 0n,
              expiresInDays: mandate.expiresInDays,
            })}
            standing={formatPrice(floorPriceFromBps(reference.price, floor.maxAdverseBps))}
            onSigned={(signature) => {
              if (!vault || !state.delegate) return;
              saveMandate({
                vault,
                delegate: state.delegate,
                nonce: String(nonce ?? 0n),
                signature,
                at: Date.now(),
              });
              onSigned();
            }}
            onDone={() => {
              setOpen(false);
              onSigned();
            }}
            onBack={() => setOpen(false)}
          />
        </div>
      </dialog>
    </div>
  );
}
