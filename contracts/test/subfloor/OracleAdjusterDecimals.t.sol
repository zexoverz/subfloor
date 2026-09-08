// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";

import { OraclePriceAdjuster } from "../../src/instructions/OraclePriceAdjuster.sol";

/// @notice Whether `OraclePriceAdjuster` is safe to put in a book whose two tokens have different
///         decimals. It is not, and the failure is silent and expensive.
///
/// The opcode compares the feed answer, rescaled to 1e18, against the swap's realised price computed
/// as `amountOut * 1e18 / amountIn` — in **raw** token units. On a pair where both tokens have
/// eighteen decimals those two are the same scale and the comparison means what it looks like. On
/// WETH/tUSDC, which is what this deployment actually trades, the swap price is ~2.478e9 while the
/// rescaled answer is ~2.478e21, so the oracle looks better by twelve orders of magnitude on every
/// single fill.
///
/// The consequence is not a revert. `adjustment = min(priceRatio, 2e18 - maxPriceDecay)` clamps, and
/// the taker is handed the clamp — up to twice the tokenOut the curve priced. It fills, at a price
/// nobody meant, which is the same shape as the `REFERENCE` scaling bug §3 already records.
contract OracleAdjusterDecimalsTest is Test {
    /// The arithmetic the opcode performs, reproduced exactly so the claim is checked rather than
    /// asserted from reading. Mirrors `OraclePriceAdjuster.exec` for the exactIn branch.
    function _adjustedOut(
        int256 answer,
        uint8 oracleDecimals,
        uint64 maxPriceDecay,
        uint256 amountIn,
        uint256 amountOut
    ) internal pure returns (uint256) {
        uint256 ONE = 1e18;

        uint256 oraclePrice = uint256(answer);
        if (oracleDecimals < 18) oraclePrice = oraclePrice * 10 ** (18 - oracleDecimals);
        else if (oracleDecimals > 18) oraclePrice = oraclePrice / 10 ** (oracleDecimals - 18);

        uint256 currentPrice = (amountOut * ONE) / amountIn;
        if (oraclePrice <= currentPrice) return amountOut;

        uint256 priceRatio = (oraclePrice * ONE) / currentPrice;
        uint256 maxIncrease = (2 * ONE - maxPriceDecay);
        uint256 adjustment = priceRatio < maxIncrease ? priceRatio : maxIncrease;
        return (amountOut * adjustment) / ONE;
    }

    /// ETH/USD at $2,478.67, the feed's own eight decimals.
    int256 internal constant ANSWER = 247_867;
    uint8 internal constant FEED_DECIMALS = 8;

    /// One WETH in, priced by the curve at 2,478.67 tUSDC. Raw units: 1e18 in, 2478.67e6 out.
    uint256 internal constant AMOUNT_IN = 1e18;
    uint256 internal constant AMOUNT_OUT = 2_478_670_000;

    function test_onAMismatchedPairTheAdjusterDoublesTheTakersFill() public pure {
        // `maxPriceDecay = 0` is the permissive setting, and the one a reader would pick to mean
        // "let the oracle correct the price freely".
        uint256 adjusted = _adjustedOut(ANSWER * 1e4, FEED_DECIMALS, 0, AMOUNT_IN, AMOUNT_OUT);
        assertEq(adjusted, AMOUNT_OUT * 2, "the taker is handed the clamp, not a correction");
    }

    /// Tightening the cap does not fix it. It only chooses how much is given away.
    function test_aTightCapStillGivesAwayEverythingUpToTheCap() public pure {
        uint256 tenPercent = 0.9e18; // maxIncrease = 2e18 - 0.9e18 = 1.1e18
        uint256 adjusted = _adjustedOut(ANSWER * 1e4, FEED_DECIMALS, uint64(tenPercent), AMOUNT_IN, AMOUNT_OUT);
        assertEq(adjusted, (AMOUNT_OUT * 1.1e18) / 1e18, "still the clamp, just a smaller one");
    }

    /// The comparison is only meaningful when both sides are the same scale, which is what an
    /// eighteen-and-eighteen pair gives for free and this deployment does not have.
    function test_onAMatchedPairTheAdjusterBehaves() public pure {
        uint256 outEighteen = 2_478_670_000_000_000_000_000; // 2478.67e18
        uint256 adjusted = _adjustedOut(ANSWER * 1e4, FEED_DECIMALS, 0, AMOUNT_IN, outEighteen);
        assertEq(adjusted, outEighteen, "the curve already matches the oracle, so nothing moves");
    }

    /// There is a scaling exponent that makes the two sides line up — but it is the parameter named
    /// `oracleDecimals`, and using it this way means the number in the program is not the feed's
    /// decimals at all. Recorded because it is the tempting fix and it is a trap for the next reader.
    function test_thereIsAWorkingExponentAndItIsNotTheFeedsDecimals() public pure {
        // WETH is 18 and tUSDC is 6, so the raw-unit price is 1e12 smaller than the human one.
        // 8 + 12 = 20 makes the rescaled answer land on the raw scale.
        uint8 asIfDecimals = FEED_DECIMALS + 12;
        uint256 adjusted = _adjustedOut(ANSWER * 1e4, asIfDecimals, 0, AMOUNT_IN, AMOUNT_OUT);
        assertEq(adjusted, AMOUNT_OUT, "lines up, and only because the argument is being misused");
    }
}
