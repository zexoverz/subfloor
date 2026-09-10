# Upstream contributions

What this project sent back to the code it was built on. One entry so far, and it is a real defect
in a sponsor's shipped source rather than a typo fix.

---

## 1inch SwapVM — `OraclePriceAdjuster` pays out on any pair with mismatched decimals

**Issue comment:** [`1inch/swap-vm#31`](https://github.com/1inch/swap-vm/issues/31#issuecomment-5617847294)
**Pull request:** [`1inch/swap-vm#197`](https://github.com/1inch/swap-vm/pull/197)
**Found:** 10 Sep 2026, while trying to ship the fuller §4 position.

### What is wrong

`OraclePriceAdjuster` hands the taker the better of the curve price and a Chainlink feed. It scales
the feed answer to 1e18 and compares it against the swap's realised price, computed as
`amountOut * 1e18 / amountIn` — in **raw** token units.

Those two are the same scale only when both tokens carry eighteen decimals. On WETH/USDC the raw
price is 1e12 smaller, so the feed is found better on every single fill, `priceRatio` saturates
`min(priceRatio, 2e18 - maxPriceDecay)`, and the taker is handed the cap.

It does not revert. It fills, at a price nobody meant.

No setting avoids it. `maxPriceDecay < ONE` is required at build, so `maxIncrease` is always above
`ONE` and some giveaway is always expressible. Passing the pair's decimal difference through
`oracleDecimals` lines the two sides up in one direction and needs `8 - 18 + 6 = -4` in the other,
which a `uint8` cannot hold.

### Measured

In their own fixture, an 18/6 pair, exactIn, `maxPriceDecay = 0`, feed quoting the same price the
curve is centred on. Reverting only the scaling line and rerunning their suite:

```
1) test_ScaleAnswerMatchesTheRawUnitConvention()          3000000000000000000000 != 3000000000
2) test_OracleAdjusterIgnoresWorseFeed()                  6000000000 != 3000000000
3) test_OracleAdjusterDoesNotAdjustWhenFeedMatchesCurve() 6000000000 != 3000000000
4) test_OracleAdjusterAppliesFeedPriceWhenBetter()        6000000000 !~= 3150000000
```

`6000000000` where the curve priced `3000000000`. Exactly twice, no revert.

Independently, through our own router on our own 18/6 book: 5,046,836,538 out where the curve priced
2,523,418,269. Same factor, different codebase, different fixture — which is what makes it a
property of the instruction rather than of one test.

### The fix

Scale the answer to `10 ** (18 + tokenOutDecimals - tokenInDecimals)`, the convention the swap price
is already in, and take both tokens' decimals in the encoding. On an eighteen-and-eighteen pair that
exponent is 18 and the instruction is unchanged.

Decimals are declared in the program rather than read from the tokens: two `decimals()` calls per
fill is real gas on the hot path, and a program is immutable once shipped and signed by the maker,
so a wrong declaration costs the party that made it.

This changes the encoding from four fields to six, which is breaking for anyone building the
instruction today. The PR says so plainly and offers a different shape if they would rather.

Their suite goes from 797 to 803 passing. The PR adds `test/solidity/OraclePriceAdjuster.t.sol` and
a `PriceOracleMock`, because they had neither.

### Standing, honestly stated

[`#31`](https://github.com/1inch/swap-vm/issues/31) reported the scale mismatch on 10 Dec 2025 and
was closed as completed on 4 Sep 2026 with:

> Thank you for the issue
>
> The `OraclePriceAdjuster` is unused opcode and is not in development focus now

So the mismatch was known. What was not on record is that it **pays out** rather than merely
behaving unreliably, and that no configuration avoids it. That is what our comment adds and what the
PR fixes.

The maintainers may well not merge it, and that is their call on an opcode they have said is out of
focus. Nothing in this repository claims otherwise.

### In our own tree

The same fix, in our fork's copy, with the divergence from upstream written into the file:
`contracts/src/instructions/OraclePriceAdjuster.sol`. Tests in
`contracts/test/subfloor/OracleAdjusterDecimals.t.sol` (the arithmetic, both implementations side by
side) and `contracts/test/subfloor/OracleAdjusterMismatchedPair.t.sol` (end to end on an 18/6 book
through the shipped router). Written up as counterexample 3 in `docs/counterexamples.md`.

The book still ships with `oracle` unset. The live router parses the old four-field encoding, so
turning it on needs a router redeploy and reverify first, and that is not worth doing days before
submission for an improvement the position never had.
