// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test, console } from "forge-std/Test.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { SwapVM } from "../../src/SwapVM.sol";
import { Context } from "../../src/libs/VM.sol";
import { MakerTraitsLib } from "../../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../../src/libs/TakerTraits.sol";
import { GuardedSwapVM } from "../../src/subfloor/GuardedSwapVM.sol";
import { Opcodes } from "../../src/opcodes/Opcodes.sol";
import { SubfloorGuardDispatch } from "../../src/opcodes/SubfloorGuardDispatch.sol";
import { StaticBalances } from "../../src/instructions/Balances.sol";
import { LimitSwap } from "../../src/instructions/LimitSwap.sol";
import { RequireFreshReference, NotionalThrottle, ApprovalGate } from "../../src/instructions/SubfloorGuards.sol";
import { FloorRegistry } from "../../src/subfloor/FloorRegistry.sol";
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

/// @dev The guards over the full standard opcode set, so these tests can use plain LimitSwap
///      programs. The deployed FloorRouter composes the same mixin onto the Aqua set.
contract GuardRouter is Simulator, GuardedSwapVM, Opcodes, SubfloorGuardDispatch {
    constructor(address aqua, address weth, address owner, address registry)
        SwapVM(aqua, weth, owner, "SwapVM", "1.0.0")
        GuardedSwapVM(registry)
        SubfloorGuardDispatch(registry)
    { }

    function _runOpcode(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        if (!_runSubfloorGuard(ctx, opcode, args)) super._runOpcode(ctx, opcode, args);
    }

    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        _runOpcode(ctx, opcode, args);
    }
}

