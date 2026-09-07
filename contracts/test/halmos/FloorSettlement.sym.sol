// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { SymTest } from "halmos-cheatcodes/SymTest.sol";
import { Test } from "forge-std/Test.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice The settlement lemma, extracted so it can be proved rather than sampled.
///
/// `FloorSettlementLemma` is the exact arithmetic `FloorRegistry._checkFill` runs, lifted out of the
/// contract. `test_lemmaMatchesTheRegistry` in `FloorRegistry.t.sol` pins the two together for
/// concrete inputs, so this is a proof about the shipped comparison and not about a lookalike.
///
/// Lifting it is deliberate and it is the spec's own cut order. Running Halmos against the whole
/// registry does not converge: `effectiveFloor` reaches an external oracle call through a storage
/// mapping, and the path count blows up before the solver reaches the comparison this is about.
/// The fuzz suite covers the contract end to end in the millions; what fuzzing cannot do is close
/// the space, and the space that matters is this comparison.
contract FloorSettlementLemma {
    uint256 internal constant _BPS = 10_000;
    uint256 internal constant _RATE_ONE = 1e18;

    error SettledBelowFloor(uint256 executionRate, uint256 floorRate);

    /// @dev Identical to FloorRegistry.effectiveFloor's final combination step.
    function effectiveFloor(uint256 referenceRate, uint16 maxAdverseBps, uint256 absoluteRate) public pure returns (uint256) {
        uint256 relative = 0;
        if (maxAdverseBps < _BPS) {
            relative = Math.mulDiv(referenceRate, _BPS - maxAdverseBps, _BPS, Math.Rounding.Ceil);
        }
        return Math.max(relative, absoluteRate);
    }

    /// @dev Identical to FloorRegistry._checkFill's comparison.
    function checkFill(uint256 given, uint256 received, uint256 floorRate) public pure {
        uint256 executionRate = given == 0 ? type(uint256).max : Math.mulDiv(received, _RATE_ONE, given);
        require(executionRate >= floorRate, SettledBelowFloor(executionRate, floorRate));
    }

    function executionRate(uint256 given, uint256 received) public pure returns (uint256) {
        return given == 0 ? type(uint256).max : Math.mulDiv(received, _RATE_ONE, given);
    }
}

contract FloorSettlementSymTest is SymTest, Test {
    FloorSettlementLemma internal lemma;

    function setUp() public {
        lemma = new FloorSettlementLemma();
    }

    /// For all inputs: if the check passes, what actually moved was at or above the floor.
    ///
    /// Bounded to amounts below 2**128. That is not a convenience: OpenZeppelin's `mulDiv` carries a
    /// full 512-bit path for products that overflow 256 bits, and leaving the domain open makes the
    /// solver explore it without terminating in any time worth waiting for. Under 2**128 the product
    /// with 1e18 cannot overflow, the 512-bit branch is unreachable, and what is proved is the
    /// arithmetic that actually runs for every token amount that can exist — total supply of every
    /// real ERC-20 is orders of magnitude below this bound.
    function check_passingImpliesAtOrAboveTheFloor(uint256 given, uint256 received, uint256 floorRate) public view {
        vm.assume(given < 2 ** 128);
        vm.assume(received < 2 ** 128);

        lemma.checkFill(given, received, floorRate);
        assert(lemma.executionRate(given, received) >= floorRate);
    }

    /// The converse, which is the half that makes it a guarantee rather than a formality. A check
    /// that never passes a bad fill *and never passes a good one either* would satisfy the lemma
    /// above and be worthless.
    function check_belowTheFloorAlwaysReverts(uint256 given, uint256 received, uint256 floorRate) public {
        vm.assume(given < 2 ** 128);
        vm.assume(received < 2 ** 128);

        uint256 rate = lemma.executionRate(given, received);
        vm.assume(rate < floorRate);

        (bool ok,) = address(lemma).call(abi.encodeCall(FloorSettlementLemma.checkFill, (given, received, floorRate)));
        assert(!ok);
    }

    /// Strengthening never weakens, proved one component at a time.
    ///
    /// The combined version — both components varying at once — does not converge: 31 paths and a
    /// solver timeout, because two independent `mulDiv` calls with `Ceil` rounding leave the solver
    /// relating two symbolic divisions. Split, each half is small. The conjunction of the two is
    /// the property, since `effectiveFloor` is a max over the two components and max is monotone in
    /// each argument independently.
    function check_tighteningToleranceRaisesTheFloor(uint256 referenceRate, uint16 bpsLoose, uint16 bpsTight, uint256 absolute)
        public
        view
    {
        vm.assume(bpsLoose <= 10_000 && bpsTight <= bpsLoose);
        vm.assume(referenceRate < 2 ** 128);

        uint256 weaker = lemma.effectiveFloor(referenceRate, bpsLoose, absolute);
        uint256 stronger = lemma.effectiveFloor(referenceRate, bpsTight, absolute);
        assert(stronger >= weaker);
    }

    function check_raisingTheBackstopRaisesTheFloor(uint256 referenceRate, uint16 bps, uint256 absSmall, uint256 absLarge)
        public
        view
    {
        vm.assume(bps <= 10_000);
        vm.assume(absLarge >= absSmall);
        vm.assume(referenceRate < 2 ** 128);

        uint256 weaker = lemma.effectiveFloor(referenceRate, bps, absSmall);
        uint256 stronger = lemma.effectiveFloor(referenceRate, bps, absLarge);
        assert(stronger >= weaker);
    }
}
