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

export function DeviceScreen({ rows, waiting = true }: { rows: [string, string][]; waiting?: boolean }) {
  return (
    <div className="device-screen relative w-full overflow-hidden rounded-xl bg-[#0A0C10] px-4 py-3.5 font-mono text-[11px] leading-[1.75] tracking-[0.02em] text-[#F2F4F7] tabular-nums">
      <div className="mb-2.5 flex items-center gap-2 text-[10px] tracking-[0.16em] text-[#7C8794] uppercase">
        <LedgerMark />
        Review transaction
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="text-[#7C8794]">{k}</span>
          <span className="text-right">{v}</span>
        </div>
      ))}
      <div className="pixel-rule mt-3" />
      <div className="mt-2.5 flex gap-2 text-[10.5px]">
        <b className="flex-1 rounded-md bg-[#2A1614] py-1.5 text-center tracking-[0.08em] text-[#E2705F] uppercase">Reject</b>
        <b className={`flex-1 rounded-md bg-[#14261F] py-1.5 text-center tracking-[0.08em] text-[#57AC8C] uppercase ${waiting ? 'animate-pulse' : ''}`}>
          Approve
        </b>
      </div>
    </div>
  );
}
