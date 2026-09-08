import { User, Users } from 'lucide-react';
import { copy } from '../copy.ts';
import { Hoverable } from './Hoverable.tsx';

/**
 * One control with two states, rather than two controls with one state each.
 *
 * A pair of tabs spends the width of both options permanently to show that one of them is on. This
 * is a switch: it wears what it is showing, and pressing it goes to the other. There are only ever
 * two tapes, so nothing is hidden by collapsing them — the label still names the state, and the
 * card explains both.
 *
 * Disabled while a read is in flight, because the switch changes which query runs. Pressing it
 * mid-fetch queues a second read whose answer arrives out of order.
 */
export function ScopeSwitch({
  scope,
  busy,
  onScope,
}: {
  scope: 'mine' | 'public';
  busy: boolean;
  onScope: (scope: 'mine' | 'public') => void;
}) {
  const mine = scope === 'mine';
  const Icon = mine ? User : Users;

  return (
    <Hoverable
      content={
        <dl className="m-0 grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-[12px]">
          <dt className={`flex items-center gap-2 ${mine ? 'text-floor' : 'text-faint'}`}>
            <User size={12} strokeWidth={1.9} />
            {copy.desk.scopeMine}
          </dt>
          <dd className="m-0 leading-relaxed text-muted">{copy.desk.scopeMineNote}</dd>
          <dt className={`flex items-center gap-2 ${mine ? 'text-faint' : 'text-floor'}`}>
            <Users size={12} strokeWidth={1.9} />
            {copy.desk.scopePublic}
          </dt>
          <dd className="m-0 leading-relaxed text-muted">{copy.desk.scopePublicNote}</dd>
        </dl>
      }
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => onScope(mine ? 'public' : 'mine')}
        aria-pressed={!mine}
        className="flex items-center gap-2 rounded-lg border border-rule bg-sunken px-2.5 py-1 text-[11px] tracking-normal normal-case transition-colors hover:border-floor hover:text-ink disabled:cursor-wait disabled:opacity-55"
      >
        <Icon size={13} strokeWidth={2} className="text-floor" />
        <span className="font-semibold text-ink">{mine ? copy.desk.scopeMine : copy.desk.scopePublic}</span>
      </button>
    </Hoverable>
  );
}
