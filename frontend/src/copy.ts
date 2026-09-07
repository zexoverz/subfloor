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
    onboarding: 'First run',
    /** Visitor-facing names. "Desk" and "Floor control" are what we call them, not what they are. */
    floor: 'Your floor',
    live: 'Live',
    ceremony: 'Device',
    public: 'Public',
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
    done: 'Trading stopped. The agent’s credential is revoked and cannot be restored — issuing a new one takes your device. Your funds are yours to withdraw.',
  },

  wallet: {
    connect: 'CONNECT YOUR WALLET',
    connecting: 'waiting for your wallet…',
    /** A prerequisite, not a step of the ceremony — §10 keeps that to one signature. */
    why: 'so the vault can read what you hold. Nothing moves until you sign on the device.',
    none: 'no wallet found in this browser',
    disconnect: 'disconnect',
    step1: 'Connect your wallet',
    step2: 'Connect the agent',
    /** The mandate is the connection. The delegate address stays hidden: it is machinery. */
    agentWhat: 'the agent may trade inside your floor, for a fixed term. It never holds your keys, and it can never lower the floor.',
    agentLocked: 'connect your wallet first',
    notDeployed: 'no vault deployed yet — the addresses land with the Base deployment',
    notOwner: 'this wallet does not own the vault. You are seeing the public view.',
    ceremonyWhy: 'Four ordinary transactions, then one signature. Only the last one needs your device, because only the last one is worth stealing.',
    done: 'done',
    /** The floor is registered for the vault. Saying so is not a detail; it is the whole guarantee. */
    forTheVault: 'registered for the vault — the address that actually settles',
    amount: 'amount',
    max: 'max',
    inWallet: 'in wallet',
    guardianLabel: 'your device address',
    guardianHint: 'the key that may weaken the floor. It should be a hardware address, never this browser.',
    useDevice: 'read it from my device',
    delegateLabel: "the agent's address",
    delegateHint: 'it composes and ships strategies. It can never move a token out of the vault.',
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
    settled: 'Settled',
    refused: 'Refused',
    settledNote: 'Above the floor, the fill settles like any other. The check costs the same either way.',
    unchanged: 'balances unchanged',
    launch: 'OPEN THE DESK',
    seePublic: 'see the public page',

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

    disclosure:
      'FLOOR implements ERC-8377 (Reference-Relative Slippage Bounds), a draft standard I authored (ethereum/ERCs PR #1935, public since Aug 2026). The specification is public prior art; every line of implementation here was written during the event, and none of the ERC’s reference implementation is reused.',
  },

  onboarding: {
    title: 'An agent trades your whole portfolio.',
    lede: 'The worst price is the one you set.',
    inventory: 'your inventory',
    fromWallet: 'from your wallet',
    worstPrice: 'your worst price',
    adjust: 'adjust',
    action: 'SIGN ON YOUR DEVICE',
    /** Load-bearing: it sets up clear-signing as confirmation, before the device ever lights up. */
    underAction: 'the device will show you exactly these numbers',
    noInventory: 'fund the wallet first',
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
    view: 'view',
  },

  ceremony: {
    willDisplay: 'your device will display',
    onlyIfMatches: 'confirm on the device only if it matches',
    continue: 'CONTINUE ON DEVICE',
    waiting: 'waiting for your device',
    takeYourTime: 'Take your time — nothing happens until you press confirm.',
    declined: 'You declined on the device. Nothing changed.',
    absent: 'This needs your device. Everything else on this page works without it.',
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
