import { copy } from '../copy.ts';

/**
 * The objections, answered in the open.
 *
 * Native <details> rather than a JS accordion: keyboard operable, reachable by the browser's own
 * find-in-page, and working before any script runs — this is the part a sceptical reader jumps to,
 * so it should be the part least able to break.
 *
 * The prior-art answer is open by default. Naming CoW Protocol is mandatory, and an obligation
 * discharged inside a collapsed panel is an obligation half discharged.
 */
export function Faq() {
  return (
    <div className="border-t border-rule">
      {copy.landing.faq.map((item, i) => (
        <details key={item.q} open={i === 2} className="group border-b border-rule">
          <summary className="flex cursor-pointer list-none items-baseline gap-4 py-5 [&::-webkit-details-marker]:hidden">
            <span className="w-6 shrink-0 text-[11px] text-faint tabular-nums">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="flex-1 text-[16px] font-medium tracking-tight">{item.q}</span>
            <span className="shrink-0 text-[18px] leading-none text-faint transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="serif mb-5 max-w-[68ch] pl-10 text-[15.5px] leading-relaxed text-muted">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
