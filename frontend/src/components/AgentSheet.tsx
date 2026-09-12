import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Info, X } from 'lucide-react';
import { copy } from '../copy.ts';
import { AddressChip } from './AddressChip.tsx';
import { Tooltip } from './Tooltip.tsx';
import { Tide } from './Tide.tsx';
import { identicon } from '../lib/identicon.ts';
import { useHouseAgent } from '../lib/houseAgent.ts';
import { useAgentLog } from '../lib/agentLog.ts';

/**
 * Where an agent is found, and what it has done.
 *
 * The premise this holds: SUBFLOOR does not supply agents. A vault takes a delegate address, any
 * address, and the guarantee does not depend on whose it is — the same arithmetic binds a
 * compromised agent and a careful one. One agent happens to run here and is listed; that is a
 * convenience, not the product, and the order of the panels is written so it reads that way.
 *
 * A sheet rather than a page, and rather than a button that fills the field. A control that answers
 * the question teaches that ours is the answer; a sheet lets somebody read what an agent can reach
 * before pasting one into their own vault — including deciding to run their own, which
 * `docs/bring-your-own-agent.md` is a whole document about.
 */
function CopyAddress({ address }: { address: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(address).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        });
      }}
      className="inline-flex w-full cursor-pointer items-center gap-2 rounded-xl border border-rule bg-sunken px-3.5 py-2.5 font-mono text-[12px] break-all text-ink transition-colors hover:border-floor"
    >
      {done ? (
        <Check size={13} strokeWidth={2.2} className="shrink-0 text-floor" />
      ) : (
        <Copy size={13} strokeWidth={1.8} className="shrink-0 text-faint" />
      )}
      {address}
    </button>
  );
}

/*
 * Short and fixed-width. `toLocaleString`'s comma and meridiem cost a column's worth of characters
 * and pushed every cell in the row onto two lines — on a table whose whole job is to be scanned.
 * Twenty-four hour, no comma, same shape for every row.
 */
const when = (t: number) => {
  const d = new Date(t * 1000);
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
};

