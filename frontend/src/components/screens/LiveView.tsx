import { ArrowDownToLine, ChartLine, Receipt, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { copy } from '../../copy.ts';
import { Card, CardBody, CardHead } from '../Card.tsx';

import { Tile, Tiles } from '../Tiles.tsx';
import { Tape } from '../Tape.tsx';
import { FloorChart } from '../FloorChart.tsx';
import { AddressChip } from '../AddressChip.tsx';
import { PairIcons } from '../PairIcons.tsx';
import { RefreshBadge } from '../RefreshBadge.tsx';
import { ScopeSwitch } from '../ScopeSwitch.tsx';
import type { InitialSetup } from '../../lib/vault.ts';
import { PublicAside } from '../PublicAside.tsx';
import { FloorDialog } from '../FloorDialog.tsx';
import { AgentCard } from '../AgentCard.tsx';
import { FloorControl } from '../FloorControl.tsx';
import { ChainlinkMark, TokenIcon } from '../TokenIcon.tsx';
import { Act } from '../Button.tsx';
import { TopUp } from '../TopUp.tsx';
import { formatBps, formatPrice, rateToPrice } from '../../lib/rate.ts';
import { addressUrl } from '../../lib/chain.ts';
import type { DataSource, Screen, VaultState } from '../../types.ts';

/**
 * The desk: the owner's home while the agent trades. One rule — every number here is read from the
 * index, the same queries the public page runs, so the owner never sees a figure a stranger cannot
 * check. Refusals are a headline tile, never buried: they are the product's proudest number.
 */
export function LiveView({
  state,
  source,
  vault,
  wallet,
  walletAddress,
  walletHoldings,
  scope,
  onScope,
  canScope,
  fetching,
  block,
  fetchedAt,
  onRefresh,
  tapeStatus,
  owner,
  onNavigate,
  onLower,
  onRaise,
  onConnect,
  onWithdraw,
  onMoved,
  onCreateVault,
  creatingVault,
  creatingStep,
  canCreateVault,
  vaultChecked,
  vaultError,
  onSetAgent,
  settingAgent,
  agentStep,
  mandate,
  guardianStrip,
  ledger,
  connected,
  connecting,
}: {
  state: VaultState;
  source: DataSource;
  /** What the reader knows about the tape, so waiting is not drawn as data. */
  tapeStatus: 'loading' | 'live' | 'empty' | 'failed';
  /** The vault the tape is about, named on the card so a change of subject is visible. */
  vault: string | null;
  /** The whole connection, for the lowering ceremony — a guardian may be a soft wallet. */
  wallet: import('../../lib/wallet.ts').Wallet;
  /** Whose wallet is sending, and what it holds — the vault's own balances are a different list. */
  walletAddress: `0x${string}` | null;
  walletHoldings: import('../../types.ts').Holding[] | null;
  /** Which tape is on screen. Two questions, so two tapes rather than one with a hidden filter. */
  scope: 'mine' | 'public';
  onScope: (scope: 'mine' | 'public') => void;
  /** Whether "mine" has an owner at all. Without a wallet it does not, so the switch is not offered. */
  canScope: boolean;
  /** Freshness, shown rather than assumed: the board polls and never said so. */
  fetching: boolean;
  block: number | null;
  fetchedAt: number | null;
  onRefresh: () => void;
  /** True when the connected wallet owns the vault. False is what a stranger sees. */
  owner: boolean;
  onNavigate: (s: Screen) => void;
  onLower: (bps: number) => void;
  onRaise: (bps: number) => void;
  onConnect: () => void;
  /** Owner-only: the vault's withdraw, which is onlyOwner on chain too. */
  onWithdraw: () => void;
  /** Re-read the balances after money has moved in either direction. */
  onMoved: () => void;
  onCreateVault: (setup: InitialSetup) => void;
  creatingVault: boolean;
  /** What the deploy is doing: one call sets six things and it is slower than it looks. */
  creatingStep: string | null;
  canCreateVault: boolean;
  vaultChecked: boolean;
  vaultError: string | null;
  connected: boolean;
  /** So the connect button can turn instead of growing a sentence. */
  connecting: boolean;
  /** Null when the vault is configured; otherwise the way back into the ceremony. */
  /** Replacing the agent is an ordinary owner action, so it needs a way in after setup. */
  /** Non-null only for the owner: it is what tells the agent card who may edit and stop. */
  /** Point the vault at a different agent. `onlyOwner`, no signature, no device. */
  onSetAgent: (next: `0x${string}`) => Promise<void>;
  settingAgent: boolean;
  agentStep: string | null;
  /** The mandate strip, built where the nonce and the device are. */
  mandate?: import('react').ReactNode;
  /** The key that may lower this floor, built where the writes are. */
  guardianStrip?: import('react').ReactNode;
  /** One session for the whole board — see PublicAside. */
  ledger: import('../../lib/ledger.ts').Ledger;
}) {
  const [adjusting, setAdjusting] = useState(false);
  /*
   * What the handle is on, which starts where the registry is. Keyed on the registered number so a
   * floor that changes on chain — by this owner elsewhere, or by a guardian-signed lowering — moves
   * the handle with it rather than leaving a stale draft sitting on the card.
   */
  const [draft, setDraft] = useState(state.floor.maxAdverseBps);
  useEffect(() => setDraft(state.floor.maxAdverseBps), [state.floor.maxAdverseBps]);
  // One flag decides the badge and every provenance sentence on the screen, so the header and the
  // line under the tape can never again claim different things about the same rows.
  const live = source === 'chain';
  const { pair, stats, tape, agent, inventory, floor, floorBuy, reference } = state;
  // An unregistered floor is not a floor of zero, and rendering 0.00 would read as one.
  const sellFloor = rateToPrice(floor.absoluteRate, pair.baseDecimals, pair.quoteDecimals);
  const feedFresh = reference.ageSeconds < reference.stalenessBoundSeconds;

  return (
    <>
      <Tiles>
        <Tile
          label={copy.desk.fills}
          art="/tiles/fills.webp"
          value={stats.fills}
          sub={live ? `${copy.desk.fillsSub} · ${stats.since}` : copy.desk.fillsSubPending}
        />
        <Tile
          label={copy.desk.notional}
          art="/tiles/notional.webp"
          value={stats.notionalUsd}
          format={(n) => `$${n.toLocaleString('en-US')}`}
          sub={copy.desk.notionalSub}
        />
        <Tile
          label={copy.desk.markout}
          art="/tiles/markout.webp"
          value={stats.markout.s30}
          format={formatBps}
          sub={`${formatBps(stats.markout.s30)} / ${formatBps(stats.markout.m5)} / ${formatBps(stats.markout.h1)} · ${copy.desk.horizons}`}
          tone="settle"
        />
        <Tile
          label={copy.desk.worst}
          art="/tiles/worst.webp"
          value={stats.worstFillAboveFloorBps}
          format={formatBps}
          sub={copy.desk.worstSub}
        />
        <Tile
          label={copy.desk.refused}
          art="/tiles/refused.webp"
          value={stats.refused}
          sub={copy.desk.refusedSub}
          tone="refuse"
          tour="refused"
        />
      </Tiles>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4.5 max-[1000px]:grid-cols-1">
        {/*
          * The chart and the tape share one column, and the aside runs beside both.
          *
          * Full-bleed, the chart was a wide band drawn from a hundred points — most of its width
          * spent on air, and the reader's eye crossing the whole viewport to get from a bar to the
          * row that produced it. Stacked over the tape they share an x-axis by proximity, and the
          * panel is narrow enough that the shape has to be dense to fill it.
          */}
        <div className="flex min-w-0 flex-col gap-4.5">
        <Card tour="chart">
          <CardHead
            icon={ChartLine}
            left={
              <span className="flex items-center gap-2">
                <PairIcons base={pair.base} quote={pair.quote} size={18} />
                {pair.base} / {pair.quote} · {scope === 'mine' ? copy.desk.chartTitleMine : copy.desk.chartTitlePublic}
              </span>
            }
            /* The reference itself, since the chart below now plots distance from it rather than it. */
            right={`reference $${formatPrice(reference.price)}`}
          />
          <FloorChart state={state} status={tapeStatus} scope={scope} />
        </Card>
        {/*
          * No height of its own: it stretches to the row, which the column beside it defines. The
          * tape is the one thing here that changes without the owner doing anything, so its frame
          * has to be the one thing that does not move.
          */}
        {/*
          * flex-1, because the column above it changed. The tape used to stretch to a grid row the
          * aside defined; wrapped in a column with the chart it sizes to its own content instead,
          * and an empty tape left the panel a third of its height with the seabed showing under it.
          */}
        <Card tour="tape" className="flex flex-1 flex-col">
          <CardHead
            icon={Receipt}
            left={
              <span className="flex items-center gap-2">
                {copy.desk.tape}
                {/*
                 * Whose tape this is. Deploying a vault changes the subject of this card — the
                 * board follows the wallet's own vault, because attributing another vault's
                 * trades to it is the mistake this whole screen exists to avoid — and without the
                 * address on it, that change of subject reads as the data vanishing.
                 */}
                {scope === 'mine' && vault && <AddressChip address={vault} size={14} />}
              </span>
            }
            /*
             * No pair label beside the tabs. The chart above already names the pair, every row
             * carries both tokens, and a third statement of it was crowding the one control on
             * this card that changes what the card is about.
             */
            right={
              <span className="flex items-center gap-3">
                {/*
                 * Two tapes, not one with a filter. "My vault's trades" and "everything that
                 * settled here" answer different questions, and a board that silently switched
                 * between them when a vault was deployed is what sent someone looking for a bug.
                 */}
                {canScope && <ScopeSwitch scope={scope} onScope={onScope} />}
                <RefreshBadge
                  fetching={fetching}
                  block={block}
                  fetchedAt={fetchedAt}
                  onRefresh={onRefresh}
                />
              </span>
            }
          />
          <Tape entries={tape} pair={pair} status={tapeStatus} />
        </Card>
        </div>

        {owner ? (
        <div className="flex flex-col gap-4.5">
          <Card>
            <CardHead
              icon={Wallet}
              left={copy.desk.vault}
              // Nothing is "under mandate" until a delegate exists to hold one.
              right={state.delegate ? `${inventory.length} under mandate` : copy.wallet.noMandate}
            />
            <CardBody>
              <dl className="m-0 text-[12.5px]">
                {inventory.map((h) => (
                  <div key={h.symbol} className="flex items-baseline justify-between gap-3 py-1">
                    <dt className="flex items-center gap-2 text-[11.5px] tracking-[0.08em] text-faint uppercase">
                      <TokenIcon symbol={h.symbol} size={15} />
                      {h.symbol}
                    </dt>
                    <dd className="m-0 text-right font-medium">
                      {/* A read that failed is not a zero balance and must not be rendered as one. */}
                      {Number.isNaN(h.amount) ? '—' : h.amount}
                      {h.mandateMax !== undefined && (
                        <span className="ml-2 text-[11.5px] font-normal text-faint">of {h.mandateMax}</span>
                      )}
                    </dd>
                  </div>
                ))}
                <div className="mt-2 flex items-baseline justify-between gap-3 pt-1">
                  <dt className="text-[11.5px] tracking-[0.08em] text-faint uppercase">{copy.desk.marketPrice}</dt>
                  <dd className="m-0 text-right font-medium">{formatPrice(reference.price)}</dd>
                </div>
              </dl>
              <TopUp
                vault={vault as `0x${string}` | null}
                owner={walletAddress}
                holdings={walletHoldings}
                inventory={inventory}
                onWithdraw={onWithdraw}
                onMoved={onMoved}
              />

              <p className="mt-4 flex items-center gap-2 text-[11px] text-faint">
                <ChainlinkMark />
                {/* Linked, because "the reference" is a claim until someone can open it. */}
                {reference.feed ? (
                  <a
                    href={addressUrl(reference.feed)}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-floor"
                  >
                    {reference.name}
                  </a>
                ) : (
                  reference.name
                )}
                · {reference.ageSeconds}s
                <span className={feedFresh ? 'text-settle' : 'text-refuse'}>
                  <span className="mr-1 inline-block size-[6px] rounded-full bg-current align-[1px]" />
                  {feedFresh ? copy.desk.fresh : copy.desk.stale}
                </span>
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHead
              icon={ArrowDownToLine}
              left={copy.desk.standing}
              // Adjusted in place: leaving the board to change one number loses the tape, the
              // freshness reading and the fills the number is being judged against.
              right={
                /*
                 * Nothing. The card carries the control now, so the pencil opened a second way to
                 * do what is already on screen — and while setup is unfinished the sheet is reached
                 * from the setup card, which is one task with one entry rather than two.
                 */
                null
              }
            />
            <CardBody>
              {/*
                * The control itself, seeded with what the registry holds.
                *
                * It was three static rows, and two of them printed the wrong number: they rendered
                * `floor.absoluteRate` — the backstop, which is deliberately zero here — under a
                * caption naming the relative floor in bps. So a vault with a −50 bps floor read
                * "never below 0.00". The same mistake the indexer made and fixed: the floor on a
                * fill was the backstop, which is zero on every row here.
                *
                * Showing the live control rather than a picture of the number also removes the
                * reason the pencil existed. The value starts where the registry is, so nothing is
                * proposed until the owner moves it — which is the line §10 draws, and it is drawn
                * by the handle's position rather than by a second screen.
                */}
              <FloorControl
                bps={draft}
                referencePrice={reference.price}
                base={pair.base}
                quote={pair.quote}
                fillsBps={state.calibration.fillsBps}
                feed={reference.feed ?? null}
                onChange={setDraft}
              />

              {/*
                * Only once it differs from what is registered. A button offering to set the number
                * already set is a button that does nothing, and pressing it costs a transaction to
                * find that out.
                */}
              {/*
                * Always rendered, never disappearing. It sat behind `draft !== registered`, so the
                * card grew a button the moment the handle moved and lost it again when it went
                * back — the control jumping under the hand that is dragging it.
                *
                * Inert rather than absent when there is nothing to do, and it says which: a button
                * that vanishes teaches nothing, and one that fires a transaction to set the number
                * already set teaches it expensively.
                *
                * The asymmetry stays two different buttons. Tightening is one cheap transaction and
                * happens here; loosening needs the device, and that ceremony lives in the sheet, so
                * this opens it rather than pretending the card can finish the job. Routing it to
                * `onLower` was exactly that pretence — the handler only records the number, so the
                * button did nothing at all.
                */}
              {(() => {
                const unchanged = floor.enforced && draft === floor.maxAdverseBps;
                const tightening = !floor.enforced || draft < floor.maxAdverseBps;
                return (
                  <Act
                    wide
                    primary
                    ceremony
                    aria-disabled={unchanged}
                    title={unchanged ? copy.floor.alreadyThere : undefined}
                    onClick={() => {
                      if (unchanged) return;
                      // Both directions go through the sheet. Raising fired straight from the card,
                      // which made the two halves of one decision behave differently for a reason
                      // the reader cannot see — and the cheap half was the one with no confirmation
                      // at all. The sheet is where the number is shown against the fills it will be
                      // judged by, and that is worth a click in either direction.
                      setAdjusting(true);
                    }}
                  >
                    {!floor.enforced ? copy.floor.set : tightening ? copy.floor.raise : copy.floor.lower}
                  </Act>
                );
              })()}

              <p className="mt-2 mb-0 text-[11px] leading-relaxed text-faint">
                {/*
                  * The two things the control cannot show, said rather than drawn. The buying
                  * direction only when it differs, because equal is the normal case and repeating
                  * it is noise; and the backstop as a state rather than as a price, because "never
                  * below 0.00" is what a missing backstop looked like.
                  */}
                {floor.enforced && floorBuy.maxAdverseBps !== floor.maxAdverseBps
                  ? `${copy.desk.buying} ${pair.base}: −${floorBuy.maxAdverseBps} bps · `
                  : ''}
                {floor.absoluteRate > 0n
                  ? `${copy.desk.backstopNote}: ${formatPrice(sellFloor)}`
                  : copy.floor.noBackstop}
              </p>

              {guardianStrip}
            </CardBody>
          </Card>

          <AgentCard
            delegate={state.delegate}
            behaviour={agent}
            owner={owner}
            onSetAgent={onSetAgent}
            saving={settingAgent}
            savingStep={agentStep}
            mandate={mandate}
          />
        </div>
        ) : (
          <PublicAside
            state={state}
            connected={connected}
            connecting={connecting}
            onConnect={onConnect}
            onNavigate={onNavigate}
            onCreateVault={onCreateVault}
            creatingVault={creatingVault}
            creatingStep={creatingStep}
            canCreateVault={canCreateVault}
            checked={vaultChecked}
            vaultError={vaultError}
            ledger={ledger}
            walletAddress={walletAddress}
          />
        )}
      </div>

      {owner && (
        <FloorDialog
          state={state}
          wallet={wallet}
          open={adjusting}
          // Opened from the card's handle, so it starts where that handle was left rather than
          // making the owner find the same number a second time.
          startAt={draft}
          onClose={() => setAdjusting(false)}
          onLower={(bps) => {
            setAdjusting(false);
            onLower(bps);
          }}
          onRaise={(bps) => {
            setAdjusting(false);
            onRaise(bps);
          }}
        />
      )}

      <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-faint">
        <span>{live ? copy.desk.everyRowLive : copy.desk.everyRowSample}</span>
        <span className="text-muted">{copy.scope}.</span>
      </p>
    </>
  );
}
