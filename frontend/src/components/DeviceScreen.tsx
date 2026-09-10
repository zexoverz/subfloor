import { useLayoutEffect, useRef, useState } from 'react';
import { Check, Usb, X } from 'lucide-react';
import { Hoverable } from './Hoverable.tsx';

/**
 * What the Ledger renders, drawn as the device draws it.
 *
 * The web copy and the device copy must match verbatim — same strings, same order, from one
 * ERC-7730 descriptor — because the habit this teaches, "confirm only if it matches", is the one
 * thing that defeats a compromised frontend. Drawing it as the device draws it is what makes the
 * comparison a glance rather than a reading: the reader is matching two pictures, not parsing two
 * lists.
 *
 * It briefly became a line of terminal output and then briefly became an overlay pasted onto the
 * illustration's own drawn screen. The lines were true and hard to compare; the overlay was exact
 * and measured off artwork that nobody would know to re-measure. This is the version that was right
 * before either.
 *
 * Full width of whatever holds it. It was capped at 268px, which is roughly a Nano's screen if you
 * squint — but this is not a photograph of the device, it is the same words the device will show,
 * and pinning them to the physical width only left a column half empty beside the values they are
 * meant to be compared against.
 *
 * Set in the mono this project already loads rather than a pixel face fetched for one panel. A Nano
 * renders a small fixed-width font on a 128×64 monochrome screen, and what carries that is the
 * even advance and the tight tracking — the same properties that make the two lists comparable at a
 * glance, which is the point of drawing it this way at all. A true pixel face would be sharper and
 * would cost a fourth font for eleven lines of text; it is one `font-family` away if it is wanted.
 */

/** The device's answer, once it has given one. */
export type Answer = 'approved' | 'rejected';

/** `.screen-answer`'s 460ms transition plus a frame, so the card is never removed mid-travel. */
const SLIDE = 480;

/** Where the winning button started, in pixels from each edge of the panel. */
type Seat = { top: number; left: number; right: number; bottom: number };

/**
 * Ledger's frame mark, drawn rather than fetched.
 *
 * Two brackets facing each other, which is the shape the device itself wears above the word on its
 * case — and the shape the illustration draws on the one in the mascot's hands. It sits on the
 * screen for the same reason the scanlines do: this panel is a claim about what a specific device
 * will show, and an unbranded dark box is a claim about nothing.
 */
function LedgerMark({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square">
        <path d="M3 8V3h5" />
        <path d="M16 3h5v5" />
        <path d="M21 16v5h-5" />
        <path d="M8 21H3v-5" />
      </g>
    </svg>
  );
}

