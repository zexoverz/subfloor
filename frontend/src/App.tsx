import { useCallback, useEffect, useState } from 'react';
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
import { LiveView } from './components/screens/LiveView.tsx';
import { AgentSheet } from './components/AgentSheet.tsx';
import { AgentDock } from './components/AgentDock.tsx';
import { Ceremony } from './components/screens/Ceremony.tsx';
import { MandateStrip } from './components/MandateStrip.tsx';
import { GuardianStrip } from './components/GuardianStrip.tsx';
import { copy } from './copy.ts';
import { fixtures } from './fixtures.ts';
import { useSimulatedFeed } from './lib/feed.ts';
import { useWallet } from './lib/wallet.ts';
import { useCeremony } from './lib/ceremony.ts';
import { useKeys } from './lib/keys.ts';
import { useLedger } from './lib/ledger.ts';
import { useCalibration } from './lib/calibration.ts';
import { runTourOnce } from './lib/tour.ts';

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
  /*
   * Which tape. Defaults to the vault's own, because that is the question the owner came with —
   * and switches to the venue when there is no vault to be the subject of the other one.
   */
  const [scope, setScope] = useState<'mine' | 'public'>('mine');
  const vault = own.vault ?? ((addresses.vault || null) as `0x${string}` | null);
  const mineIsPossible = Boolean(wallet.address && vault);
  const shownScope = mineIsPossible ? scope : 'public';
  const index = useIndex(vault, shownScope);
  const source = index.source === 'chain' ? 'chain' : feedSource;
  // Every hook runs before the landing screen returns early: React counts hooks per render, and a
  // hook below that return would change the count the moment someone navigates on to the board.
  const panic = usePanic(wallet.address, vault);
  const floorWrite = useFloor(vault);

  const ceremony = useCeremony(wallet.address, vault);

  /*
   * Read the two balances again, because a transfer that lands changes them and nothing else says
   * so. The vault's inventory comes from the ceremony read, the wallet's from the wallet — both are
   * cached until asked, so every path that moves money has to ask.
   */
  // Writes the vault's own two keys. The setup sheet has its own instance; these are plain wagmi
  // writes with no shared session, so a second one costs nothing.
  const ledger = useLedger();
  const keys = useKeys(vault, () => reread(), ceremony.registryGuardianSet);

  const reread = useCallback(() => {
    ceremony.refresh();
    wallet.refresh();
  }, [ceremony.refresh, wallet.refresh]);
  const calibration = useCalibration(index.tape);

  /*
   * The first minute, once, for a visitor who arrived with nobody beside them. It waits for the
   * board to lay itself out and cancels if they navigate away — a tour that opens over a screen
   * that has gone is worse than no tour.
   */
  useEffect(() => (screen === 'live' ? runTourOnce() : undefined), [screen]);
  /*
   * The tape is the index's, or it is nothing.
   *
   * It used to fall through to the simulated feed whenever the index had not answered, so every
   * load began with invented trades on the surface the product is read from — and a slow answer
   * looked exactly like a busy venue. The simulated feed stays for the dev switcher, which says
   * on screen that it is simulated; it is not a stand-in for not knowing yet.
   */
  const indexed = {
    ...fed,
    tape: index.tape ?? (feedSource === 'simulated' ? fed.tape : []),
    ...(index.stats ? { stats: { ...fed.stats, ...index.stats } } : {}),
    /*
     * What the agent is doing, from the index or not at all.
     *
     * The fixture said "quoting both sides ±35 bps, decaying · TWAP exit 0.4 WETH over 6h · auction
     * rebalance idle" on every board, for every vault, forever — three specific-sounding sentences
     * about strategies this vault has never run (#252). An empty list is the honest answer when the
     * index has not said: the zone renders nothing rather than something invented.
     */
    /*
     * Null passes through. `?? []` here was the whole bug: a rate-limited or failed index read left
     * `index.agent` null, this turned it into an empty list, and the card stated as fact that no
     * book was live — on a vault whose book the index could see perfectly well a second later.
     */
    agent: index.agent ?? (feedSource === 'simulated' ? fed.agent : null),
  };
  /*
   * "What is in the vault" has to be the vault's balance. This used to render the owner's wallet
   * holdings, which meant the card claimed the vault held tokens that had never left the wallet —
   * the same lie as a fixture labelled live, on the card the whole desk is named after.
   */
  const withHoldings = ceremony.inventory ? { ...indexed, inventory: ceremony.inventory } : indexed;
  const withDelegate = ceremony.delegate ? { ...withHoldings, delegate: ceremony.delegate } : withHoldings;
  // The registry's answer wins over the fixture's, including when the answer is "nothing is set".
  // The registered device, so a ceremony can compare it with the one actually attached rather
  // than producing a signature the chain will refuse.
  const withGuardian = {
    ...withDelegate,
    ...(ceremony.guardian ? { guardian: ceremony.guardian } : {}),
    vaultGuardian: ceremony.vaultGuardian,
    registryGuardian: ceremony.registryGuardian,
  };
  const withFloor = ceremony.floor ? { ...withGuardian, floor: ceremony.floor } : withGuardian;
  const withFeed = ceremony.feed
    ? { ...withFloor, reference: { ...withFloor.reference, feed: ceremony.feed } }
    : withFloor;
  /*
   * §4's non-negotiable, and until now it was not met: the floor screen's percentiles and its strip
   * of past fills both came from `fixtures.ts`. A wallet with no fills of its own was told a floor
   * would have refused seven of fifty — fifty fills that never happened, on the screen whose whole
   * argument is that the human is not signing a guess.
   *
   * The index's answer wins where there is one, and where there is not, nothing pretends there was.
   */
  const state = {
    ...withFeed,
    calibration: calibration.data ?? {
      /*
       * No answer is not the same as an answer of zero, and it must not become the fixture's.
       * The house default stays, because the handle has to start somewhere and that number is
       * labelled as a house number rather than as this venue's history — but the strip is empty and
       * the sample count is nought, so nothing on screen counts fills that were never read.
       */
      ...withFeed.calibration,
      sampleCount: 0,
      p50Bps: 0,
      p99Bps: 0,
      fillsBps: [],
    },
  };

  // Lowering is answered in the sheet on the board now; this only records what was signed.
  const lower = (bps: number) => setDraftBps(bps);
  /*
   * The agent sheet, and the dock that opens it. Held here rather than inside the board because it
   * is not the board's — it answers "whose address may trade a vault", which is a question somebody
   * asks before they have one.
   */
  const [agentsOpen, setAgentsOpen] = useState(false);

  if (screen === 'landing')
    return (
      <>
        <Landing onNavigate={setScreen} />
        <Toasts />
      </>
    );


  return (
    <AppShell
      screen={screen}
      onNavigate={setScreen}
      source={source}
      // Simulated says so on its own badge; only a real read has a wait worth showing.
      loading={feedSource !== 'simulated' && index.status === 'loading'}
      wallet={wallet}
      owner={ceremony.isOwner === true}
      // The board gets the width whoever is reading it.
      wide={screen === 'live'}
    >
      {panic.stage === 'stopped' ? (
        <StoppedState state={state} onWithdraw={() => void panic.withdraw().then(reread)} />
      ) : (
        <>
      {screen === 'live' && (
        <LiveView
          state={state}
          source={source}
          /* Simulated says so on its own badge; otherwise the reader's own state, unedited. */
          tapeStatus={feedSource === 'simulated' ? 'live' : index.status}
          vault={vault}
          wallet={wallet}
          walletAddress={wallet.address}
          walletHoldings={wallet.holdings}
          scope={shownScope}
          // No wallet, no "mine": the switch is hidden rather than offering a tape nobody owns.
          canScope={mineIsPossible}
          onScope={setScope}
          fetching={index.fetching}
          block={index.block}
          fetchedAt={index.fetchedAt}
          onRefresh={index.refresh}
          // One page in two states: the owner sees inventory, the standing floor and the agent;
          // everyone else sees the proof counter and the contracts in that column.
          owner={ceremony.isOwner === true}
          onNavigate={setScreen}
          onAgents={() => setAgentsOpen(true)}
          onConnect={wallet.connect}
          onWithdraw={() => void panic.withdraw().then(reread)}
          onMoved={reread}
          onCreateVault={own.create}
          creatingVault={own.creating}
          creatingStep={own.step}
          // Only offer it once the factory has actually said this wallet has none.
          canCreateVault={own.known && !own.vault}
          /*
           * Both answers, not one. isOwner is null until the ceremony has read the vault, and
           * treating null as "not the owner" is what made the card deliver a verdict on a question
           * still in flight.
           */
          vaultChecked={own.known && ceremony.settled}
          /*
           * Whose failure it was, not just that there was one. These are two different reads — the
           * factory's list of vaults, and the vault's own state — and both were rendered under
           * "could not reach the factory", so a vault read that reverted was reported as a factory
           * that could not be reached (#266). One string for two failures sent the last diagnosis
           * looking in the wrong contract.
           */
          vaultError={own.error ? `${copy.wallet.vaultReadFailed} ${own.error}` : ceremony.error ? `${copy.wallet.stateReadFailed} ${ceremony.error}` : null}
          connected={Boolean(wallet.address)}
          connecting={wallet.connecting}
          onSetAgent={async (next) => {
            await keys.setDelegate(next);
            reread();
          }}
          settingAgent={keys.sending}
          agentStep={keys.step}
          /*
           * The same call the header used to make. Docking stops trading and revoking the mandate
           * ends the authorisation; neither needs the device, which is the point of it.
           */
          ledger={ledger}
          guardianStrip={
            <GuardianStrip
              // The write-once one, which is the key a lowering is checked against.
              guardian={ceremony.registryGuardian}
              registered={ceremony.registryGuardianSet}
              owner={ceremony.isOwner === true}
              ledger={ledger}
              onSet={(next) => keys.setGuardian(next)}
              saving={keys.sending}
              savingStep={keys.step}
            />
          }
          mandate={
            ceremony.isOwner === true ? (
              <MandateStrip
                state={state}
                vault={vault as `0x${string}` | null}
                nonce={ceremony.nonce}
                wallet={wallet}
                ledger={ledger}
                onSigned={() => ceremony.refresh()}
                onPanic={() => void panic.stop(addresses.aqua as `0x${string}`, `0x${'0'.repeat(64)}`)}
              />
            ) : null
          }
          onLower={lower}
          /*
           * The registry decides what the floor is after this, not the button. It writes both
           * directions, waits for both to land, and then re-reads — so what the screen says next
           * comes from effectiveFloor rather than from the number that was typed.
           */
          onRaise={(bps) => void floorWrite.raise(bps).then(() => ceremony.refresh())}
        />
      )}

      {screen === 'ceremony' && (
        <Ceremony
          state={state}
          wallet={wallet}
          draftBps={draftBps}
          purpose={purpose}
          vault={vault}
          onDone={() => setScreen('live')}
          onBack={() => setScreen('live')}
        />
      )}
        </>
      )}
      <AgentDock onOpen={() => setAgentsOpen(true)} />
      <AgentSheet open={agentsOpen} onClose={() => setAgentsOpen(false)} />
      {/* One container, in the top layer — see Toasts. It no longer has to be hidden for a
          sheet to be able to raise one. */}
      <Toasts />
    </AppShell>
  );
}
