import { useState } from 'react';
import { Check, Copy, Dot } from 'lucide-react';
import { copy } from '../../copy.ts';
import { Card, CardBody, CardHead } from '../Card.tsx';
import { AddressChip } from '../AddressChip.tsx';
import { useHouseAgent } from '../../lib/houseAgent.ts';
import { useAgentLog } from '../../lib/agentLog.ts';

/**
 * Where an agent is found, and what it has done.
 *
 * The premise this page exists to hold: SUBFLOOR does not supply agents. The vault takes a delegate
 * address, any address, and the guarantee does not depend on whose it is — a compromised agent and
 * a careful one are bounded by the same arithmetic. One agent happens to run here and is listed;
 * that is a convenience, not the product, and the page is written so it reads that way.
 *
 * Which is also why this is a page rather than a button beside the field. A control that fills in
 * an address teaches that ours is the answer. A page that lists what an agent is, what it can
 * reach, and what it has shipped lets somebody decide — including deciding to run their own, which
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
      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rule bg-sunken px-3 py-2 font-mono text-[12.5px] break-all text-ink transition-colors hover:border-floor"
    >
      {done ? <Check size={13} strokeWidth={2.2} className="shrink-0 text-floor" /> : <Copy size={13} strokeWidth={1.8} className="shrink-0 text-faint" />}
      {address}
    </button>
  );
}

const when = (t: number) =>
  new Date(t * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Agents() {
  const house = useHouseAgent(null);
  const log = useAgentLog(house.address);

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-4.5">
      <div>
        <h1 className="mt-0 mb-2 text-[clamp(22px,3.4vw,30px)] leading-tight font-semibold tracking-[-0.015em]">
          {copy.agents.title}
        </h1>
        <p className="serif m-0 max-w-[62ch] text-[15px] leading-relaxed text-muted">{copy.agents.lede}</p>
      </div>

      {/*
        * The bound comes before the address, deliberately. Anyone about to paste a stranger's
        * address into their own vault should read what that stranger can and cannot do first.
        */}
      <Card>
        <CardHead left={copy.agents.boundsTitle} />
        <CardBody>
          <p className="serif mt-0 mb-3 text-[13.5px] leading-relaxed text-muted">{copy.agents.boundsBody}</p>
          <div className="grid grid-cols-2 gap-2.5 max-[560px]:grid-cols-1">
            <div className="rounded-xl border border-rule bg-sunken px-3.5 py-3">
              <span className="block text-[11px] tracking-[0.11em] text-faint uppercase">{copy.agents.canLabel}</span>
              <ul className="m-0 mt-1.5 list-none p-0 text-[12.5px] text-ink">
                {['compose', 'ship', 'dock', 'update-quote'].map((c) => (
                  <li key={c} className="flex items-center gap-1.5 font-mono">
                    <Dot size={14} strokeWidth={3} className="shrink-0 text-floor" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-rule bg-sunken px-3.5 py-3">
              <span className="block text-[11px] tracking-[0.11em] text-faint uppercase">{copy.agents.cannotLabel}</span>
              <p className="serif m-0 mt-1.5 text-[12.5px] leading-relaxed text-muted">{copy.agents.cannotBody}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead left={copy.agents.oneHereTitle} right={house.known && house.address ? copy.agents.oneHereTag : ''} />
        <CardBody>
          {house.address ? (
            <>
              <p className="serif mt-0 mb-3 text-[13.5px] leading-relaxed text-muted">{copy.agents.oneHereBody}</p>
              <CopyAddress address={house.address} />
              <p className="m-0 mt-3 text-[12.5px] leading-relaxed text-faint">
                {log.status === 'ready' && log.vaults.length > 0
                  ? copy.agents.serving(log.vaults.length)
                  : log.status === 'ready'
                    ? copy.agents.servingNone
                    : copy.agents.reading}
              </p>
            </>
          ) : (
            /* No agent here is a legitimate deployment, and it is not an error. */
            <p className="serif m-0 text-[13.5px] leading-relaxed text-muted">{copy.agents.noneHere}</p>
          )}
        </CardBody>
      </Card>

      {/*
        * The record, from the index rather than from the agent. A page that printed what the agent
        * reported would be the agent auditing itself, which is the thing §4 builds the index to
        * avoid.
        */}
      <Card>
        <CardHead left={copy.agents.logTitle} right={copy.agents.logTag} />
        <CardBody>
          {log.status === 'failed' ? (
            <p className="serif m-0 text-[13.5px] leading-relaxed text-faint">{copy.agents.logFailed}</p>
          ) : log.status === 'loading' ? (
            <p className="serif m-0 text-[13.5px] leading-relaxed text-faint">{copy.agents.reading}</p>
          ) : log.books.length === 0 ? (
            <p className="serif m-0 text-[13.5px] leading-relaxed text-faint">{copy.agents.logEmpty}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {log.books.map((b) => (
                <li
                  key={b.strategyHash}
                  className="flex items-baseline gap-3 border-b border-rule/50 py-2.5 text-[12.5px] last:border-0"
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
      </Card>

      <p className="serif m-0 text-[13px] leading-relaxed text-faint">{copy.agents.own}</p>
    </div>
  );
}
