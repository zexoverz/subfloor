// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test, console } from "forge-std/Test.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { SwapVM } from "../../src/SwapVM.sol";
import { Context } from "../../src/libs/VM.sol";
import { MakerTraitsLib } from "../../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../../src/libs/TakerTraits.sol";
import { SwapVMRouter } from "../../src/routers/SwapVMRouter.sol";
import { ControlFloorRouter } from "../../src/routers/ControlFloorRouter.sol";
import { GuardedSwapVM } from "../../src/subfloor/GuardedSwapVM.sol";
import { Opcodes } from "../../src/opcodes/Opcodes.sol";
import { StaticBalances } from "../../src/instructions/Balances.sol";
import { LimitSwap } from "../../src/instructions/LimitSwap.sol";
import { RequireFloor } from "../../src/instructions/RequireFloor.sol";
import { FloorRegistry } from "../../src/subfloor/FloorRegistry.sol";
import { IFloorRegistry } from "../../src/subfloor/IFloorRegistry.sol";

contract GuardedRouter is Simulator, GuardedSwapVM, Opcodes {
    constructor(address aqua, address weth, address owner, address registry)
        SwapVM(aqua, weth, owner, "SwapVM", "1.0.0")
        GuardedSwapVM(registry)
    { }

    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        _runOpcode(ctx, opcode, args);
    }
}

