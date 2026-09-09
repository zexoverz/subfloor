import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { isAddress } from 'viem';
import { copy } from '../copy.ts';
import { Act, Stepper } from './Button.tsx';
import { AddressField } from './StepForms.tsx';
import type { InitialSetup } from '../lib/vault.ts';
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
  connecting,
  creatingStep,
  onConnect,
  onCreateVault,
  creatingVault,
  canCreateVault,
  checked,
  vaultError,
}: {
  state: VaultState;
  /** A connected wallet that is not the owner is a different message, not the same button again. */
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
  onCreateVault: (setup: InitialSetup) => void;
  creatingVault: boolean;
  /** What the deploy is doing. One call sets six things and it is slower than it looks. */
  creatingStep: string | null;
  /** Only true once the factory has confirmed this wallet owns none — never guessed from silence. */
  canCreateVault: boolean;
  /** Whether the factory has answered at all. Until it has, the card claims nothing either way. */
  checked: boolean;
  /** Why we could not tell. Shown, so a card that cannot answer does not look like one still trying. */
  vaultError: string | null;
}) {
  /*
   * Collected before the vault exists, because that is the only moment the factory can set them.
   * It owns the vault for the length of the call and hands it over before returning; afterwards
   * each of these is a separate transaction the owner signs, and one of them — the registry-side
   * guardian — fails silently when it is skipped.
   */
  const [bps, setBps] = useState(state.calibration.houseDefaultBps);
  const [agent, setAgent] = useState('');
  const [device, setDevice] = useState('');
  // Empty is allowed and is a decision; wrong is not.
  const usable = (v: string) => v === '' || isAddress(v);
  const setupReady = usable(agent) && usable(device);

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
                    className="flex items-center gap-1 hover:text-floor"
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
          {!connected ? (
            /*
             * The same shape as the branch after it: a sentence, then the button, then the mascot
             * beside it. A card that is only a button reads as a fragment of a card, and this one
             * had the sentence written already — `publicOwnBody` existed and was never rendered.
             *
             * Connects, exactly like the control in the header. It used to navigate to first run,
             * which then bounced anyone whose vault was already set up.
             */
            <>
              <p className="serif m-0 mb-3 text-[13.5px] leading-relaxed text-muted">
                {copy.landing.publicOwnBody}
              </p>
              <div className="flex items-end gap-1">
                <Act primary onClick={onConnect} busy={connecting} busyLabel={copy.wallet.connecting}>
                  {copy.wallet.connect}
                </Act>
                <img
                  src="/mascot-setup.webp"
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="tile-art pointer-events-none -mr-1 -mb-1 ml-auto w-[92px] shrink-0 select-none max-[420px]:hidden"
                />
              </div>
            </>
          ) : vaultError ? (
            /* Ours to explain, not theirs to interpret: we could not look, so we say nothing about
               what we would have found. */
            <p className="m-0 text-[12.5px] leading-relaxed text-refuse">
              {copy.wallet.vaultReadFailed} <span className="text-faint">{vaultError}</span>
            </p>
          ) : !checked ? (
            /*
             * Still asking. Saying "this wallet does not own the vault" here would be a claim about
             * an answer nobody has yet — and it sat directly above a line admitting we were still
             * checking, which is the contradiction that made it obvious.
             */
            <p className="m-0 flex items-center gap-2 text-[12.5px] text-faint">
              <Loader2 size={13} strokeWidth={1.8} className="animate-spin" />
              {copy.wallet.checkingVault}
            </p>
          ) : (
            /*
             * Connects, exactly like the control in the header. It used to navigate to first run,
             * which then bounced anyone whose vault was already set up.
             */
            <>
              <p className="serif m-0 text-[13.5px] leading-relaxed text-muted">
                {copy.wallet.notOwner} {copy.wallet.notOwnerHint}
              </p>
              {canCreateVault && (
                <>
                  <p className="serif mt-3 mb-3 text-[13.5px] leading-relaxed text-muted">
                    {copy.wallet.createVaultHint}
                  </p>
                  {/*
                   * The same drawing as the owner's setup card, because it is the same moment seen
                   * from the other side: the one thing on this card still to be done. Beside the
                   * button rather than beside the paragraphs — this card is mostly prose, and a
                   * drawing next to that would take the width the sentences need.
                   */}
                  <div className="mb-4 flex flex-col gap-3">
                    <label className="flex items-center justify-between gap-3 text-[12px] text-muted">
                      <span>
                        {copy.wallet.deployFloor}
                        <span className="block text-[11px] text-faint">{copy.wallet.deployFloorHint}</span>
                      </span>
                      <Stepper
                        value={bps}
                        onChange={setBps}
                        step={25}
                        min={25}
                        max={400}
                        format={(n) => `${n} bps`}
                      />
                    </label>

                    <AddressField
                      label={copy.wallet.deployDeviceLabel}
                      hint={copy.wallet.deployDeviceHint}
                      value={device}
                      onChange={setDevice}
                    />
                    <AddressField
                      label={copy.wallet.deployAgentLabel}
                      hint={copy.wallet.deployAgentHint}
                      value={agent}
                      onChange={setAgent}
                      icon="wallet"
                    />
                  </div>

                  <div className="flex items-end gap-1">
                    <Act
                      primary
                      onClick={() =>
                        onCreateVault({
                          delegate: agent as InitialSetup['delegate'],
                          guardian: device as InitialSetup['guardian'],
                          maxAdverseBps: bps,
                        })
                      }
                      disabled={!setupReady}
                      busy={creatingVault}
                      busyLabel={creatingStep ?? copy.wallet.creatingVault}
                    >
                      {copy.wallet.createVault}
                    </Act>
                    <img
                      src="/mascot-setup.webp"
                      alt=""
                      aria-hidden
                      draggable={false}
                      className="tile-art pointer-events-none -mr-1 -mb-1 ml-auto w-[92px] shrink-0 select-none max-[420px]:hidden"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
