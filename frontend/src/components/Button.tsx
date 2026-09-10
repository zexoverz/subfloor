import { ChevronLeft, KeyRound, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = { children: ReactNode; onClick?: () => void; disabled?: boolean };

/**
 * The affirmative action.
 *
 * Blue, and pushable when it is primary: the affirmative action on this board deploys, funds or
 * signs something, so it should feel like a key going down rather than a link lighting up. The
 * secondary stays flat — if both are raised, neither is.
 *
 * Blue, as everywhere in Oku: it is what the application does. Brass is kept for the floor — the
 * owner's own number — so the two never compete. When every button was floor, the one colour that
 * was supposed to mean "your decision" meant "a button", and the floor stopped standing out on
 * the screen built around it.
 */
export function Act({
  children,
  onClick,
  disabled,
  primary = false,
  wide = false,
  busy = false,
  busyLabel,
  ceremony = false,
  ...rest
}: Props & {
  primary?: boolean;
  wide?: boolean;
  busy?: boolean;
  busyLabel?: string;
  /** The gradient face, for the two buttons that end a step of the setup ceremony and no others. */
  ceremony?: boolean;
  /**
   * Inert with a reason, which is not the same as disabled.
   *
   * A `disabled` button takes no focus, shows no hover and answers no question, so someone who
   * cannot press it is told nothing about why. This one keeps its title and simply does not fire —
   * and the caller is responsible for not firing, because `aria-disabled` is a promise to the
   * reader rather than to the browser.
   */
  'aria-disabled'?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      aria-disabled={rest['aria-disabled'] || undefined}
      title={rest['aria-disabled'] ? rest.title : busy ? busyLabel : rest.title}
      // The words still exist for anyone who cannot see the spinner turn.
      aria-busy={busy || undefined}
      aria-label={busy ? busyLabel : undefined}
      className={`cursor-pointer rounded-xl px-3.5 py-2.5 text-xs tracking-[0.06em] disabled:cursor-not-allowed ${
        wide ? 'w-full' : ''
      } ${
        primary
          ? `pushable mb-1.5 font-semibold ${ceremony ? 'push-floor' : 'push-action'} ${rest['aria-disabled'] ? 'opacity-55' : ''}`
          : 'pushable push-quiet mb-1.5'
      }`}
    >
      {/*
       * A spinner rather than a sentence. "waiting for your wallet…" is longer than the label it
       * replaces, so the button either grew or the words wrapped inside it — and a control that
       * changes shape while you wait reads as the page breaking rather than as the page working.
       * The sentence moves to the label, where it costs no width.
       */}
      {busy ? <Loader2 size={14} strokeWidth={2} className="mx-auto animate-spin" /> : children}
    </button>
  );
}

/**
 * The action the address alone cannot take. The key is the device: it appears only on moves that
 * weaken protection, which is the whole asymmetry rendered as one glyph.
 *
 * `weakening` turns it red. Lowering a floor is the one press on this board that leaves the owner
 * with less protection than before, and it should not look like every other quiet control.
 */
export function Locked({
  children,
  onClick,
  wide = false,
  weakening = false,
}: Props & { wide?: boolean; weakening?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`pushable mb-1.5 cursor-pointer rounded-xl px-3.5 py-2.5 text-xs tracking-[0.06em] ${
        weakening ? 'push-panic font-semibold' : 'push-quiet'
      } ${wide ? 'w-full' : ''}`}
    >
      <span className={`flex items-center gap-2 ${wide ? 'justify-center' : ''}`}>
        {/*
         * The glyph is the device, and its colour is what the press does. Cyan where the device is
         * simply required; red where the press weakens the guarantee, which is the only action on
         * this board that does — and a red key is a truer warning than a red word, because it is
         * the key itself that authorises the weakening.
         */}
        <KeyRound size={13} strokeWidth={1.7} className={weakening ? '' : 'text-floor'} />
        {children}
      </span>
    </button>
  );
}

/**
 * The quiet action in a card header. `label` makes it icon-only: the glyph carries it on screen
 * and the label carries it everywhere else, which is the only honest way to drop the words — a
 * button whose text is gone and whose name is gone too is a button nobody can find.
 */
/**
 * The way out, as a chevron.
 *
 * It used to be the word "back" in a row with the affirmative button, and only after a decline —
 * which made leaving look like one of two answers to the question, and made it unavailable to
 * anyone who simply changed their mind before asking. A chevron in the corner is the shape every
 * other application uses for this, and it can stay there the whole time without competing.
 */
export function Back({ onClick, label = 'back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="-ml-1.5 flex cursor-pointer items-center rounded-lg p-1 text-faint transition-colors hover:text-ink"
    >
      <ChevronLeft size={15} strokeWidth={2} />
    </button>
  );
}

export function Ghost({ children, onClick, label }: Props & { label?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="pushable push-quiet mb-1 cursor-pointer rounded-lg px-2.5 py-1.5 text-[11.5px]"
    >
      {children}
    </button>
  );
}

/** Safer is left, riskier is right, and the direction is labelled rather than assumed. */
export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format,
}: {
  value: number;
  onChange: (n: number) => void;
  step: number;
  min: number;
  max: number;
  format: (n: number) => string;
}) {
  return (
    <span className="inline-flex overflow-hidden rounded-xl border border-rule">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        aria-label="safer"
        className="h-8.5 w-8 cursor-pointer bg-surface hover:bg-sunken"
      >
        −
      </button>
      <span className="grid min-w-[78px] place-items-center border-x border-rule font-semibold">{format(value)}</span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        aria-label="riskier"
        className="h-8.5 w-8 cursor-pointer bg-surface hover:bg-sunken"
      >
        +
      </button>
    </span>
  );
}
