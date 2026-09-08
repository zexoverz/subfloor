import { OctagonX, Wallet } from 'lucide-react';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { TokenIcon } from './TokenIcon.tsx';
import type { VaultState } from '../types.ts';

/**
 * What the board becomes after the panic control fires.
 *
 * §10 asks for "a plain terminal state", and it is plain on purpose: someone who has just stopped
 * their agent is not in a mood to be reassured by design. It says what happened, in the order it
 * happened, says the one part that cannot be undone, and then offers the only thing they might
 * actually want next.
 *
 * The withdrawal is the point of the screen. "Withdrawal is the owner path, always available,
 * never behind the agent, never behind the ceremony" — so it is a button here, not a route back
 * through a vault that has just been stopped.
 */
export function StoppedState({ state, onWithdraw }: { state: VaultState; onWithdraw: () => void }) {
  return (
    <div className="mx-auto max-w-[560px] py-16">
      <div className="rounded-lg border border-rule bg-surface p-7 shadow-card">
        <h1 className="m-0 flex items-center gap-2.5 text-[17px] font-semibold">
          <OctagonX size={17} strokeWidth={1.8} className="text-refuse" />
          {copy.panic.stopped}
        </h1>

        <p className="serif mt-3 mb-0 text-[15px] leading-relaxed text-muted">{copy.panic.doneDocked}</p>
        <p className="serif mt-2 text-[15px] leading-relaxed text-ink">{copy.panic.doneFunds}</p>

        <div className="mt-6 border-t border-rule pt-5">
          <span className="text-[11.5px] font-semibold tracking-[0.11em] text-faint uppercase">
            {copy.desk.vault}
          </span>
          <div className="mt-2 mb-5">
            {state.inventory.map((holding) => (
              <div
                key={holding.symbol}
                className="flex items-center gap-2.5 border-b border-rule py-2.5 last:border-b-0"
              >
                <TokenIcon symbol={holding.symbol} size={18} />
                <span className="text-[12.5px]">{holding.symbol}</span>
                <span className="ml-auto font-mono text-[13px] tabular-nums">
                  {Number.isNaN(holding.amount) ? '—' : holding.amount}
                </span>
              </div>
            ))}
          </div>

          <Act wide primary onClick={onWithdraw}>
            <span className="flex items-center justify-center gap-2">
              <Wallet size={14} strokeWidth={1.7} />
              {copy.panic.withdraw}
            </span>
          </Act>
          <p className="mt-2 text-center text-[11.5px] text-faint">{copy.panic.withdrawAll}</p>
        </div>
      </div>
    </div>
  );
}
