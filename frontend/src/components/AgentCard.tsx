import { useEffect, useState, type CSSProperties } from 'react';
import { Activity, Bot, Cog, Pencil, Sparkles, X } from 'lucide-react';
import { isAddress, type Address } from 'viem';
import { copy } from '../copy.ts';
import { Act, Ghost } from './Button.tsx';
import { Card, CardBody, CardHead } from './Card.tsx';
import { Tide } from './Tide.tsx';
import { AddressField } from './StepForms.tsx';
import { useHouseAgent } from '../lib/houseAgent.ts';
import { AddressChip } from './AddressChip.tsx';

/**
 * Everything about the agent, in the card that describes it.
 *
 * The address used to be read-only here and edited in the setup sheet — a wizard for a vault that
 * has finished being set up. `AquaGuardVault.setDelegate` is `onlyOwner` and takes no signature and
 * no device, so changing it is an ordinary edit and belongs beside the thing it changes rather than
 * behind a re-opened ceremony.
 *
 * Stopping the agent came here for the opposite reason. It was in the header, reachable from
 * anywhere — a real property to give up, and given up on purpose: a red button pinned above every
 * screen is a red button that stops being read. It sits in the mandate block at the foot of this
 * card, beside the button that grants the licence it takes back.
 */
export function AgentCard({
  delegate,
  behaviour,
  owner,
  onSetAgent,
  saving,
  savingStep,
  mandate,
}: {
  delegate: Address | null;
  /** What it is doing right now, as the index reports it. */
  behaviour: string[];
  /** Only the owner may edit or stop; everyone else reads. */
  owner: boolean;
  onSetAgent: (next: Address) => Promise<void>;
  saving: boolean;
  savingStep: string | null;
  /**
   * The mandate, which lives here because changing the agent above invalidates it.
   *
   * Passed in rather than built here: it needs the vault's nonce, the connection and the device,
   * and threading four more props through the board to reach one strip is worse than a slot.
   */
  mandate?: import('react').ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState('');
  /*
   * Only the address is wanted here — whether it can trade *this* vault is the mandate strip's
   * question, and it is asked there, where the vault is already in hand.
   */
  const house = useHouseAgent(null);

  // Every opening starts from what is there now, so the field is a correction rather than a blank.
  useEffect(() => {
    if (editing) setNext(delegate ?? '');
  }, [editing, delegate]);

  const ready = isAddress(next) && next.toLowerCase() !== delegate?.toLowerCase();

  return (
    <Card className="relative">
      {/*
        * Water at its foot, the same as the cards on the landing page and the well on this one.
        *
        * 0.7 rather than half: this panel's foot is `--c-surface-foot`, darker than the surface the
        * landing cards sit on, so it can carry more before anything on top of it suffers. Measured
        * there — the ground comes to #03324a, where the mandate's label reads 5.59 and its line
        * 11.83, and the shield beside them 4.39 against the 3 an icon needs. See Tide.
        *
        * `relative` on the card, because the reef banner and this both position against it.
        */}
      <Tide height={92} depth={0.7} />

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
              {/*
                * §10: do not ask them to choose a delegate. A first-run owner has no agent, and a
                * 42-character field is a question they cannot answer — so the one this deployment
                * runs is offered by name rather than left to be found and typed. It fills the field
                * rather than bypassing it: what gets saved is still an address they can see, and
                * changing it later is the same control.
                */}
              {house.address && house.address.toLowerCase() !== next.toLowerCase() && (
                <button
                  onClick={() => setNext(house.address as string)}
                  className="mt-2 flex w-full cursor-pointer items-start gap-2 rounded-xl border border-rule bg-sunken px-3 py-2.5 text-left transition-colors hover:border-floor"
                >
                  <Sparkles size={13} strokeWidth={1.8} className="mt-0.5 shrink-0 text-floor" />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold text-floor">{copy.wallet.houseUse}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">{copy.wallet.houseHint}</span>
                  </span>
                </button>
              )}

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

          {/*
           * The machine itself, turning behind the list of what it is doing.
           *
           * Right-aligned and running off the edge, because a cog centred in its own space reads
           * as an icon and a cog cut by the frame reads as part of something larger — which is
           * what it is standing in for. Forty seconds and counter to the small ones: at this size
           * a matching period would be three times the linear speed and the eye would go to the
           * decoration instead of the sentences.
           *
           * Low enough to sit under the text without being a scrim under it — measured, not
           * chosen: where a sentence crosses the thickest spoke the ground composites to #1e3448,
           * where ink reads 11.24 and muted 5.31.
           *
           * The stroke is 0.6 in a 24-unit box, ~4px at this size. At lucide's default of 2 the
           * spokes came out 14px thick and the thing read as a blob rather than as a gear.
           */}
          <Cog
            size={168}
            strokeWidth={0.6}
            aria-hidden
            className="gear pointer-events-none absolute -right-14 bottom-2 text-floor opacity-[0.07]"
            style={{ '--gear-period': '40s', animationDirection: 'reverse' } as CSSProperties}
          />

          {/*
            * Nothing shipped, or nothing known yet — either way there is no list. The fixture used
            * to fill this space on every board, so an empty state was never reachable and never
            * drawn; a vault with no live book now says so instead of describing one (#252).
            */}
          {behaviour.length === 0 && (
            <p className="serif relative m-0 text-[12.5px] leading-relaxed text-faint">{copy.live.agentQuiet}</p>
          )}

          <ul className="relative m-0 list-none space-y-1.5 p-0 text-[12.5px]">
            {behaviour.map((line, i) => {
              /*
               * ponytail: reads the word out of the line, because the line is all there is. These
               * strings are prose and nothing beside them carries a running/stopped flag. A cog
               * turning next to "auction rebalance idle" would be the card claiming motion the
               * sentence denies, which is worse than a cog that sometimes does not turn.
               */
              const idle = /\bidle\b/i.test(line);
              return (
                <li key={line} className="flex items-start gap-2 text-muted">
                  <Cog
                    size={12}
                    strokeWidth={1.9}
                    aria-hidden
                    className={`mt-[3.5px] shrink-0 text-floor ${idle ? 'opacity-40' : 'gear'}`}
                    style={idle ? undefined : ({ '--gear-period': `${7 + i * 2.5}s` } as CSSProperties)}
                  />
                  <span className="text-ink">{line}</span>
                </li>
              );
            })}
          </ul>

          {mandate}

        </CardBody>
      </div>
    </Card>
  );
}
