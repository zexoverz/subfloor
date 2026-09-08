/**
 * Every user-visible string. One module, so the banned-list gate is an exact grep over real copy
 * rather than a guess at which parts of a component are prose.
 *
 * The permission register — the words the §3 rule names — is dead ground: seven prior ETHGlobal
 * projects own it, and a judge who pattern-matches this into "another agent-permissions project"
 * never looks twice. Sanctioned substitutions: notional bound, the floor held, trading stops,
 * refused, device-signed.
 */
export const copy = {
  brand: 'SUBFLOOR',

  /** Verbatim, everywhere scope is stated. Never "your portfolio is protected". */
  scope: 'the worst price on this venue is the one you set',

  nav: {
    landing: 'Home',
    live: 'Live',
    ceremony: 'Device',
  },

  /** The skeleton-only picker. The shipped app reaches these by flow, not by a tab. */
  preview: 'skeleton',

  desk: {
    fills: 'Fills',
    fillsSub: 'since the vault was funded',
    markout: 'Median markout',
    markoutSub: '30s post-fill vs reference',
    notional: 'Notional traded',
    notionalSub: 'what the vault actually moved',
    horizons: 'markout · 30s / 5m / 1h',
    worst: 'Worst fill vs floor',
    worstSub: 'closest approach, never through',
    /** The old draft said "Blocked" here, which is the register this project stays out of. */
    refused: 'Refused',
    refusedSub: 'reverts below the floor',
    tape: 'Fill tape',
    vault: 'What is in the vault',
    marketPrice: 'Market price',
    /** Not "your limits" — the register matters more here than anywhere. */
    standing: 'Your floor right now',
    selling: 'Selling',
    buying: 'Buying',
    feedDies: 'If the feed goes quiet',
    neverBelow: 'never below',
    neverAbove: 'never above',
    backstopNote: 'absolute backstop, ignores the reference',
    fresh: 'fresh',
    stale: 'stale',
    /** Only true when the rows came from the chain. Keyed off the same source flag as the badge. */
    everyRowLive:
      'Every row above is a real Base transaction, reconstructed from chain data rather than from our own logs.',
    whoPaysTitle: 'Who this is for',
    whoPays:
      'A foundation lends treasury inventory to a market maker. Today that runs on a legal covenant — a document saying the inventory will not be traded below a certain price. Nobody can enforce a document while the trade is happening; you find out afterwards, in arbitration.',
    whoPaysAfter:
      'This turns the covenant into settlement arithmetic. The foundation’s device signs the floor, the market maker’s automation trades inside it, and the venue refuses anything below it. A clause becomes a rule that cannot be broken rather than one you sue over.',

    explainTagline: 'An agent trades your whole portfolio. The worst price is the one you set.',
    explainProblem:
      'You give an AI agent access to your money, someone poisons what it reads, and it dumps your inventory at any price.',
    explainWhy:
      'Everything shipped today watches the agent and tries to catch bad behaviour. A watcher is a program forming an opinion, and the same attacker who fooled the agent can fool the watcher.',
    explainHow: 'read how it works',

    everyRowSample: 'Sample rows. The vault is not live yet — every number here is an illustration.',
    /** "since the vault was funded" reads as history. It has not happened yet. */
    fillsSubPending: 'illustration · the vault is not funded yet',
    leadLive: 'The vault has been traded against {fills} times. It refused {refused}. It has never once settled at a bad price.',
    /** Answered, and the answer was nothing. Different from not having asked. */
    /** Zero on this chart is the floor, so the axis label has to say whose. */
    chartTitleMine: 'this vault against its floor',
    chartTitlePublic: 'every maker against their own floor',
    chartFloorMine: 'your floor',
    chartFloorPublic: "each maker's floor",
    refresh: 'Read again',
    refreshBlock: 'index at block',
    refreshNoBlock: 'the index did not report a block',
    refreshNever: 'not read yet',
    refreshRead: 'last read',
    refreshAgo: 'ago',
    refreshNext: 'reads again',
    refreshInterval: 'every 20s',
    /** Why the block is the number here, and not the clock beside it. */
    refreshWhyBlock:
      'the clock says when this asked; the block says what it got — a fill newer than that block is not on this screen yet',
    chartAtCursor: 'above the floor, at the cursor',
    chartThisFill: 'this fill',
    chartAboveFloor: 'above the floor, latest fill',
    chartVsRef: 'against the reference',
    chartTraded: 'traded in view',
    chartHeldMine: 'fills stayed above your floor',
    chartHeldPublic: "fills stayed above their maker's floor",
    /** Says what the numbers are, because a bps axis is not self-evident the way a price is. */
    chartAxis: 'basis points from the floor · bars are size',
    chartLoading: 'Reading what this venue has traded…',
    markoutNote:
      'markout is where the reference sat 30 seconds later — the honest read on whether the fill was good, rather than whether it merely cleared the floor',
    noTakerRows: 'Nothing from that counterparty in this window.',
    /*
     * Says which vault, because the usual way to arrive here is by deploying one — and a board
     * that empties without explaining that it changed subject reads as a fault.
     */
    scopeMine: 'My tape',
    scopePublic: 'Public tape',
    /** Whose trades are on screen, said plainly, because the two answer different questions. */
    scopeMineNote: 'Only this vault: what it traded, against the floor it set.',
    scopePublicNote: 'Every maker on this venue, each measured against their own floor — which is why the axis is basis points and not price.',
    tapeEmpty: 'This vault has not traded yet. The tape follows the vault named above, so a vault you just deployed starts empty.',
    /** We could not ask. Says whose failure it is rather than reporting an empty venue. */
    tapeUnreachable: 'The index could not be reached, so what has traded here is unknown.',
    leadSample: 'When the vault is live, this line reports what it actually traded and what it refused. Nothing below has happened yet.',
  },

  floorControl: {
    tighten: 'Tighten the floor',
    tightenNote: 'Safer is free. One transaction from your own address, no device, binding on the very next fill.',
    tightenTo: 'Tighten to',
    oneWay: 'One-way. Going back counts as loosening, and loosening needs your device.',
    loosen: 'Loosen the floor',
    loosenNote:
      'Giving away protection is the one dangerous move here, so your address alone cannot do it. It needs a signature from your device.',
    loosenTo: 'Loosen to',
    chartTitle: 'How far below the reference each of your fills landed',
    chartNote: 'Taller bar = more fills landed there. Everything you have actually traded sits in the left clump.',
    usually: 'Usually',
    oneInHundred: '1 fill in 100',
    worstEver: 'Worst ever',
    yourFloor: 'Your floor',
    backstopHolds: 'also holds on its own, whatever the reference does',
    rebuilt:
      'The chart is rebuilt from on-chain fill history, not from our own server — so the number you are signing against is one anybody can recompute.',
  },

  panic: {
    label: 'STOP THE AGENT',
    hint: 'press and hold',
    done: 'Trading stopped.',
    /** §10, near verbatim: the two effects, in the order they happen, and what cannot be undone. */
    doneDocked: 'Every strategy is docked. The agent’s credential is revoked and cannot be restored — issuing a new one takes your device.',
    doneFunds: 'Your funds are yours to withdraw.',
    withdraw: 'WITHDRAW',
    withdrawAll: 'everything, to your own address',
    stopped: 'Stopped',
    docking: 'docking every strategy…',
    revoking: 'revoking the agent’s credential…',
  },

  wallet: {
    /** Short enough not to wrap in the header chip or the aside card. */
    connect: 'CONNECT WALLET',
    connectLedger: 'CONNECT A LEDGER',
    /** Not a convenience: routing the device through a browser wallet hides the split it proves. */
    ledgerWhy: 'no browser wallet in between — the device is where the rule is authored, not a signing accessory.',
    ledgerUnsupported: 'this browser cannot talk to a Ledger directly — try Chrome or Edge',
    or: 'or',
    connecting: 'waiting for your wallet…',
    /** A prerequisite, not a step of the ceremony — §10 keeps that to one signature. */
    why: 'so the vault can read what you hold. Nothing moves until you sign on the device.',
    none: 'no wallet found in this browser',
    disconnect: 'Disconnect',
    connected: 'Connected',
    copyAddress: 'Copy address',
    copied: 'Copied',
    viewOnExplorer: 'View on explorer',
    step1: 'Connect your wallet',
    step2: 'Connect the agent',
    /** The mandate is the connection. The delegate address stays hidden: it is machinery. */
    agentWhat: 'the agent may trade inside your floor, for a fixed term. It never holds your keys, and it can never lower the floor.',
    agentLocked: 'connect your wallet first',
    notDeployed: 'no vault deployed yet — the addresses land with the Base deployment',
    notOwner: 'This wallet does not own the vault.',
    notOwnerAction: 'OPEN THE BOARD',
    notOwnerHint: 'Everything the vault trades is public — the tape, the floor distance on every fill, and the refusals.',
    /** #132 made this real: the factory deploys a vault owned by whoever asks. */
    createVault: 'Deploy your own vault',
    createVaultHint: 'One transaction. It comes out owned by this wallet, empty, and with no agent connected — you set the floor before anything can trade.',
    creatingVault: 'Deploying…',
    checkingVault: 'Checking whether this wallet owns a vault…',
    sendToVault: 'Send to the vault',
    setFloor: 'Register this floor',
    registerDevice: 'Register the device',
    /** Two writes, one of which cannot be taken back. Said before the press, not after. */
    registerDeviceHint: 'writes your device to the vault and to the registry. The registry entry can only be set once — after this, changing it needs a signature from the device being replaced.',
    /*
     * Not "you cannot change this" — you can, but not from here. The registry entry is write-once,
     * so moving it needs rotateGuardian signed by the device being replaced, which this screen
     * does not do yet.
     */
    deviceRegistered: 'Registered on the vault and the registry. The registry entry is set once — moving it now needs a signature from this device, which is not on this screen.',
    nameAgent: 'Name the agent',
    changeAgent: 'Change the agent',
    nameAgentHint: 'the address allowed to compose and ship strategies. It can never move a token out, and you can change it whenever you like.',
    agentNamed: 'Named. Change it whenever you like.',
    /** Two transactions: a floor on one side only is the absence of a floor, not half of one. */
    setFloorHint: 'registered for the vault, both directions — two signatures. The registry can only be moved to a stronger floor from here; weakening it needs your device.',
    floorAlreadySet: 'Registered. Raising it again is one press; weakening it is not.',
    /** Said only when a delegate exists. With none, nothing is under any mandate. */
    noMandate: 'no agent yet',
    withdraw: 'Withdraw everything',
    /** The owner's standing exit, not the panic path. Both exist; only this one is one press. */
    withdrawHint: 'sends the full balance of each token back to your address. Yours to call at any time, and the agent can never reach it.',
    /** A disabled button with no reason on it reads as broken rather than as waiting. */
    sendNeedsAmount: 'Enter an amount above',
    /** Two transactions, and saying so beforehand is cheaper than a surprise second prompt. */
    wrapNote: 'You hold ETH but no WETH, so this wraps what is missing first — two signatures, not one.',
    /** Named so it reads as our failure to look, never as a finding about their wallet. */
    vaultReadFailed: 'Could not reach the factory, so whether this wallet owns a vault is unknown:',
    ceremonyWhy: 'Four ordinary transactions, then one signature. Only the last one needs your device, because only the last one is worth stealing.',
    done: 'done',
    /** The floor is registered for the vault. Saying so is not a detail; it is the whole guarantee. */
    forTheVault: 'registered for the vault — the address that actually settles',
    amount: 'amount',
    max: 'max',
    inWallet: 'in wallet',
    guardianLabel: 'your device address',
    guardianHint: 'the key that may weaken the floor — hardware, never this browser.',
    useDevice: 'read it from my device',
    readingDevice: 'asking the device…',
    delegateLabel: "the agent's address",
    delegateHint: 'composes and ships strategies. It can never move a token out.',
    agentAddress: 'the agent',
    /**
     * Deliberately visible. The symbolic proof went green, so the agent's private key is published
     * in the README — and a judge cannot connect "this key is public" to "this is the address the
     * vault trades through" if the interface only ever shows a nickname. Hiding it here would turn
     * the strongest claim in the entry into a claim about a label.
     */
    agentAddressHint: 'the key that trades. Its private key is published; the floor is what makes that safe.',
    mandateSummary: 'what your device will sign',
    invalidAddress: 'that is not an address',
    nothingToFund: 'enter an amount',
  },

  landing: {
    eyebrow: 'Settlement-level price bound · Base mainnet',
    standfirst:
      'Drag the fill. Below the floor, the venue itself refuses to settle — no classifier, no verdict, just arithmetic where the tokens move.',
    /** What the poisoned agent asks for, in its own words. Act one of the drawing. */
    bubbleAgent: 'sell it all — any price',
    settled: 'Settled',
    refused: 'Refused',
    settledNote: 'Above the floor, the fill settles like any other. The check costs the same either way.',
    unchanged: 'balances unchanged',
    launch: 'OPEN THE DESK',
    launchApp: 'LAUNCH APP',
    seePublic: 'see the public page',

    shotEyebrow: 'The desk',
    shotTitle: 'Every fill, measured against your floor.',
    shotStandfirst:
      'The tape shows what settled and what did not. A refusal enters it like any other row, with the two rates decoded from the transaction that failed.',
    /** The same honesty rule as every other surface: sample data says so. */
    shotNote: 'Sample rows — the vault is not live yet. The refusal is decoded from real revert data.',

    featuresEyebrow: 'What it does',
    featuresTitle: 'Six parts, one guarantee.',
    featuresStandfirst:
      'Each of these is a piece of the running product, not a description of one — the same components the desk uses.',

    f1Label: 'The floor',
    f1Title: 'Tighten it free. Loosen it only with your device.',
    f2Label: 'Refusals',
    f2Title: 'A fill below your floor cannot exist.',
    f3Label: 'The agent',
    f3Title: 'It trades. It can never move a token out.',
    f3Surface: 'everything the agent may call',
    f4Label: 'The proof',
    f4Title: 'Hostile programs, none of them settled below a floor.',
    f4Sub: 'counted by CI, in a file anyone can open',
    f5Label: 'The index',
    f5Title: 'Every number here is somebody else’s query.',
    f6Label: 'The panic path',
    f6Title: 'Stop the agent in one gesture.',
    f6Sub: 'press and hold · no device needed, because stopping can only help you',

    faqEyebrow: 'Objections',
    faqTitle: 'The questions worth asking.',
    faqStandfirst:
      'These are the ones a reader who knows this space asks first, so they are answered here rather than avoided.',

    whereTitle: 'Where the check lives',
    whereBody:
      'The router computes amounts first and moves tokens second. The floor sits in the gap — after the program has had its say, before a single token leaves anyone’s balance, checked for both parties.',
    whereAfter:
      'There is no hook to detach, no opcode to omit, no pool to route around. The run loop only computes amounts; settlement is unreachable from bytecode. There is nothing an attacker can leave out.',

    slippageTitle: 'Not a slippage parameter',
    slippageBody:
      'Every router already has amountOutMinimum. It lives in calldata, and a compromised agent writes the calldata. FLOOR moves the same number into storage keyed by recipient: raising it is one free transaction from your own address, lowering it needs a signature from your hardware key. The same arithmetic everyone already trusts, relocated to where the attacker is not.',

    legsTitle: 'Three ways a guarantee fails',
    legs: [
      { mode: 'Unenforced', title: 'Settlement arithmetic', body: 'The promise is checked where value moves, not where intentions are declared.' },
      { mode: 'Forged', title: 'Hardware key split', body: 'The agent’s key can raise a floor and ship strategies. Only the device can weaken one.' },
      { mode: 'Unverifiable', title: 'Independent index', body: 'Every fill and every floor change reconstructed from chain data, not from our logs.' },
    ],

    priorTitle: 'What is not new here',
    /** Naming this is mandatory (§4). Omitting it is the mistake that sinks a project on contact. */
    priorBody:
      'CoW Protocol’s settlement contract already enforces on-chain that no order clears worse than what it specifies, for every order regardless of signature type. That is taker-side and per discrete order: a CoW order is its own floor, one signed order at a time. This property exists for taker orders; nobody gives it to delegated makers running continuous two-sided strategies on standing inventory.',
    scopeTitle: 'And what this does not cover',
    scopeBody:
      'The protection is venue-scoped: price, on fills through this venue. That is the trade — generality for certainty, a smart guard over everything versus an unbreakable rule over one thing.',

    faq: [
      {
        q: 'Is this just a slippage parameter?',
        a: 'Every router already has amountOutMinimum. It lives in calldata, and a compromised agent writes the calldata. SUBFLOOR moves the same number into storage keyed by recipient: tightening it is one cheap transaction from your own address, loosening it needs a signature from your hardware key. The same arithmetic everyone already trusts, relocated to where the attacker is not.',
      },
      {
        q: 'Where exactly is the check?',
        a: 'In the settlement function, after the program has computed its amounts and before a single token leaves anyone’s balance, for both parties of the fill and mirrored in quote(). The run loop only computes amounts; settlement is unreachable from bytecode. There is no hook to detach, no opcode to omit, and no pool to route around.',
      },
      {
        q: 'Has CoW Protocol not already done this?',
        a: 'CoW’s settlement contract already enforces on-chain that no order clears worse than what it specifies, for every order regardless of signature type. That is taker-side and per discrete order: a CoW order is its own floor, one signed order at a time. This property exists for taker orders; nobody gives it to delegated makers running continuous two-sided strategies on standing inventory. That gap is the whole of what is new here.',
      },
      {
        q: 'What does it not cover?',
        a: 'The protection is venue-scoped: price, on fills through this venue. It says nothing about bridging, lending, or any other transaction class. That is the trade — generality for certainty, a smart guard over everything against an unbreakable rule over one thing.',
      },
      {
        q: 'Cannot a compromised agent simply trade somewhere else?',
        a: 'It never holds the inventory. The vault is the maker, and the agent’s key reaches four calls: compose, ship, dock, update-quote. There is no arbitrary-call path, no transfer it can reach, and approvals leave the vault only to the canonical venue and only for finite amounts. Compromising the agent buys the ability to trade badly down to the floor, and to stop trading. That is the whole blast radius.',
      },
      {
        q: 'Can the agent lower the floor?',
        a: 'No. Tightening is free and callable by the vault itself; weakening requires an EIP-712 signature from a guardian key registered on chain, and that key is hardware the trading machine never holds. The registry entry is write-once — replacing a guardian needs a signature from the outgoing one — so a captured key cannot appoint a guardian of its own.',
      },
      {
        q: 'What happens when the reference feed goes quiet?',
        a: 'Trading stops. A stale reference fails closed into no trading, never into a bad fill; if an absolute backstop is configured, that backstop carries the floor on its own and settlement continues against it. Nothing settles at a price nobody can verify.',
      },
      {
        q: 'Who would actually pay for this?',
        a: 'A foundation lends treasury inventory to a market maker. Today that runs on a legal covenant, and nobody can enforce a document while the trade is happening — you find out afterwards, in arbitration. This turns the covenant into settlement arithmetic: the foundation’s device signs the floor, the market maker’s automation trades inside it, and the venue refuses anything below it.',
      },
    ],

    closeTitle: 'Let it trade. Keep the price.',
    closeStandfirst:
      'An agent can run your inventory around the clock. What it cannot do is settle below the number you signed.',

    footerTagline: 'A venue-enforced price floor for delegated makers.',
    footerBuilt: 'Built with',
    footerProject: 'Project',
    footerStandard: 'The standard',
    footerRights: 'MIT. Live on Base.',

    publicEyebrow: 'Public record',
    publicTitle: 'Every number here is somebody else’s query.',
    publicStandfirst:
      'This page is the same data any stranger can pull from the index. Nothing on it is our claim about our own execution — each figure names the query it comes from.',
    publicOwnTitle: 'Own a vault?',
    publicOwnBody: 'Connect your wallet to see your own floor, your own fills, and the agent trading inside them.',

    disclosure:
      'FLOOR implements ERC-8377 (Reference-Relative Slippage Bounds), a draft standard I authored (ethereum/ERCs PR #1935, public since Aug 2026). The specification is public prior art; every line of implementation here was written during the event, and none of the ERC’s reference implementation is reused.',
  },

  onboarding: {
    title: 'An agent trades your whole portfolio.',
    lede: 'The worst price is the one you set.',
    inventory: 'your inventory',
    fromWallet: 'from your wallet',
    worstPrice: 'your worst price',
    /** Before anything is registered, this number is a suggestion and has to say so. */
    proposedPrice: 'the worst price you will set',
    proposedNote: 'nothing is registered yet — this is what the button below will set',
    adjust: 'adjust',
    action: 'SIGN ON YOUR DEVICE',
    /** Load-bearing: it sets up clear-signing as confirmation, before the device ever lights up. */
    underAction: 'the device will show you exactly these numbers',
    /** The vault, not the wallet: they are different addresses and only one of them settles. */
    noInventory: 'the vault holds nothing yet — send inventory in above',
    runsFor: 'runs for {days} days · the agent trades inside this, nothing else',
    /** Required, and named so. It used to read "the keys behind this", which sounds like an aside. */
    advanced: 'two keys, set once',
    required: 'required',
    /** §10 hides the machinery; #111 makes the delegate address the exception, and says why. */
    advancedNote: 'Set once. This is why the agent can trade without ever holding your tokens.',
    keysDone: 'device and agent set',
    change: 'change',
    doing: 'what happens when you press it',
    finishSetup: 'Finish setup',
    finishSetupNote: 'Your vault is deployed but not configured. Nothing trades until it is.',
  },

  floor: {
    title: 'your worst price',
    runQuery: 'run query',
    reference: 'reference',
    yourFloor: 'your floor',
    detail: 'detail',
    failClosed:
      'if the reference feed goes quiet, trading stops until it returns — nothing settles at an unknown price',
    raise: 'RAISE SUBFLOOR',
    /** The first entry is still a raise on chain — from no protection — but not in anyone's words. */
    set: 'SET SUBFLOOR',
    setHint: 'nothing is registered for this pair yet',
    notSet: 'not set',
    /**
     * The real hazard is a floor tight enough to catch ordinary trading. §10 wants it sitting past
     * the worst realized fill precisely so it never interferes — a hijacked agent hits it, honest
     * fills never do. Warning about that state was backwards.
     */
    tooTight: 'would have refused {n} of the last {total} fills',
    clear: '{n} bps past the worst fill ever taken',
    raiseHint: 'free · immediate · no device',
    lower: 'LOWER ON DEVICE',
    lowerHint: 'lowering your floor needs your device',
    coldStart: 'venue history too short to calibrate — house default shown',
    notConfigured: 'no floor set for this pair yet — the first one is free and takes no device',
  },

  live: {
    tape: 'the tape',
    axisKey: 'floor ┊ reference',
    agentNow: 'the agent now',
    inventory: 'inventory',
    floor: 'floor',
    live: 'live',
    /** Shown instead of "live" whenever the tape is the dev feed rather than the chain. */
    simulated: 'simulated feed',
    /** And this whenever the page is standing on fixtures — a deployed skeleton says so. */
    fixtures: 'fixture data',
    /** Nothing is deployed and the flow is being walked anyway. Never silent about it. */
    mock: 'mock — nothing deployed',
  },

  refusal: {
    /** §10 of the 7 Sep spec renames this. Contract names (FloorRegistry, SettledBelowFloor) do not change. */
    heading: 'THE SUBFLOOR HELD',
    attempted: 'attempted',
    yourFloor: 'your floor',
    /** The sentence a worried owner is actually looking for. It leads; the forensics follow. */
    unchanged: 'balances unchanged',
    hint: 'Nothing moved. The balances are the same either side of this row — the venue refused rather than settling, and the transaction reverted.',
    view: 'view',
  },

  ceremony: {
    willDisplay: 'your device will display',
    onlyIfMatches: 'confirm on the device only if it matches',
    continue: 'CONTINUE ON DEVICE',
    waiting: 'waiting for your device',
    blindSigning:
      'If the device shows nothing: this vault is in no hardware vendor\u2019s contract registry, so the app needs Blind signing turned on \u2014 Ethereum app \u203a Settings \u203a Blind signing.',
    takeYourTime: 'Take your time — nothing happens until you press confirm.',
    declined: 'You declined on the device. Nothing changed.',
    absent: 'This needs your device. Everything else on this page works without it.',
    /** Honest about the one thing WebHID cannot tell us without a gesture. */
    unknownDevice: 'Your device will be asked for when you continue.',
    paired: 'device found',
    signing: 'waiting for your device',
    signed: 'Signed on your device.',
    scheduled: 'Signed. It takes effect at',
  },

  publicPage: {
    programsExecuted: 'programs executed',
    settledBelowFloor: 'settled below floor',
  },

  stats: {
    fills: 'fills',
    median: 'median vs CEX mid',
    worst: 'worst fill above floor',
    refused: 'refused',
    since: 'running since',
  },
} as const;
