import { useEffect, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { copy } from '../copy.ts';

/**
 * The frame every destructive confirmation wears, so there is only one of them to recognise.
 *
 * Hazard tape along the top, a frame that glows red rather than sitting on a rule, and the mascot
 * leaning in from outside the left edge — which is why `overflow: visible` is load-bearing here and
 * why this cannot reuse `.sheet`.
 *
 * **What it deliberately does not fix is the weight.** Stopping the agent revokes a credential that
 * cannot be restored; emptying the vault sends the tokens back to the address that owns them. Both
 * are destructive and only one is irreversible, so the acknowledgement and the line about decisions
 * that cannot be undone are passed in rather than baked in. A dialog that claims irreversibility
 * for a reversible act teaches the owner to stop reading it, and then the one that means it is
 * read the same way.
 *
 * Native <dialog>: focus trapping, Esc, the page behind going inert and the top layer are the
 * browser's, and each is something a hand-rolled modal gets subtly wrong.
 */
export function DangerSheet({
  open,
  onClose,
  title,
  lead,
  children,
  ack,
  confirmLabel,
  confirmIcon,
  onConfirm,
  busy = false,
  busyLabel,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  lead: string;
  /** The detail of what is about to happen. Numbered steps, a balance, whatever the act needs. */
  children?: ReactNode;
  /** Present only where the act cannot be undone: the sentence, and the tick that arms the button. */
  ack?: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void };
  confirmLabel: string;
  confirmIcon?: ReactNode;
  onConfirm: () => void;
  busy?: boolean;
  busyLabel?: string;
  /** The closing line under the rule. Only true for some of these, so only passed by those. */
  footer?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const armed = !ack || ack.checked;

  return (
    <dialog
      ref={ref}
      className="danger-sheet w-[min(560px,calc(100vw-32px))]"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {/*
       * The one piece of pure signalling here. It says "this is the destructive one" before a word
       * is read, and it is drawn rather than an image so it stays crisp at any width.
       */}
      <div className="danger-tape" />

      <div className="relative flex gap-1 px-6 pt-6 pb-5 max-[520px]:block">
        {/*
         * Leaning in from outside the frame. Decoration, so aria-hidden — the warning is carried by
         * the triangle, the title and the text, all of which are read.
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

          <h2 className="m-0 font-serif text-[27px] leading-tight font-normal text-refuse">{title}</h2>

          <p className="m-0 max-w-[36ch] text-[13.5px] text-muted">{lead}</p>

          {children}

          {ack && (
            <label className="flex cursor-pointer items-start gap-2.5 self-stretch text-left text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={ack.checked}
                onChange={(e) => ack.onChange(e.target.checked)}
                className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-[var(--c-panic-face)]"
              />
              <span>{ack.label}</span>
            </label>
          )}

          <div className="mt-1 flex w-full items-center justify-center gap-3 max-[520px]:justify-start">
            <button
              onClick={onClose}
              className="pushable push-quiet mb-1.5 cursor-pointer rounded-xl px-5 py-2.5 text-xs tracking-[0.06em]"
            >
              {copy.panic.cancel}
            </button>
            {/*
             * aria-disabled rather than disabled: a disabled button takes no focus, shows no hover
             * and gives no reason, so someone who has not ticked the box is told nothing about why
             * nothing happened. This one keeps its title and simply does not fire.
             */}
            <button
              onClick={() => armed && !busy && onConfirm()}
              aria-disabled={!armed || busy}
              title={armed ? undefined : ack?.hint}
              className="pushable push-panic mb-1.5 cursor-pointer rounded-xl px-5 py-2.5 text-xs font-semibold tracking-[0.06em]"
            >
              <span className="flex items-center gap-2">
                {confirmIcon}
                {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
              </span>
            </button>
          </div>

          {footer && (
            <p className="danger-rule m-0 mt-1 w-full text-[10.5px] tracking-[0.18em] text-faint uppercase">
              {footer}
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}
