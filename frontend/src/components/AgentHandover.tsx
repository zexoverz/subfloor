import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import type { Address } from 'viem';
import { copy as strings } from '../copy.ts';
import type { StoredMandate } from '../lib/mandateStore.ts';

/**
 * The end of the ceremony, which is a handover rather than a tick.
 *
 * The owner has just authorised an agent they do not run. What the agent needs is exactly two
 * strings — the vault it trades and the mandate that lets it ship — and until now neither could be
 * got out of this app: `AddressChip` links to a block explorer, and the mandate went to
 * `localStorage` and was never shown. Walking the flow meant opening devtools, which is not a step
 * anyone should have to know about (#219).
 *
 * The mandate is copied whole, signature and struct together, because the vault rebuilds the hash
 * from every field and the signature alone buys nothing (#218).
 */
function CopyRow({
  label,
  value,
  hint,
  filename,
  fileValue,
}: {
  label: string;
  value: string;
  hint?: string;
  /** When set, the value is also offered as a file. A mandate is long enough that copying it out of
   *  a terminal-shaped box is worse than keeping it. */
  filename?: string;
  /** What the file holds, when that should differ from what is shown and copied — a mandate reads
   *  better indented in a file and pastes worse indented into a shell. */
  fileValue?: string;
}) {
  const [done, setDone] = useState(false);

  const save = () => {
    const url = URL.createObjectURL(new Blob([fileValue ?? value], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? 'subfloor.json';
    a.click();
    // Revoked on the next tick: the click has already started the download, and holding the object
    // URL for the life of the page leaks the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="mb-2.5 rounded-xl border border-rule bg-sunken px-3.5 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-[10.5px] tracking-[0.11em] text-faint uppercase">{label}</span>
        <div className="flex items-center gap-1">
        {filename && (
          <button
            onClick={save}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase transition-colors hover:text-floor"
          >
            <Download size={12} strokeWidth={1.9} />
            {strings.live.handoverDownload}
          </button>
        )}
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setDone(true);
              // Long enough to be read, short enough that the button is ready before it is wanted.
              setTimeout(() => setDone(false), 1600);
            });
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase transition-colors hover:text-floor"
        >
          {done ? <Check size={12} strokeWidth={2.2} /> : <Copy size={12} strokeWidth={1.9} />}
          {done ? strings.live.handoverCopied : strings.live.handoverCopy}
        </button>
        </div>
      </div>
      {/*
        * Wraps and scrolls rather than truncating. A mandate is long, and an owner checking that
        * what they copied is what they signed cannot check an ellipsis.
        */}
      <p className="no-bar m-0 max-h-24 overflow-y-auto font-mono text-[11px] leading-relaxed break-all text-ink">{value}</p>
      {hint && <p className="mt-1.5 mb-0 text-[11.5px] leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}

export function AgentHandover({ vault, mandate }: { vault: Address | null; mandate: StoredMandate | null }) {
  if (!vault || !mandate) return null;

  return (
    <div className="mb-4">
      <p className="serif mt-0 mb-3 text-[14px] leading-relaxed text-muted">{strings.live.handoverLead}</p>

      <CopyRow label={strings.live.handoverVaultLabel} value={vault} hint={strings.live.handoverVaultHint} />
      <CopyRow
        label={strings.live.handoverMandateLabel}
        value={JSON.stringify(mandate)}
        fileValue={JSON.stringify(mandate, null, 2)}
        hint={strings.live.handoverMandateHint}
        filename={`subfloor-mandate-${vault.slice(0, 10)}-nonce${mandate.nonce}.json`}
      />

      <p className="serif m-0 text-[13.5px] leading-relaxed text-faint">{strings.live.handoverOnce}</p>
    </div>
  );
}
