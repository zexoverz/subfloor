import { useState } from 'react';
import { Usb, Wallet as WalletIcon } from 'lucide-react';
import { copy } from '../copy.ts';
import { Act, Back, Ghost } from './Button.tsx';
import { Card, CardBody, CardHead } from './Card.tsx';
import { DeviceReview } from './DeviceReview.tsx';
import { DeviceScreen } from './DeviceScreen.tsx';
import type { Ledger } from '../lib/ledger.ts';
import type { Wallet, WalletAccount } from '../lib/wallet.ts';
import { deviceSigner, walletSigner } from '../lib/signer.ts';
import { SigningKeys } from './SigningKeys.tsx';

export type SignPurpose = 'mandate' | 'lower';

type Stage = 'pre' | 'waiting' | 'signed' | 'declined' | 'absent' | 'scheduled';

/**
 * The device signature, wherever it is asked for.
 *
 * §10 puts the whole of setup on one screen ending in one signature, and sending the owner to a
 * separate route to sign broke that: the sheet they had been filling in vanished, and the thing
 * they were authorising was no longer on screen beside the device asking them to authorise it.
 * So this is a panel rather than a page, and the sheet hosts it in place.
 *
 * The rows are the payload as the device will render it. Screen and device disagreeing is the one
 * bug this component exists to make impossible, which is why both read from the same array.
 */