/// @notice The experiment the settlement claim rests on. One hostile program, two routers.
///
/// The program is not exotic and does not attack anything. It is an ordinary limit swap that
/// simply does not contain the floor instruction — which is all an attacker has to do when the
/// floor is an opcode.
contract RedThenGreenTest is Test {
    FloorRegistry internal registry;
    ControlFloorRouter internal control;
    GuardedRouter internal guarded;
    SwapVMRouter internal upstream;

    TokenMock internal tokenA;
    TokenMock internal tokenB;

    address internal maker;
    uint256 internal makerPK = 0x1234;
    address internal maker2;
    uint256 internal maker2PK = 0x5678;
    address internal taker;

    /// The maker gives 2 tokenB and receives 1 tokenA, a rate of 0.5e18. Its floor demands 0.6e18,
    /// so this fill is below it and must be refused.
    uint256 internal constant MAKER_FLOOR = 0.6e18;

    address internal constant FRESH_TAKER = address(0xBEEF);
    address internal constant CONFIGURED_TAKER = address(0xCAFE);

    function setUp() public {
        maker = vm.addr(makerPK);
        maker2 = vm.addr(maker2PK);
        taker = address(this);

        registry = new FloorRegistry(address(this));
        control = new ControlFloorRouter(address(0), address(0), address(this), "SwapVM", "1.0.0", address(registry));
        guarded = new GuardedRouter(address(0), address(0), address(this), address(registry));
        upstream = new SwapVMRouter(address(0), address(0), address(this), "SwapVM", "1.0.0");

        tokenA = new TokenMock("Token I", "TKI");
        tokenB = new TokenMock("Token J", "TKJ");
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);

        tokenA.mint(maker, 10_000e18);
        tokenB.mint(maker, 10_000e18);
        tokenA.mint(maker2, 10_000e18);
        tokenB.mint(maker2, 10_000e18);
        for (uint256 i = 0; i < 3; ++i) {
            address r = i == 0 ? address(control) : i == 1 ? address(guarded) : address(upstream);
            for (uint256 j = 0; j < 2; ++j) {
                address m = j == 0 ? maker : maker2;
                vm.prank(m);
                tokenA.approve(r, type(uint256).max);
                vm.prank(m);
                tokenB.approve(r, type(uint256).max);
            }
            tokenA.approve(r, type(uint256).max);
            tokenB.approve(r, type(uint256).max);
        }

        // Absolute backstop only, so this measures enforcement rather than the oracle.
        vm.prank(maker);
        registry.raiseFloor(address(tokenB), address(tokenA), 10_000, MAKER_FLOOR);

        // Configured in setUp, not in the gas test, so both gas measurements begin with cold
        // registry storage. Warming a slot inside the test makes the opted-in path look cheaper
        // than the opted-out one, which is an artefact of the measurement.
        vm.prank(CONFIGURED_TAKER);
        registry.raiseFloor(address(tokenA), address(tokenB), 10_000, 1e18);
    }

    // --- red ------------------------------------------------------------------------------------

    /// RED. On the control router the floor is an instruction, so a program that omits it settles
    /// below the maker's floor and the tokens move. This is the counterexample the whole design
    /// exists to remove, and it is one missing opcode away.
    function test_red_controlRouterSettlesBelowTheFloorWhenTheProgramOmitsTheOpcode() public {
        SwapVM router = SwapVM(payable(address(control)));
        (ISwapVM.Order memory order, bytes memory takerData) = _prep(router, _programWithoutFloorGuard(), taker, maker, makerPK);

        uint256 before = tokenB.balanceOf(taker);
        router.swap(order, 1e18, takerData);

        assertEq(tokenB.balanceOf(taker) - before, 2e18, "the fill went through");

        (uint256 floorRate,) = registry.effectiveFloor(maker, address(tokenB), address(tokenA));
        assertEq(floorRate, MAKER_FLOOR);
        assertLt(uint256(1e18) * 1e18 / uint256(2e18), floorRate, "and it was below the maker's floor");
    }

    /// The control is not broken, it is optional. Include the opcode and it does refuse the fill —
    /// which is exactly why an optional guard proves nothing about programs you did not write.
    function test_red_controlRouterDoesRefuseWhenTheProgramCooperates() public {
        SwapVM router = SwapVM(payable(address(control)));
        (ISwapVM.Order memory order, bytes memory takerData) = _prep(router, _programWithFloorGuard(), taker, maker, makerPK);

        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.SettledBelowFloor.selector, maker, address(tokenB), address(tokenA), uint256(0.5e18), MAKER_FLOOR));
        router.swap(order, 1e18, takerData);
    }

    // --- green ----------------------------------------------------------------------------------

    /// GREEN. The same program, unchanged, against the settlement check. There is no opcode to
    /// omit, so omitting it changes nothing.
    function test_green_guardedRouterRefusesTheSameProgram() public {
        SwapVM router = SwapVM(payable(address(guarded)));
        (ISwapVM.Order memory order, bytes memory takerData) = _prep(router, _programWithoutFloorGuard(), taker, maker, makerPK);

        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.SettledBelowFloor.selector, maker, address(tokenB), address(tokenA), uint256(0.5e18), MAKER_FLOOR));
        router.swap(order, 1e18, takerData);
    }

    // --- what it costs ---------------------------------------------------------------------------

    /// The gas table, measured in one test so the three numbers are directly comparable: same
    /// program, same amounts, same block. Published numbers come from here, never from an estimate.
    function test_gasCostOfTheSettlementCheck() public {
        bytes memory program = _programWithoutFloorGuard();

        // Each measurement starts from identical, cold state. Measuring back to back would compare
        // a cold first swap against a warm second one.
        uint256 snap = vm.snapshotState();
        uint256 gasUpstream = _measure(SwapVM(payable(address(upstream))), program, FRESH_TAKER);
        vm.revertToState(snap);

        snap = vm.snapshotState();
        uint256 gasNoFloor = _measure(SwapVM(payable(address(guarded))), program, FRESH_TAKER);
        vm.revertToState(snap);

        snap = vm.snapshotState();
        uint256 gasWithFloor = _measure(SwapVM(payable(address(guarded))), program, CONFIGURED_TAKER);
        vm.revertToState(snap);

        console.log("upstream LimitSwap swap        ", gasUpstream);
        console.log("guarded, neither side opted in ", gasNoFloor, gasNoFloor - gasUpstream);
        console.log("guarded, taker floor set       ", gasWithFloor, gasWithFloor - gasUpstream);

        assertGt(gasNoFloor, gasUpstream, "the check is not free");
        assertGt(gasWithFloor, gasUpstream, "nor is it free when a floor is set");
    }

    // --- helpers ---------------------------------------------------------------------------------

    function _programWithoutFloorGuard() private view returns (bytes memory) {
        return bytes.concat(StaticBalances.build(100e18, 200e18), LimitSwap.build(address(tokenA), address(tokenB)));
    }

    function _programWithFloorGuard() private view returns (bytes memory) {
        return bytes.concat(RequireFloor.build(), StaticBalances.build(100e18, 200e18), LimitSwap.build(address(tokenA), address(tokenB)));
    }

    /// Measured against maker2, which has no floor, so this is the cost of a passing fill.
    function _measure(SwapVM router, bytes memory program, address to) private returns (uint256) {
        (ISwapVM.Order memory order, bytes memory takerData) = _prep(router, program, to, maker2, maker2PK);

        uint256 g0 = gasleft();
        router.swap(order, 1e18, takerData);
        return g0 - gasleft();
    }

    function _prep(SwapVM router, bytes memory program, address to, address mk, uint256 pk)
        private
        returns (ISwapVM.Order memory order, bytes memory takerData)
    {
        order = _createOrder(program, mk);
        takerData = _takerData(router, order, to, pk);
        tokenA.mint(taker, 1e18);
    }

    function _createOrder(bytes memory program, address mk) private view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: mk,
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

    function _takerData(SwapVM router, ISwapVM.Order memory order, address to, uint256 pk) private view returns (bytes memory) {
        bytes32 orderHash = router.hash(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, orderHash);

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
            to: to,
            deadline: 0,
            hasPreTransferInCallback: false,
            hasPreTransferOutCallback: false,
            preTransferInHookData: "",
            postTransferInHookData: "",
            preTransferOutHookData: "",
            postTransferOutHookData: "",
            preTransferInCallbackData: "",
            preTransferOutCallbackData: "",
            instructionsArgs: "",
            signature: abi.encodePacked(r, s, v)
        }));
    }
}
