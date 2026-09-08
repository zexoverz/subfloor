# SUBFLOOR — design brief

What each screen shows, where each thing sits, and what it reads from. Written so someone who has
not read the planning spec can pick up a screen and build it.

Six surfaces total: five owner screens and one public page. Nothing else is in scope — see
[Do not build](#do-not-build) at the foot, which is as load-bearing as the rest.

---

## 0 — The two rules that bind every screen

**The design test.** A user must currently understand five things before money moves: deposit
inventory, sign a mandate on a device, set a floor, lower a floor, revoke a credential. That is too
many concepts, and the interface exists to collapse them.

> **If a screen makes the user think about anything except "what is the worst price I will accept",
> it is wrong.**

The floor is one number. Aqua, SwapVM, the delegate key, token approvals, the mandate's EIP-712
shape — all machinery, and machinery stays invisible until the moment it matters. Where a concept
genuinely cannot be hidden — the device *is* the guarantee, and the trading machine cannot sign it
away — it is not spread across form fields. It becomes one deliberate ceremony.

**The copy discipline.** These words must not appear anywhere in the interface — not in a tooltip,
not in an aria-label, not in an error:

> limit · policy · permission · guardrail · cap · allowlist · firewall · zero-trust ·
> circuit breaker · spending · monitors · blocks · sentinel · warden · leash

Seven-plus prior projects own that register; a reader who pattern-matches SUBFLOOR into
"another agent-permissions project" never looks twice. **SUBFLOOR is about price, never about
permission.** Sanctioned substitutions, settled — do not improvise worse ones:

| Instead of | Write |
|---|---|
| spending limit / cap | **notional bound** |
| the guardrail worked | **the floor held** |
| blocked / prevented | **refused** |
| circuit breaker fired | **trading stops** |
| hardware-approved | **device-signed** |

`frontend/check-copy.mjs` greps all of `src/` on every build and fails the build on a hit.
Comments are exempt; strings are not.

**And what no screen may overclaim.** The protection is venue-scoped — price, on fills through this
venue. No screen may say "your portfolio is protected". The honest string, used verbatim wherever
scope is stated, lives in `copy.ts` as `copy.scope`:

> the worst price on this venue is the one you set

---

## 1 — The surfaces, in the order a user meets them

```
first run  ──►  the floor screen  ──►  the live view  ──►  (refusal card arrives in the tape)
(ceremony)      (reached from            ↑ home thereafter
                 [adjust], then          │
                 from the live view)     └── the panic control: persistent, top-right,
                                             on every owner screen, never sought out

the public page — what a stranger meets instead of any of them
```

---

## 2 — Screen 1: first run — *the empty state IS the onboarding*

No dashboard-shaped emptiness. No zero-filled stat tiles. A user with no vault sees one screen
whose entire job is the ceremony.

```
┌────────────────────────────────────────────────────────────────┐
│  S U B F L O O R                                               │
│  An agent trades your whole portfolio.                         │
│  The worst price is the one you set.                           │
│                                                                │
│  your inventory     [ 0.20 WETH ] [ 500 USDC ]   (from wallet) │
│                                                                │
│  your worst price   2,445.40 USDC per WETH                     │
│                     100 bps below the live reference  [adjust] │
│                                                                │
│  runs for 14 days · the agent trades inside this, nothing else │
│                                                                │
│              [ SIGN ON YOUR DEVICE ]                           │
│         the device will show you exactly these numbers         │
└────────────────────────────────────────────────────────────────┘
```

**What the user does:** picks amounts, accepts or adjusts the one number (`[adjust]` opens the floor
screen inline), presses the one primary action, confirms on the device.

**What they must understand:** money in, one worst price, one signature, 14 days. That is the whole
list.

**What is deliberately hidden** — this is the part most easily got wrong, because each of these is
easy to render and feels helpful:

- the delegate address (the mandate carries it; the interface calls it "the agent")
- the token approvals (finite, to canonical Aqua only — machinery)
- the mandate's notional bound (defaults to the deposited amount; surfaced only if the user
  deposits more later)
