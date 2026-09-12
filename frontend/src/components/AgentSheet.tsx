import { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { copy } from '../copy.ts';
import { CardBody, CardHead } from './Card.tsx';
import { AddressChip } from './AddressChip.tsx';
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
      className="inline-flex w-full cursor-pointer items-center gap-2 rounded-xl border border-rule bg-sunken px-3 py-2 font-mono text-[12px] break-all text-ink transition-colors hover:border-floor"
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

const when = (t: number) =>
  new Date(t * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

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
      className="sheet relative max-h-[86vh] w-[min(560px,calc(100vw-32px))] overflow-visible"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="flex items-center justify-between border-b border-rule bg-sunken px-5 py-3">
        <h2 className="m-0 text-[11.5px] tracking-[0.11em] text-faint uppercase">{copy.agents.title}</h2>
        <button
          onClick={onClose}
          aria-label={copy.panic.cancel}
          className="-mr-1 cursor-pointer p-1 text-faint transition-colors hover:text-ink"
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>

      {/*
        * The agent leads, and it leads as a face rather than as a heading.
        *
        * The identity is the thing being decided about — whose address may trade a vault — so it is
        * the first thing on the sheet: the banner, a blockie half out of it, and the address under
        * both, ready to copy. Everything else is evidence for or against that address.
        *
        * The blockie is not decoration. Forty hex characters are unreadable and unmemorable, and a
        * shape is what makes the same agent recognisable across the tape, the vault card and here.
        */}
      <div className="relative">
        <div className="h-[104px] overflow-hidden">
          <img
            src="/agent-banner.webp"
            alt=""
            aria-hidden
            draggable={false}
            className="h-full w-full object-cover object-center opacity-[0.55] select-none"
            style={{
              maskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
            }}
          />
        </div>

        {house.address && (
          <img
            src={identicon(house.address)}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute bottom-0 left-5 size-[72px] translate-y-1/3 rounded-full border-2 border-rule bg-sunken shadow-card select-none"
          />
        )}
      </div>

      <div className="max-h-[calc(86vh-152px)] overflow-x-hidden overflow-y-auto px-5 pt-8 pb-5">
        {house.address ? (
          <>
            <span className="block text-[11px] tracking-[0.11em] text-faint uppercase">{copy.agents.oneHereTag}</span>
            <CopyAddress address={house.address} />
            <p className="serif mt-2.5 mb-0 text-[13px] leading-relaxed text-muted">{copy.agents.lede}</p>
          </>
        ) : (
          /* No agent here is a legitimate deployment, and it is not an error. */
          <p className="serif m-0 text-[13px] leading-relaxed text-muted">{copy.agents.noneHere}</p>
        )}

        {/*
          * The bound, kept and kept small. Anyone about to paste a stranger's address into their
          * own vault should read it, and it is four words and a sentence — a panel of its own gave
          * it more room than it needs and pushed the record it exists to qualify off the screen.
          */}
        <div className="mt-3.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-rule bg-sunken px-3.5 py-2.5 text-[12px]">
          <span className="text-[11px] tracking-[0.11em] text-faint uppercase">{copy.agents.canLabel}</span>
          <span className="font-mono text-ink">compose · ship · dock · update-quote</span>
          <span className="w-full text-[11.5px] leading-relaxed text-faint">{copy.agents.cannotBody}</span>
        </div>

        {/*
          * The record, from the index rather than from the agent. A panel printing what the agent
          * reported would be the agent auditing itself, which is the thing §4 builds the index to
          * prevent — so there is nothing here about what it is thinking, only books the chain
          * accepted. A decision is a claim; a shipped book is a fact.
          */}
        <div className="mt-4 rounded-xl border border-rule">
          <CardHead left={copy.agents.logTitle} right={copy.agents.logTag} />
          <CardBody>
            {log.status === 'failed' ? (
              <p className="serif m-0 text-[13px] leading-relaxed text-faint">{copy.agents.logFailed}</p>
            ) : log.status === 'loading' ? (
              <p className="serif m-0 text-[13px] leading-relaxed text-faint">{copy.agents.reading}</p>
            ) : log.books.length === 0 ? (
              <p className="serif m-0 text-[13px] leading-relaxed text-faint">{copy.agents.logEmpty}</p>
            ) : (
              <ul className="m-0 max-h-[280px] list-none overflow-y-auto p-0">
                {log.books.map((b) => (
                  <li
                    key={b.strategyHash}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule/50 py-2.5 text-[12px] last:border-0"
                  >
                    <span className={`shrink-0 font-mono ${b.active ? 'text-floor' : 'text-faint'}`}>
                      {b.active ? copy.agents.live : copy.agents.docked}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink">{b.classification.toLowerCase()}</span>
                      <span className="text-faint"> · {b.stepCount} steps · </span>
                      <AddressChip address={b.vault} size={13} />
                    </span>
                    <span className="t-num shrink-0 text-faint">{when(b.shippedTimestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
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
