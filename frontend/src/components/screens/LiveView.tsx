import { copy } from '../../copy.ts';
import { Panel, Label, Note } from '../Panel.tsx';
import { StatStrip } from '../StatStrip.tsx';
import { Tape } from '../Tape.tsx';
import { formatPrice, rateToPrice } from '../../lib/rate.ts';
import type { VaultState } from '../../types.ts';

/**
 * The owner's home while the agent trades. One rule: every number here is read from the index —
 * the same queries the public page runs — so the owner never sees a number a stranger cannot
 * check. The scope sentence is a permanent fixture, not fine print.
 */
export function LiveView({ state }: { state: VaultState }) {
  const { pair, stats, tape, agent, inventory, floor } = state;

  return (
    <>
      <Panel>
        <StatStrip stats={stats} />
      </Panel>

      <Panel>
        <div className="mb-3 flex items-baseline justify-between">
          <Label>{copy.live.tape}</Label>
          <Note>{copy.live.axisKey}</Note>
        </div>
        <Tape entries={tape} pair={pair} />
      </Panel>

      <Panel>
        <Label>{copy.live.agentNow}</Label>
        <ul className="space-y-1 text-sm">
          {agent.map((line) => (
            <li key={line} className="text-dim">
              · <span className="text-ink">{line}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <div className="flex items-start justify-between">
          <div>
            <Label>{copy.live.inventory}</Label>
            <div className="num">
              {inventory.base} {pair.base} · {inventory.quote} {pair.quote}
            </div>
          </div>
          <div className="text-right">
            <Label>{copy.live.floor}</Label>
            <div className="num">
              {floor.enforced
                ? formatPrice(rateToPrice(floor.absoluteRate, pair.baseDecimals, pair.quoteDecimals))
                : '—'}
            </div>
          </div>
        </div>
        <Note className="mt-4">{copy.scope}</Note>
      </Panel>
    </>
  );
}