- the EIP-712 structure
- every contract address

**The line under the button is load-bearing.** "the device will show you exactly these numbers" sets
up clear-signing as confirmation rather than surprise, before the device ever lights up.

### Failure states of screen 1

| State | What the screen does |
|---|---|
| **Device absent** | Detected *before* the ceremony starts (WebHID enumeration on page load). One honest line: "This needs your device. Everything else on this page works without it." Never a form the user completes and then fails at the end. |
| **Rejected on device** | Not an error state. Return to this screen with every field intact: "You declined on the device. Nothing moved." |
| **Wallet has no inventory** | Amounts read zero, primary action stays visible but inert, with "fund the wallet first". No modal, no wizard. |

---

## 3 — Screen 2: the floor screen — *a distribution becomes one number*

The heart of the product. It reads realized adverse deviation from the public index, so the human
is not signing a guess.

The design problem: the honest input is a distribution and a non-quant cannot choose a percentile.
The answer is **one axis, everything on it** — fills, the reference, the percentile markers and the
floor handle all live on the same horizontal price axis, so "where do fills actually land" and
"where is my floor" are the same picture, and moving the handle is visibly moving away from or into
the cloud of real fills.

```
┌────────────────────────────────────────────────────────────────┐
│  your worst price                                              │
│                                                                │
│  fills on this venue, last 7 days — 214 fills, from the        │
│  public index                                     [run query]  │
│                                                                │
│   ····・・・••••●●●●●●●●●●●●●●●●●●●●●●●・・・・··  ·   ·          │
│               │                    │            │              │
│           p50 −6 bps          p99 −41 bps       │              │
│  ───────────────────────────────────────────────█──────────    │
│  reference 2,470.10                        your floor          │
│  (Chainlink ETH/USD)                   2,445.40 · −100 bps     │
│                                                                │
│  fewer than 1 in 100 past fills landed beyond p99; your floor  │
│  sits 59 bps beyond that                                       │
│                                                                │
│  2,445.40 also holds on its own, whatever the reference does   │
│  if the reference feed goes quiet, trading stops until it      │
│  returns — nothing settles at an unknown price       [detail]  │
│                                                                │
│  [ RAISE SUBFLOOR ]   free · immediate · no device             │
│  lowering your floor needs your device                         │
└────────────────────────────────────────────────────────────────┘
```

### Placement rules

**The absolute number is the headline; the bps figure is the subtitle.** A non-quant chooses a price
("I will never take less than 2,445.40 per WETH"), not a deviation. The two update in lockstep as
the handle moves — the handle drags in **bps space, 25 bps detents**, because that is what the
registry stores, but the big type is always USDC-per-WETH.

**Both floor forms are on screen at once.** The reference-relative floor is the handle; the absolute
backstop is the one quiet line under the headline number, auto-derived (the absolute rate at signing
time), phrased as reassurance rather than as a second decision.

**The staleness bound renders as the fail-closed sentence**, with the measured numbers behind
`[detail]`:

> the reference typically updates about every 2½ minutes (p50 150s over 91 measured intervals);
> the longest quiet spell measured was 1,232s (~21 min)

Real numbers from the sampler, never invented ones, and re-pulled the day anything is recorded.

### The default, and how it is derived

**Default floor = p99 of realized adverse deviation over the trailing 7 days, rounded up to the next
25 bps.** Rationale, shown in the `[detail]` expander in one sentence: a floor the venue's history
would almost never have hit — fewer than 1 in 100 past fills — so the guarantee is real but the
vault trades freely.

The percentiles come from the index. **Never from a config file.** The sample count is always
printed next to them.

### The cold start

On day one the venue history is hours old, and a percentile over a dozen fills is not statistics.
Below a sample threshold — **N < 100** — the screen says so:

