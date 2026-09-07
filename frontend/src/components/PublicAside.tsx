import { ExternalLink } from 'lucide-react';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { Card, CardHead } from './Card.tsx';
import { RollingNumber } from './RollingNumber.tsx';
import { addresses } from '../lib/contracts.ts';
import { addressUrl } from '../lib/chain.ts';
import type { VaultState } from '../types.ts';

/**
 * What sits where the owner's inventory would be, when the reader is not the owner.
 *
 * The rule this enforces is structural rather than remembered: a stranger cannot be shown holdings,
 * a floor keyed to a recipient, or anything mapping an address to a position size, because on that
 * branch those components are not rendered at all.
 */
export function PublicAside({
  state,
  connected,
  onConnect,
  onCreateVault,
  creatingVault,
  canCreateVault,
  vaultError,
}: {
  state: VaultState;
  /** A connected wallet that is not the owner is a different message, not the same button again. */
  connected: boolean;
  onConnect: () => void;
  onCreateVault: () => void;
  creatingVault: boolean;
  /** Only true once the factory has confirmed this wallet owns none — never guessed from silence. */
  canCreateVault: boolean;
  /** Why we could not tell. Shown, so a card that cannot answer does not look like one still trying. */
  vaultError: string | null;
}) {
  return (
    <div className="flex flex-col gap-4.5">
      <Card>
        <CardHead left={copy.publicPage.programsExecuted} right="counted by CI" />
        <div className="p-5">
          <div className="text-[34px] leading-none font-semibold tracking-tight">
            <RollingNumber value={state.fuzz.programs} />
          </div>
          <p className="mt-2 text-[11.5px] text-faint">
            <b className="font-semibold text-settle">{state.fuzz.settledBelowFloor}</b>{' '}
            {copy.publicPage.settledBelowFloor}
          </p>
        </div>
      </Card>

      {addresses.registry && (
        <Card>
          <CardHead left="Contracts" right="Base Sepolia" />
          <ul className="m-0 list-none p-4 text-[11.5px]">
            {(
              [
                ['FloorRegistry', addresses.registry],
                ['FloorRouter', addresses.router],
                ['AquaGuardVault', addresses.vault],
                ['Aqua', addresses.aqua],
              ] as const
            ).map(([name, address]) =>
              address ? (
                <li key={name} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-faint">{name}</span>
                  <a
                    href={addressUrl(address)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-brass"
                  >
                    {address.slice(0, 6)}…{address.slice(-4)}
                    <ExternalLink size={10} strokeWidth={1.7} className="text-faint" />
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        </Card>
      )}

      <Card>
        <CardHead left={copy.landing.publicOwnTitle} />
        <div className="p-4">
          {connected ? (
            /*
             * Already connected, and this vault is someone else's. Offering the same connect
             * button again asks them to fix something that is not broken — but since #132 there
             * is somewhere for them to go, so the dead end became an action.
             */
            <>
              <p className="serif m-0 text-[13.5px] leading-relaxed text-muted">
                {copy.wallet.notOwner} {copy.wallet.notOwnerHint}
              </p>
              {canCreateVault ? (
                <>
                  <p className="serif mt-3 mb-3 text-[13.5px] leading-relaxed text-muted">
                    {copy.wallet.createVaultHint}
                  </p>
                  <Act primary onClick={onCreateVault} disabled={creatingVault}>
                    {creatingVault ? copy.wallet.creatingVault : copy.wallet.createVault}
                  </Act>
                </>
              ) : vaultError ? (
                <p className="mt-3 mb-0 text-[11.5px] leading-relaxed text-settle">
                  {copy.wallet.vaultReadFailed} <span className="text-faint">{vaultError}</span>
                </p>
              ) : (
                <p className="mt-3 mb-0 text-[11.5px] text-faint">{copy.wallet.checkingVault}</p>
              )}
            </>
          ) : (
            /*
             * Connects, exactly like the control in the header. It used to navigate to first run,
             * which then bounced anyone whose vault was already set up.
             */
            <Act primary onClick={onConnect}>
              {copy.wallet.connect}
            </Act>
          )}
        </div>
      </Card>
    </div>
  );
}
