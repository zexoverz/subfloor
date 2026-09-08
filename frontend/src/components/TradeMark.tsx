import { ArrowDownRight, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { TokenIcon } from './TokenIcon.tsx';

/**
 * The token, with what happened to it badged on the corner.
 *
 * The badge could have carried the chain, the way a portfolio table does — but every row here is
 * the same chain and the same pair, so a chain badge would repeat identical information on every
 * line and pay for it in space. The direction differs row to row, which is what earns the corner.
 *
 * Refusal gets the shield rather than a third arrow: it is not a direction that went wrong, it is
 * the outcome where nothing moved at all.
 */
export function TradeMark({ symbol, kind }: { symbol: string; kind: 'bought' | 'sold' | 'refused' }) {
  const badge =
    kind === 'refused'
      ? { tone: 'bg-refuse text-white', icon: <ShieldCheck size={9} strokeWidth={3} /> }
      : kind === 'bought'
        ? { tone: 'bg-settle text-ground', icon: <ArrowUpRight size={9} strokeWidth={3.4} /> }
        : { tone: 'bg-floor text-ground', icon: <ArrowDownRight size={9} strokeWidth={3.4} /> };

  return (
    <span className="relative inline-flex shrink-0">
      <TokenIcon symbol={symbol} size={26} />
      {/*
       * Ringed in the surface colour so the badge reads as sitting in front of the token rather
       * than punched out of it — the same trick a chain badge uses, for the same reason.
       */}
      <span
        className={`absolute -right-0.5 -bottom-0.5 grid size-[13px] place-items-center rounded-full ring-2 ring-surface ${badge.tone}`}
      >
        {badge.icon}
      </span>
    </span>
  );
}
