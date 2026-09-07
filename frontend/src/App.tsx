import { useState } from 'react';
import { AppShell } from './components/AppShell.tsx';
import { Landing } from './components/screens/Landing.tsx';
import { Onboarding } from './components/screens/Onboarding.tsx';
import { LiveView } from './components/screens/LiveView.tsx';
import { Ceremony } from './components/screens/Ceremony.tsx';
import { copy } from './copy.ts';
import { fixtures } from './fixtures.ts';
import { useSimulatedFeed } from './lib/feed.ts';
import { useWallet } from './lib/wallet.ts';
import { useCeremony } from './lib/ceremony.ts';
import type { Screen } from './types.ts';

/**
 * Skeleton wiring. `fixtures` stands in for every reader — contract reads, the subgraph, and the
 * Substreams refusal counter — so no component knows where its data comes from.
 */
export default function App() {
  // The front door, not the desk: a stranger arriving at this URL has no vault to look at.
  const [screen, setScreen] = useState<Screen>('landing');
  const [draftBps, setDraftBps] = useState(fixtures.floor.maxAdverseBps);
  const [purpose, setPurpose] = useState<'mandate' | 'lower'>('mandate');
  // Until the router is deployed nothing produces fills, so a dev-only feed drives the tape and
  // the number strip says so. See src/lib/feed.ts.
  const { state: fed, source } = useSimulatedFeed(fixtures);
  const wallet = useWallet();

  // Real balances replace the fixture inventory the moment a wallet is connected, so the desk
  // stops describing a vault nobody owns.
  const ceremony = useCeremony(wallet.address, 0);
  const withHoldings = wallet.holdings ? { ...fed, inventory: wallet.holdings } : fed;
  const state = ceremony.delegate ? { ...withHoldings, delegate: ceremony.delegate } : withHoldings;

  // Lowering is answered in the sheet on the board now; this only records what was signed.
  const lower = (bps: number) => setDraftBps(bps);

  if (screen === 'landing') return <Landing onNavigate={setScreen} />;

  // First run is not a page of the app, it is the door to it: no tabs, no chips, no panic control,
  // because there is nothing yet to navigate to and nothing yet to stop.
  if (screen === 'onboarding') {
    return (
      <Onboarding
        state={state}
        wallet={wallet}
        onSign={() => {
          setPurpose('mandate');
          setScreen('ceremony');
        }}
        onNavigate={setScreen}
      />
    );
  }

  return (
    <AppShell
      screen={screen}
      onNavigate={setScreen}
      onPanic={() => alert(copy.panic.done)}
      state={state}
      source={source}
      wallet={wallet}
      owner={ceremony.isOwner === true}
      // The board gets the width whoever is reading it.
      wide={screen === 'live'}
    >
      {screen === 'live' && (
        <LiveView
          state={state}
          source={source}
          // One page in two states: the owner sees inventory, the standing floor and the agent;
          // everyone else sees the proof counter and the contracts in that column.
          owner={ceremony.isOwner === true}
          onNavigate={setScreen}
          onLower={lower}
          onRaise={(bps) => alert(`raiseFloor(${state.pair.base}, ${state.pair.quote}, ${bps}, absoluteRate)`)}
        />
      )}
      {screen === 'ceremony' && (
        <Ceremony
          state={state}
          draftBps={draftBps}
          purpose={purpose}
          onDone={() => setScreen('live')}
          onBack={() => setScreen('onboarding')}
        />
      )}
    </AppShell>
  );
}
