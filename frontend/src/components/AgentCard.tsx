import { useEffect, useState } from 'react';
import { Activity, Bot, OctagonX, Pencil, X } from 'lucide-react';
import { isAddress, type Address } from 'viem';
import { copy } from '../copy.ts';
import { Act, Ghost } from './Button.tsx';
import { Card, CardBody, CardHead } from './Card.tsx';
import { AddressField } from './StepForms.tsx';
import { PanicDialog } from './PanicDialog.tsx';
import { AddressChip } from './AddressChip.tsx';

/**
 * Everything about the agent, in the card that describes it.
 *
 * The address used to be read-only here and edited in the setup sheet — a wizard for a vault that
 * has finished being set up. `AquaGuardVault.setDelegate` is `onlyOwner` and takes no signature and
 * no device, so changing it is an ordinary edit and belongs beside the thing it changes rather than
 * behind a re-opened ceremony.
 *
 * Stopping the agent moved here for the opposite reason. It was in the header, reachable from
 * anywhere — which is a real property to give up, and it is given up on purpose: a red button
 * pinned above every screen is a red button that stops being read. Here it sits under the address
 * it revokes and the behaviour it ends, where pressing it is a decision about something on screen.
 *
 * No device on this path, and that has not changed. Docking can only stop trading, never worsen a
 * price, and a stop that needs hardware fails exactly when the device is in a drawer somewhere else.
 */
export function AgentCard({
  delegate,
  behaviour,
  owner,
  onSetAgent,
  saving,
  savingStep,
  onPanic,
}: {
  delegate: Address | null;
  /** What it is doing right now, as the index reports it. */
  behaviour: string[];
  /** Only the owner may edit or stop; everyone else reads. */
  owner: boolean;
  onSetAgent: (next: Address) => Promise<void>;
  saving: boolean;
  savingStep: string | null;
  onPanic: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState('');
  const [asking, setAsking] = useState(false);

  // Every opening starts from what is there now, so the field is a correction rather than a blank.
  useEffect(() => {
    if (editing) setNext(delegate ?? '');
  }, [editing, delegate]);

  const ready = isAddress(next) && next.toLowerCase() !== delegate?.toLowerCase();

  return (
    <Card>
      <CardHead
        icon={Bot}
        left={copy.live.agentNow}
        right={
          owner ? (
            <Ghost
              onClick={() => setEditing((was) => !was)}
              label={editing ? copy.panic.cancel : copy.wallet.changeAgent}
            >
              {editing ? <X size={13} strokeWidth={1.9} /> : <Pencil size={13} strokeWidth={1.8} />}
            </Ghost>
          ) : (
            <Activity size={12} strokeWidth={1.6} />
          )
        }
      />
      {/*
       * The reef, behind the top half of the card rather than as a strip above it.
       *
       * Under the title, because the title is a sunken rule and uppercase grey type over a lit
       * illustration is a label nobody can read.
       *
       * Faded with a mask rather than covered with a colour: the panel it sits in is itself a
       * gradient, so painting anything over the picture to hide it would leave a rectangle of the
       * wrong shade halfway down the card. A mask removes the image and lets the panel be the
       * panel. The dimming is what buys the text back — the artwork is bright cyan and the labels
       * on top of it are the faintest grey this palette has.
       *
       * 0.12, and the label under it lifted one step. Measured against the worst pixel in the band
       * the text sits in — the anglerfish's lantern, which composites to #223d5d at this opacity:
       * ink 9.74, muted 4.60, and `text-faint` 3.62, which is why the one label over the artwork is
       * the one label on this card that is not faint. Dimming far enough to save it would have
       * needed 0.05 and left no picture to dim.
       */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 overflow-hidden" aria-hidden>
          <img
            src="/agent-banner.webp"
            alt=""
            draggable={false}
            className="h-full w-full origin-top scale-[1.02] object-cover object-center opacity-[0.12] select-none"
            style={{
              maskImage: 'linear-gradient(to bottom, black 0%, black 34%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 34%, transparent 100%)',
            }}
          />
        </div>

        <CardBody className="relative">
          {editing ? (
            <div className="mb-3 border-b border-rule pb-3">
              <AddressField
                label={copy.wallet.agentAddress}
                hint={copy.wallet.agentAddressHint}
                value={next}
                onChange={setNext}
                icon="wallet"
              />
              <div className="mt-2.5">
                <Act
                  wide
                  primary
                  disabled={!ready}
                  busy={saving}
                  busyLabel={savingStep ?? copy.wallet.savingAgent}
                  onClick={() => void onSetAgent(next as Address).then(() => setEditing(false))}
                >
                  {copy.wallet.saveAgent}
                </Act>
              </div>
            </div>
          ) : (
            /* #111: the address, not a nickname — the published key has to be checkable. */
            delegate && (
              <div className="mb-3 border-b border-rule pb-3">
                {/* Muted, not faint: it is the only label on this card with a picture behind it. */}
                <span className="text-[11.5px] tracking-[0.08em] text-muted uppercase">
                  {copy.wallet.agentAddress}
                </span>
                {/*
                 * Truncated, with the identicon carrying the identity — the same chip as every
                 * other address on this board. Forty hex characters wrapped over three lines and
                 * made the card about its own middle; nobody reads an address, they recognise one,
                 * and the full string is still on the hover and one click away on the explorer.
                 */}
                <div className="mt-1">
                  <AddressChip address={delegate} size={18} />
                </div>
              </div>
            )
          )}

          <ul className="m-0 list-none space-y-1.5 p-0 text-[12.5px]">
            {behaviour.map((line) => (
              <li key={line} className="text-muted">
                <span className="mr-2 text-floor">›</span>
                <span className="text-ink">{line}</span>
              </li>
            ))}
          </ul>

          {owner && (
            <>
              <button
                onClick={() => setAsking(true)}
                title={copy.panic.hint}
                className="pushable push-panic mt-4 mb-1.5 w-full cursor-pointer rounded-xl px-3.5 py-2.5 text-xs font-semibold tracking-[0.08em] uppercase select-none"
              >
                <span className="flex items-center justify-center gap-2">
                  <OctagonX size={13} strokeWidth={1.9} />
                  {copy.panic.label}
                </span>
              </button>
              <PanicDialog
                open={asking}
                onClose={() => setAsking(false)}
                onFire={() => {
                  setAsking(false);
                  onPanic();
                }}
              />
            </>
          )}
        </CardBody>
      </div>
    </Card>
  );
}
