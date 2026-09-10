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
 */
export function DeviceScreen({ rows, waiting = true }: { rows: [string, string][]; waiting?: boolean }) {
  return (
    <div className="w-full max-w-[268px] rounded-xl border border-[#2A313C] bg-[#0A0C10] px-4 py-3.5 text-[11.5px] leading-[1.7] text-[#F2F4F7] shadow-card">
      <div className="mb-2.5 text-[11px] tracking-[0.13em] text-[#7C8794] uppercase">Review transaction</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="text-[#7C8794]">{k}</span>
          <span className="text-right">{v}</span>
        </div>
      ))}
      <div className="mt-3 flex gap-2 border-t border-[#2A313C] pt-2.5 text-[11.5px]">
        <b className="flex-1 rounded-xl bg-[#2A1614] py-1.5 text-center text-[#E2705F]">Reject</b>
        <b className={`flex-1 rounded-xl bg-[#14261F] py-1.5 text-center text-[#57AC8C] ${waiting ? 'animate-pulse' : ''}`}>
          Approve
        </b>
      </div>
    </div>
  );
}
