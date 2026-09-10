import { isAddress } from 'viem';
import { Check, Info, KeyRound, Loader2, Usb, Wallet } from 'lucide-react';
import { copy } from '../copy.ts';
import { Hoverable } from './Hoverable.tsx';
import { TokenIcon } from './TokenIcon.tsx';
import { Tooltip } from './Tooltip.tsx';
import type { Holding } from '../types.ts';

/**
 * One form per step. Without these the flow is a counter with a button on it — pressing "Name the
 * agent" has to actually ask which agent, or the screen is describing work rather than doing it.
 *
 * Everything here is uncontrolled-simple on purpose: three fields across the whole ceremony, and
 * each one is the single fact its step is about.
 */
export function AmountRow({
  holding,
  value,
  onChange,
  onMarkPress,
  markBusy = false,
  markLabel,
}: {
  holding: Holding;
  value: string;
  onChange: (v: string) => void;
  /**
   * Something the token's own mark does when pressed. Used for exactly one thing — the faucet —
   * and the row does not know or care what it is.
   *
   * It is unlabelled on screen on purpose, but it is not unlabelled: an interactive element with
   * no accessible name is a button nobody using a screen reader can identify, and "it is a secret"
   * is not a reason to ship one. The surprise is that there is no visible button, not that the
   * control is hidden from anyone who needs to be told it exists.
   */
  onMarkPress?: () => void;
  markBusy?: boolean;
  markLabel?: string;
}) {
  const balance = Number.isNaN(holding.amount) ? null : holding.amount;

  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-rule py-3 last:border-b-0">
      {/*
        * The token and what you hold of it, stacked. The balance is the number this row is actually
        * about — it is the ceiling on the amount — and reading it as a footnote at the far right
        * meant looking away from the field to find it.
        */}
      {onMarkPress ? (
        <button
          type="button"
          onClick={onMarkPress}
          aria-label={markLabel}
          title={markLabel}
          className="shrink-0 cursor-pointer rounded-full leading-none"
        >
          <span className={markBusy ? 'coin-flip block' : 'block'}>
            <TokenIcon symbol={holding.symbol} size={22} />
          </span>
        </button>
      ) : (
        <TokenIcon symbol={holding.symbol} size={22} />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="text-[12.5px] font-medium">{holding.symbol}</span>
        <span className="flex items-center gap-1 text-[11.5px] text-faint">
          <Wallet size={10} strokeWidth={1.8} />
          {balance === null ? '—' : balance} {copy.wallet.inWallet}
        </span>
      </span>

      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder="0.00"
        className="ml-auto w-20 min-w-0 shrink border-0 bg-transparent text-right font-mono text-[16px] tabular-nums outline-none placeholder:text-faint"
      />
      <button
        type="button"
        onClick={() => balance !== null && onChange(String(balance))}
        disabled={!balance}
        className="shrink-0 cursor-pointer rounded-xl border border-rule px-2 py-1 text-[11px] tracking-[0.08em] text-faint uppercase transition-colors hover:border-floor hover:text-floor disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copy.wallet.max}
      </button>
    </div>
  );
}

export function AddressField({
  label,
  hint,
  value,
  onChange,
  action,
  icon = 'key',
  readOnly = false,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  /** The one-press way to fill it. `label` is the whole explanation: it is a glyph on screen. */
  action?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean };
  icon?: 'key' | 'wallet';
  /** Filled by a decision made elsewhere: shown, checkable, and not typed into. */
  readOnly?: boolean;
}) {
  const Mark = icon === 'wallet' ? Wallet : KeyRound;
  const invalid = value.length > 0 && !isAddress(value);

  return (
    <div className="text-left">
      {/*
        * The explanation moves onto the label as a tooltip. It is read once, by someone deciding
        * what to paste, and a permanent line under every field turned three inputs into a wall of
        * grey prose — the thing that made this sheet hard to read at all.
        */}
      <label className="flex items-center gap-1.5 text-[11.5px] tracking-[0.09em] text-muted uppercase">
        {label}
        <Tooltip text={hint}>
          <Info size={11} strokeWidth={1.8} />
        </Tooltip>
      </label>
      {/* The mark sits inside the field: which key this is matters more than the field's border. */}
      <div
        className={`mt-1.5 flex items-center gap-2 rounded-xl border bg-sunken px-3 focus-within:border-floor ${
          invalid ? 'border-refuse' : 'border-rule'
        }`}
      >
        <Mark size={13} strokeWidth={1.7} className={invalid ? 'text-refuse' : 'text-faint'} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="0x…"
          readOnly={readOnly}
          spellCheck={false}
          className={`w-full border-0 bg-transparent py-2.5 font-mono text-[12.5px] outline-none ${
            invalid ? 'text-refuse' : ''
          }`}
        />
        {!invalid && value.length > 0 && <Check size={13} strokeWidth={2.2} className="text-settle" />}
        {/*
          * Inside the field, at the end of it.
          *
          * It was an underlined sentence under the input — a second line of prose in a card whose
          * whole problem is prose, and one that read as a footnote rather than as something to
          * press. As a glyph at the end of the field it is where a filling action belongs, and the
          * sentence survives as its label, on hover and for anything not reading pixels.
          */}
        {action && (
          <Hoverable content={action.label}>
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              aria-label={action.label}
              className="-mr-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:text-floor disabled:cursor-not-allowed disabled:text-faint/40"
            >
              {action.busy ? (
                <Loader2 size={13} strokeWidth={2} className="animate-spin" />
              ) : (
                <Usb size={13} strokeWidth={1.9} />
              )}
            </button>
          </Hoverable>
        )}
      </div>
      {/* Only the error stays on the page: an address that is nearly right is the worst outcome
          here, and it is not something to discover behind a hover. */}
      {invalid && <p className="mt-1.5 text-[12px] text-refuse">{copy.wallet.invalidAddress}</p>}
    </div>
  );
}
