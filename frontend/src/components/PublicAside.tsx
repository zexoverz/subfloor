import { useEffect, useState } from 'react';
import { ExternalLink, Info, Loader2, Usb, Wallet as WalletIcon } from 'lucide-react';
import { isAddress } from 'viem';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { FloorControl } from './FloorControl.tsx';
import { AddressField } from './StepForms.tsx';
import { Tooltip } from './Tooltip.tsx';
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
  ledger,
  walletAddress,
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
  /**
   * Passed in, never created here. `useLedger` keeps its paired session in a ref, so a second
   * instance is a second session — and it is always the empty one, which is how a device paired on
   * one panel came back unpaired on another.
   */
  ledger: import('../lib/ledger.ts').Ledger;
  /** What answering "no" fills the guardian field with. */
  walletAddress: `0x${string}` | null;
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
  /**
   * Whether the owner has a device at all. Null until asked, and asked before the field.
   *
   * Not a preference: it decides what goes in the write-once registry slot. Null keeps the field
   * off the card entirely, because an empty box for the guardian is a box whose only wrong answer
   * is silent.
   */
  const [hasDevice, setHasDevice] = useState<boolean | null>(null);

  /*
   * Derived, not copied on the click.
   *
   * Filling the field inside the button's handler read `walletAddress` at the instant of the press
   * and never again — so a press that happened before the connection had reported its address left
   * the field empty and the owner staring at a box the answer was supposed to have filled. This
   * follows the connection instead, which is what "use this wallet" means.
   */
  useEffect(() => {
    if (hasDevice === false) setDevice(walletAddress ?? '');
  }, [hasDevice, walletAddress]);
  // Empty is allowed and is a decision; wrong is not.
  const usable = (v: string) => v === '' || isAddress(v);
  /*
   * The question has to be answered, even though an empty guardian is a legal vault. Deploying
   * without answering is not the same decision as deploying having decided — and the registry slot
   * is write-once, so "I did not see the field" is a permanent answer.
   */
  const setupReady = hasDevice !== null && usable(agent) && usable(device);

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
              <p className="serif m-0 mb-3 text-[13.5px] leading-relaxed text-muted">{copy.landing.publicOwnBody}</p>
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
              {/* The label travels with the error now, because which read failed is half the answer. */}
              <span className="text-faint">{vaultError}</span>
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
              <p className="serif m-0 text-[13.5px] leading-relaxed text-muted">{copy.wallet.notOwner}</p>
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
                  {/*
                   * The same control the owner uses to change a floor later, not a second way of
                   * asking the same question. It leads with the price, which is what a non-quant
                   * decides — "never below 2,445", never "100 bps" — and it counts the realized
                   * fills a number this tight would have refused, which a stepper cannot do.
                   */}
                  <FloorControl
                    bps={bps}
                    referencePrice={state.reference.price}
                    feed={state.reference.feed ?? null}
                    base={state.pair.base}
                    quote={state.pair.quote}
                    fillsBps={state.calibration.fillsBps}
                    onChange={setBps}
                  />

                  <div className="mb-4 flex flex-col gap-3">
                    {/*
                     * Asked before the field, because the field cannot be answered without it.
                     *
                     * The guardian is the key that may weaken the floor, and the registry takes it
                     * write-once. An owner with no hardware was being shown an empty box and left
                     * to work out that their own wallet goes in it — and that putting it there
                     * collapses the split this whole design is about. So the choice is the
                     * question, and the consequence of the wrong answer is printed beside it
                     * rather than discovered afterwards.
                     */}
                    <div>
                      {/* The why is one hover away, as it is on every other field on this card. */}
                      <label className="flex items-center gap-1.5 text-[11.5px] tracking-[0.09em] text-muted uppercase">
                        {copy.wallet.deviceAsk}
                        <Tooltip text={copy.wallet.deviceWhy}>
                          <Info size={11} strokeWidth={1.8} />
                        </Tooltip>
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {/*
                         * Two answers, coloured by what they cost rather than by which is the
                         * default. The device keeps the split and wears the floor's own brass; the
                         * wallet collapses it and wears the colour this board uses for a refusal,
                         * which is the only honest place to spend it here.
                         */}
                        {(
                          [
                            [true, copy.wallet.deviceYes, Usb, 'floor'],
                            [false, copy.wallet.deviceNo, WalletIcon, 'refuse'],
                          ] as const
                        ).map(([answer, label, Mark, tone]) => (
                          <button
                            key={label}
                            onClick={() => setHasDevice(answer)}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12px] transition-colors ${
                              hasDevice === answer
                                ? tone === 'floor'
                                  ? 'border-floor/60 bg-floor-wash text-ink'
                                  : 'border-refuse/55 bg-refuse-wash text-ink'
                                : 'border-rule bg-sunken text-muted hover:text-ink'
                            }`}
                          >
                            <Mark
                              size={14}
                              strokeWidth={1.8}
                              className={`shrink-0 ${tone === 'floor' ? 'text-floor' : 'text-refuse'}`}
                            />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/*
                     * Read off the device, not typed off it.
                     *
                     * This is the field that decides which key may ever weaken the floor, and the
                     * registry takes it write-once — a transposed character here is a vault whose
                     * guardian is an address nobody holds, and nothing on chain can undo that. The
                     * setup sheet has had this button for a while; the card that deploys the vault
                     * in the first place, which is the one moment the mistake is unrecoverable,
                     * did not.
                     */}
                    {hasDevice !== null && (
                      <div>
                        <AddressField
                          label={copy.wallet.deployDeviceLabel}
                          hint={copy.wallet.deployDeviceHint}
                          value={device}
                          onChange={setDevice}
                          readOnly={!hasDevice}
                          {...(hasDevice
                            ? {
                                action: {
                                  label: ledger.connecting ? copy.wallet.readingDevice : copy.wallet.useDevice,
                                  busy: ledger.connecting,
                                  onClick: () => {
                                    void (async () => {
                                      // `connect()` returns what it read: `ledger.address` here is
                                      // a render behind, so reading it would fill the field from
                                      // the device before this one.
                                      const found = ledger.address ?? (await ledger.connect());
                                      if (found) setDevice(found);
                                    })();
                                  },
                                  disabled: ledger.connecting || !ledger.supported,
                                },
                              }
                            : {})}
                        />
                        {/* The cost of the answer, next to the answer. */}
                        {!hasDevice && (
                          <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[11.5px] text-refuse">
                            {copy.wallet.deviceSameKeyShort}
                            <Tooltip text={copy.wallet.deviceSameKey}>
                              <Info size={11} strokeWidth={1.8} />
                            </Tooltip>
                          </p>
                        )}
                      </div>
                    )}
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
