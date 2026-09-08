import { useEffect, useRef, useState } from 'react';
import { OctagonX, TriangleAlert } from 'lucide-react';
import { copy } from '../copy.ts';

/**
 * The confirmation before the agent is stopped.
 *
 * This replaces a press-and-hold, and the swap is a deliberate departure from §10, which asks for
 * a hold "not a confirmation modal — a scared user should not have to read a dialog". The
 * counter-argument that won: the second effect is irreversible in a way the first is not. Docking
 * can be undone by shipping again; a revoked credential cannot be restored, and issuing a new one
 * takes the device. A hold protects against the stray click and says nothing about what is about
 * to be lost, so an owner who did not know the credential was gone forever learns it afterwards.
 *
 * What survives from §10 is the part that mattered: still one gesture from anywhere, still no
 * device, and still impossible to fire by accident — the accident is caught by an acknowledgement
 * rather than by a timer.
 *
 * Native <dialog>, like every other sheet here: focus trapping, Esc, the page behind going inert
 * and the top layer are the browser's, and each is something a hand-rolled modal gets subtly wrong.
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
  const ref = useRef<HTMLDialogElement>(null);
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    // Every opening starts unacknowledged. Carrying the tick over would put a second visit one
    // click from stopping the agent, which is the accident this exists to prevent.
    if (open) setUnderstood(false);
  }, [open]);

  return (
    <dialog
      ref={ref}
      /*
       * Wider than the other sheets and with no clipping, because the mascot leans out of the left
       * edge. `overflow: visible` is the whole reason this cannot reuse `.sheet` as-is.
       */
      className="danger-sheet w-[min(560px,calc(100vw-32px))]"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {/*
       * Hazard tape along the top, which is the one piece of pure signalling here. It says
       * "this is the destructive one" before a word is read, and it is drawn rather than an image
       * so it stays crisp at any width.
       */}
      <div className="danger-tape" />

      <div className="relative flex gap-1 px-6 pt-6 pb-5 max-[520px]:block">
        {/*
         * Leaning in from outside the frame. Decoration, so aria-hidden — the warning is carried by
         * the triangle, the title and the acknowledgement, all of which are text.
         */}
        <img
          src="/mascot-alert.webp"
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute -top-10 -left-[104px] w-[188px] select-none max-[520px]:hidden"
          style={{ filter: 'drop-shadow(0 0 14px rgba(255, 107, 115, 0.35))' }}
        />

        <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center max-[520px]:items-start max-[520px]:text-left">
          <TriangleAlert size={38} strokeWidth={1.6} className="text-refuse" aria-hidden />

          <h2 className="m-0 font-serif text-[27px] leading-tight font-normal text-refuse">
            {copy.panic.confirmTitle}
          </h2>

          <p className="m-0 max-w-[36ch] text-[13.5px] text-muted">{copy.panic.confirmLead}</p>

          {/*
           * Numbered because the order is the mechanism rather than presentation: docking goes
           * through canonical Aqua first, so it works even if the router is unreachable, and the
           * credential goes second.
           */}
          <ol className="m-0 flex w-full list-none flex-col gap-2 p-0 text-left">
            {[copy.panic.step1, copy.panic.step2].map((step, i) => (
              <li key={step} className="flex gap-2.5 rounded-lg bg-sunken/70 px-3 py-2 text-[12.5px] text-ink">
                <span className="t-num mt-px shrink-0 text-[11px] text-faint">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <label className="flex cursor-pointer items-start gap-2.5 self-stretch text-left text-[12.5px] text-ink">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-[var(--c-panic-face)]"
            />
            <span>{copy.panic.ack}</span>
          </label>

          <div className="mt-1 flex w-full items-center justify-center gap-3 max-[520px]:justify-start">
            <button
              onClick={onClose}
              className="pushable push-quiet mb-1.5 cursor-pointer rounded-xl px-5 py-2.5 text-xs tracking-[0.06em]"
            >
              {copy.panic.cancel}
            </button>
            {/*
             * aria-disabled rather than disabled: a disabled button takes no focus, shows no hover
             * and gives no reason, so an owner who has not ticked the box is told nothing about why
             * nothing happened. This one keeps its title and simply does not fire.
             */}
            <button
              onClick={() => understood && onFire()}
              aria-disabled={!understood}
              title={understood ? undefined : copy.panic.ackHint}
              className="pushable push-panic mb-1.5 cursor-pointer rounded-xl px-5 py-2.5 text-xs font-semibold tracking-[0.06em]"
            >
              <span className="flex items-center gap-2">
                <OctagonX size={14} strokeWidth={1.9} />
                {copy.panic.label}
              </span>
            </button>
          </div>

          <p className="danger-rule m-0 mt-1 w-full text-[10.5px] tracking-[0.18em] text-faint uppercase">
            {copy.panic.undone}
          </p>
        </div>
      </div>
    </dialog>
  );
}
