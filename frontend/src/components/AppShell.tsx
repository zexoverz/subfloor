import type { ReactNode } from 'react';
import { copy } from '../copy.ts';
import { PanicButton } from './PanicButton.tsx';
import type { Screen } from '../types.ts';

const SCREENS: Screen[] = ['onboarding', 'floor', 'live', 'ceremony', 'public'];

export function AppShell({
  screen,
  onNavigate,
  onPanic,
  children,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  onPanic: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 border-b border-line px-6 py-3.5">
        <div className="font-semibold tracking-[0.34em]">{copy.brand}</div>

        {/* Skeleton affordance: the shipped app routes, it does not offer a screen picker. */}
        <nav className="ml-auto flex gap-1.5">
          {SCREENS.map((s) => (
            <button
              key={s}
              onClick={() => onNavigate(s)}
              aria-current={screen === s}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                screen === s ? 'border-line bg-line/40 text-ink' : 'border-line/60 text-dim hover:text-ink'
              }`}
            >
              {copy.nav[s]}
            </button>
          ))}
        </nav>

        {screen !== 'public' && <PanicButton onFire={onPanic} />}
      </header>

      <main className="mx-auto max-w-3xl px-6 pt-9 pb-20">{children}</main>
    </div>
  );
}
