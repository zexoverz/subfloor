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
 * Set in the mono this project already loads rather than a pixel face fetched for one panel. A Nano
 * renders a small fixed-width font on a 128×64 monochrome screen, and what carries that is the
 * even advance and the tight tracking — the same properties that make the two lists comparable at a
 * glance, which is the point of drawing it this way at all. A true pixel face would be sharper and
 * would cost a fourth font for eleven lines of text; it is one `font-family` away if it is wanted.
 */
export function DeviceScreen({ rows, waiting = true }: { rows: [string, string][]; waiting?: boolean }) {
  return (
    <div className="device-screen relative w-full max-w-[268px] overflow-hidden rounded-xl bg-[#0A0C10] px-4 py-3.5 font-mono text-[11px] leading-[1.75] tracking-[0.02em] text-[#F2F4F7] tabular-nums">
      <div className="mb-2.5 text-[10px] tracking-[0.16em] text-[#7C8794] uppercase">Review transaction</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="text-[#7C8794]">{k}</span>
          <span className="text-right">{v}</span>
        </div>
      ))}
      <div className="mt-3 flex gap-2 border-t border-[#22282F] pt-2.5 text-[10.5px]">
        <b className="flex-1 rounded-md bg-[#2A1614] py-1.5 text-center tracking-[0.08em] text-[#E2705F] uppercase">Reject</b>
        <b className={`flex-1 rounded-md bg-[#14261F] py-1.5 text-center tracking-[0.08em] text-[#57AC8C] uppercase ${waiting ? 'animate-pulse' : ''}`}>
          Approve
        </b>
      </div>
    </div>
  );
}
