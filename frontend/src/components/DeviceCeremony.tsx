import { useState } from 'react';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { DeviceReview } from './DeviceReview.tsx';
import { DeviceScreen } from './DeviceScreen.tsx';
import { useLedger } from '../lib/ledger.ts';
import type { Wallet } from '../lib/wallet.ts';
import { deviceSigner, useSignerError, walletSigner } from '../lib/signer.ts';

/**
 * The two hardware moments, as a body that can sit in a screen or in a sheet.
 *
 * Extracted because lowering a floor is decided on the board and should be finished there: sending
 * someone to another page to answer a device question loses the fills the decision was made
 * against. The mandate signature uses the same body during onboarding.
 *
 * Four states, per §10 and #129: what the device will show, waiting, declined, and device-absent —
 * and the absent one is known before this is offered, from enumeration on page load.
 *
 * **All four wear the same body.** The panel used to be swapped out on the click: the screen the
 * owner had been reading disappeared and a column of terminal lines took its place, so the moment
 * of pressing Approve on the device was the moment the thing being approved left the page. Now the
 * click only puts the button to work, and every state after it is reported on the screen and in one
 * status line, in the places those things already were.
 */
type Stage = 'pre' | 'waiting' | 'declined' | 'signed' | 'absent';

export function DeviceCeremony({
  rows,
  expect,
  wallet,
  onDone,
  typedData,
  onSigned,
}: {
  /** Exactly what the device will render, in its order. */
  rows: [string, string][];
  /**
   * The device the registry has on file for this vault, when there is one.
   *
   * Checked before anything is signed, because a signature from the wrong Ledger is not a failure
   * the owner finds out about here — it is a transaction that reverts later, or a mandate the vault
   * will not honour, and either way the moment to catch it is while the device is in their hand.
   * A signature is cheap to produce and expensive to discover was worthless.
   */
  expect?: `0x${string}` | null;
  /**
   * The connected account, offered when the registry's guardian is a soft wallet rather than a
   * device. The mechanism recovers an address from the struct and compares it to the guardian on
   * file; it does not care what plastic the key lives in, and an owner who registered a wallet
   * cannot be served by a ceremony that can only ask a Ledger.
   */
  wallet?: Wallet;
  onDone: () => void;
  /**
   * The struct the device signs. Null means there is nothing to sign yet — a nonce still being
   * read, or a floor that is not actually being lowered — and the ceremony declines to ask rather
   * than asking for a signature over nothing.
   */
  typedData?: object | null;
  /** The signature, when one is given. The caller is what sends it on chain. */
  onSigned?: (signature: string) => void;
}) {
  const ledger = useLedger();
  // 'absent' is about the device, and it is only a dead end when there is no other key either.
  const [stage, setStage] = useState<Stage>(ledger.presence === 'unsupported' && !wallet?.address ? 'absent' : 'pre');
  /**
   * Which device is actually attached, once it has been asked.
   *
   * Null until the read happens — and null is not "the wrong one". Everything below distinguishes
   * the three states, because treating "not asked yet" as a mismatch would refuse a correct device
   * and treating it as a match would defeat the check entirely.
   */
  const [attached, setAttached] = useState<`0x${string}` | null>(null);
  /** What the signer is doing, so a slow device reads as progress rather than as a hang. */
  const [step, setStep] = useState<string | null>(null);
  const mismatch = expect && attached ? attached.toLowerCase() !== expect.toLowerCase() : false;
  /**
   * Which thing is asked, decided from the registry rather than from a preference.
   *
   * If the guardian on file is the connected account, a device cannot produce a signature the vault
   * will honour, and leading with one would send the owner to fetch hardware for nothing.
   */
  const [via, setVia] = useState<'device' | 'wallet' | null>(null);
  const isWallet =
    via === 'wallet' ||
    (via === null && Boolean(expect && wallet?.address && expect.toLowerCase() === wallet.address.toLowerCase()));
  const signer = isWallet && wallet ? walletSigner(wallet) : deviceSigner(ledger);
  /**
   * The other key, offered only while the chain has not already decided.
   *
   * With a guardian on file the choice is not a preference — it is a fact, and the one that is not
   * it cannot produce a signature the contract will accept. Offering it anyway is offering a
   * ceremony whose only possible outcome is a signature the vault refuses, which is worse than not
   * offering it at all because it looks like a way forward.
   *
   * With nothing registered either could turn out to be right, so both are on the table.
   */
  const other = wallet && !expect ? (isWallet ? 'device' : 'wallet') : null;
  useSignerError(signer.error);

  return (
    <div className="grid items-start gap-5 md:grid-cols-[minmax(0,300px)_1fr]">
      <DeviceReview />

      <div>
        {stage === 'absent' ? (
          <p className="serif mt-0 text-[14px] leading-relaxed text-muted">{copy.ceremony.absent}</p>
        ) : (
          <>
            <p className="serif mt-0 text-[14px] leading-relaxed text-muted">
              {isWallet
                ? 'Your wallet spells the action out in words instead of raw calldata. Whoever signs can read it in the wallet\u2019s own dialog.'
                : 'The device spells the action out in words instead of raw calldata. Whoever presses Approve can read it on the device screen itself.'}
            </p>

            {/*
             * What the device will display, verbatim and in order, before it lights up — and then
             * the answer it gave, in the same place. It used to be a drawn screen; it is the same
             * strings either way, and the rule §10 sets is about the strings matching rather than
             * about the picture.
             */}
            <div className="my-3">
              <DeviceScreen
                rows={rows}
                waiting={stage === 'waiting'}
                answer={stage === 'signed' ? 'approved' : stage === 'declined' ? 'rejected' : null}
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

            {stage === 'signed' ? (
              <Act wide primary onClick={onDone}>
                continue
              </Act>
            ) : (
              /*
               * One button, re-armed. A decline is not a different question, so it does not get a
               * different control — "try again" beside a spent button is two things to read where
               * the first one still says what to do.
               */
              <Act
                wide
                primary
                busy={stage === 'waiting'}
                /* The signer's own step when it reports one: a slow device should read as busy. */
                busyLabel={
                  step
                    ? step.replace('signer.eth.steps.', '')
                    : isWallet
                      ? 'waiting for your wallet'
                      : 'awaiting approval on device'
                }
                disabled={!signer.ready}
                onClick={async () => {
                  // Also the way back from a decline: this is what sends the answer on the screen
                  // shrinking into the button it grew out of.
                  setStage('waiting');
                  /*
                   * Read the device before asking it for anything. `connect()` returns the address
                   * it read rather than only storing it, because the state from this render is a
                   * render behind — reading `ledger.address` here would check the previous device.
                   */
                  const at = signer.address ?? (await signer.connect());
                  setAttached(at);
                  if (expect && at && at.toLowerCase() !== expect.toLowerCase()) {
                    setStage('pre');
                    return;
                  }
                  /*
                   * The payload, not the picture of it.
                   *
                   * This used to hand `{ rows }` to the signer — the strings drawn on screen. The
                   * device is asked for a signature over a struct the contract will recover a
                   * guardian from, and a faithful rendering of the same numbers is not that struct.
                   * The rows stay what they always were: what the screen promises the device will
                   * show, so the owner can compare. They were never the thing to sign.
                   */
                  if (!typedData) {
                    setStage('pre');
                    return;
                  }
                  const signature = await signer.signTypedData(typedData, setStep);
                  if (signature) onSigned?.(signature);
                  setStage(signature ? 'signed' : 'declined');
                }}
              >
                {isWallet ? copy.ceremony.continueInWallet : copy.ceremony.continue}
              </Act>
            )}

            {/*
             * The other key, when the owner has one. Not a preference toggle: whichever leads is
             * the one the registry says holds the guardian, and this is only here because that
             * answer can be wrong in either direction.
             */}
            {/*
             * Why the choice is being offered at all. Without it, a link to a key the vault will
             * not check reads as a bug rather than as the only honest state of a vault that has
             * registered nothing.
             */}
            {!expect && stage === 'pre' && (
              <p className="mt-3 text-[11.5px] leading-relaxed text-faint">{copy.ceremony.noKeyYet}</p>
            )}

            {other && stage === 'pre' && (
              <button
                onClick={() => setVia(other)}
                className="mt-3 block cursor-pointer text-[11.5px] text-faint underline underline-offset-2 transition-colors hover:text-ink"
              >
                {other === 'wallet' ? copy.ceremony.useWallet : copy.ceremony.useDevice}
              </button>
            )}

            {/*
             * Named, not just refused. "Wrong device" leaves the owner guessing which of theirs it
             * is; the two addresses side by side answer it without them going to look.
             */}
            {mismatch && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-refuse">
                {copy.ceremony.wrongDevice}
                <span className="t-num mt-1 block text-faint">
                  {copy.ceremony.attached} {attached}
                  <br />
                  {copy.ceremony.registered} {expect}
                </span>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
