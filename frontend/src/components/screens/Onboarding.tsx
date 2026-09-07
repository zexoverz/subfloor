import { Vault, Wallet as WalletIcon } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Card, CardBody, CardHead, Note, Todo } from '../Card.tsx';
import { Act, Ghost } from '../Button.tsx';
import { formatPrice, rateToPrice } from '../../lib/rate.ts';
import type { Wallet } from '../../lib/wallet.ts';
import type { VaultState } from '../../types.ts';

/**
 * The empty state IS the onboarding: no dashboard-shaped emptiness, no zero-filled tiles.
 *
 * Two things happen here and they are not the same kind of thing. Connecting the wallet is a
 * prerequisite — it only lets the screen read what you hold. Connecting the agent is the ceremony:
 * deposit, mandate and first floor collapse into one device signature, because a user should meet
 * the device twice in normal life, not five times.
 *
 * Deliberately hidden: the delegate address (the mandate carries it; the UI says "the agent"), the
 * token approvals, the mandate's notional bound, the EIP-712 shape, every contract address.
 */
export function Onboarding({
  state,
  wallet,
  onAdjust,
  onSign,
}: {
  state: VaultState;
  wallet: Wallet;
  onAdjust: () => void;
  onSign: () => void;
}) {
  const { pair, floor, mandate } = state;
  const connected = Boolean(wallet.address);
  const holdings = wallet.holdings ?? state.inventory;
  const funded = holdings.some((h) => h.amount > 0);
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

      {/* 1 — the prerequisite */}
      <Card className="mb-4.5">
        <CardHead
          icon={WalletIcon}
          left={`1 · ${copy.wallet.step1}`}
          right={connected ? 'connected' : wallet.available ? 'not connected' : copy.wallet.none}
        />
        <CardBody>
          {connected ? (
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="font-medium">
                  {wallet.address?.slice(0, 6)}…{wallet.address?.slice(-4)}
                </div>
                <Note className="mt-1">{copy.onboarding.fromWallet}</Note>
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                {holdings.map((h) => (
                  <span key={h.symbol} className="rounded-[2px] border border-rule px-3 py-2 font-medium">
                    {Number.isNaN(h.amount) ? '—' : h.amount} {h.symbol}
                  </span>
                ))}
                <Ghost onClick={wallet.disconnect}>{copy.wallet.disconnect}</Ghost>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <Act primary onClick={wallet.connect} disabled={wallet.connecting || !wallet.available}>
                {wallet.connecting ? copy.wallet.connecting : copy.wallet.connect}
              </Act>
              <Note className="max-w-[46ch]">{wallet.error ?? copy.wallet.why}</Note>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 2 — the ceremony. One signature covers the deposit, the mandate and the first floor. */}
      <Card className={connected ? '' : 'opacity-45'}>
        <CardHead icon={Vault} left={`2 · ${copy.wallet.step2}`} right={`${pair.base} / ${pair.quote}`} />
        <CardBody>
          <p className="serif m-0 max-w-[58ch] text-[15px] text-muted">{copy.wallet.agentWhat}</p>

          <div className="mt-5">
            <span className="text-[10.5px] tracking-[0.09em] text-faint uppercase">
              {copy.onboarding.worstPrice}
            </span>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-7 gap-y-2">
              <span className="text-[clamp(28px,5vw,40px)] font-semibold tracking-[-0.03em] text-brass">
                {formatPrice(floorPrice)}
              </span>
              <span className="serif max-w-[40ch] text-[15px] text-muted">
                {pair.quote} per {pair.base} — {floor.maxAdverseBps} bps below the reference.{' '}
                <Ghost onClick={onAdjust}>{copy.onboarding.adjust}</Ghost>
              </span>
            </div>
          </div>

          <p className="serif mt-5 border-t border-rule pt-4 text-[15px] text-muted">
            Runs for {mandate.expiresInDays} days. The agent trades inside this and nothing else.
          </p>

          <div className="mt-1">
            <Act primary disabled={!connected || !funded} onClick={onSign}>
              {copy.onboarding.action}
            </Act>
          </div>
          <Note className="mt-2">
            {!connected
              ? copy.wallet.agentLocked
              : !funded
                ? copy.onboarding.noInventory
                : copy.onboarding.underAction}
          </Note>
        </CardBody>
      </Card>

      <Todo>
        skeleton: injected wallets only, and no device is enumerated yet. WebHID enumeration has to
        run before the ceremony is offered so the device-absent state is known up front — never a
        form the owner completes and then fails at the end.
      </Todo>
    </>
  );
}
