# The two consumers

What makes the index leg load-bearing rather than a checkbox. Both read the subgraph and nothing
else; neither reads an operator log.

| | reads | feeds |
|---|---|---|
| `/calibration` | `ExecutionQualityDailySnapshot` over a trailing window | the floor screen's default, so the human is not signing a guess |
| `/report` | the same, plus `ReferenceAnswer` and `_meta` | the daily published execution-quality record |

```bash
npm run check     # tests
npm run serve     # :8787
npm run report    # markdown to stdout
```

`SUBFLOOR_SUBGRAPH` overrides the endpoint.

## Decisions worth not re-litigating

**The window's p99 is the worst day, not the mean of the daily p99s.** A mean of percentiles is not
a percentile of anything, and it sits below the bad day — which is the day a floor exists for.

**Unscored fills count toward `fills` and enter no percentile.** A fill with no reference indexed at
its block has no deviation. Averaging it in at zero would pull every percentile toward the reference
and make the floor look safer than the venue is.

**Below 100 scored fills there is no calibration.** The response says
`venue history too short to calibrate — house default shown` and returns the house number with
`calibrated: false` and `p99Bps: null`. A p99 over twelve fills is a rumour with a decimal point, and
the screen must not render it in the same type as one over two hundred.

**An unreachable index is a 503, never a fallback.** A calibration that silently degrades to a
constant while the screen still says "from venue history" is worse than one that stops.

**Every response carries the query that produced it.** The floor screen's `[run query]` affordance is
only honest if the query it hands a stranger is the query the number came from.
