import { copy } from '../../copy.ts';
import { Panel, Label, Todo } from '../Panel.tsx';
import { StatStrip } from '../StatStrip.tsx';
import { Tape } from '../Tape.tsx';
import type { VaultState } from '../../types.ts';

/**
 * What a stranger meets: the same page in a second state, which is what keeps the two honest.
 *
 * A stranger does not see inventory, floor levels keyed to a recipient, or anything mapping an
 * address to an exposed position size. No page may ever publish an identifying list of exposed
 * positions — that is a target list, not a product.
 */
export function PublicPage({ state }: { state: VaultState }) {
  return (
    <>
      <Panel>
        <StatStrip stats={state.stats} />
      </Panel>

      <Panel>
        <Label>{copy.live.tape}</Label>
        <Tape entries={state.tape} pair={state.pair} />
      </Panel>

      <Panel>
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <span className="block text-[11px] tracking-[0.08em] text-dim uppercase">
              {copy.publicPage.programsExecuted}
            </span>
            <b className="num text-lg">{state.fuzz.programs.toLocaleString('en-US')}</b>
          </div>
          <div>
            <span className="block text-[11px] tracking-[0.08em] text-dim uppercase">
              {copy.publicPage.settledBelowFloor}
            </span>
            <b className="num text-lg">{state.fuzz.settledBelowFloor}</b>
          </div>
        </div>
      </Panel>

      <Todo>
        skeleton: [run query] belongs next to every headline number here — the guarantee is
        anyone's query, and the affordance is that sentence made clickable.
      </Todo>
    </>
  );
}
