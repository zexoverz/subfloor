import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { isAddress } from 'viem';
import { Check, ChevronDown, KeyRound, Wallet as WalletIcon, X } from 'lucide-react';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { AddressField, AmountRow } from './StepForms.tsx';
import { FloorControl } from './FloorControl.tsx';
import type { CeremonyState } from '../lib/ceremony.ts';
import { useFund } from '../lib/fund.ts';
import { useFloor } from '../lib/floor.ts';
import { useKeys } from '../lib/keys.ts';
import { DeviceSign } from './DeviceSign.tsx';
import { floorPriceFromBps, formatPrice } from '../lib/rate.ts';
import { buildMandate } from '../lib/mandate.ts';
import { saveMandate } from '../lib/mandateStore.ts';
import { Toasts } from './Toasts.tsx';
import { ACTIVE_TOKENS } from '../lib/tokens.ts';
import { useLedger } from '../lib/ledger.ts';
import { withTransition } from '../lib/transition.ts';
// Lazy, like every other heavy thing here: a WebGL library is not something a visitor who never
// opens this sheet should have paid to download.
const Orb = lazy(() => import('./Orb.tsx').then((m) => ({ default: m.Orb })));
import type { Wallet } from '../lib/wallet.ts';
import type { Screen, VaultState } from '../types.ts';

/**
 * Setting the vault up, in a sheet over the board.
 *
 * §10 wants the owner of an unconfigured vault to meet the ceremony rather than a board of zeros,
 * and this still opens on its own the first time. What it no longer does is trap them there: "not
 * now" closes it, the board is behind it, and a card in the owner's column brings it back. An
 * owner who wants to look before signing is not a case worth blocking.
 */