> venue history too short to calibrate — house default shown

…and the default is the house number (100 bps), labelled as such. **Never render a p99 computed over
12 fills as if it were the 214-fill strip.** The `[run query]` affordance stays either way: the
strip's query is the same one a stranger can run against the public index, which is what makes the
number trustworthy rather than decorative.

### Raise versus lower, on this screen

Dragging the handle **up** (toward the reference) arms `[ RAISE SUBFLOOR ]` — one click, one cheap
transaction, no device, effective immediately. Dragging it **down** flips the primary action to
`[ LOWER ON DEVICE ]` and the ceremony takes over.

The asymmetry is the product's design, and **the screen teaches it by having two different buttons,
not by explaining it.**

---

## 4 — The two hardware moments

Exactly two: **mandate signing** (onboarding, and renewal every 14 days) and **floor-lowering**.
Both are clear-signed on the device, so it renders economic meaning rather than a hash.

The flow is designed around the device being slow and physical. **That slowness is the feature**, and
the screen's job is to make the wait feel like deliberation instead of latency.

**Before the device lights up**, the screen shows verbatim what the device will show:

```
┌────────────────────────────────────────────────┐
│  your device will display                      │
│                                                │
│    Lower WETH/USDC floor                       │
│    to 2.0% below reference                     │
│    delegate: agent-7                           │
│    expires: 14d                                │
│                                                │
│  confirm on the device only if it matches      │
│              [ CONTINUE ON DEVICE ]            │
└────────────────────────────────────────────────┘
```

The web copy and the device copy must match **verbatim** — same strings, same order, rendered from
the same descriptor source. That is the entire point of clear-signing, and the "only if it matches"
line teaches the one habit that defeats a compromised frontend. **A mismatch between screen and
device is a stop-everything bug, not a cosmetic one.**

| Moment | What the screen does |
|---|---|
| **While waiting** | Full screen, the summary static. **No spinner, no countdown.** "Waiting for your device. Take your time — nothing happens until you press confirm." No timeout that cancels the ceremony: a user comparing eight lines of text on a small screen must not be raced. |
| **On rejection** | "You declined on the device. Nothing changed. Your floor is still 2,445.40." Return to the previous screen, state intact. Rejection is a **success of the system** — styled neutrally, never as an error, never with retry-nagging. |
| **Device absent** | Detected before the ceremony is offered, as on screen 1. |

**The rule that holds everywhere: floor raises and every read never mention the device.** The device
appears at exactly the trust-critical moments and nowhere else. If it shows up at any other point it
reads bolt-on.

---

## 5 — Screen 3: the live view — four zones

The owner's home while the agent trades. One rule above all others:

> **Every number on this screen is read from the index — the same queries the public page runs — so
> the owner never sees a number the index cannot prove.**

```
┌────────────────────────────────────────────────────────────────┐
│  47 fills · median +9 bps vs CEX mid · worst fill +3 bps       │  ZONE 1
│  above floor · 2 refused · running since Sep 8      ● live     │
│                                                                │
│  the tape                       floor ┊ ref                    │  ZONE 2
│  14:02  sold 0.05 WETH   2,463.1   ───┊──●─     +72 bps above  │
│  13:47  bought 0.04 WETH 2,468.9   ───┊────●    +96 bps above  │
│  13:31  THE SUBFLOOR HELD — a fill at 2,391.6 was refused [card]│
│  13:12  sold 0.03 WETH   2,459.8   ───┊─●──     +58 bps above  │
│                                                                │
│  the agent now: quoting both sides ±35 bps, decaying ·         │  ZONE 3
│  TWAP exit 0.4 WETH over 6h · auction rebalance idle           │
│                                                                │
│  inventory  0.18 WETH · 512 USDC          floor 2,445.40       │  ZONE 4
│  the worst price on this venue is the one you set              │
└────────────────────────────────────────────────────────────────┘
```

