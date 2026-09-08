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
 * It stays live while a read is in flight, and it is safe to: `useIndex` keys its effect on the
 * scope, so switching tears the old read down before starting the new one and a late answer from
 * the tape you left returns early instead of landing. Disabling it was guarding against a race
 * the reader already handles, at the cost of the control going dead exactly when someone is
 * waiting and most likely to press it.
 */
export function ScopeSwitch({
  scope,
  onScope,
}: {
  scope: 'mine' | 'public';
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
        onClick={() => onScope(mine ? 'public' : 'mine')}
        aria-pressed={!mine}
        className="pushable push-quiet push-sm mb-1 flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11px] tracking-normal normal-case"
      >
        <Icon size={13} strokeWidth={2} className="text-floor" />
        <span className="font-semibold text-ink">{mine ? copy.desk.scopeMine : copy.desk.scopePublic}</span>
      </button>
    </Hoverable>
  );
}
