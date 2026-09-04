// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { FloorRegistry } from "../../src/subfloor/FloorRegistry.sol";
import { IFloorRegistry } from "../../src/subfloor/IFloorRegistry.sol";
import { SubfloorParams } from "../../src/subfloor/SubfloorParams.sol";

contract MockAggregator {
    int256 public answer;
    uint256 public updatedAt;

    constructor(int256 answer_, uint256 updatedAt_) {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function set(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract FloorRegistryTest is Test {
    // The provisional bound and its provenance live in SubfloorParams; the tests use the same
    // number the deployment will, so a revision there is caught here.
    uint32 internal constant STALENESS_BOUND = SubfloorParams.ETH_USD_STALENESS_BOUND_PROVISIONAL;
    uint8 internal constant FEED_DECIMALS = SubfloorParams.BASE_ETH_USD_DECIMALS;
    int256 internal constant ETH_USD = 2500e8; // round number for hand-computed expectations

    address internal constant WETH = SubfloorParams.BASE_WETH;
    address internal constant USDC = SubfloorParams.BASE_USDC;

    FloorRegistry internal registry;
    MockAggregator internal feed;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal ledger = makeAddr("ledger");

    function setUp() public {
        vm.warp(1_757_000_000);
        registry = new FloorRegistry(owner);
        feed = new MockAggregator(ETH_USD, block.timestamp);

        vm.startPrank(owner);
        // WETH given, USDC received: the feed already quotes USD per ETH, so no inversion.
        registry.setReferenceFeed(WETH, USDC, address(feed), false, STALENESS_BOUND, FEED_DECIMALS, 18, 6);
        // USDC given, WETH received: the same feed, read the other way up.
        registry.setReferenceFeed(USDC, WETH, address(feed), true, STALENESS_BOUND, FEED_DECIMALS, 6, 18);
        vm.stopPrank();
    }

    // --- the opt-out path ---------------------------------------------------------------------

    function test_unconfiguredRecipientIsNotEnforced() public view {
        (uint256 floorRate, bool enforced) = registry.effectiveFloor(alice, WETH, USDC);
        assertEq(floorRate, 0);
        assertFalse(enforced);
    }

    function test_unconfiguredRecipientPassesAnyFill() public view {
        registry.checkFill(alice, WETH, USDC, 1e18, 1);
    }

    // --- rate orientation, pinned to hand-computed numbers ------------------------------------

    /// 1 WETH (1e18 raw) for 2500 USDC (2500e6 raw) is a rate of 2500e6 * 1e18 / 1e18 = 2.5e9.
    /// A 50 bps tolerance puts the floor at 2.5e9 * 9950 / 10000 = 2_487_500_000.
    function test_relativeFloor_wethForUsdc() public {
        vm.prank(alice);
        registry.raiseFloor(WETH, USDC, 50, 0);

        (uint256 floorRate, bool enforced) = registry.effectiveFloor(alice, WETH, USDC);
        assertTrue(enforced);
        assertEq(floorRate, 2_487_500_000);
    }

    /// The other orientation, same feed inverted: 2500 USDC (2500e6) for 1 WETH (1e18) is a rate
    /// of 1e18 * 1e18 / 2500e6 = 4e26. A 50 bps tolerance puts the floor at 3.98e26.
    function test_relativeFloor_usdcForWeth() public {
        vm.prank(alice);
        registry.raiseFloor(USDC, WETH, 50, 0);

        (uint256 floorRate,) = registry.effectiveFloor(alice, USDC, WETH);
        assertEq(floorRate, 398_000_000_000_000_000_000_000_000);
    }

    function test_checkFill_passesAtTheFloor() public {
        vm.prank(alice);
        registry.raiseFloor(WETH, USDC, 50, 0);
        registry.checkFill(alice, WETH, USDC, 1e18, 2_487_500_000);
    }

    function test_checkFill_revertsOneWeiBelowTheFloor() public {
        vm.prank(alice);
        registry.raiseFloor(WETH, USDC, 50, 0);

        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.SettledBelowFloor.selector, alice, WETH, USDC, uint256(2_487_499_999), uint256(2_487_500_000)));
        registry.checkFill(alice, WETH, USDC, 1e18, 2_487_499_999);
    }

    // --- resolution order ---------------------------------------------------------------------

    function test_defaultToleranceAppliesWhenThePairHasNoEntry() public {
        vm.prank(alice);
        registry.tightenDefaultTolerance(100);

        (uint256 floorRate, bool enforced) = registry.effectiveFloor(alice, WETH, USDC);
        assertTrue(enforced);
        assertEq(floorRate, 2_475_000_000); // 2.5e9 * 9900 / 10000
    }

    function test_pairEntryBeatsTheDefault() public {
        vm.startPrank(alice);
        registry.tightenDefaultTolerance(100);
        registry.raiseFloor(WETH, USDC, 50, 0);
        vm.stopPrank();

        (uint256 floorRate,) = registry.effectiveFloor(alice, WETH, USDC);
        assertEq(floorRate, 2_487_500_000); // the pair's 50 bps, not the default's 100
    }

    function test_effectiveFloorIsTheStrongerOfRelativeAndAbsolute() public {
        // Relative gives 2_487_500_000; an absolute backstop above it must win.
        vm.prank(alice);
        registry.raiseFloor(WETH, USDC, 50, 2_490_000_000);
        (uint256 floorRate,) = registry.effectiveFloor(alice, WETH, USDC);
        assertEq(floorRate, 2_490_000_000);

        // And a backstop below it must not weaken anything.
        vm.prank(bob);
        registry.raiseFloor(WETH, USDC, 50, 2_000_000_000);
        (uint256 bobFloor,) = registry.effectiveFloor(bob, WETH, USDC);
        assertEq(bobFloor, 2_487_500_000);
    }

    function test_fullToleranceLeavesOnlyTheBackstop() public {
        vm.prank(alice);
        registry.raiseFloor(WETH, USDC, 10_000, 2_000_000_000);
        (uint256 floorRate, bool enforced) = registry.effectiveFloor(alice, WETH, USDC);
        assertTrue(enforced);
        assertEq(floorRate, 2_000_000_000);
    }

    // --- fail closed ---------------------------------------------------------------------------

    function test_staleFeedWithNoBackstopReverts() public {
        vm.prank(alice);
        registry.raiseFloor(WETH, USDC, 50, 0);

        vm.warp(block.timestamp + STALENESS_BOUND + 1);
        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.StaleReference.selector, WETH, USDC, feed.updatedAt(), uint256(STALENESS_BOUND)));
        registry.effectiveFloor(alice, WETH, USDC);
    }

    function test_staleFeedWithBackstopFallsBackToTheBackstop() public {
        vm.prank(alice);
        registry.raiseFloor(WETH, USDC, 50, 2_000_000_000);

        vm.warp(block.timestamp + STALENESS_BOUND + 1);
        (uint256 floorRate, bool enforced) = registry.effectiveFloor(alice, WETH, USDC);
        assertTrue(enforced);
        assertEq(floorRate, 2_000_000_000);
    }

    function test_feedExactlyAtTheBoundIsStillFresh() public {
        vm.prank(alice);
        registry.raiseFloor(WETH, USDC, 50, 0);

        vm.warp(block.timestamp + STALENESS_BOUND);
        (uint256 floorRate,) = registry.effectiveFloor(alice, WETH, USDC);
        assertEq(floorRate, 2_487_500_000);
    }

    function test_relativeFloorOnAPairWithNoFeedReverts() public {
        address rando = makeAddr("rando");
        vm.prank(alice);
        registry.raiseFloor(WETH, rando, 50, 0);

        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.NoReferenceFeed.selector, WETH, rando));
        registry.effectiveFloor(alice, WETH, rando);
    }

    function test_nonPositiveAnswerReverts() public {
        vm.prank(alice);
        registry.raiseFloor(WETH, USDC, 50, 0);

        feed.set(0, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.BadReferenceAnswer.selector, WETH, USDC, int256(0)));
        registry.effectiveFloor(alice, WETH, USDC);
    }

    // --- the asymmetry ---------------------------------------------------------------------------

    function test_raiseCannotWidenTolerance() public {
        vm.startPrank(alice);
        registry.raiseFloor(WETH, USDC, 50, 0);
        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.NotARaise.selector, uint16(50), uint16(60), uint256(0), uint256(0)));
        registry.raiseFloor(WETH, USDC, 60, 0);
        vm.stopPrank();
    }

    function test_raiseCannotLowerTheBackstop() public {
        vm.startPrank(alice);
        registry.raiseFloor(WETH, USDC, 50, 2_000_000_000);
        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.NotARaise.selector, uint16(50), uint16(50), uint256(2_000_000_000), uint256(1_000_000_000)));
        registry.raiseFloor(WETH, USDC, 50, 1_000_000_000);
        vm.stopPrank();
    }

    function test_raiseCannotWeakenOneComponentWhileStrengtheningTheOther() public {
        vm.startPrank(alice);
        registry.raiseFloor(WETH, USDC, 50, 2_000_000_000);
        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.NotARaise.selector, uint16(50), uint16(40), uint256(2_000_000_000), uint256(1_000_000_000)));
        registry.raiseFloor(WETH, USDC, 40, 1_000_000_000);
        vm.stopPrank();
    }

    function test_defaultToleranceCannotBeWidened() public {
        vm.startPrank(alice);
        registry.tightenDefaultTolerance(100);
        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.NotARaise.selector, uint16(100), uint16(200), uint256(0), uint256(0)));
        registry.tightenDefaultTolerance(200);
        vm.stopPrank();
    }

    function test_raiseIsKeyedToTheCallerNotChosenForOthers() public {
        vm.prank(alice);
        registry.raiseFloor(WETH, USDC, 50, 0);

        (, bool bobEnforced) = registry.effectiveFloor(bob, WETH, USDC);
        assertFalse(bobEnforced);
    }

    function test_bpsAboveRangeReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FloorRegistry.MaxAdverseBpsOutOfRange.selector, uint16(10_001)));
        registry.raiseFloor(WETH, USDC, 10_001, 0);
    }

    function test_onlyOwnerSetsReferenceFeeds() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        registry.setReferenceFeed(WETH, USDC, address(feed), false, STALENESS_BOUND, 8, 18, 6);
    }

    function test_setGuardianEmitsAndStores() public {
        vm.expectEmit(true, false, false, true);
        emit IFloorRegistry.GuardianSet(alice, address(0), ledger);
        vm.prank(alice);
        registry.setGuardian(ledger);
        assertEq(registry.guardian(alice), ledger);
    }

    // --- the property the fuzzer is here for -----------------------------------------------------

    /// Raising can never weaken protection. Any sequence of accepted raises leaves the effective
    /// floor at or above where it was, for every step.
    function testFuzz_raisingIsMonotone(uint16[8] calldata bpsSeq, uint96[8] calldata absSeq) public {
        vm.startPrank(alice);
        uint256 previous = 0;
        bool everEnforced = false;

        for (uint256 i = 0; i < 8; ++i) {
            uint16 bps = uint16(bound(uint256(bpsSeq[i]), 0, 10_000));
            uint256 abs = uint256(absSeq[i]);
            try registry.raiseFloor(WETH, USDC, bps, abs) {
                (uint256 floorRate, bool enforced) = registry.effectiveFloor(alice, WETH, USDC);
                assertTrue(enforced);
                if (everEnforced) assertGe(floorRate, previous);
                previous = floorRate;
                everEnforced = true;
            } catch { }
        }
        vm.stopPrank();
    }
}
