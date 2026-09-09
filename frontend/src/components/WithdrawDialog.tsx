import { Undo2 } from 'lucide-react';
import { copy } from '../copy.ts';
import { DangerSheet } from './DangerSheet.tsx';
import { TokenIcon } from './TokenIcon.tsx';
import type { Holding } from '../types.ts';

/**
 * The confirmation before the vault is emptied.
 *
 * Same frame as stopping the agent, and deliberately not the same weight. This is destructive and
 * it is recoverable: the tokens go to the address that owns the vault and can be sent back. So
 * there is no acknowledgement to tick and no line claiming it cannot be undone — a dialog that
 * overstates a reversible act is one the owner learns to click past, and the next dialog they click
 * past is the one that meant it.
 *
 * What it does say is the thing worth knowing before pressing: the vault stops trading, because an
 * empty vault has nothing to quote against.
 */
export function WithdrawDialog({
  open,
  onClose,
  onConfirm,
  inventory,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** What is about to move, named and counted, so this is a decision about amounts rather than words. */
  inventory: Holding[];
  busy: boolean;
}) {
  const held = inventory.filter((h) => h.amount > 0);

  return (
    <DangerSheet
      open={open}
      onClose={onClose}
      title={copy.wallet.withdrawTitle}
      lead={copy.wallet.withdrawLead}
      confirmLabel={copy.wallet.withdraw}
      confirmIcon={<Undo2 size={14} strokeWidth={1.9} />}
      onConfirm={onConfirm}
      busy={busy}
      busyLabel={copy.wallet.withdrawing}
    >
      {/*
       * The balances themselves, not a sentence about them. "Everything" is an amount, and an owner
       * about to move it should see the number rather than the word.
       */}
      {held.length > 0 && (
        <ul className="m-0 flex w-full list-none flex-col gap-2 p-0 text-left">
          {held.map((h) => (
            <li
              key={h.symbol}
              className="flex items-center gap-2.5 rounded-lg bg-sunken/70 px-3 py-2 text-[12.5px] text-ink"
            >
              <TokenIcon symbol={h.symbol} size={18} />
              <span className="text-faint">{h.symbol}</span>
              <span className="ml-auto font-medium">{h.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </DangerSheet>
  );
}
