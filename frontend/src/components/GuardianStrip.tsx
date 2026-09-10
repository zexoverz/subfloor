import { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import type { Address } from 'viem';
import { isAddress } from 'viem';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { AddressChip } from './AddressChip.tsx';
import { AddressField } from './StepForms.tsx';
import type { Ledger } from '../lib/ledger.ts';

/**
 * The key that may weaken this floor, on the card that shows the floor.
 *
 * It was in a collapsed "advanced" section of the setup sheet, which is the wrong place twice over:
 * it is not advanced — a vault without it cannot lower its floor at all — and the sheet it hid in
 * reads as finished business.
 *
 * The registry's slot is write-once. That is the whole asymmetry of the design: an owner key that
 * has been taken over must not be able to appoint a guardian it controls and then lower the floor
 * with it. So once it is set this strip stops offering and starts reporting, and says why — moving
 * it is `rotateGuardian`, under a signature from the key being replaced, which is a ceremony this
 * card does not have and should not pretend to.
 */
export function GuardianStrip({
  guardian,
  registered,
  owner,
  ledger,
  onSet,
  saving,
  savingStep,
}: {
  /** What the vault names. Null until read — never rendered as "none" while unknown. */
  guardian: Address | null;
  /** Whether the *registry's* write-once slot is filled. The vault's own is not the binding one. */
  registered: boolean;
  owner: boolean;
  ledger: Ledger;
  onSet: (next: Address) => Promise<void>;
  saving: boolean;
  savingStep: string | null;
}) {
  const [next, setNext] = useState('');
  const ready = isAddress(next);

  return (
    <div className="mt-3.5 border-t border-rule pt-3.5">
      <div className="flex items-center gap-2.5">
        <KeyRound size={14} strokeWidth={1.8} aria-hidden className="shrink-0 text-floor" />
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] tracking-[0.08em] text-muted uppercase">{copy.floor.guardianLabel}</div>
          {guardian ? (
            <div className="mt-1">
              <AddressChip address={guardian} size={16} />
            </div>
          ) : (
            <div className="text-[12.5px] text-refuse">{copy.floor.guardianNone}</div>
          )}
        </div>
        {registered && (
          <span
            title={copy.wallet.guardianLocked}
            className="flex shrink-0 items-center gap-1 text-[10px] tracking-[0.1em] text-faint uppercase"
          >
            <Lock size={10} strokeWidth={2.2} />
            {copy.floor.guardianFixed}
          </span>
        )}
      </div>

      {/* Offered only while the slot is empty, because a write that reverts still costs the owner a
          transaction and the vault-side half has already landed by then. */}
      {owner && !registered && (
        <div className="mt-2.5">
          <AddressField
            label={copy.wallet.guardianLabel}
            hint={copy.wallet.guardianHint}
            value={next}
            onChange={setNext}
            action={{
              label: ledger.connecting ? copy.wallet.readingDevice : copy.wallet.useDevice,
              busy: ledger.connecting,
              onClick: () => {
                void (async () => {
                  // `connect()` returns what it read: state here is a render behind.
                  const found = ledger.address ?? (await ledger.connect());
                  if (found) setNext(found);
                })();
              },
              disabled: ledger.connecting || !ledger.supported,
            }}
          />
          <div className="mt-2.5">
            <Act
              wide
              primary
              disabled={!ready}
              busy={saving}
              busyLabel={savingStep ?? copy.floor.guardianSaving}
              onClick={() => void onSet(next as Address)}
            >
              {copy.floor.guardianSet}
            </Act>
          </div>
        </div>
      )}
    </div>
  );
}
