import { TokenIcon } from './TokenIcon.tsx';
import { formatUsd } from '../lib/rate.ts';

/**
 * One side of an exchange: how much of what, and what that was worth.
 *
 * Small amounts keep their significant digits rather than their decimal places. A tenth of a
 * thousandth of an ether at three decimals is "0.000", which is the same thing a failed read
 * renders — and the two must never look alike on a tape.
 */
export function SwapLeg({
  amount,
  symbol,
  usd,
  muted = false,
}: {
  amount: number | null;
  symbol: string;
  usd?: number;
  /** The received side is the consequence, so it sits a step quieter than the given side. */
  muted?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TokenIcon symbol={symbol} size={22} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={`text-[13px] font-semibold ${muted ? 'text-muted' : 'text-ink'}`}>
          {amount === null ? '—' : amount < 0.01 ? amount.toPrecision(2) : amount.toFixed(4)}{' '}
          <span className="font-medium text-muted">{symbol}</span>
        </span>
        <span className="text-[11.5px] text-faint">{usd === undefined ? '' : formatUsd(usd)}</span>
      </span>
    </span>
  );
}