export function AgentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const house = useHouseAgent(null);
  const log = useAgentLog(house.address);

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
       * Visible overflow, so the mascot can hang off the corner. The body scrolls instead of the
       * sheet: clipping here would cut him in half, and scrolling here would carry him up the page
       * as the log is read, which is the one thing a fixed corner ornament must not do.
       */
      className="sheet relative max-h-[86vh] w-[min(600px,calc(100vw-32px))] overflow-visible"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {/*
        * The header sits *on* the banner rather than above it.
        *
        * A filled bar across the top cut the picture off at a straight line and squared the sheet's
        * own corner — the dialog has `overflow: visible` so the mascot can hang off it, so nothing
        * clips a child's corners for it any more. One rounded block holds both, the image runs the
        * full height of it, and the title floats with the scrim carrying its legibility instead of
        * a slab.
        */}
      <div className="relative overflow-hidden rounded-t-2xl">
        <img
          src="/agent-banner.webp"
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover object-center select-none"
        />
        {/*
          * Dark at the top, gone by the middle. It is what the title is read against — `.on-art`
          * alone is a shadow on every letter, which at this size reads as smudge rather than
          * contrast — and it fades to nothing so the picture below it is a picture.
          */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(1,10,26,0.82) 0%, rgba(1,10,26,0.35) 46%, transparent 100%)' }}
        />

        <div className="relative flex items-center justify-between px-5 py-3">
          <h2 className="on-art m-0 text-[11.5px] tracking-[0.11em] text-ink uppercase">{copy.agents.title}</h2>
          <button
            onClick={onClose}
            aria-label={copy.panic.cancel}
            className="on-art -mr-1 cursor-pointer p-1 text-ink transition-colors hover:text-floor"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>

        {/* The picture's own room, under the title. */}
        <div className="h-[86px]" />
      </div>

      {house.address && (
        /* Outside the clipped block, so it can hang below the banner's edge. */
        <img
          src={identicon(house.address)}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute top-[94px] left-5 size-[72px] rounded-full border-2 border-rule bg-sunken shadow-card select-none"
        />
      )}

      <div className="max-h-[calc(86vh-152px)] overflow-x-hidden overflow-y-auto px-5 pt-12 pb-5">
        {house.address ? (
          <>
            {/*
              * The premise, and the bound, behind one mark.
              *
              * Both were paragraphs on the sheet and both are read once. Standing open they pushed
              * the record — the part somebody actually came to look at — below the fold every time
              * the sheet was opened, including the tenth time. Behind a mark they are still one
              * gesture away and no longer charge rent.
              */}
            <span className="mb-1 flex items-center gap-1.5 text-[11px] tracking-[0.11em] text-faint uppercase">
              {copy.agents.oneHereTag}
              <Tooltip text={`${copy.agents.lede} ${copy.agents.cannotBody}`}>
                <Info size={11} strokeWidth={1.8} />
              </Tooltip>
            </span>
            <CopyAddress address={house.address} />
          </>
        ) : (
          /* No agent here is a legitimate deployment, and it is not an error. */
          <p className="serif m-0 text-[13px] leading-relaxed text-muted">{copy.agents.noneHere}</p>
        )}

        {/*
          * The record, from the index rather than from the agent. A panel printing what the agent
          * reported would be the agent auditing itself, which is the thing §4 builds the index to
          * prevent — so there is nothing here about what it is thinking, only books the chain
          * accepted. A decision is a claim; a shipped book is a fact.
          */}
        {/*
          * A well, not a bordered card — the same recess the floor control sits in. A panel that
          * holds a reading belongs *in* the sheet rather than on it, and the inset edge is what
          * says so; an outline would make this a second card floating on a card.
          */}
        <div className="well relative mt-4 overflow-hidden rounded-xl bg-sunken">
          {/*
            * The same water as the floor control's well, and there for the same reason: this is a
            * floor, in a product whose whole argument is that there is a bottom. It sits at the
            * foot, behind the rows, and is out of the accessibility tree — it says nothing the
            * table does not.
            */}
          <Tide />

          <div className="relative flex items-center justify-between gap-3 px-4 pt-3.5 pb-2 t-label text-faint">
            <span>{copy.agents.logTitle}</span>
            <span>{copy.agents.logTag}</span>
          </div>
          <div className="relative px-4 pb-3.5">
            {log.status === 'failed' ? (
              <p className="serif m-0 text-[13px] leading-relaxed text-faint">{copy.agents.logFailed}</p>
            ) : log.status === 'loading' ? (
              <p className="serif m-0 text-[13px] leading-relaxed text-faint">{copy.agents.reading}</p>
            ) : log.books.length === 0 ? (
              <p className="serif m-0 text-[13px] leading-relaxed text-faint">{copy.agents.logEmpty}</p>
            ) : (
              /*
                * The same table the tape is, because it is the same kind of thing: a list of what
                * happened, newest first, with a state and a time. A bespoke list beside the desk's
                * own tape would be a second visual grammar for one idea.
                */
              <div className="tape-scroll max-h-[280px] overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {[copy.agents.colState, copy.agents.colBook, copy.agents.colVault, copy.agents.colWhen].map(
                        (h, k) => (
                          <th
                            key={h}
                            /*
                              * No background of its own: it is already inside the well, and
                              * `bg-sunken` on `bg-sunken` is an invisible header that still costs
                              * a rule. The line under it is what separates it.
                              */
                            className={`sticky top-0 z-10 border-b border-rule/70 bg-sunken t-label px-3 py-2 text-faint ${
                              k === 3 ? 'text-right' : 'text-left'
                            }`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {log.books.map((b) => (
                      <tr key={b.strategyHash} className="[&>td]:border-b [&>td]:border-rule/50">
                        <td className={`px-3 py-2.5 font-mono text-[12px] ${b.active ? 'text-floor' : 'text-faint'}`}>
                          {b.active ? copy.agents.live : copy.agents.docked}
                        </td>
                        <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-ink">
                          {b.classification.toLowerCase()}
                          <span className="text-faint"> · {b.stepCount} steps</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <AddressChip address={b.vault} size={13} />
                        </td>
                        <td className="t-num px-3 py-2.5 text-right whitespace-nowrap text-faint">{when(b.shippedTimestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <p className="m-0 mt-2.5 text-[12px] leading-relaxed text-faint">
          {log.status === 'ready' && log.vaults.length > 0
            ? copy.agents.serving(log.vaults.length)
            : log.status === 'ready'
              ? copy.agents.servingNone
              : copy.agents.reading}
        </p>

        <p className="serif m-0 mt-4 text-[12.5px] leading-relaxed text-faint">{copy.agents.own}</p>
      </div>

      {/*
        * The same figure that opened this, holding the corner of what it opened.
        *
        * Half outside the sheet on purpose: clipped inside it would read as a picture printed on a
        * panel, and breaking the edge reads as something present at it — the same reasoning as the
        * guide on the tour popover. Dropped on narrow screens, where there is no margin for him to
        * hang into and the words are what have to survive.
        */}
      <img
        src="/agent-bot.webp"
        alt=""
        aria-hidden
        draggable={false}
        className="agent-sheet-bot pointer-events-none absolute -right-7 -bottom-8 w-[110px] select-none max-[620px]:hidden"
      />
    </dialog>
  );
}
