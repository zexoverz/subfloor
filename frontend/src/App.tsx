import { useState } from 'react';
import { AppShell } from './components/AppShell.tsx';
import { Onboarding } from './components/screens/Onboarding.tsx';
import { FloorScreen } from './components/screens/FloorScreen.tsx';
import { LiveView } from './components/screens/LiveView.tsx';
import { Ceremony } from './components/screens/Ceremony.tsx';
import { PublicPage } from './components/screens/PublicPage.tsx';
import { copy } from './copy.ts';
import { fixtures } from './fixtures.ts';
import type { Screen } from './types.ts';

/**
 * Skeleton wiring. `fixtures` stands in for every reader — contract reads, the subgraph, and the
 * Substreams refusal counter — so no component knows where its data comes from.
 */
export default function App() {
  const [screen, setScreen] = useState<Screen>('live');
  const [draftBps, setDraftBps] = useState(fixtures.floor.maxAdverseBps);
  const state = fixtures;

  const lower = (bps: number) => {
    setDraftBps(bps);
    setScreen('ceremony');
  };

  return (
    <AppShell screen={screen} onNavigate={setScreen} onPanic={() => alert(copy.panic.done)}>
      {screen === 'onboarding' && (
        <Onboarding state={state} onAdjust={() => setScreen('floor')} onSign={() => setScreen('ceremony')} />
      )}
      {screen === 'floor' && (
        <FloorScreen
          state={state}
          onLower={lower}
          onRaise={(bps) => alert(`raiseFloor(${state.pair.base}, ${state.pair.quote}, ${bps}, absoluteRate)`)}
        />
      )}
      {screen === 'live' && <LiveView state={state} />}
      {screen === 'ceremony' && (
        <Ceremony state={state} draftBps={draftBps} onDone={() => setScreen('live')} onBack={() => setScreen('floor')} />
      )}
      {screen === 'public' && <PublicPage state={state} />}
    </AppShell>
  );
}
