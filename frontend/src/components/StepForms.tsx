import { isAddress } from 'viem';
import { copy } from '../copy.ts';
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
    <div className="flex items-center gap-2 border-b border-rule py-2.5 last:border-b-0">
      <span className="w-14 text-[11px] tracking-[0.08em] text-faint uppercase">{holding.symbol}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder="0.00"
        className="min-w-0 flex-1 border-0 bg-transparent text-right font-mono text-[15px] tabular-nums outline-none placeholder:text-faint"
      />
      <button
        type="button"
        onClick={() => balance !== null && onChange(String(balance))}
        className="cursor-pointer rounded-[2px] border border-rule px-2 py-1 text-[10px] tracking-[0.08em] text-faint uppercase hover:border-brass hover:text-brass"
      >
        {copy.wallet.max}
      </button>
      <span className="w-24 text-right text-[10.5px] text-faint">
        {balance === null ? '—' : balance} {copy.wallet.inWallet}
      </span>
    </div>
  );
}

export function AddressField({
  label,
  hint,
  value,
  onChange,
  action,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  const invalid = value.length > 0 && !isAddress(value);

  return (
    <div className="text-left">
      <label className="block text-[10.5px] tracking-[0.09em] text-faint uppercase">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder="0x…"
        spellCheck={false}
        className={`mt-1.5 w-full rounded-[2px] border bg-sunken px-3 py-2.5 font-mono text-[12.5px] outline-none ${
          invalid ? 'border-refuse text-refuse' : 'border-rule focus:border-brass'
        }`}
      />
      {/* An address that is nearly right is the worst outcome here, so it is checked as it is typed. */}
      <p className={`serif mt-1.5 text-[12.5px] leading-relaxed ${invalid ? 'text-refuse' : 'text-faint'}`}>
        {invalid ? copy.wallet.invalidAddress : hint}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className="mt-1 cursor-pointer text-[11px] text-brass underline underline-offset-4 disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function MandateSummary({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-[2px] border border-rule bg-sunken px-3 py-2.5 text-left">
      <p className="mb-2 text-[10px] tracking-[0.12em] text-faint uppercase">{copy.wallet.mandateSummary}</p>
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