export function DeviceScreen({
  rows,
  waiting = true,
  answer = null,
  device,
}: {
  rows: [string, string][];
  waiting?: boolean;
  /**
   * Whether a device has answered an enumeration yet, shown as the screen's own status corner.
   *
   * It was a line of text under the panel, which put a fact about the cable in the same weight as
   * the transaction being reviewed. On the screen it is what it is — a connection light — and the
   * sentence is still there for anyone who wants it, one hover away.
   */
  device?: { paired: boolean; hint: string };
  /**
   * When the device has answered, the button it answered with grows out of its own place and takes
   * the screen. The answer is reported where the question was asked, which is the whole reason this
   * panel is a screen and not a list.
   */
  answer?: Answer | null;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const approve = useRef<HTMLElement>(null);
  const reject = useRef<HTMLElement>(null);
  /** Measured rather than written down: the buttons are a flex row and their halves move with it. */
  const [seat, setSeat] = useState<Seat | null>(null);
  const [grown, setGrown] = useState(false);
  /**
   * What is on screen, which outlives the answer that put it there.
   *
   * Asking again clears `answer`, and unmounting on that would make the way back a disappearance.
   * The card that grew out of Approve goes back into Approve, and only then stops existing.
   */
  const [shown, setShown] = useState<Answer | null>(null);

  useLayoutEffect(() => {
    if (!answer) {
      setGrown(false);
      // Long enough for the shrink to finish, and it must not be a `transitionend` — reduced motion
      // removes the transition, and then the event never fires and the card never leaves.
      const done = setTimeout(() => setShown(null), SLIDE);
      return () => clearTimeout(done);
    }
    const p = panel.current?.getBoundingClientRect();
    const b = (answer === 'approved' ? approve : reject).current?.getBoundingClientRect();
    if (!p || !b) return;
    setSeat({
      top: b.top - p.top,
      left: b.left - p.left,
      right: p.right - b.right,
      bottom: p.bottom - b.bottom,
    });
    setShown(answer);
    /*
     * Two frames, not one. A layout effect runs before this frame's rendering steps and so does a
     * single rAF callback — the seat would never be painted and the growth would be a jump. The
     * second frame is the first one that can see where it started from.
     */
    let inner = 0;
    let hold: ReturnType<typeof setTimeout> | undefined;
    let gone: ReturnType<typeof setTimeout> | undefined;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setGrown(true);
        /*
         * Held half a second, then it puts itself away.
         *
         * The answer is a moment, not a state — leaving it over the screen meant the only way back
         * to the rows that were signed was to ask the device all over again. Now the review is what
         * the panel returns to, and reading what was approved costs nothing.
         */
        hold = setTimeout(() => {
          setGrown(false);
          gone = setTimeout(() => setShown(null), SLIDE);
        }, SLIDE + 500);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      clearTimeout(hold);
      clearTimeout(gone);
    };
  }, [answer]);

  const skin =
    shown === 'approved' ? { background: '#14261F', color: '#57AC8C' } : { background: '#2A1614', color: '#E2705F' };

  return (
    <div
      ref={panel}
      className="device-screen relative w-full overflow-hidden rounded-xl bg-[#0A0C10] px-4 py-3.5 font-mono text-[11px] leading-[1.75] tracking-[0.02em] text-[#F2F4F7] tabular-nums"
    >
      <div className="mb-2.5 flex items-center gap-2 text-[10px] tracking-[0.16em] text-[#7C8794] uppercase">
        <LedgerMark />
        Review transaction
        {device && (
          <Hoverable content={device.hint}>
            <span
              className="ml-auto flex cursor-help items-center"
              style={{ color: device.paired ? '#57AC8C' : '#5A6472' }}
              aria-label={device.hint}
            >
              <Usb size={12} strokeWidth={2} />
            </span>
          </Hoverable>
        )}
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="text-[#7C8794]">{k}</span>
          <span className="text-right">{v}</span>
        </div>
      ))}
      <div className="pixel-rule mt-3" />
      <div className="mt-2.5 flex gap-2 text-[10.5px]">
        <b
          ref={reject}
          className="flex-1 rounded-md bg-[#2A1614] py-1.5 text-center tracking-[0.08em] text-[#E2705F] uppercase"
        >
          Reject
        </b>
        <b
          ref={approve}
          className={`flex-1 rounded-md bg-[#14261F] py-1.5 text-center tracking-[0.08em] text-[#57AC8C] uppercase ${waiting ? 'animate-pulse' : ''}`}
        >
          Approve
        </b>
      </div>

      {/*
       * Below the scanlines on purpose: no z-index here, and ::after is generated last, so the
       * answer is lit behind the same glass as the words it replaces rather than pasted on top.
       */}
      {shown && seat && (
        <div
          className="screen-answer tracking-[0.14em] uppercase"
          data-grown={grown || undefined}
          style={{
            ...skin,
            top: grown ? 0 : seat.top,
            left: grown ? 0 : seat.left,
            right: grown ? 0 : seat.right,
            bottom: grown ? 0 : seat.bottom,
          }}
          role="status"
        >
          {shown === 'approved' ? <Check size={16} strokeWidth={2.4} /> : <X size={16} strokeWidth={2.4} />}
          {shown === 'approved' ? 'Approved' : 'Rejected'}
        </div>
      )}
    </div>
  );
}
