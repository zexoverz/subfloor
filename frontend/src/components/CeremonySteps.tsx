import { Check, KeyRound } from 'lucide-react';
import { copy } from '../copy.ts';
import type { Step } from '../lib/ceremony.ts';

/**
 * The setup as a list of facts read from the chain, not a wizard with a progress bar. A step that
 * someone completed from a script still shows as done, and a half finished setup resumes where it
 * actually is rather than where the browser remembers being.
 */
export function CeremonySteps({ steps, enabled }: { steps: Step[]; enabled: boolean }) {
  return (
    <ol className="m-0 list-none p-0">
      {steps.map((step, i) => (
        <li
          key={step.id}
          className={`flex items-start gap-3 border-b border-rule py-3 last:border-b-0 ${
            enabled ? '' : 'opacity-45'
          }`}
        >
          <span
            className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[10px] ${
              step.done ? 'border-settle bg-settle/10 text-settle' : 'border-rule text-faint'
            }`}
          >
            {step.done ? <Check size={12} strokeWidth={2.4} /> : i + 1}
          </span>

          <span className="flex-1">
            <span className="flex items-center gap-2 font-medium">
              {step.title}
              {step.device && <KeyRound size={13} strokeWidth={1.7} className="text-brass" />}
            </span>
            <span className="serif block text-[13.5px] leading-relaxed text-muted">{step.detail}</span>
          </span>

          {step.done && <span className="text-[10.5px] tracking-[0.1em] text-settle uppercase">{copy.wallet.done}</span>}
        </li>
      ))}
    </ol>
  );
}
