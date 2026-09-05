import { copy } from '../../copy.ts';
import { Panel, Label, Note, Todo } from '../Panel.tsx';
import { Primary, Ghost } from '../Button.tsx';
import { formatPrice, rateToPrice } from '../../lib/rate.ts';
import type { VaultState } from '../../types.ts';

/**
 * The empty state IS the onboarding: no dashboard-shaped emptiness, no zero-filled tiles. Deposit,
 * mandate and first floor collapse into one ceremony ending in one device signature.
 *
 * Deliberately hidden: the delegate address, the token approvals, the mandate's notional bound,
 * the EIP-712 shape, every contract address. Machinery stays invisible until it matters.
 */
export function Onboarding({
  state,
  onAdjust,
  onSign,
}: {
  state: VaultState;
  onAdjust: () => void;
  onSign: () => void;
}) {
  const { pair, wallet, floor, mandate } = state;
  const funded = wallet.base > 0 || wallet.quote > 0;
  const floorPrice = rateToPrice(floor.absoluteRate, pair.baseDecimals, pair.quoteDecimals);

  return (
    <>
      <Panel>
        <h1 className="mb-1 text-2xl">{copy.onboarding.title}</h1>
        <p className="mb-6 text-dim">{copy.onboarding.lede}</p>

        <Label>{copy.onboarding.inventory}</Label>
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <div className="flex gap-2">
            <span className="num rounded-lg border border-line px-3 py-2">
              {wallet.base.toFixed(2)} {pair.base}
            </span>
            <span className="num rounded-lg border border-line px-3 py-2">
              {wallet.quote} {pair.quote}
            </span>
          </div>
          <Note>{funded ? copy.onboarding.fromWallet : copy.onboarding.noInventory}</Note>
        </div>

        <Label>{copy.onboarding.worstPrice}</Label>
        <div className="num text-4xl tracking-tight">
          {formatPrice(floorPrice)} {pair.quote} per {pair.base}
        </div>
        <div className="mt-1 mb-6 flex items-center gap-3 text-sm text-dim">
          {floor.maxAdverseBps} bps below the live reference
          <Ghost onClick={onAdjust}>{copy.onboarding.adjust}</Ghost>
        </div>

        <p className="mb-4 border-t border-line pt-4 text-sm text-dim">
          runs for {mandate.expiresInDays} days · the agent trades inside this, nothing else
        </p>

        <Primary device onClick={onSign} disabled={!funded}>
          {copy.onboarding.action}
        </Primary>
        <Note className="mt-2 text-center">{copy.onboarding.underAction}</Note>
      </Panel>

      <Todo>
        skeleton: amounts are not editable and no device is enumerated yet. WebHID enumeration has
        to happen on page load, so the device-absent state is known before the ceremony is offered
        — never a form the owner completes and then fails at the end.
      </Todo>
    </>
  );
}
