// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { ConcentratedBook } from "../../src/subfloor/strategies/ConcentratedBook.sol";

/// @notice `bounds` at the edges, because the two most expensive bugs on this project were both
///         scale errors in this arithmetic and neither reverted.
///
/// The `REFERENCE` bug shipped a book quoting 1e12 out, which filled at a price nobody meant. The
/// `OraclePriceAdjuster` finding was the same shape from the other direction. Both passed every test
/// that existed because nothing asked what happens away from the one value the fixtures used.
/// `bounds` is `internal`, so a direct call from the test is inlined and `vm.expectRevert` never
/// sees a lower frame. This wrapper gives the revert somewhere to happen.
contract BoundsHarness {
    function bounds(uint256 referencePrice, uint16 spreadBps) external pure returns (uint256, uint256) {
        return ConcentratedBook.bounds(referencePrice, spreadBps);
    }
}

contract ConcentratedBookBoundsTest is Test {
    BoundsHarness internal harness = new BoundsHarness();

    uint16 internal constant BPS = 10_000;

    /// The exact bounds of the book currently on Base Sepolia, read out of its shipped program.
    ///
    /// Exact rather than bracketed, and that distinction is the point. A tolerance-shaped assertion
    /// passes when the arithmetic is reordered to divide before scaling — which loses the remainder
    /// and moves the bounds by a few thousand wei. That is invisible to a range check and it is
    /// exactly the difference that made the TypeScript composer produce different bytes from the
    /// contract. Two implementations of one wire format only stay in step if the test pins the
    /// number rather than the neighbourhood.
    function test_theBoundsOfTheBookThatIsLive() public pure {
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(2_478_669_714, 50);
        assertEq(lo, 49_661_618_634_816, "sqrtPriceMin moved");
        assertEq(hi, 49_910_550_613_773, "sqrtPriceMax moved");
    }

    /// The eighteen-decimal shape, so both conventions are covered by name rather than by accident.
    function test_theEighteenDecimalReference() public pure {
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(2_500e18, 50);
        assertLt(lo, hi);
    }

    function test_aOneWeiReferenceStillBrackets() public pure {
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(1, 5_000);
        // sqrt(0.5e18) and sqrt(1.5e18): far apart even at one wei, because of the 1e18 scaling.
        assertLt(lo, hi, "a one-wei reference collapses the range");
    }

    /// The range must never be empty, because `build` requires `sqrtPriceMin < sqrtPriceMax` and an
    /// empty one is a book that cannot quote. A spread small enough to round both bounds to the same
    /// integer is the way that happens.
    function testFuzz_theRangeIsNeverEmpty(uint128 refIn, uint16 spreadBps) public pure {
        uint256 ref = bound(uint256(refIn), 1, type(uint128).max);
        uint16 spread = uint16(bound(uint256(spreadBps), 1, BPS - 1));

        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(ref, spread);
        assertLt(lo, hi, "empty range");
    }

    /// The bounds bracket the reference in price space: lo*hi should land back on the reference,
    /// because sqrt(p*(1-s)) * sqrt(p*(1+s)) = p*sqrt(1-s^2) which is p to within the spread squared.
    function testFuzz_theRangeBracketsTheReference(uint96 refIn) public pure {
        uint256 ref = bound(uint256(refIn), 1e6, type(uint96).max);
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(ref, 50);

        uint256 product = (lo * hi) / 1e18;
        uint256 diff = product > ref ? product - ref : ref - product;
        // 50 bps either side, so the geometric mean sits within a few bps of the reference.
        assertLe(diff * BPS / ref, 2, "the range is not centred on the reference");
    }

    function test_aZeroSpreadIsRefused() public {
        vm.expectRevert();
        harness.bounds(2_478_669_714, 0);
    }

    function test_aFullSpreadIsRefused() public {
        vm.expectRevert();
        harness.bounds(2_478_669_714, BPS);
    }

    function test_aZeroReferenceIsRefused() public {
        vm.expectRevert();
        harness.bounds(0, 50);
    }

    /// A reference large enough to overflow the intermediate must revert rather than wrap. `mulDiv`
    /// reverts when the quotient does not fit, which is the fail-safe direction: no book instead of
    /// a book priced from a wrapped number.
    function test_anEnormousReferenceRevertsRatherThanWrapping() public {
        vm.expectRevert();
        harness.bounds(type(uint256).max, 50);
    }
}
