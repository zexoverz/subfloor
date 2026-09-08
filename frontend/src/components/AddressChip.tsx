import { identicon } from '../lib/identicon.ts';
import { addressUrl } from '../lib/chain.ts';

/**
 * An address, as something a reader can recognise and open.
 *
 * The identicon is the point: forty hex characters are unreadable and unmemorable, but the same
 * counterparty repeated down a tape is obvious the moment it has a shape. Truncated text alone
 * makes two different addresses starting `0x02` look identical at a glance.
 */
export function AddressChip({ address, size = 16 }: { address: string; size?: number }) {
  return (
    <a
      href={addressUrl(address)}
      target="_blank"
      rel="noreferrer"
      // The row beneath opens a detail panel; this must not do both.
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 font-mono text-[12px] font-medium text-muted transition-colors hover:text-floor"
      title={address}
    >
      <img
        src={identicon(address)}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full"
        style={{ width: size, height: size }}
      />
      {address.slice(0, 6)}…{address.slice(-4)}
    </a>
  );
}
