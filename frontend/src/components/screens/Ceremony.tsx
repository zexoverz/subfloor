import { DeviceSign } from '../DeviceSign.tsx';
import { useLedger } from '../../lib/ledger.ts';
import type { Wallet } from '../../lib/wallet.ts';
import { Todo } from '../Card.tsx';
import { floorPriceFromBps, formatPrice } from '../../lib/rate.ts';
import type { VaultState } from '../../types.ts';

/**
 * The two hardware moments: signing the mandate, and loosening a floor. Designed around the device
 * being slow and physical — that slowness is the feature, and the screen's job is to make the wait
 * read as deliberation rather than latency. No spinner, no countdown, no timeout that cancels.
 *
 * Rejection is a success of the system and is styled neutrally, never as an error.
 */
export function Ceremony({
  state,
  wallet,
  draftBps,
  purpose,
  onDone,
  onBack,
}: {
  state: VaultState;
  /** Offered as the alternative key, for a vault whose guardian is a soft wallet. */
  wallet: Wallet;
  draftBps: number;
  /** Which of the two hardware moments this is. They sign different things and must say so. */
  purpose: 'mandate' | 'lower';
  onDone: () => void;
  onBack: () => void;
}) {
  // §10: the device-absent state is known before the ceremony is offered, never discovered by
  const { pair, reference, floor, mandate } = state;

  const ledger = useLedger();
  const bindsAt = floorPriceFromBps(reference.price, draftBps);
  const standing = formatPrice(floorPriceFromBps(reference.price, floor.maxAdverseBps));

  // What the device will render. In the shipped app both sides come from one ERC-7730 descriptor:
  // a screen that disagrees with the device is a stop-everything bug, and this correspondence is
  // the only reason clear-signing means anything at all.
  const rows: [string, string][] =
    purpose === 'lower'
      ? [
          ['Action', 'Lower price floor'],
          ['Pair', `${pair.base} / ${pair.quote}`],
          ['New floor', `−${draftBps} bps`],
          ['Binds at', `${formatPrice(bindsAt)} ${pair.quote}`],
          ['Delegate', mandate.delegateLabel],
        ]
      : [
          // The mandate is a different object entirely: it authorises an agent, it does not touch
          // the floor. Rendering the lowering payload here would teach the owner to approve the
          // wrong screen — on the one screen whose whole job is teaching them to compare.
          ['Action', 'Authorise agent'],
          ['Delegate', mandate.delegateLabel],
          ['Tokens', state.inventory.map((h) => h.symbol).join(' / ')],
          ['Expires', `${mandate.expiresInDays} days`],
        ];

  return (
    <>
      <DeviceSign
              expect={state.guardian ?? null}
        rows={rows}
        purpose={purpose}
        ledger={ledger}
        wallet={wallet}
        // The lowering payload is not built yet; the panel refuses to sign rather than send noise.
        typedData={null}
        standing={standing}
        scheduledAt={state.pendingLowering?.effectiveAt ?? null}
        onDone={onDone}
        onBack={onBack}
      />

      <Todo>
        skeleton: these rows are hand-written. They must be generated from the ERC-7730 descriptor
        the device renders (#36), or screen and device can drift — the one bug this screen exists to
        make impossible. A registry deployed with LOWERING_DELAY &gt; 0 ends here in the scheduled
        state, not in a new floor.
      </Todo>
    </>
  );
}
