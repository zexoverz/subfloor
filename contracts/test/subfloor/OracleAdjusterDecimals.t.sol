// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { OraclePriceAdjuster } from "../../src/instructions/OraclePriceAdjuster.sol";

/// @notice Whether the oracle adjuster is safe to put in a book whose two tokens have different
///         decimals. Upstream's is not, and the failure is silent and expensive; this repo's copy
///         takes both tokens' decimals to make the comparison mean what it looks like.
///
/// Upstream rescales the feed answer to 1e18 and compares it against the swap's realised price,
/// computed as `amountOut * 1e18 / amountIn` in **raw** token units. On a pair where both tokens
/// have eighteen decimals those two are the same scale. On WETH/tUSDC, which is what this
/// deployment actually trades, the swap price is ~2.478e9 while the rescaled answer is ~2.478e21,
/// so the oracle looks better by twelve orders of magnitude on every single fill.
///
/// The consequence is not a revert. `adjustment = min(priceRatio, 2e18 - maxPriceDecay)` clamps,
/// and the taker is handed the clamp — up to twice the tokenOut the curve priced. It fills, at a
/// price nobody meant, which is the same shape as the `REFERENCE` scaling bug §3 already records.
contract OracleAdjusterDecimalsTest is Test {
    uint256 internal constant ONE = 1e18;

    /// ETH/USD at $2,478.67, in the feed's own eight decimals.
    int256 internal constant ANSWER = 247_867e6;
    uint8 internal constant FEED_DECIMALS = 8;

    uint8 internal constant WETH_DECIMALS = 18;
    uint8 internal constant TUSDC_DECIMALS = 6;

    /// One WETH in, priced by the curve at 2,478.67 tUSDC. Raw units: 1e18 in, 2478.67e6 out.
    uint256 internal constant AMOUNT_IN = 1e18;
    uint256 internal constant AMOUNT_OUT = 2_478_670_000;

    /// The constant above says what it is meant to say. Pinned because an earlier version of this
    /// file wrote `247_867 * 1e4`, which is $24.79, and the exponent test below then passed through
    /// the `oraclePrice <= currentPrice` early return rather than by the two sides lining up.
    function test_theFeedAnswerIsTheStatedPrice() public pure {
        assertEq(uint256(ANSWER) / 10 ** FEED_DECIMALS, 2478, "answer decodes to ~$2,478");
    }

    /* ------------------------------------------------------------------------------------------
     * Upstream, reproduced inline so the failure is checked rather than described.
     * ---------------------------------------------------------------------------------------- */

    /// The arithmetic upstream performs, exactIn branch, with its 1e18 rescale.
    function _upstreamAdjustedOut(
        int256 answer,
        uint8 oracleDecimals,
        uint64 maxPriceDecay,
        uint256 amountIn,
        uint256 amountOut
    ) internal pure returns (uint256) {
        uint256 oraclePrice = uint256(answer);
        if (oracleDecimals < 18) oraclePrice = oraclePrice * 10 ** (18 - oracleDecimals);
        else if (oracleDecimals > 18) oraclePrice = oraclePrice / 10 ** (oracleDecimals - 18);

        return _applyExactIn(oraclePrice, maxPriceDecay, amountIn, amountOut);
    }

    /// Everything after the rescale, shared by both, because the rescale is the only difference.
    function _applyExactIn(
        uint256 oraclePrice,
        uint64 maxPriceDecay,
        uint256 amountIn,
        uint256 amountOut
    ) internal pure returns (uint256) {
        uint256 currentPrice = (amountOut * ONE) / amountIn;
        if (oraclePrice <= currentPrice) return amountOut;

        uint256 priceRatio = (oraclePrice * ONE) / currentPrice;
        uint256 maxIncrease = (2 * ONE - maxPriceDecay);
        uint256 adjustment = priceRatio < maxIncrease ? priceRatio : maxIncrease;
        return (amountOut * adjustment) / ONE;
    }

    function test_upstreamOnAMismatchedPairDoublesTheTakersFill() public pure {
        // `maxPriceDecay = 0` is the permissive setting, and the one a reader would pick to mean
        // "let the oracle correct the price freely".
        uint256 adjusted = _upstreamAdjustedOut(ANSWER, FEED_DECIMALS, 0, AMOUNT_IN, AMOUNT_OUT);
        assertEq(adjusted, AMOUNT_OUT * 2, "the taker is handed the clamp, not a correction");
    }

    /// Tightening the cap does not fix it. It only chooses how much is given away.
    function test_upstreamATightCapStillGivesAwayEverythingUpToTheCap() public pure {
        uint64 tenPercent = 0.9e18; // maxIncrease = 2e18 - 0.9e18 = 1.1e18
        uint256 adjusted = _upstreamAdjustedOut(ANSWER, FEED_DECIMALS, tenPercent, AMOUNT_IN, AMOUNT_OUT);
        assertEq(adjusted, (AMOUNT_OUT * 1.1e18) / ONE, "still the clamp, just a smaller one");
    }

    /// The comparison is only meaningful when both sides are the same scale, which is what an
    /// eighteen-and-eighteen pair gives for free and this deployment does not have.
    function test_upstreamOnAMatchedPairBehaves() public pure {
        uint256 outEighteen = 2_478_670_000_000_000_000_000; // 2478.67e18
        uint256 adjusted = _upstreamAdjustedOut(ANSWER, FEED_DECIMALS, 0, AMOUNT_IN, outEighteen);
        assertEq(adjusted, outEighteen, "the curve already matches the oracle, so nothing moves");
    }

    /// Passing the pair's decimal difference through `oracleDecimals` is the tempting one-character
    /// fix. It lines the two sides up in this direction, and it is still wrong: the argument name
    /// then lies, and the other direction of the same book needs `8 - 18 + 6 = -4`, which a `uint8`
    /// cannot hold. Recorded because it is a trap for the next reader.
    function test_theTemptingFixIsAnExponentThatCannotBeNegative() public pure {
        uint8 asIfDecimals = FEED_DECIMALS + 12;
        uint256 adjusted = _upstreamAdjustedOut(ANSWER, asIfDecimals, 0, AMOUNT_IN, AMOUNT_OUT);
        assertEq(adjusted, AMOUNT_OUT, "lines up, and only because the argument is being misused");

        // The exponent the other leg would need, as a signed number, is below zero.
        assertLt(int256(uint256(FEED_DECIMALS)) - 18 + 6, 0, "the reverse leg has no encodable exponent");
    }

    /* ------------------------------------------------------------------------------------------
     * This repo's copy.
     * ---------------------------------------------------------------------------------------- */

    /// The rescale lands on the raw-unit convention the swap price is already in.
    function test_theAnswerIsScaledToTheRawUnitPrice() public pure {
        assertEq(
            OraclePriceAdjuster.scaleAnswer(uint256(ANSWER), FEED_DECIMALS, WETH_DECIMALS, TUSDC_DECIMALS),
            2_478_670_000,
            "1e18-scaled tUSDC per wei, the same number the curve produces"
        );
    }

    /// The other leg of the same book, where the exponent goes the other way. Upstream's parameter
    /// could not express this at all; here it is one branch of the same expression.
    function test_theOtherDirectionScalesUpwardsRatherThanDown() public pure {
        assertEq(
            OraclePriceAdjuster.scaleAnswer(uint256(ANSWER), FEED_DECIMALS, TUSDC_DECIMALS, WETH_DECIMALS),
            uint256(ANSWER) * 10 ** 22,
            "18 + 18 - 6 - 8 = 22"
        );
    }

    /// On an eighteen-and-eighteen pair this is upstream, exactly. The fix is not a new behaviour,
    /// it is the old behaviour extended to pairs upstream could not describe.
    function test_onAMatchedPairItReducesToUpstream() public pure {
        assertEq(
            OraclePriceAdjuster.scaleAnswer(uint256(ANSWER), FEED_DECIMALS, 18, 18),
            uint256(ANSWER) * 10 ** (18 - uint256(FEED_DECIMALS)),
            "the same 1e18 rescale upstream performs"
        );
    }

    /// The whole point: a curve priced at the feed is left alone rather than doubled.
    function test_aCurveAtTheFeedPriceIsNotAdjusted() public pure {
        uint256 oraclePrice = OraclePriceAdjuster.scaleAnswer(uint256(ANSWER), FEED_DECIMALS, WETH_DECIMALS, TUSDC_DECIMALS);
        assertEq(_applyExactIn(oraclePrice, 0, AMOUNT_IN, AMOUNT_OUT), AMOUNT_OUT, "no adjustment, and no giveaway");
    }

    /// And a feed that really is better moves the fill by what it is better by, not to the clamp.
    function test_aBetterFeedMovesTheFillByTheRealDifference() public pure {
        int256 higher = 260_000e6; // $2,600.00
        uint256 oraclePrice = OraclePriceAdjuster.scaleAnswer(uint256(higher), FEED_DECIMALS, WETH_DECIMALS, TUSDC_DECIMALS);

        uint256 adjusted = _applyExactIn(oraclePrice, 0, AMOUNT_IN, AMOUNT_OUT);

        // ~4.9% better, nowhere near the 2x clamp upstream would have handed over.
        assertApproxEqRel(adjusted, 2_600_000_000, 1e12, "the taker gets the feed price");
        assertLt(adjusted, AMOUNT_OUT * 2, "and not the clamp");
    }

    /// The curve keeps its spread when the feed is worse. Adjustment is one-directional by design.
    function test_aWorseFeedIsIgnored() public pure {
        int256 lower = 200_000e6; // $2,000.00
        uint256 oraclePrice = OraclePriceAdjuster.scaleAnswer(uint256(lower), FEED_DECIMALS, WETH_DECIMALS, TUSDC_DECIMALS);
        assertEq(_applyExactIn(oraclePrice, 0, AMOUNT_IN, AMOUNT_OUT), AMOUNT_OUT, "the maker keeps the spread");
    }
}
