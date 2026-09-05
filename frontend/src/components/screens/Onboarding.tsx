import { Vault } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Card, CardBody, CardHead, Note, Todo } from '../Card.tsx';
import { Act, Ghost } from '../Button.tsx';
import { formatPrice, rateToPrice } from '../../lib/rate.ts';
import type { VaultState } from '../../types.ts';

/**
 * The empty state IS the onboarding: no dashboard-shaped emptiness, no zero-filled tiles. Deposit,
 * mandate and first floor collapse into one ceremony ending in one device signature.
 *
 * Deliberately hidden: the delegate address, the token approvals, the mandate's notional bound, the
 * EIP-712 shape, every contract address. Machinery stays invisible until it matters.
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
      <header className="max-w-[63ch] pb-6">
        <p className="m-0 text-[11px] font-semibold tracking-[0.17em] text-faint uppercase">
          Settlement-level price bound · Base mainnet
        </p>
        <h1 className="mt-3 mb-0 text-[clamp(28px,5vw,42px)] leading-[1.1] font-semibold tracking-[-0.02em] text-balance">
          {copy.onboarding.title}
          <br />
          <span className="text-faint">{copy.onboarding.lede}</span>
        </h1>
      </header>

      <Card>
        <CardHead icon={Vault} left="Open the vault" right={`${pair.base} / ${pair.quote}`} />
        <CardBody>
          <span className="text-[10.5px] tracking-[0.09em] text-faint uppercase">{copy.onboarding.inventory}</span>
          <div className="mt-2 mb-6 flex flex-wrap items-baseline gap-2">
            <span className="rounded-[2px] border border-rule px-3 py-2 font-medium">
              {wallet.base.toFixed(2)} {pair.base}
            </span>
            <span className="rounded-[2px] border border-rule px-3 py-2 font-medium">
              {wallet.quote} {pair.quote}
            </span>
            <Note className="ml-2">{funded ? copy.onboarding.fromWallet : copy.onboarding.noInventory}</Note>
          </div>

          <span className="text-[10.5px] tracking-[0.09em] text-faint uppercase">{copy.onboarding.worstPrice}</span>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-7 gap-y-2">
            <span className="text-[clamp(28px,5vw,40px)] font-semibold tracking-[-0.03em] text-brass">
              {formatPrice(floorPrice)}
            </span>
            <span className="serif max-w-[40ch] text-[15px] text-muted">
              {pair.quote} per {pair.base} — {floor.maxAdverseBps} bps below the reference.{' '}
              <Ghost onClick={onAdjust}>{copy.onboarding.adjust}</Ghost>
            </span>
          </div>

          <p className="serif mt-5 border-t border-rule pt-4 text-[15px] text-muted">
            Runs for {mandate.expiresInDays} days. The agent trades inside this and nothing else.
          </p>

          <div className="mt-1">
            <Act primary disabled={!funded} onClick={onSign}>
              {copy.onboarding.action}
            </Act>
          </div>
          <Note className="mt-2">{copy.onboarding.underAction}</Note>
        </CardBody>
      </Card>

      <Todo>
        skeleton: amounts are not editable and no device is enumerated yet. WebHID enumeration has to
        run on page load so the device-absent state is known before the ceremony is offered — never a
        form the owner completes and then fails at the end.
      </Todo>
    </>
  );
}
