import { useState } from 'react';
import { useRoute } from './lib/route.ts';
import { AppShell } from './components/AppShell.tsx';
import { Landing } from './components/screens/Landing.tsx';
import { SetupDialog } from './components/SetupDialog.tsx';
import { LiveView } from './components/screens/LiveView.tsx';
import { Ceremony } from './components/screens/Ceremony.tsx';
import { copy } from './copy.ts';
import { fixtures } from './fixtures.ts';
import { useSimulatedFeed } from './lib/feed.ts';
import { useWallet } from './lib/wallet.ts';
import { useCeremony } from './lib/ceremony.ts';

/**
 * Skeleton wiring. `fixtures` stands in for every reader — contract reads, the subgraph, and the
 * Substreams refusal counter — so no component knows where its data comes from.
 */
export default function App() {
  // The address bar decides which screen this is, so a reload stays where it was and the board can
  // be linked to.
  const [screen, setScreen] = useRoute();
  const [draftBps, setDraftBps] = useState(fixtures.floor.maxAdverseBps);
  const [purpose, setPurpose] = useState<'mandate' | 'lower'>('mandate');
  // Opens itself once for an owner whose vault is not configured, and closes for good if they
  // would rather look around first.
  const [setupOpen, setSetupOpen] = useState(true);
  // Until the router is deployed nothing produces fills, so a dev-only feed drives the tape and
  // the number strip says so. See src/lib/feed.ts.
  const { state: fed, source } = useSimulatedFeed(fixtures);
  const wallet = useWallet();

  // Real balances replace the fixture inventory the moment a wallet is connected, so the desk
  // stops describing a vault nobody owns.
  const ceremony = useCeremony(wallet.address, 0);
  const withHoldings = wallet.holdings ? { ...fed, inventory: wallet.holdings } : fed;
  const withDelegate = ceremony.delegate ? { ...withHoldings, delegate: ceremony.delegate } : withHoldings;
  // The registry's answer wins over the fixture's, including when the answer is "nothing is set".
  const state = ceremony.floor ? { ...withDelegate, floor: ceremony.floor } : withDelegate;

  // Lowering is answered in the sheet on the board now; this only records what was signed.
  const lower = (bps: number) => setDraftBps(bps);

  if (screen === 'landing') return <Landing onNavigate={setScreen} />;


  const needsSetup = ceremony.isOwner === true && ceremony.steps.some((step) => !step.done);

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
          onConnect={wallet.connect}
          connected={Boolean(wallet.address)}
          onSetup={needsSetup ? () => setSetupOpen(true) : null}
          onLower={lower}
          onRaise={(bps) => alert(`raiseFloor(${state.pair.base}, ${state.pair.quote}, ${bps}, absoluteRate)`)}
        />
      )}
      {needsSetup && (
        <SetupDialog
          state={state}
          wallet={wallet}
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          onSign={() => {
            setPurpose('mandate');
            setScreen('ceremony');
          }}
          onNavigate={setScreen}
        />
      )}

      {screen === 'ceremony' && (
        <Ceremony
          state={state}
          draftBps={draftBps}
          purpose={purpose}
          onDone={() => setScreen('live')}
          onBack={() => setScreen('live')}
        />
      )}
    </AppShell>
  );
}