export function DeviceSign({
  rows,
  expect,
  purpose,
  standing,
  scheduledAt,
  typedData,
  ledger,
  wallet,
  onSigned,
  onDone,
  onBack,
}: {
  rows: [string, string][];
  /**
   * The device the registry has on file, when there is one.
   *
   * A mandate signed by the wrong Ledger is not refused here — it is a signature the vault will not
   * honour, discovered the first time the agent tries to ship. The moment to catch that is while
   * the device is still in the owner's hand.
   */
  expect?: `0x${string}` | null;
  purpose: SignPurpose;
  /**
   * The EIP-712 object the device is actually asked to sign.
   *
   * Separate from `rows`, which is what the screen shows, and that separation is the risk this
   * component exists to manage: the two must describe the same thing. Until a descriptor generates
   * both (#36) they are written together and reviewed together.
   *
   * Null when the payload cannot be built yet — an unset delegate, an unread nonce — in which case
   * there is nothing to ask the device and the panel says so rather than sending it noise.
   */
  typedData: object | null;
  /** The floor that still holds if this is declined — the reassurance a decline needs. */
  standing: string;
  /** Set when the registry delays lowerings, in which case signing schedules rather than applies. */
  scheduledAt?: number | null;
  /*
   * Passed in, never created here. useLedger keeps the paired session in a ref, so a second
   * instance is a second session — and it is always the empty one. The owner paired on the sheet
   * and this panel then asked a different, unpaired hook to sign, which returned null without ever
   * reaching the device: nothing appeared on the Ledger and the screen called it a decline.
   */
  ledger: Ledger;
  /**
   * The connected account, for a vault whose guardian is a soft wallet rather than a device.
   *
   * Offered, not defaulted. The design's whole claim is that the key which sets the worst price
   * lives somewhere the trading machine cannot reach, and a browser extension on the same machine
   * is a weaker arrangement — but it is the arrangement some owners actually registered, and a
   * ceremony that can only ask a Ledger cannot serve them at all.
   */
  wallet?: Wallet;
  /** Receives the signature, because producing one and dropping it is how the step never finished. */
  onSigned?: (signature: string) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  // Starts at 'pre' unless the browser cannot speak to a device at all, which is worth saying to
  // someone who has already completed a form.
  // 'absent' is about the device, and it is only a dead end when there is no other key either.
  const [stage, setStage] = useState<Stage>(ledger.presence === 'unsupported' && !wallet?.address ? 'absent' : 'pre');
  /** Which device is attached, once asked. Null is "not asked", never "the wrong one". */
  const [attached, setAttached] = useState<`0x${string}` | null>(null);
  const mismatch = expect && attached ? attached.toLowerCase() !== expect.toLowerCase() : false;
  /** The kit's own step name, so a wait says what it is waiting on. */
  const [step, setStep] = useState<string | null>(null);
  /**
   * Which thing is asked, decided from the registry rather than from a preference.
   *
   * If the guardian on file is the connected account, the device cannot produce a signature the
   * vault will honour and offering it first would send the owner to fetch hardware for nothing.
   * Everywhere else the device leads, which is what this is built to demonstrate.
   */
  const [via, setVia] = useState<'device' | 'wallet' | null>(null);
  /** Which address signs, once picked by hand. Null means "whatever the registry points at". */
  const [chosen, setChosen] = useState<WalletAccount | null>(null);
  /** The guardian on file, found among everything the browser has connected — not only the active one. */
  const guardianKey =
    (expect && wallet?.accounts.find((a) => a.address.toLowerCase() === expect.toLowerCase())) || null;
  const isWallet = via === 'wallet' || (via === null && Boolean(guardianKey));
  const signer = isWallet && wallet ? walletSigner(wallet, chosen ?? guardianKey) : deviceSigner(ledger);
  /** The other one, when the owner has one worth offering. */
  const other = wallet && (isWallet ? 'device' : 'wallet');
  /** Approved and applied, or approved and waiting out the registry's delay — both are a yes. */
  const answered = stage === 'signed' || stage === 'scheduled';

  return (
    <Card>
      <CardHead
        left={
          <>
            {/* Ahead of the card's own landmark icon, because it is navigation and the icon is a
                label — CardHead draws `icon` first, so the chevron has to come in through `left`. */}
            <Back onClick={onBack} />
            {isWallet ? (
              <WalletIcon size={13} strokeWidth={1.6} className="text-floor" />
            ) : (
              <Usb size={13} strokeWidth={1.6} className="text-floor" />
            )}
            {`${isWallet ? 'Wallet' : 'Ledger'} · ${purpose === 'lower' ? 'lower the floor' : 'authorise the agent'}`}
          </>
        }
        right={stage === 'waiting' ? 'waiting for device' : stage}
      />
      <CardBody>
        <div className="grid grid-cols-[minmax(0,290px)_1fr] items-start gap-5.5 max-[620px]:grid-cols-1">
          <DeviceReview />

          <div>
            {stage === 'absent' ? (
              <p className="serif mt-0 text-[14.5px] text-muted">{copy.ceremony.absent}</p>
            ) : (
              <>
                <p className="serif mt-0 text-[14.5px] leading-relaxed text-muted">
                  {isWallet
                    ? 'Your wallet spells the action out in words instead of raw calldata. The pair, the new floor and the price it binds at are readable in its own dialog before anything is signed.'
                    : 'The device spells the action out in words instead of raw calldata. Whoever presses Approve can read the pair, the new floor and the price it binds at, on the device screen itself.'}
                </p>

                {/*
                 * What the device will display, verbatim and in order, before it lights up — and
                 * then the answer it gave, in the same place. §10 makes this the point of the
                 * screen: the habit it teaches is "confirm only if it matches", and there is
                 * nothing to match against if the strings are not here.
                 */}
                <div className="my-3">
                  <DeviceScreen
                    rows={rows}
                    waiting={stage === 'waiting'}
                    answer={stage === 'declined' ? 'rejected' : answered ? 'approved' : null}
                    chrome={isWallet ? 'wallet' : 'ledger'}
                    device={{
                      paired: isWallet ? Boolean(signer.address) : ledger.presence === 'paired',
                      hint: isWallet
                        ? (signer.address ?? copy.ceremony.walletAbsent)
                        : ledger.presence === 'paired'
                          ? copy.ceremony.paired
                          : copy.ceremony.unknownDevice,
                    }}
                  />
                </div>

                {mismatch && (
                  <p className="mb-3 text-[11.5px] leading-relaxed text-refuse">
                    {copy.ceremony.wrongDevice}
                    <span className="t-num mt-1 block text-faint">
                      {copy.ceremony.attached} {attached}
                      <br />
                      {copy.ceremony.registered} {expect}
                    </span>
                  </p>
                )}

                {/*
                 * The one thing the screen cannot say. Approved and rejected are already drawn on it;
                 * a delayed lowering has a time attached, and that is new information rather than the
                 * same answer repeated in a second place.
                 */}
                {stage === 'scheduled' && (
                  <p className="serif mb-3 text-[14px] leading-relaxed text-muted">
                    {copy.ceremony.scheduled}{' '}
                    <b className="font-mono font-semibold text-floor tabular-nums">
                      {new Date((scheduledAt ?? 0) * 1000).toLocaleTimeString('en-US')}
                    </b>
                    . Until then the standing floor of{' '}
                    <b className="font-mono font-semibold text-ink tabular-nums">{standing}</b> is what settlement
                    uses.
                  </p>
                )}

                {/*
                 * Only where there is a choice to make. One account and a guardian that matches it is
                 * not a decision, and a picker over a list of one is a question with one answer.
                 */}
                {isWallet && wallet && (wallet.accounts.length > 1 || !guardianKey) && stage === 'pre' && (
                  <SigningKeys wallet={wallet} expect={expect} chosen={chosen ?? guardianKey} onChoose={setChosen} />
                )}

                {answered ? (
                  <Ghost onClick={onDone}>continue</Ghost>
                ) : (
                  /* Declining re-arms the same button rather than growing a "try again" beside it. */
                  <div className="flex items-center gap-2">
                    <Act
                      primary
                      busy={stage === 'waiting'}
                      busyLabel={
                        step
                          ? step.replace('signer.eth.steps.', '')
                          : isWallet
                            ? 'waiting for your wallet'
                            : 'awaiting approval on device'
                      }
                      disabled={!signer.ready}
                      onClick={async () => {
                        setStage('waiting');
                        // The real thing: the device renders the payload and answers. A decline and
                        // an unreachable device are both ordinary outcomes, not errors.
                        /*
                         * Read the device before asking it for anything. `connect()` returns what it
                         * read rather than only storing it — `ledger.address` here is a render behind,
                         * so checking it would check the previous device.
                         */
                        const at = signer.address ?? (await signer.connect());
                        setAttached(at);
                        if (expect && at && at.toLowerCase() !== expect.toLowerCase()) {
                          setStage('pre');
                          return;
                        }
                        // `rows` is what the screen renders; this is what the device verifies. They
                        // must describe the same thing, and only one of them can be signed.
                        const signature = await signer.signTypedData(typedData, setStep);
                        if (signature) onSigned?.(signature);
                        setStage(signature ? (scheduledAt ? 'scheduled' : 'signed') : 'declined');
                      }}
                    >
                      {isWallet ? copy.ceremony.continueInWallet : copy.ceremony.continue}
                    </Act>
                  </div>
                )}

                {/*
                 * The other key, when the owner has one. Not a preference toggle: whichever leads
                 * is the one the registry says holds the guardian, and this is only here because
                 * that answer can be wrong in either direction — a device that is not to hand, or a
                 * wallet connected under a different account than the one on file.
                 */}
                {other && stage === 'pre' && (
                  <button
                    onClick={() => setVia(other)}
                    className="mt-3 block cursor-pointer text-[11.5px] text-faint underline underline-offset-2 transition-colors hover:text-ink"
                  >
                    {other === 'wallet' ? copy.ceremony.useWallet : copy.ceremony.useDevice}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
