/**
 * What the Ledger renders, drawn as the device draws it. The web copy and the device copy must
 * match verbatim — same strings, same order, from one ERC-7730 descriptor — because the habit this
 * teaches ("confirm only if it matches") is the one thing that defeats a compromised frontend.
 */
export function DeviceScreen({
  rows,
  waiting = true,
  fill = false,
}: {
  rows: [string, string][];
  waiting?: boolean;
  /**
   * Fill the parent instead of sizing itself, and scale its own text with it.
   *
   * Used when this sits over the drawn device in the illustration, where the panel's size comes
   * from the artwork rather than from here. `cqw` is what makes that work without a second set of
   * sizes: every measurement below becomes a fraction of the panel's own width, so one component
   * serves a 246px card and a screen that is 18% of an image.
   */
  fill?: boolean;
}) {
  const p = (px: number, cq: number) => (fill ? `${cq}cqw` : `${px}px`);
  return (
    <div
      className={
        fill
          ? 'flex h-full w-full flex-col overflow-hidden bg-[#0A0C10] text-[#F2F4F7]'
          : 'w-[246px] rounded-xl border border-[#2A313C] bg-[#0A0C10] px-4 py-3.5 text-[11.5px] leading-[1.7] text-[#F2F4F7] shadow-card'
      }
      style={
        fill
          ? { borderRadius: '4cqw', padding: '6cqw 7cqw', fontSize: '5.4cqw', lineHeight: 1.7 }
          : undefined
      }
    >
      <div
        className="tracking-[0.13em] text-[#7C8794] uppercase"
        style={{ marginBottom: p(10, 4), fontSize: p(11, 5) }}
      >
        Review transaction
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between" style={{ gap: p(12, 4) }}>
          <span className="text-[#7C8794]">{k}</span>
          <span className="text-right">{v}</span>
        </div>
      ))}
      <div
        className="mt-auto flex border-t border-[#2A313C]"
        style={{ gap: p(8, 3), paddingTop: p(10, 4), marginTop: p(12, 5) }}
      >
        <b
          className="flex-1 rounded-xl bg-[#2A1614] text-center text-[#E2705F]"
          style={{ padding: `${p(6, 2)} 0` }}
        >
          Reject
        </b>
        <b
          className={`flex-1 rounded-xl bg-[#14261F] text-center text-[#57AC8C] ${waiting ? 'animate-pulse' : ''}`}
          style={{ padding: `${p(6, 2)} 0` }}
        >
          Approve
        </b>
      </div>
    </div>
  );
}
