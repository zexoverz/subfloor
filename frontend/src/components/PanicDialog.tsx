import { useEffect, useState } from 'react';
import { OctagonX } from 'lucide-react';
import { copy } from '../copy.ts';
import { DangerSheet } from './DangerSheet.tsx';

/**
 * The confirmation before the agent is stopped.
 *
 * This replaces a press-and-hold, and the swap is a deliberate departure from §10, which asks for a
 * hold "not a confirmation modal — a scared user should not have to read a dialog". The
 * counter-argument that won: the second effect is irreversible in a way the first is not. Docking
 * can be undone by shipping again; a revoked credential cannot be restored, and issuing a new one
 * takes the device. A hold protects against the stray click and says nothing about what is about to
 * be lost, so an owner who did not know the credential was gone forever learns it afterwards.
 *
 * What survives from §10 is the part that mattered: still one gesture from anywhere, still no
 * device, and still impossible to fire by accident — the accident is caught by an acknowledgement
 * rather than by a timer.
 *
 * The acknowledgement is why this one has a tick and the withdraw sheet does not. It is the only
 * control here that cannot be undone.
 */
export function PanicDialog({
  open,
  onClose,
  onFire,
}: {
  open: boolean;
  onClose: () => void;
  onFire: () => void;
}) {
  const [understood, setUnderstood] = useState(false);

  // Every opening starts unacknowledged. Carrying the tick over would put a second visit one click
  // from stopping the agent, which is the accident this exists to prevent.
  useEffect(() => {
    if (open) setUnderstood(false);
  }, [open]);

  return (
    <DangerSheet
      open={open}
      onClose={onClose}
      title={copy.panic.confirmTitle}
      lead={copy.panic.confirmLead}
      ack={{
        label: copy.panic.ack,
        hint: copy.panic.ackHint,
        checked: understood,
        onChange: setUnderstood,
      }}
      confirmLabel={copy.panic.label}
      confirmIcon={<OctagonX size={14} strokeWidth={1.9} />}
      onConfirm={onFire}
      footer={copy.panic.undone}
    >
      {/*
       * Numbered because the order is the mechanism rather than presentation: docking goes through
       * canonical Aqua first, so it works even if the router is unreachable, and the credential goes
       * second.
       */}
      <ol className="m-0 flex w-full list-none flex-col gap-2 p-0 text-left">
        {[copy.panic.step1, copy.panic.step2].map((step, i) => (
          <li key={step} className="flex gap-2.5 rounded-lg bg-sunken/70 px-3 py-2 text-[12.5px] text-ink">
            <span className="t-num mt-px shrink-0 text-[11px] text-faint">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </DangerSheet>
  );
}
