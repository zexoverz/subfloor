# How often Chainlink ETH/USD actually updates

Every protocol with an oracle staleness check has to pick a bound. Almost nobody publishes
measurements behind theirs, so most pick a round number. This is the distribution ours is derived
from, measured rather than assumed, across three chains.

Regenerate with `python3 scripts/chainlink_gap.py --rounds 400`. Raw rounds in
[`chainlink-gap.json`](chainlink-gap.json).

## The numbers, 8 Sep 2026

| Chain | Rounds | Window | p50 | p90 | Max |
|---|---:|---|---:|---:|---:|
| Base | 400 | Sat 05 Sep 06:38 → Tue 08 Sep 12:41, 78.1h | 660s | 1232s | **1234s** |
| Optimism | 256 | Sun 06 Sep 18:13 → Tue 08 Sep 12:41, 42.5h | 472s | 1212s | 1212s |
| Arbitrum | 400 | Mon 07 Sep 20:06 → Tue 08 Sep 12:53, 16.8h | 91s | 330s | 1050s |

Windows differ because they are however far back 400 readable rounds reach, and a faster feed covers
less time for the same number of rounds. Arbitrum's shorter window is a consequence of it updating
more often, not of sampling it less.

## What the shape means

**The tail is the heartbeat.** Chainlink updates on a deviation threshold *or* a maximum interval,
whichever comes first. The long gaps are that interval expiring during a flat market — not the feed
failing. Base and Optimism both cap just over 1200s; Arbitrum's cap is lower and its median is seven
times faster, which is a different configuration rather than a different quality of service.

**The p50 is not the number to bound against.** A bound near the median fails the vault closed
through every ordinary quiet period. 300s is the round number a reasonable person reaches for, and it
sits above the p50 and well below the p90 — safe in direction, unusable in practice.

**The max is the number that matters**, because a staleness bound has to survive the quietest stretch
the feed allows, not the typical one.

## What this settles, and what it does not

SUBFLOOR's mainnet bound is **2464s**, chosen as twice the then-observed maximum of 1232s. Two things
about that are now different from when it was written.

**The weekend caveat is answered.** `SubfloorParams.sol` recorded that the bound was provisional
because a flat weekend had not been observed. This window runs from Saturday morning through Tuesday
midday and includes one. The heartbeat held: the maximum moved from 1232s to 1234s, by two seconds.

**And so the arithmetic is now marginally behind.** Twice 1234s is 2468s, and the constant is 2464s —
2464 is 1.997× the observed max rather than 2.00×. That is not a safety problem at this scale and the
bound is a margin rather than a precise quantity, but the method said "twice the observed maximum"
and it is worth saying that it no longer exactly does.

**What it does not settle:** three days is not a year. A feed can be reconfigured, an aggregator
replaced, and a genuinely dead feed looks exactly like a very quiet one until the bound expires.
The bound is the thing that turns that ambiguity into a refusal, which is why it exists at all.

## Method, and one thing worth knowing if you rerun it

Rounds are read backwards from `latestRound` through `getRoundData`, so the history is genuine and
available at once rather than accumulated by polling. A sampler that has run for six hours can only
honestly report six hours, and a bound argued from six hours is not an argument.

**Public RPCs drop batched calls, and one of them does it silently.** `mainnet.base.org` answers five
of eight batched `eth_call`s and returns no error for the three it drops. Treating a missing response
as the end of history walks a handful of rounds and reports Base as the quietest feed of the three,
which is the opposite of true. The sampler retries dropped calls three times before believing an
aggregator boundary, and uses `base-rpc.publicnode.com`, which answers all eight.
