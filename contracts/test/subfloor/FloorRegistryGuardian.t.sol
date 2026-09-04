// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { FloorRegistry } from "../../src/subfloor/FloorRegistry.sol";
import { IFloorRegistry } from "../../src/subfloor/IFloorRegistry.sol";
import { SubfloorParams } from "../../src/subfloor/SubfloorParams.sol";

contract MockAggregator {
    int256 public answer;
    uint256 public updatedAt;

    constructor(int256 a, uint256 u) {
        answer = a;
        updatedAt = u;
    }

    function set(int256 a, uint256 u) external {
        answer = a;
        updatedAt = u;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

/// @notice The asymmetry, tested. Strengthening is one call from the recipient. Weakening takes a
///         signature from a key the trading machine never holds, and so does replacing that key.
contract FloorRegistryGuardianTest is Test {
    address internal constant WETH = SubfloorParams.BASE_WETH;
    address internal constant USDC = SubfloorParams.BASE_USDC;
    uint32 internal constant BOUND = SubfloorParams.ETH_USD_STALENESS_BOUND_PROVISIONAL;

    FloorRegistry internal registry;
    MockAggregator internal feed;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");

    address internal ledger;
    uint256 internal ledgerPK = 0x1EDCE1;
    address internal attacker;
    uint256 internal attackerPK = 0xBAD;

    bytes32 internal constant FLOOR_LOWERING_TYPEHASH =
        keccak256("FloorLowering(address recipient,address base,address quote,uint16 maxAdverseBps,uint256 absoluteRate,uint256 nonce,uint256 deadline)");
    bytes32 internal constant GUARDIAN_ROTATION_TYPEHASH =
        keccak256("GuardianRotation(address recipient,address newGuardian,uint256 nonce,uint256 deadline)");

    function setUp() public {
        ledger = vm.addr(ledgerPK);
        attacker = vm.addr(attackerPK);

        vm.warp(1_757_000_000);
        registry = new FloorRegistry(owner, 0);
        feed = new MockAggregator(2500e8, block.timestamp);

        vm.prank(owner);
        registry.setReferenceFeed(WETH, USDC, address(feed), false, BOUND, 8, 18, 6);

        vm.startPrank(alice);
        registry.setGuardian(ledger);
        registry.raiseFloor(WETH, USDC, 50, 0);
        vm.stopPrank();
    }

    function test_guardianSignatureLowersTheFloor() public {
        (uint256 before,) = registry.effectiveFloor(alice, WETH, USDC);
        assertEq(before, 2_487_500_000);

        _lowerFloor(200, 0, 0, block.timestamp + 1 hours, ledgerPK);

        (uint256 after_,) = registry.effectiveFloor(alice, WETH, USDC);
        assertEq(after_, 2_450_000_000); // 2.5e9 * 9800 / 10000
        assertEq(registry.nonces(alice), 1);
    }

    function test_wrongSignerIsRejected() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sigLowerFloor(200, 0, 0, deadline, attackerPK);

        vm.expectRevert();
        registry.lowerFloor(alice, WETH, USDC, 200, 0, 0, deadline, sig);
    }

    function test_replayedSignatureIsRejected() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sigLowerFloor(200, 0, 0, deadline, ledgerPK);
        registry.lowerFloor(alice, WETH, USDC, 200, 0, 0, deadline, sig);

        vm.expectRevert(abi.encodeWithSelector(FloorRegistry.WrongNonce.selector, uint256(1), uint256(0)));
        registry.lowerFloor(alice, WETH, USDC, 200, 0, 0, deadline, sig);
    }

    function test_expiredSignatureIsRejected() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sigLowerFloor(200, 0, 0, deadline, ledgerPK);
        vm.warp(deadline + 1);

        vm.expectRevert(abi.encodeWithSelector(FloorRegistry.SignatureExpired.selector, deadline));
        registry.lowerFloor(alice, WETH, USDC, 200, 0, 0, deadline, sig);
    }

    function test_signatureForOnePairDoesNotLowerAnother() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sigLowerFloor(200, 0, 0, deadline, ledgerPK);

        // Same everything, different quote token: the digest changes, so the signature fails.
        vm.expectRevert();
        registry.lowerFloor(alice, WETH, address(0xdead), 200, 0, 0, deadline, sig);
    }

    function test_recipientAloneCannotWeakenAnything() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.NotARaise.selector, uint16(50), uint16(200), uint256(0), uint256(0)));
        registry.raiseFloor(WETH, USDC, 200, 0);
    }

    // --- the rotation hole ---------------------------------------------------------------------

    /// Without this the guardian is decorative: a recipient key that has been taken over appoints a
    /// guardian it controls, signs with it, and lowers the floor to zero. The hardware would be
    /// protecting nothing.
    function test_recipientCannotAppointANewGuardianOnceOneIsSet() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FloorRegistry.NoGuardianRegistered.selector, alice));
        registry.setGuardian(attacker);

        assertEq(registry.guardian(alice), ledger);
    }

    function test_rotationNeedsTheOutgoingGuardiansSignature() public {
        address newLedger = makeAddr("newLedger");
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 structHash = keccak256(abi.encode(GUARDIAN_ROTATION_TYPEHASH, alice, newLedger, uint256(0), deadline));
        bytes memory badSig = _sign(structHash, attackerPK);
        bytes memory goodSig = _sign(structHash, ledgerPK);

        vm.expectRevert();
        registry.rotateGuardian(alice, newLedger, 0, deadline, badSig);

        registry.rotateGuardian(alice, newLedger, 0, deadline, goodSig);
        assertEq(registry.guardian(alice), newLedger);
    }

    function test_lowerFloorWithoutAGuardianReverts() public {
        address bob = makeAddr("bob");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(FLOOR_LOWERING_TYPEHASH, bob, WETH, USDC, uint16(200), uint256(0), uint256(0), deadline));
        bytes memory sig = _sign(structHash, ledgerPK);

        vm.expectRevert(abi.encodeWithSelector(FloorRegistry.NoGuardianRegistered.selector, bob));
        registry.lowerFloor(bob, WETH, USDC, 200, 0, 0, deadline, sig);
    }

    // --- the timelock, off for the live run and available as a constructor option --------------

    /// Deployed with a delay, a signed weakening does not bind when it is signed. It is announced
    /// on-chain and anyone can see it coming before the floor actually moves.
    function test_withADelayTheLoweringIsScheduledNotApplied() public {
        FloorRegistry delayed = _delayedRegistry(1 days);

        (uint256 before,) = delayed.effectiveFloor(alice, WETH, USDC);
        assertEq(before, 2_487_500_000);

        _lowerOn(delayed, 200, block.timestamp + 1 hours);

        (uint256 stillBefore,) = delayed.effectiveFloor(alice, WETH, USDC);
        assertEq(stillBefore, 2_487_500_000, "the floor must not move yet");
    }

    function test_executingBeforeTheDelayReverts() public {
        FloorRegistry delayed = _delayedRegistry(1 days);
        _lowerOn(delayed, 200, block.timestamp + 1 hours);

        uint64 effectiveAt = uint64(block.timestamp + 1 days);
        vm.expectRevert(abi.encodeWithSelector(FloorRegistry.LoweringStillTimelocked.selector, effectiveAt));
        delayed.executeLowering(alice, WETH, USDC);
    }

    function test_executingAfterTheDelayApplies() public {
        FloorRegistry delayed = _delayedRegistry(1 days);
        _lowerOn(delayed, 200, block.timestamp + 1 hours);

        vm.warp(block.timestamp + 1 days);
        feed.set(2500e8, block.timestamp); // a day passed; the reference has to be fresh to read
        delayed.executeLowering(alice, WETH, USDC);

        (uint256 after_,) = delayed.effectiveFloor(alice, WETH, USDC);
        assertEq(after_, 2_450_000_000);
    }

    function test_executingWithNothingPendingReverts() public {
        FloorRegistry delayed = _delayedRegistry(1 days);
        vm.expectRevert(abi.encodeWithSelector(FloorRegistry.NoPendingLowering.selector, alice, WETH, USDC));
        delayed.executeLowering(alice, WETH, USDC);
    }

    /// The live run deploys with delay 0, so a signed weakening binds immediately. That is the
    /// configuration the shoot-day floor adjustments depend on.
    function test_withNoDelayTheLoweringAppliesImmediately() public {
        _lowerFloor(200, 0, 0, block.timestamp + 1 hours, ledgerPK);
        (uint256 after_,) = registry.effectiveFloor(alice, WETH, USDC);
        assertEq(after_, 2_450_000_000);
    }

    function _delayedRegistry(uint32 delay) private returns (FloorRegistry d) {
        d = new FloorRegistry(owner, delay);
        vm.prank(owner);
        d.setReferenceFeed(WETH, USDC, address(feed), false, BOUND, 8, 18, 6);
        vm.startPrank(alice);
        d.setGuardian(ledger);
        d.raiseFloor(WETH, USDC, 50, 0);
        vm.stopPrank();
    }

    function _lowerOn(FloorRegistry d, uint16 bps, uint256 deadline) private {
        bytes32 structHash = keccak256(abi.encode(FLOOR_LOWERING_TYPEHASH, alice, WETH, USDC, bps, uint256(0), uint256(0), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", d.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s2) = vm.sign(ledgerPK, digest);
        d.lowerFloor(alice, WETH, USDC, bps, 0, 0, deadline, abi.encodePacked(r, s2, v));
    }

    // --- helpers ---------------------------------------------------------------------------------

    function _lowerFloor(uint16 bps, uint256 abs, uint256 nonce, uint256 deadline, uint256 pk) private {
        registry.lowerFloor(alice, WETH, USDC, bps, abs, nonce, deadline, _sigLowerFloor(bps, abs, nonce, deadline, pk));
    }

    function _sigLowerFloor(uint16 bps, uint256 abs, uint256 nonce, uint256 deadline, uint256 pk) private view returns (bytes memory) {
        return _sign(keccak256(abi.encode(FLOOR_LOWERING_TYPEHASH, alice, WETH, USDC, bps, abs, nonce, deadline)), pk);
    }

    function _sign(bytes32 structHash, uint256 pk) private view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", registry.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
