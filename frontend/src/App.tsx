import { useState } from 'react';
import { useRoute } from './lib/route.ts';
import { usePanic } from './lib/panic.ts';
import { useIndex } from './lib/subgraph.ts';
import { StoppedState } from './components/StoppedState.tsx';
import { Toasts } from './components/Toasts.tsx';
import { addresses } from './lib/contracts.ts';
import { AppShell } from './components/AppShell.tsx';
import { Landing } from './components/screens/Landing.tsx';
import { SetupDialog } from './components/SetupDialog.tsx';
import { LiveView } from './components/screens/LiveView.tsx';
import { Ceremony } from './components/screens/Ceremony.tsx';
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
  const { state: fed, source: feedSource } = useSimulatedFeed(fixtures);
  /*
   * §10: every number on the live view is read from the index, the same queries the public page
   * runs. Where the index has answered, it wins over both the fixtures and the simulated feed —
   * and where it has not, nothing pretends it did.
   */
  const index = useIndex();
  const source = index.source === 'chain' ? 'chain' : feedSource;
  const wallet = useWallet();

  // Real balances replace the fixture inventory the moment a wallet is connected, so the desk
  // stops describing a vault nobody owns.
  const ceremony = useCeremony(wallet.address, 0);
  const indexed = {
    ...fed,
    ...(index.tape ? { tape: index.tape } : {}),
    ...(index.stats ? { stats: { ...fed.stats, ...index.stats } } : {}),
  };
  const withHoldings = wallet.holdings ? { ...indexed, inventory: wallet.holdings } : indexed;
  const withDelegate = ceremony.delegate ? { ...withHoldings, delegate: ceremony.delegate } : withHoldings;
  // The registry's answer wins over the fixture's, including when the answer is "nothing is set".
  const withFloor = ceremony.floor ? { ...withDelegate, floor: ceremony.floor } : withDelegate;
  const state = ceremony.feed
    ? { ...withFloor, reference: { ...withFloor.reference, feed: ceremony.feed } }
    : withFloor;

  // Lowering is answered in the sheet on the board now; this only records what was signed.
  const lower = (bps: number) => setDraftBps(bps);

  if (screen === 'landing')
    return (
      <>
        <Landing onNavigate={setScreen} />
        <Toasts />
      </>
    );


  const needsSetup = ceremony.isOwner === true && ceremony.steps.some((step) => !step.done);
  const panic = usePanic(wallet.address);

  return (
    <AppShell
      screen={screen}
      onNavigate={setScreen}
      /*
       * §10 fixes the order: dock through canonical Aqua first, because it works even if the
       * modified router is bricked, then revoke the credential. The app is the strategy holder, so
       * it is the one being docked.
       */
      onPanic={() => void panic.stop(addresses.aqua as `0x${string}`, `0x${'0'.repeat(64)}`)}
      state={state}
      source={source}
      wallet={wallet}
      owner={ceremony.isOwner === true}
      // The board gets the width whoever is reading it.
      wide={screen === 'live'}
    >
      {panic.stage === 'stopped' ? (
        <StoppedState state={state} onWithdraw={() => void panic.withdraw()} />
      ) : (
        <>
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
        </>
      )}
      <Toasts />
    </AppShell>
  );
}
