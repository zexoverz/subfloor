import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Undo2, X } from 'lucide-react';
import type { Address } from 'viem';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { AmountRow } from './StepForms.tsx';
import { WithdrawDialog } from './WithdrawDialog.tsx';
import { useFund } from '../lib/fund.ts';
import { useFaucet } from '../lib/faucet.ts';
import { ACTIVE_TOKENS, USDC_SYMBOL } from '../lib/tokens.ts';
import type { Holding } from '../types.ts';

/**
 * Sending inventory in, from the card that says what is in there.
 *
 * It used to live only in the setup sheet, which made funding a step of a ceremony — done once, at
 * the beginning, and then finished with. It is not. A vault is topped up for as long as it trades,
 * and a control that only exists inside "finish setup" is one an owner has to re-open a completed
 * wizard to reach.
 *
 * A button and a sheet rather than a disclosure. The card's job is to answer "what is in the
 * vault", and a form unfolding inside it pushes that answer down the page every time someone is
 * curious — the card changes height for a question it was not asked. A sheet costs one click and
 * leaves the card the size it was.
 */
export function TopUp({
  vault,
  owner,
  holdings,
  inventory,
  onWithdraw,
  onMoved,
}: {
  vault: Address | null;
  owner: Address | null;
  /** The *wallet's* balances, which is what can be sent — not the vault's, which is what it holds. */
  holdings: Holding[] | null;
  /** The *vault's* balances: what leaving would move, and whether there is anything to leave. */
  inventory: Holding[];
  onWithdraw: () => void;
  /**
   * Re-read the balances, because a transfer that lands changes two of them and nothing else says
   * so.
   *
   * Both numbers on this card are read once and then cached until something asks again. Sending
   * tokens in and drawing from the faucet both moved money and asked nothing — so the card went on
   * showing what was true before the press, which reads as the transfer having failed. Withdrawing
   * already did this; these two were the ones that did not.
   */
  onMoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDialogElement>(null);
  const fund = useFund(vault, owner);
  const faucet = useFaucet(owner);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    // Every opening starts empty. A number typed and abandoned should not be waiting the next time.
    if (open) setAmounts({});
  }, [open]);

  const rows = holdings ?? ACTIVE_TOKENS.map((t) => ({ symbol: t.symbol, amount: Number.NaN }));
  const hasAmount = Object.values(amounts).some((v) => Number(v) > 0);
  const hasBalance = inventory.some((h) => h.amount > 0);

  return (
    <div className="mt-4">
      {/*
       * Money in and money out on one row, because they are the two ends of one question and an
       * owner deciding between them should not have to look in two places to find both.
       *
       * Halves rather than content-width. They are the same kind of decision and neither is the
       * default, so sizing them by the length of their labels would make "Withdraw everything" the
       * bigger target for no reason but its name.
       *
       * Only the exit is red, and only when there is something to take. A destructive colour on a
       * button that would do nothing is a warning about nothing, and it spends the one colour that
       * has to keep meaning something.
       */}
      <div className={`grid gap-2.5 ${hasBalance ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Act wide onClick={() => setOpen(true)}>
          <span className="flex items-center gap-2">
            <ArrowDownToLine size={13} strokeWidth={1.8} />
            {copy.wallet.topUp}
          </span>
        </Act>

        {hasBalance && (
          <button
            onClick={() => setLeaving(true)}
            className="pushable push-panic mb-1.5 w-full cursor-pointer rounded-xl px-3.5 py-2.5 text-xs font-semibold tracking-[0.06em]"
          >
            <span className="flex items-center justify-center gap-2">
              <Undo2 size={13} strokeWidth={1.9} />
              {copy.wallet.withdrawShort}
            </span>
          </button>
        )}
      </div>

      <WithdrawDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        inventory={inventory}
        busy={withdrawing}
        onConfirm={() => {
          setWithdrawing(true);
          // Closed on the way out, so the sheet outlives the transaction it started and can report
          // it. Resetting either flag on the click would leave the owner watching nothing.
          void Promise.resolve(onWithdraw()).finally(() => {
            setWithdrawing(false);
            setLeaving(false);
          });
        }}
      />

      <dialog
        ref={ref}
        className="sheet w-[min(420px,calc(100vw-32px))]"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
      >
        <div className="flex items-baseline justify-between border-b border-rule bg-sunken px-5 py-3">
          <h2 className="m-0 text-[11.5px] tracking-[0.11em] text-faint uppercase">{copy.wallet.topUp}</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label={copy.panic.cancel}
            className="-mr-1 cursor-pointer p-1 text-faint transition-colors hover:text-ink"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-5 py-4">
          {/*
            * The faucet is the token's own mark, on the one row it pays out in — asked and answered
            * on chain, `TOKEN()` on the deployed faucet is the tUSDC address. There is no visible
            * button because there does not need to be one: it is a favour on a testnet, not a step,
            * and a step is what a button would make it look like.
            */}
          {rows.map((h) => (
            <AmountRow
              key={h.symbol}
              holding={h}
              value={amounts[h.symbol] ?? ''}
              onChange={(v) => setAmounts((a) => ({ ...a, [h.symbol]: v }))}
              {...(faucet.available && h.symbol === USDC_SYMBOL
                ? {
                    onMarkPress: () => void faucet.draw().then(onMoved),
                    markBusy: faucet.drawing,
                    markLabel: copy.wallet.drawTokens,
                  }
                : {})}
            />
          ))}


          <div className="mt-4">
            <Act
              primary
              wide
              onClick={() =>
                void fund
                  .send(ACTIVE_TOKENS.map((t) => ({ ...t, amount: amounts[t.symbol] ?? '0' })))
                  // Closed on the way out rather than on the click: the sheet is where the progress
                  // is reported, so it has to outlive the transaction it started.
                  .then(() => {
                    setOpen(false);
                    onMoved();
                  })
              }
              disabled={!hasAmount || !vault}
              busy={fund.sending}
              busyLabel={fund.step ?? copy.wallet.sendToVault}
            >
              {/* Say why it cannot be pressed, rather than looking broken. */}
              {hasAmount ? copy.wallet.sendToVault : copy.wallet.sendNeedsAmount}
            </Act>
          </div>
        </div>
      </dialog>
    </div>
  );
}
