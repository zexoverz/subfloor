import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import type { Address } from 'viem';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { AmountRow } from './StepForms.tsx';
import { useFund } from '../lib/fund.ts';
import { useFaucet } from '../lib/faucet.ts';
import { ACTIVE_TOKENS } from '../lib/tokens.ts';
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
}: {
  vault: Address | null;
  owner: Address | null;
  /** The *wallet's* balances, which is what can be sent — not the vault's, which is what it holds. */
  holdings: Holding[] | null;
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="mt-3 border-t border-rule pt-3">
      <Act onClick={() => setOpen(true)}>
        <span className="flex items-center gap-2">
          <ArrowDownToLine size={13} strokeWidth={1.8} />
          {copy.wallet.topUp}
        </span>
      </Act>

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
          {rows.map((h) => (
            <AmountRow
              key={h.symbol}
              holding={h}
              value={amounts[h.symbol] ?? ''}
              onChange={(v) => setAmounts((a) => ({ ...a, [h.symbol]: v }))}
            />
          ))}

          {/*
            * Offered next to the amounts, because that is where someone finds out they have none.
            * Absent entirely on a build with no faucet address, which is how a mainnet build reads.
            */}
          {faucet.available && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Act onClick={() => void faucet.draw()} busy={faucet.drawing} busyLabel={copy.wallet.drawing}>
                {copy.wallet.drawTokens}
              </Act>
              <span className="text-[11px] text-faint">
                {faucet.nextAt && faucet.nextAt * 1000 > Date.now()
                  ? copy.wallet.drawCooldown
                  : copy.wallet.drawHint}
              </span>
            </div>
          )}

          <div className="mt-4">
            <Act
              primary
              wide
              onClick={() =>
                void fund
                  .send(ACTIVE_TOKENS.map((t) => ({ ...t, amount: amounts[t.symbol] ?? '0' })))
                  // Closed on the way out rather than on the click: the sheet is where the progress
                  // is reported, so it has to outlive the transaction it started.
                  .then(() => setOpen(false))
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
