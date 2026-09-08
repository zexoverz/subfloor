import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, ExternalLink, LogOut } from 'lucide-react';
import { createPublicClient, http, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { copy } from '../copy.ts';
import { Act } from './Button.tsx';
import { identicon } from '../lib/identicon.ts';
import { addressUrl } from '../lib/chain.ts';
import type { Wallet } from '../lib/wallet.ts';

/**
 * Connect button, or the connected account.
 *
 * The name and picture come from ENS, which lives on Ethereum mainnet regardless of which chain the
 * vault is on — so this reads from a mainnet client and nothing else does. When there is no ENS
 * record, the identicon is generated from the address itself, which is always available and never
 * wrong.
 */
const ens = createPublicClient({ chain: mainnet, transport: http() });

export function AccountMenu({ wallet }: { wallet: Wallet }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const address = wallet.address;
    if (!address) {
      setName(null);
      setAvatar(null);
      return;
    }
    let live = true;

    (async () => {
      try {
        const resolved = await ens.getEnsName({ address });
        if (!live || !resolved) return;
        setName(resolved);
        const picture = await ens.getEnsAvatar({ name: resolved });
        if (live && picture) setAvatar(picture);
      } catch {
        // No ENS, or no reachable mainnet node. The identicon covers both.
      }
    })();

    return () => {
      live = false;
    };
  }, [wallet.address]);

  // A menu that stays open after a click elsewhere is a menu in the way.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  if (!wallet.address) {
    return (
      <span className="inline-block">
        <Act primary onClick={wallet.connect} busy={wallet.connecting} busyLabel={copy.wallet.connecting}>
          {copy.wallet.connect}
        </Act>
      </span>
    );
  }

  const address = wallet.address as Address;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="pushable push-quiet mb-1.5 flex cursor-pointer items-center gap-2 rounded-xl py-1.5 pr-2 pl-1.5 text-[12px]"
      >
        <img src={avatar ?? identicon(address)} alt="" className="size-5 rounded-xl object-cover" />
        <span className="font-medium">{name ?? short}</span>
        <ChevronDown size={13} strokeWidth={1.8} className={`text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-[240px] overflow-hidden rounded-xl border border-rule bg-surface shadow-card">
          {/*
           * The blockie and the short form, not the full 42 characters wrapped over two lines.
           *
           * Nobody reads an address to check it character by character — they check the first four
           * and the last four, which is what the short form is, and they recognise the blockie
           * before they read anything. The whole string is still one click away under "Copy
           * address", which is the only use that needs every character of it.
           */}
          <div className="flex items-center gap-2.5 border-b border-rule px-3 py-2.5">
            <img
              src={avatar ?? identicon(address)}
              alt=""
              aria-hidden
              className="size-7 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0">
              <p className="m-0 text-[11.5px] tracking-[0.08em] text-faint uppercase">{copy.wallet.connected}</p>
              {/* A name is what they recognise; the address is what they are about to copy, so
                  when there is a name both are here rather than one hiding the other. */}
              <p className="m-0 mt-0.5 truncate text-[12px] font-medium text-ink" title={address}>
                {name ?? short}
              </p>
              {name && <p className="t-num m-0 truncate text-[11px] text-faint">{short}</p>}
            </div>
          </div>

          <button
            onClick={() => {
              void navigator.clipboard?.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-[12px] hover:bg-sunken"
          >
            <Copy size={13} strokeWidth={1.7} className="text-faint" />
            {copied ? copy.wallet.copied : copy.wallet.copyAddress}
          </button>

          <a
            href={addressUrl(address)}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-[12px] hover:bg-sunken"
          >
            <ExternalLink size={13} strokeWidth={1.7} className="text-faint" />
            {copy.wallet.viewOnExplorer}
          </a>

          <button
            onClick={() => {
              setOpen(false);
              wallet.disconnect();
            }}
            className="flex w-full cursor-pointer items-center gap-2 border-t border-rule px-3 py-2.5 text-left text-[12px] text-refuse hover:bg-refuse-wash"
          >
            <LogOut size={13} strokeWidth={1.7} />
            {copy.wallet.disconnect}
          </button>
        </div>
      )}
    </div>
  );
}
