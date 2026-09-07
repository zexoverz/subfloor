# The taker

The self-operated taker §8 requires, and requires disclosed. Organic takers will not find a
nine-day-old Aqua app, so the venue's fills come from a bot we run from a separate funded key. It is
not a market participant and nothing here pretends otherwise. What is real about it is the
execution: real transfers, real gas, real adverse selection.

```bash
TAKER_PRIVATE_KEY=0x… SUBFLOOR_ROUTER=0x… SUBFLOOR_AQUA=0x… SUBFLOOR_VAULT=0x… \
SUBFLOOR_AGGREGATOR=0x… SUBFLOOR_QUOTE=0x… \
node --experimental-strip-types src/taker/run.ts        # --once for a single pass
```

## Three things it does deliberately

**It reads the live order off the chain rather than rebuilding one.** `Shipped` carries
`abi.encode(order)` and Aqua keys inventory by the hash of exactly those bytes, so a rebuild has to
match byte for byte — traits word, token pair, program parameters, all of it. A rebuild that differs
quotes zero, which looks like an empty book rather than like a bug. It cost an hour to find that
once; reading removes the whole class.

**It records a refusal as an outcome, not an error.** `SettledBelowFloor` is the mechanism working.
The bot decodes the two rates out of the revert and reports them, because the refusal count is the
product's proudest number and the daily report counts them beside the fills.

**It alternates which side it spends.** A taker that only ever buys drains one side of the book and
the execution-quality dataset ends up measuring one direction.

## Two things worth knowing before reading the numbers

**Rates are raw.** `received * 1e18 / given` in raw token units. tUSDC is six decimals against
WETH's eighteen, so a WETH→tUSDC rate reads about 2.48e9 and the reverse about 4e26. The registry's
floors use the same convention, which is why they are not human-shaped either.

**A negative edge is normal.** The taker crosses the spread, so a book quoting 50 bps wide with a fee
on top will show roughly −52 bps against the reference. `TAKER_EDGE_BPS` is the floor on that: set it
tighter than the spread and the bot correctly never takes.