**Zone 1 — the number strip.** One line, not five tiles. It is the submission line rendered live:
*"N fills, median X bps vs CEX mid, worst fill Y bps above floor, 2 attacks refused, running since
Sep 8."* On submission morning it is read off this screen rather than computed the night before.
The **refusal count is a zone-1 headline stat, never buried — refusals are the product's proudest
number.**

**Zone 2 — the tape.** Each fill carries its distance from the floor drawn as a bar on a shared axis
where **the floor is the fixed left edge** and **the reference is a dashed tick**. The floor is the
axis of the whole product, so it is the axis of the chart. Refusals enter the same tape. Markout
detail (vs reference-at-block and CEX mid) lives **one click behind each fill**, not on the surface.

**Zone 3 — the agent.** Current strategies in plain words: "quoting both sides", "TWAP exit",
"auction rebalance". Decoded from the strategy classification the index already computes. **Never
bytecode, never opcode names.**

**Zone 4 — inventory and the standing floor**, with the scope sentence as a permanent fixture, not
fine print.

---

## 6 — Screen 4: the refusal card

Arrives as a state in the tape; not a screen anyone navigates to. When the venue refuses a fill, the
owner must see **the product working, not an error**.

Framed identically to any fill — **no alarm styling on the card itself. The only red on screen is
the attempted rate**, because the attempted rate is the bad thing and the card is the good thing.

```
┌─ THE SUBFLOOR HELD ────────────────────────────┐
│  a fill at 2,391.6 was refused                 │
│                                                │
│  attempted        2,391.6   (−318 bps vs ref)  │
│  your floor       2,445.40  (−100 bps)         │
│                                                │
│  reverted on Base mainnet · tx 0x9d…   [view]  │
│  balances unchanged                            │
└────────────────────────────────────────────────┘
```

The numbers are the **decoded revert arguments** — five of them, and the shape is known today:
`SettledBelowFloor(recipient, tokenIn, tokenOut, executionRate, floorRate)`. `[view]` lands on a
block-explorer page whose Fail status decodes into the same two rates the card shows: the same event
from two witnesses.

**"Balances unchanged" is the sentence a worried owner is actually looking for. It leads; everything
forensic follows.**

One structural fact that shapes the data path: **a refused fill emits no logs.** A revert produces
no events and the subgraph is log-driven, so refusals can never come from the subgraph. They come
from the Substreams module, which reads transaction status.

---

## 7 — Screen 5: the panic control

One standing control on **every owner screen, top-right**: `[ STOP THE AGENT ]`.

One action, two effects in fixed order — dock through canonical Aqua first (works even if the
modified router is compromised or bricked), then ring revocation, which bricks the delegate's
secrets remotely.

**Reachable in one gesture from anywhere; impossible to trigger by accident:**
**press-and-hold for 1.5 seconds with a visible fill animation — not a confirmation modal.** A
scared user should not have to read a dialog, and a stray click should not be able to fire it.

**No device in this path, by design.** Docking can only stop trading, never worsen a price, and a
panic control that needs hardware fails exactly when the device is in a drawer somewhere else.

After firing, a plain terminal state:

> Trading stopped. The agent's credential is revoked and cannot be restored — issuing a new one
> takes your device. Your funds are yours to withdraw.

Withdrawal is the owner path: always available, never behind the agent, never behind the ceremony.

---

## 8 — The public page — *one page in two states*

The owner's live view **is** the public page plus the owner-only zones. Building it that way keeps
the two honest by construction.

| | Public | Owner |
|---|:--:|:--:|
| the number strip | ● | ● |
| the tape, with per-fill floor distance | ● | ● |
| the refusal count | ● | ● |
| the fuzz counter, uptime | ● | ● |
| the daily execution-quality report, **with its query attached** | ● | ● |
| the standing adversarial bounty page, linked | ● | ● |
| inventory | — | ● |
| mandate state | — | ● |
| the panic control | — | ● |