export function SetupDialog({
  state,
  wallet,
  vault,
  focusKeys,
  ceremony,
  open,
  onClose,
  onNavigate,
}: {
  state: VaultState;
  wallet: Wallet;
  /** The vault being set up — theirs if they deployed one, ours otherwise. */
  vault: `0x${string}` | null;
  /*
   * Open the keys section regardless of whether it is finished.
   *
   * The disclosure collapses once both addresses are set, which is right for someone completing
   * setup and wrong for someone who came here to change one: the fields were hidden while the
   * buttons that act on them stayed visible, so the sheet offered an action over an input nobody
   * could reach.
   */
  focusKeys?: boolean;
  /*
   * Passed in rather than read again here. A second useCeremony was a second copy of the same
   * chain state, and refreshing one left the other showing what was true before the transaction —
   * which is why funding the vault only appeared after a full reload.
   */
  ceremony: CeremonyState;
  open: boolean;
  onClose: () => void;
  onNavigate: (s: Screen) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { pair, floor, mandate, reference } = state;
  const connected = Boolean(wallet.address);
  const holdings = wallet.holdings ?? state.inventory;
  const fund = useFund(vault, wallet.address);
  const floorWrite = useFloor(vault);
  const keys = useKeys(vault, ceremony.refresh);
  /*
   * Signing happens here rather than on its own route. §10 puts setup on one screen ending in one
   * signature, and navigating away took the sheet — and the thing being authorised — off screen at
   * the exact moment the owner is meant to be comparing it against the device.
   */
  const [signing, setSigning] = useState(false);
  const ledger = useLedger();

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  /*
   * An unregistered pair returns 0 bps, which is not a floor of zero distance — it is no floor.
   * Opening the slider there proposes "settle at any price", and the reader has no way to know the
   * number came from an absence rather than from a choice.
   */
  const [floorBps, setFloorBps] = useState(
    floor.enforced && floor.maxAdverseBps > 0 ? floor.maxAdverseBps : state.calibration.houseDefaultBps,
  );
  const [guardian, setGuardian] = useState('');
  const [delegate, setDelegate] = useState('');

  /*
   * Seed the fields from the chain once it answers.
   *
   * These were form state and nothing else, so a reload showed two empty boxes over a vault that
   * already had both addresses set — and the section went on calling itself required. Only fills a
   * field that is still empty, so it never overwrites something being typed.
   */
  useEffect(() => {
    if (ceremony.guardian) setGuardian((current) => current || ceremony.guardian!);
    if (ceremony.delegate) setDelegate((current) => current || ceremony.delegate!);
  }, [ceremony.guardian, ceremony.delegate]);

  /*
   * Funded means the vault holds something, read from the vault's own balance by the ceremony —
   * not that a number has been typed into a field. Typing is a proposal; the mandate is about
   * inventory that exists. The typed version was wrong in both directions: it let the sheet look
   * ready before anything had moved, and it went back to "not funded" the moment the amounts were
   * cleared after a successful send.
   */
  const funded = ceremony.steps.some((step) => step.id === 'fund' && step.done);
  /** What the send button needs, which is a different question: is there an amount to send. */
  const hasAmount = holdings.some((h) => Number(amounts[h.symbol]) > 0);
  // WETH is the one that needs a wrap, and only when the wallet is short of what was typed.
  const wrapping = Number(amounts.WETH ?? 0) > (holdings.find((h) => h.symbol === 'WETH')?.amount ?? 0);
  /*
   * Registered on chain counts, whatever the boxes say. Reading only the inputs meant a vault with
   * both keys set still reported the section as unfinished.
   */
  const guardianDone = Boolean(ceremony.steps.find((x) => x.id === 'guardian')?.done);
  const delegateDone = Boolean(ceremony.delegate);
  const keysReady = (guardianDone || isAddress(guardian)) && (delegateDone || isAddress(delegate));
  const blocked = !ceremony.deployed
    ? copy.wallet.notDeployed
    : ceremony.isOwner === false
      ? copy.wallet.notOwner
      : null;
  const ready = connected && !blocked && funded && keysReady;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      /*
        * A fixed height, not a maximum. Expanding the keys used to grow the sheet under the
        * cursor: the panel beside it jumped, the buttons moved, and the whole thing resized around
        * a disclosure. The frame holds and the form column scrolls inside it instead.
        */
      className="sheet h-[min(720px,88vh)] w-[min(960px,calc(100vw-48px))] overflow-hidden"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="flex items-baseline justify-between border-b border-rule bg-sunken px-5 py-3">
        <h2 className="m-0 text-[10.5px] tracking-[0.11em] text-faint uppercase">{copy.onboarding.finishSetup}</h2>
        <button
          onClick={onClose}
          aria-label="close"
          className="-mr-1 cursor-pointer p-1 text-faint transition-colors hover:text-ink"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>

      {/*
        * Two columns on a wide screen: the orb holds the eye while the form is read, and it is
        * hidden below the width where it would push the form off the screen. It carries nothing —
        * every number in here is in the column on the right.
        */}
      {/*
        * The orb sits in its own darker panel with a fixed width, so it cannot take space from the
        * form. The column widths are not a ratio for the same reason: at a ratio the form squeezed
        * and every label wrapped, which is a worse outcome than no orb at all.
        */}
      <div className="grid h-[calc(100%-49px)] md:grid-cols-[320px_minmax(380px,1fr)]">
        <div className="hidden border-r border-rule bg-sunken md:block">
          <div className="flex h-full flex-col gap-6 overflow-hidden p-6">
            {/*
              * The word, not the mark. At this size inside a ring that big the two shapes lose
              * their relationship and read as a scribble; the name survives being small and says
              * the same thing.
              */}
            <div className="relative aspect-square w-full">
              <Suspense fallback={null}>{open && <Orb />}</Suspense>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="text-[13px] font-semibold tracking-[0.3em] text-ink/85">{copy.brand}</span>
              </div>
            </div>

            {/*
              * The sequence belongs beside the form rather than under the button. It answers "what
              * am I about to do" while the form is being filled in, which is when that question is
              * asked — under the action it was answering a question already committed to.
              */}
            <ol className="m-0 grid list-none gap-1.5 p-0 text-[11px] text-faint">
              <li className="mb-0.5 tracking-[0.08em] uppercase">{copy.onboarding.doing}</li>
              {ceremony.steps.map((step) => (
                <li key={step.id} className={`flex items-center gap-2 ${step.done ? 'text-settle' : ''}`}>
                  {step.done ? <Check size={11} strokeWidth={2.4} /> : <span className="w-[11px]">·</span>}
                  {step.title}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="no-bar overflow-y-auto p-5">
          {!connected ? (
            <>
              <h1 className="m-0 text-center text-[17px] font-semibold">{copy.wallet.step1}</h1>
              <p className="serif mx-auto mt-2 mb-6 max-w-[32ch] text-center text-[13.5px] leading-relaxed text-muted">
                {copy.wallet.why}
              </p>
              <Act wide primary onClick={() => withTransition(wallet.connect)} disabled={wallet.connecting}>
                <span className="flex items-center justify-center gap-2">
                  <WalletIcon size={14} strokeWidth={1.7} />
                  {wallet.connecting ? copy.wallet.connecting : copy.wallet.connect}
                </span>
              </Act>
              {wallet.error && <p className="mt-3 text-center text-[11.5px] text-refuse">{wallet.error}</p>}

              <div className="my-4 flex items-center gap-3 text-[10.5px] tracking-[0.12em] text-faint uppercase">
                <span className="h-px flex-1 bg-rule" />
                {copy.wallet.or}
                <span className="h-px flex-1 bg-rule" />
              </div>

              <Act wide onClick={ledger.connect} disabled={ledger.connecting || !ledger.supported}>
                <span className="flex items-center justify-center gap-2">
                  <KeyRound size={14} strokeWidth={1.7} className="text-floor" />
                  {copy.wallet.connectLedger}
                </span>
              </Act>
              <p className="serif mx-auto mt-2 max-w-[34ch] text-center text-[12.5px] leading-relaxed text-faint">
                {ledger.error ?? (ledger.supported ? copy.wallet.ledgerWhy : copy.wallet.ledgerUnsupported)}
              </p>
            </>
          ) : signing ? (
            <DeviceSign
              rows={[
                ['Action', 'Authorise agent'],
                ['Delegate', delegate || mandate.delegateLabel],
                ['Tokens', state.inventory.map((h) => h.symbol).join(' / ')],
                ['Expires', `${mandate.expiresInDays} days`],
              ]}
              purpose="mandate"
              ledger={ledger}
              typedData={buildMandate({
                vault,
                delegate,
                inventory: state.inventory,
                nonce: ceremony.nonce ?? 0n,
                expiresInDays: mandate.expiresInDays,
              })}
              payloadLine="Mandate(delegate, app, tokens, maxAmounts, nonce, expiry)"
              standing={formatPrice(floorPriceFromBps(reference.price, floor.maxAdverseBps))}
              onSigned={(signature) => {
                if (!vault) return;
                saveMandate({
                  vault,
                  delegate: (ceremony.delegate ?? delegate) as `0x${string}`,
                  nonce: String(ceremony.nonce ?? 0n),
                  signature,
                  at: Date.now(),
                });
                // Tick the step now rather than when the owner presses continue: the thing the
                // step checks has already happened, and a list that lags the fact it reads is the
                // same complaint as a list that never updates.
                ceremony.refresh();
              }}
              onDone={() => {
                setSigning(false);
                ceremony.refresh();
                onClose();
              }}
              onBack={() => setSigning(false)}
            />
          ) : blocked ? (
            <div className="text-center">
              <p className="serif m-0 text-[14px] leading-relaxed text-muted">{blocked}</p>
              {ceremony.isOwner === false && (
                <>
                  <p className="serif mx-auto mt-2 mb-5 max-w-[32ch] text-[13px] leading-relaxed text-faint">
                    {copy.wallet.notOwnerHint}
                  </p>
                  <Act primary onClick={() => onNavigate('live')}>
                    {copy.wallet.notOwnerAction}
                  </Act>
                </>
              )}
            </div>
          ) : (
            <>
              {/* No address row here: the header already shows which wallet this is and offers
                  the only disconnect the app needs. Two of each invites the reader to wonder
                  whether they do different things. */}
              <span className="text-[10.5px] font-semibold tracking-[0.11em] text-faint uppercase">
                {copy.onboarding.inventory}
              </span>
              <div className="mt-2 mb-7">
                {holdings.map((h) => (
                  <AmountRow
                    key={h.symbol}
                    holding={h}
                    value={amounts[h.symbol] ?? ''}
                    onChange={(v) => setAmounts((a) => ({ ...a, [h.symbol]: v }))}
                  />
                ))}
                {wrapping && <p className="mt-2 mb-2 text-[11px] text-faint">{copy.wallet.wrapNote}</p>}
                <div className="mt-3" />
                <Act
                  primary
                  wide
                  onClick={() =>
                    void fund.send(
                      ACTIVE_TOKENS.map((t) => ({ ...t, amount: amounts[t.symbol] ?? '0' })),
                    )
                  }
                  disabled={!hasAmount || fund.sending || !vault}
                >
                  {/* Say why it cannot be pressed, rather than looking broken. */}
                  {fund.step ?? (hasAmount ? copy.wallet.sendToVault : copy.wallet.sendNeedsAmount)}
                </Act>
              </div>

              {/*
                * Before the registry has an entry, this figure is a proposal, and the heading says
                * so. Rendering it under "your worst price" made the fixture default look like a
                * setting the owner had already made — the same class of mistake as a fixture
                * labelled live, on the screen where the number is chosen.
                */}
              <span className="block border-t border-rule pt-5 text-[10.5px] font-semibold tracking-[0.11em] text-faint uppercase">
                {floor.enforced ? copy.onboarding.worstPrice : copy.onboarding.proposedPrice}
              </span>
              {/* Shown, not hidden behind a toggle: this is the decision the sheet exists for. */}
              <FloorControl
                bps={floorBps}
                referencePrice={reference.price}
                base={pair.base}
                quote={pair.quote}
                fillsBps={state.calibration.fillsBps}
                onChange={setFloorBps}
              />
              {!floor.enforced && (
                <p className="-mt-3 mb-5 text-[11px] text-faint">{copy.onboarding.proposedNote}</p>
              )}
              {/*
                * The sheet's whole subject, and until now the one thing it could not do: the number
                * was collected and never written, so an owner left this screen believing a floor
                * was set while the registry held none.
                */}
              <div className="mb-6">
                <Act
                  primary
                  wide
                  disabled={floorWrite.sending || !vault}
                  onClick={() => void floorWrite.raise(floorBps).then(() => ceremony.refresh())}
                >
                  {floorWrite.step ? `registering — ${floorWrite.step}` : copy.wallet.setFloor}
                </Act>
                <p className="mt-2 mb-0 text-[11px] leading-relaxed text-faint">
                  {floor.enforced ? copy.wallet.floorAlreadySet : copy.wallet.setFloorHint}
                </p>
              </div>

              {/* The one exception to hiding machinery, and the ticket that made it one. */}
              {/*
                * Filled in, it collapses to one line. The addresses are set once and never looked
                * at again, and leaving two fields and two explanations open afterwards is most of
                * this sheet's height spent on a decision already made.
                */}
              <details open={!keysReady || focusKeys} className="group mt-2 mb-6 border-t border-rule pt-5">
                {/*
                  * Not an aside. The signature cannot be produced without both addresses, so an
                  * incomplete section says "required" and a filled one collapses to a tick — the
                  * disclosure is a place to put a finished decision, never a way past an unmade one.
                  */}
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[10.5px] font-semibold tracking-[0.11em] uppercase">
                  <span className={keysReady ? 'flex items-center gap-2 text-settle' : 'flex items-center gap-2 text-ink'}>
                    {keysReady && <Check size={11} strokeWidth={2.4} />}
                    {keysReady ? copy.onboarding.keysDone : copy.onboarding.advanced}
                    {!keysReady && (
                      <span className="rounded-lg border border-floor/40 bg-floor-wash px-1.5 py-px text-[9px] tracking-[0.1em] text-floor">
                        {copy.onboarding.required}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    size={14}
                    strokeWidth={1.8}
                    className="shrink-0 text-faint transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="serif mt-2 mb-3 text-[12.5px] leading-relaxed text-muted">
                  {copy.onboarding.advancedNote}
                </p>
                <div className="grid gap-3">
                  <AddressField
                    label={copy.wallet.guardianLabel}
                    hint={copy.wallet.guardianHint}
                    value={guardian}
                    onChange={setGuardian}
                    action={{
                      label: ledger.connecting ? copy.wallet.readingDevice : copy.wallet.useDevice,
                      /*
                       * Was a no-op: the button existed, reported nothing, and left the owner to
                       * type an address they were being told to read off the device.
                       */
                      onClick: () => {
                        void (async () => {
                          const found = ledger.address ?? (await ledger.connect());
                          if (found) setGuardian(found);
                        })();
                      },
                      disabled: ledger.connecting || !ledger.supported,
                    }}
                  />
                  <AddressField
                    icon="wallet"
                    label={copy.wallet.delegateLabel}
                    hint={copy.wallet.delegateHint}
                    value={delegate}
                    onChange={setDelegate}
                  />
                </div>
              </details>

              {/*
                * The addresses were collected and never written — the same gap the floor had. Two
                * separate actions rather than one: the guardian's registry entry cannot be undone
                * and the delegate can be changed at will, and one button would hide that
                * difference behind a single press.
                */}
              <div className="mb-6 flex flex-col gap-3">
                <div>
                  <Act
                    wide
                    disabled={!isAddress(guardian) || keys.sending || guardianDone}
                    onClick={() => void keys.setGuardian(guardian as `0x${string}`)}
                  >
                    {keys.step ?? copy.wallet.registerDevice}
                  </Act>
                  <p className="mt-2 mb-0 text-[11px] leading-relaxed text-faint">
                    {guardianDone ? copy.wallet.deviceRegistered : copy.wallet.registerDeviceHint}
                  </p>
                </div>
                <div>
                  <Act
                    wide
                    disabled={!isAddress(delegate) || keys.sending}
                    onClick={() => void keys.setDelegate(delegate as `0x${string}`)}
                  >
                    {copy.wallet.nameAgent}
                  </Act>
                  <p className="mt-2 mb-0 text-[11px] leading-relaxed text-faint">
                    {delegateDone ? copy.wallet.agentNamed : copy.wallet.nameAgentHint}
                  </p>
                </div>
              </div>


              <p className="serif mb-4 border-t border-rule pt-5 text-[14px] text-muted">
                {copy.onboarding.runsFor.replace('{days}', String(mandate.expiresInDays))}
              </p>

              <Act wide primary disabled={!ready} onClick={() => setSigning(true)}>
                {copy.onboarding.action}
              </Act>
              <p className="mt-2 text-center text-[11.5px] text-faint">
                {!funded ? copy.onboarding.noInventory : copy.onboarding.underAction}
              </p>

            </>
          )}
        </div>
      </div>
      {/* Inside the sheet, because a modal dialog is in the top layer and a toast painted
          outside it cannot rise above it however high its z-index goes. */}
      <Toasts />
    </dialog>
  );
}
