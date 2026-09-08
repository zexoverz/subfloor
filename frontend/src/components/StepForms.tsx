import { isAddress } from 'viem';
import { Check, Info } from 'lucide-react';
import { copy } from '../copy.ts';
import { KeyRound, Wallet } from 'lucide-react';
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
}: {
  holding: Holding;
  value: string;
  onChange: (v: string) => void;
}) {
  const balance = Number.isNaN(holding.amount) ? null : holding.amount;

  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-rule py-3 last:border-b-0">
      {/*
        * The token and what you hold of it, stacked. The balance is the number this row is actually
        * about — it is the ceiling on the amount — and reading it as a footnote at the far right
        * meant looking away from the field to find it.
        */}
      <TokenIcon symbol={holding.symbol} size={22} />
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
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  icon?: 'key' | 'wallet';
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
          spellCheck={false}
          className={`w-full border-0 bg-transparent py-2.5 font-mono text-[12.5px] outline-none ${
            invalid ? 'text-refuse' : ''
          }`}
        />
        {!invalid && value.length > 0 && <Check size={13} strokeWidth={2.2} className="text-settle" />}
      </div>
      {/* Only the error stays on the page: an address that is nearly right is the worst outcome
          here, and it is not something to discover behind a hover. */}
      {invalid && <p className="mt-1.5 text-[12px] text-refuse">{copy.wallet.invalidAddress}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className="mt-1 cursor-pointer text-[11px] text-floor underline underline-offset-4 disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function MandateSummary({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-xl bg-sunken px-3 py-2.5 text-left shadow-card">
      <p className="mb-2 text-[11px] tracking-[0.12em] text-faint uppercase">{copy.wallet.mandateSummary}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-faint">{k}</dt>
            <dd className="m-0 truncate text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
