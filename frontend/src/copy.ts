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
    onboarding: 'first run',
    floor: 'floor',
    live: 'live',
    ceremony: 'device',
    public: 'public',
  },

  panic: {
    label: 'STOP THE AGENT',
    hint: 'press and hold',
    done: 'Trading stopped. The agent’s credential is revoked and cannot be restored — issuing a new one takes your device. Your funds are yours to withdraw.',
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
    raise: 'RAISE FLOOR',
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
  },

  refusal: {
    heading: 'THE FLOOR HELD',
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
