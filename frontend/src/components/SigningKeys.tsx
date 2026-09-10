import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { identicon } from '../lib/identicon.ts';
import type { SignKey } from '../lib/signer.ts';
import type { BrowserWallet } from '../lib/guardian.ts';

/**
 * Which of the browser's addresses signs, when more than one is here.
 *
 * The account that trades and the account registered as guardian do not have to be the same one —
 * and under the split this design argues for, they should not be. So a second key can be opened
 * from here, and it is opened straight from the wallet rather than through the connection library:
 * that library holds one active account and it is the one this whole page is *about*, so attaching
 * a signing key there re-identified everything and un-rendered the sheet under the owner.
 *
 * The list is inside the sheet for a second reason. `showModal()` makes everything outside the
 * dialog's subtree inert, so a wallet-chooser rendered into the body is unclickable however high it
 * paints — measured, with the modal promoted above the sheet: `focusable: false`, and
 * `elementFromPoint` at the middle of it returning DIALOG.
 *
 * The guardian on file is marked rather than filtered. A list showing only the address that will
 * work answers "which one" and hides "why not the others", and the owner staring at a ceremony that
 * refuses their wallet is asking the second question.
 */
export function SigningKeys({
  keys,
  offers,
  expect,
  chosen,
  onChoose,
  onAttach,
  busy = false,
}: {
  keys: SignKey[];
  /** Wallets this browser announced, for opening one that is not on the list yet. */
  offers: BrowserWallet[];
  /** The guardian the registry has on file, when there is one. */
  expect?: `0x${string}` | null;
  chosen: SignKey | null;
  onChoose: (key: SignKey) => void;
  onAttach: (uuid: string) => void;
  busy?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const missing = Boolean(expect) && !keys.some((k) => k.address.toLowerCase() === expect?.toLowerCase());

  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[10.5px] tracking-[0.14em] text-faint uppercase">Sign with</div>

      <div className="flex flex-col gap-1">
        {keys.map((key) => {
          const isGuardian = Boolean(expect && key.address.toLowerCase() === expect.toLowerCase());
          const isActive = key.address === chosen?.address;
          return (
            <button
              key={`${key.name}:${key.address}`}
              onClick={() => onChoose(key)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                isActive ? 'border-floor/50 bg-sunken' : 'border-rule hover:bg-sunken'
              }`}
            >
              <img src={identicon(key.address)} alt="" width={18} height={18} className="shrink-0 rounded-full" />
              <span className="t-num min-w-0 flex-1 truncate text-[11.5px] text-ink">
                {key.address.slice(0, 6)}…{key.address.slice(-4)}
              </span>
              <span className="text-[10.5px] text-faint">{key.name}</span>
              {/* The one the vault will honour, said once and in the place it matters. */}
              {isGuardian && (
                <span className="flex items-center gap-1 text-[10px] tracking-[0.1em] text-settle uppercase">
                  <Check size={11} strokeWidth={2.6} />
                  guardian
                </span>
              )}
            </button>
          );
        })}

        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-rule px-2.5 py-2 text-[11.5px] text-faint transition-colors hover:text-ink"
          >
            <Plus size={13} strokeWidth={2} />
            {busy ? 'opening…' : 'use another wallet'}
          </button>
        ) : (
          offers.map((offer) => (
            <button
              key={offer.uuid}
              onClick={() => {
                setAdding(false);
                onAttach(offer.uuid);
              }}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-rule px-2.5 py-2 text-left transition-colors hover:bg-sunken"
            >
              <img src={offer.icon} alt="" width={18} height={18} className="shrink-0 rounded-[5px]" />
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink">{offer.name}</span>
            </button>
          ))
        )}
      </div>

      {/*
        * Said, not fixed from here.
        *
        * The only way to add an account this page cannot see is to ask the wallet for one, and
        * asking moves the selected account inside the extension — which the extension broadcasts to
        * every connection on the origin, including the one that says who this page is about. That
        * closed the sheet and changed the owner's account twice. So the sentence points at the
        * wallet, where the owner can see what is happening while it happens.
        */}
      {missing && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
          The guardian on file is not among these. Add that account to this site in your wallet, and it will appear
          here.
        </p>
      )}
    </div>
  );
}