**Next to every headline number: `[run query]`.** The guarantee is anyone's query, never our claim —
the affordance is that sentence made clickable.

**A stranger must not see:** inventory attribution, floor levels keyed to identifiable recipients, or
anything mapping an address to an exposed position size.

> **Standing constraint: no page may publish an identifying leaderboard of exposed positions. That
> is a target list, not a product.**

Trivially moot while there is one vault, but it binds the day a second user exists — and the query
shapes must not bake in a violation before then.

---

## Do not build

Marked so nobody over-builds. Each of these is a thing the demo needs and the product does not, or a
thing neither needs:

- **No agent-thoughts pane.** The injection split-screen — the poisoned page, the agent's log
  deciding to dump, the program disassembly — is terminal/OBS capture on shoot day, not a dashboard
  surface.
- **No pair selector.** One pair, WETH/USDC.
- **No charting beyond the fill strip and the tape bars.**
- **No mobile layout.** The video is 16:9 desktop and the run has one owner.
- **No multi-user flows.**
- **A theater mode for the fuzz counter** is one CSS display state on a stat the dashboard already
  carries — *not* a new screen.

One deliberate exception in the other direction: **the refusal card must appear on cue, seconds
after the revert.** The index is the permanent record, but its lag is not choreography-grade — a
receipt-watching fast path for our own transactions is acceptable, because the card's numbers still
come from the decoded revert and the index backfills the same event.

---

## Where the build stands against this brief

Checked against `frontend/src` on 8 Sep. Built means present and reading from a live source; not
built means the surface exists but is fed by `fixtures.ts`, or does not exist.

| Surface | State | Note |
|---|---|---|
| Panic control, press-and-hold 1.5s | **built** | `PanicButton.tsx`, `HOLD_MS = 1500` |
| Refusal card | **built** | `RefusalCard.tsx`, from decoded revert args via `/api/refusals` |
| Tape with per-fill floor distance | **built** | `Tape.tsx`, `FillBar.tsx` — index-fed |
| Floor screen, one-axis layout | **built** | `FloorDialog.tsx`, `PriceLadder.tsx`, `FloorHistogram.tsx` |
| Floor screen cold-start rule | **built** | `coldStart = sampleCount < 100` |
| Device ceremony: pre-summary, waiting, rejection | **built** | `DeviceCeremony.tsx`, `DeviceScreen.tsx`, `DeviceSign.tsx` |
| One page in two states | **built** | `owner` prop on `LiveView`; `PublicAside.tsx` |
| Scope sentence as permanent fixture | **built** | `copy.scope` |
| Copy discipline enforced | **built** | `check-copy.mjs` over all of `src/` |
| **Calibration read from the index** | **not built** | `p50Bps`, `p99Bps`, `fillsBps`, `houseDefaultBps`, `sampleCount` all come from `fixtures.ts`. The index exposes no calibration query. This is the one gap the brief marks as non-negotiable — the whole point of the floor screen is that the human is not signing a guess. |
| **Zone 3, the agent** | **not built** | `fixtures.agent` is three hardcoded strings. The index computes strategy classification; nothing reads it. |
| **Zone 1 as one line** | **not built** | Currently five stat tiles (`Tiles.tsx`). The brief wants the submission line as one sentence. |
| **`[run query]`** | **half built** | `onQuery` exists on `Tiles.tsx` and is wired to nothing. |
| **Screen 1 as one ceremony** | **partly** | `SetupDialog.tsx` renders a five-step checklist — fund, floor, guardian, delegate, mandate. Four of those five are machinery the brief says to hide. The chain genuinely needs several transactions; the brief's "one ceremony" is about presentation, so the gap is that the machinery is on the surface rather than behind the one number and the one button. |
| Mandate storage | **provisional** | Lives in `localStorage`, unverified. Belongs in the Key Ring. |
