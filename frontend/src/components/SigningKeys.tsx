import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { identicon } from '../lib/identicon.ts';
import type { Wallet, WalletAccount } from '../lib/wallet.ts';

/**
 * Which of the browser's addresses signs, when more than one is here.
 *
 * The account that trades and the account registered as guardian do not have to be the same one —
 * and under the split this design argues for, they should not be. wagmi holds a map of connections
 * rather than a single wallet, so a second one can be attached without the first being given up;
 * this is the list that comes out of it, and the row that adds to it.
 *
 * The guardian on file is marked rather than filtered. A list showing only the address that will
 * work answers "which one" and hides "why not the others", and the owner staring at a ceremony that
 * refuses their wallet is asking the second question.
 */
export function SigningKeys({
  wallet,
  expect,
  chosen,
  onChoose,
}: {
  wallet: Wallet;
  /** The guardian the registry has on file, when there is one. */
  expect?: `0x${string}` | null;
  chosen: WalletAccount | null;
  onChoose: (account: WalletAccount) => void;
}) {
  const [adding, setAdding] = useState(false);
  const active = chosen?.address ?? wallet.address;

  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[10.5px] tracking-[0.14em] text-faint uppercase">Sign with</div>

      <div className="flex flex-col gap-1">
        {wallet.accounts.map((account) => {
          const isGuardian = Boolean(expect && account.address.toLowerCase() === expect.toLowerCase());
          const isActive = account.address === active;
          return (
            <button
              key={`${account.uid}:${account.address}`}
              onClick={() => onChoose(account)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                isActive ? 'border-floor/50 bg-sunken' : 'border-rule hover:bg-sunken'
              }`}
            >
              <img src={identicon(account.address)} alt="" width={18} height={18} className="shrink-0 rounded-full" />
              <span className="t-num min-w-0 flex-1 truncate text-[11.5px] text-ink">
                {account.address.slice(0, 6)}…{account.address.slice(-4)}
              </span>
              <span className="text-[10.5px] text-faint">{account.name}</span>
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

        {/*
         * Our own list, not AppKit's modal, and that is not a style preference. `showModal()`
         * makes everything outside the dialog's subtree inert, and AppKit renders its modal into
         * the body — so a wallet modal opened from inside a sheet is unclickable however high it
         * paints. These rows are inside the sheet, so they are simply not inert.
         */}
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-rule px-2.5 py-2 text-[11.5px] text-faint transition-colors hover:text-ink"
          >
            <Plus size={13} strokeWidth={2} />
            connect another wallet
          </button>
        ) : (
          wallet.options.map((option) => (
            <button
              key={option.uid}
              onClick={() => {
                setAdding(false);
                wallet.connectWith(option.uid);
              }}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-rule px-2.5 py-2 text-left transition-colors hover:bg-sunken"
            >
              {option.icon ? (
                <img src={option.icon} alt="" width={18} height={18} className="shrink-0 rounded-[5px]" />
              ) : (
                <span className="size-[18px] shrink-0 rounded-[5px] bg-sunken" />
              )}
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink">{option.name}</span>
              {/* Already here, and asking again would only re-open the same one. */}
              {option.connected && <span className="text-[10px] tracking-[0.1em] text-faint uppercase">here</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
