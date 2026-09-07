import { useState } from 'react';
import { useRoute } from './lib/route.ts';
import { usePanic } from './lib/panic.ts';
import { useOwnVault } from './lib/vault.ts';
import { useFloor } from './lib/floor.ts';
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
  /*
   * The mandate is signed inside the setup sheet now, so the only ceremony this route can still be
   * about is loosening a floor — the other moment that needs the device. Nothing navigates here
   * yet; lowering is unwired, like the guardian and delegate steps.
   */
  const purpose = 'lower' as const;
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
  const wallet = useWallet();
  /*
   * Whose vault is on screen. A wallet that deployed its own through the factory (#132) sees that
   * one; everyone else reads ours. Resolving it here rather than per component is what stops half
   * the board describing one vault while the other half describes another.
   */
  const own = useOwnVault(wallet.address);
  const vault = own.vault ?? ((addresses.vault || null) as `0x${string}` | null);
  const index = useIndex(vault);
  const source = index.source === 'chain' ? 'chain' : feedSource;
  // Every hook runs before the landing screen returns early: React counts hooks per render, and a
  // hook below that return would change the count the moment someone navigates on to the board.
  const panic = usePanic(wallet.address, vault);
  const floorWrite = useFloor(vault);

  const ceremony = useCeremony(wallet.address, vault);
  const indexed = {
    ...fed,
    ...(index.tape ? { tape: index.tape } : {}),
    ...(index.stats ? { stats: { ...fed.stats, ...index.stats } } : {}),
  };
  /*
   * "What is in the vault" has to be the vault's balance. This used to render the owner's wallet
   * holdings, which meant the card claimed the vault held tokens that had never left the wallet —
   * the same lie as a fixture labelled live, on the card the whole desk is named after.
   */
  const withHoldings = ceremony.inventory ? { ...indexed, inventory: ceremony.inventory } : indexed;
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
          onWithdraw={() =>
            void panic.withdraw().then(() => {
              ceremony.refresh();
              wallet.refresh();
            })
          }
          onCreateVault={own.create}
          creatingVault={own.creating}
          // Only offer it once the factory has actually said this wallet has none.
          canCreateVault={own.known && !own.vault}
          /*
           * Both answers, not one. isOwner is null until the ceremony has read the vault, and
           * treating null as "not the owner" is what made the card deliver a verdict on a question
           * still in flight.
           */
          vaultChecked={own.known && ceremony.settled}
          vaultError={own.error ?? ceremony.error}
          connected={Boolean(wallet.address)}
          onSetup={needsSetup ? () => setSetupOpen(true) : null}
          onLower={lower}
          /*
           * The registry decides what the floor is after this, not the button. It writes both
           * directions, waits for both to land, and then re-reads — so what the screen says next
           * comes from effectiveFloor rather than from the number that was typed.
           */
          onRaise={(bps) => void floorWrite.raise(bps).then(() => ceremony.refresh())}
        />
      )}
      {needsSetup && (
        <SetupDialog
          state={state}
          wallet={wallet}
          vault={vault}
          ceremony={ceremony}
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
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
      {/* The sheet carries its own while it is open; see SetupDialog. */}
      {!(needsSetup && setupOpen) && <Toasts />}
    </AppShell>
  );
}