/// @notice The three optional in-program guards. They sit above the mandatory settlement floor and
///         each closes something it does not: reference freshness tighter than the registry-wide
///         bound, how many fills happen at a fair price, and a human seeing a fill before it lands.
contract SubfloorGuardsTest is Test {
    FloorRegistry internal registry;
    GuardRouter internal router;
    MockAggregator internal feed;
    TokenMock internal tokenA;
    TokenMock internal tokenB;

    address internal maker;
    uint256 internal makerPK = 0x1234;
    address internal ledger;
    uint256 internal ledgerPK = 0x1EDCE1;
    address internal attacker;
    uint256 internal attackerPK = 0xBAD;
    address internal taker;

    function setUp() public {
        maker = vm.addr(makerPK);
        ledger = vm.addr(ledgerPK);
        attacker = vm.addr(attackerPK);
        taker = address(this);

        vm.warp(1_757_000_000);
        registry = new FloorRegistry(address(this), 0);
        router = new GuardRouter(address(new Aqua()), address(0), address(this), address(registry));
        feed = new MockAggregator(2500e8, block.timestamp);

        tokenA = new TokenMock("Token A", "TKA");
        tokenB = new TokenMock("Token B", "TKB");
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);

        registry.setReferenceFeed(address(tokenA), address(tokenB), address(feed), false, SubfloorParams.ETH_USD_STALENESS_BOUND_PROVISIONAL, 8, 18, 18);

        tokenA.mint(maker, 1e30);
        tokenB.mint(maker, 1e30);
        vm.startPrank(maker);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        vm.stopPrank();
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
    }

    // --- RequireFreshReference ------------------------------------------------------------------

    function test_freshReferencePasses() public {
        _swap(_program(RequireFreshReference.build(300)), 1e18, "");
    }

    function test_staleReferenceRefusesTheFill() public {
        vm.warp(block.timestamp + 301);
        (ISwapVM.Order memory order, bytes memory td) = _prep(_program(RequireFreshReference.build(300)), "");

        vm.expectRevert(
            abi.encodeWithSelector(
                RequireFreshReference.RequireFreshReferenceFailed.selector,
                address(tokenA),
                address(tokenB),
                uint256(301),
                uint256(300),
                uint32(SubfloorParams.ETH_USD_STALENESS_BOUND_PROVISIONAL)
            )
        );
        router.swap(order, 1e18, td);
    }

    /// A strategy can demand a reference fresher than the registry-wide bound. That is the point:
    /// the global bound has to clear the feed's real gap distribution, so it is necessarily loose.
    function test_aStrategyCanDemandMoreFreshnessThanTheRegistryBound() public {
        assertGt(SubfloorParams.ETH_USD_STALENESS_BOUND_PROVISIONAL, 300);

        vm.warp(block.timestamp + 400);
        (ISwapVM.Order memory order, bytes memory td) = _prep(_program(RequireFreshReference.build(300)), "");

        // The registry would still consider this fresh; the strategy does not.
        (uint256 floorRate,) = registry.effectiveFloor(maker, address(tokenA), address(tokenB));
        assertEq(floorRate, 0);

        vm.expectRevert();
        router.swap(order, 1e18, td);
    }

    // --- NotionalThrottle -----------------------------------------------------------------------

    function test_throttleAllowsFillsUpToTheEpochCap() public {
        bytes memory p = _program(NotionalThrottle.build(3600, 3e18));
        _swap(p, 1e18, "");
        _swap(p, 1e18, "");
    }

    function test_throttleRefusesTheFillThatCrossesTheCap() public {
        bytes memory p = _program(NotionalThrottle.build(3600, 3e18));
        _swap(p, 2e18, "");

        (ISwapVM.Order memory order, bytes memory td) = _prep(p, "");
        vm.expectRevert();
        router.swap(order, 2e18, td);
    }

    function test_throttleResetsOnTheNextEpoch() public {
        bytes memory p = _program(NotionalThrottle.build(3600, 3e18));
        _swap(p, 3e18, "");

        vm.warp(block.timestamp + 3600);
        feed.set(2500e8, block.timestamp);
        _swap(p, 3e18, "");
    }

    /// A storage-writing instruction is unusual in this VM, so the cost is measured and published
    /// rather than assumed. Cold first write against warm subsequent ones.
    function test_gasNotionalThrottleStorageWrite() public {
        bytes memory plain = _program("");
        bytes memory throttled = _program(NotionalThrottle.build(3600, 100e18));

        uint256 snap = vm.snapshotState();
        uint256 gasPlain = _measure(plain, 1e18);
        vm.revertToState(snap);

        snap = vm.snapshotState();
        uint256 gasFirst = _measure(throttled, 1e18);
        vm.revertToState(snap);

        console.log("LimitSwap, no throttle     ", gasPlain);
        console.log("with NotionalThrottle, cold", gasFirst, gasFirst - gasPlain);
        assertGt(gasFirst, gasPlain);
    }

    // --- ApprovalGate ---------------------------------------------------------------------------

    function test_approvalGateAcceptsAGuardianSignature() public {
        vm.prank(maker);
        registry.setGuardian(ledger);

        bytes memory p = _program(ApprovalGate.build());
        _swap(p, 1e18, _approval(p, 1e18, ledgerPK));
    }

    function test_approvalGateRefusesAWrongSigner() public {
        vm.prank(maker);
        registry.setGuardian(ledger);

        bytes memory p = _program(ApprovalGate.build());
        (ISwapVM.Order memory order, bytes memory td) = _prep(p, _approval(p, 1e18, attackerPK));

        vm.expectRevert();
        router.swap(order, 1e18, td);
    }

    function test_approvalGateRefusesWhenNoGuardianIsRegistered() public {
        bytes memory p = _program(ApprovalGate.build());
        (ISwapVM.Order memory order, bytes memory td) = _prep(p, _approval(p, 1e18, ledgerPK));

        vm.expectRevert(abi.encodeWithSelector(ApprovalGate.ApprovalGateNoGuardian.selector, maker));
        router.swap(order, 1e18, td);
    }

    /// The signature is bound to the amounts, so an approval for one fill cannot authorise a bigger
    /// one. This is the property that makes it a per-fill approval rather than a session token.
    function test_anApprovalForOneAmountDoesNotAuthoriseAnother() public {
        vm.prank(maker);
        registry.setGuardian(ledger);

        bytes memory p = _program(ApprovalGate.build());
        bytes memory sigFor1 = _approval(p, 1e18, ledgerPK);
        (ISwapVM.Order memory order, bytes memory td) = _prep(p, sigFor1);

        vm.expectRevert();
        router.swap(order, 2e18, td); // same approval, larger fill
    }

    // --- helpers ---------------------------------------------------------------------------------

    function _program(bytes memory guard) private view returns (bytes memory) {
        return bytes.concat(guard, StaticBalances.build(1e24, 2e24), LimitSwap.build(address(tokenA), address(tokenB)));
    }

    /// @dev The gate reads [uint16 len][sig] from the front of the taker instruction args.
    function _approval(bytes memory program, uint256 amount, uint256 pk) private view returns (bytes memory) {
        ISwapVM.Order memory order = _createOrder(program);
        bytes32 orderHash = router.hash(order);
        bytes32 d = keccak256(
            abi.encode(
                ApprovalGate.APPROVAL_PREFIX,
                block.chainid,
                orderHash,
                maker,
                taker,
                address(tokenA),
                address(tokenB),
                amount,
                amount * 2
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, d);
        bytes memory sig = abi.encodePacked(r, s, v);
        return abi.encodePacked(uint16(sig.length), sig);
    }

    function _measure(bytes memory program, uint256 amount) private returns (uint256) {
        (ISwapVM.Order memory order, bytes memory td) = _prep(program, "");
        uint256 g0 = gasleft();
        router.swap(order, amount, td);
        return g0 - gasleft();
    }

    function _swap(bytes memory program, uint256 amount, bytes memory instructionArgs) private {
        (ISwapVM.Order memory order, bytes memory td) = _prep(program, instructionArgs);
        router.swap(order, amount, td);
    }

    function _prep(bytes memory program, bytes memory instructionArgs)
        private
        returns (ISwapVM.Order memory order, bytes memory takerData)
    {
        order = _createOrder(program);
        takerData = _takerData(order, instructionArgs);
        tokenA.mint(taker, 10e18);
    }

    function _createOrder(bytes memory program) private view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: maker,
            tokenA: address(tokenA),
            tokenB: address(tokenB),
            shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: false,
            allowZeroAmountIn: false,
            receiver: address(0),
            hasPreTransferInHook: false,
            hasPostTransferInHook: false,
            hasPreTransferOutHook: false,
            hasPostTransferOutHook: false,
            preTransferInTarget: address(0),
            preTransferInData: "",
            postTransferInTarget: address(0),
            postTransferInData: "",
            preTransferOutTarget: address(0),
            preTransferOutData: "",
            postTransferOutTarget: address(0),
            postTransferOutData: "",
            program: program
        }));
    }

    function _takerData(ISwapVM.Order memory order, bytes memory instructionArgs) private view returns (bytes memory) {
        bytes32 orderHash = router.hash(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPK, orderHash);
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: address(0),
            isExactIn: true,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: false,
            useTransferFromAndAquaPush: false,
            isAToB: true,
            allowPartialFill: false,
            threshold: "",
            to: address(this),
            deadline: 0,
            hasPreTransferInCallback: false,
            hasPreTransferOutCallback: false,
            preTransferInHookData: "",
            postTransferInHookData: "",
            preTransferOutHookData: "",
            postTransferOutHookData: "",
            preTransferInCallbackData: "",
            preTransferOutCallbackData: "",
            instructionsArgs: instructionArgs,
            signature: abi.encodePacked(r, s, v)
        }));
    }
}
