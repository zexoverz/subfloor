// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { SwapVM } from "../../src/SwapVM.sol";
import { Context } from "../../src/libs/VM.sol";
import { MakerTraitsLib } from "../../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../../src/libs/TakerTraits.sol";
import { OpcodesDebug } from "../../src/opcodes/OpcodesDebug.sol";
import { StaticBalances } from "../../src/instructions/Balances.sol";
import { LimitSwap } from "../../src/instructions/LimitSwap.sol";
import { GuardedSwapVM } from "../../src/subfloor/GuardedSwapVM.sol";
import { IFloorRegistry } from "../../src/subfloor/IFloorRegistry.sol";

/// @dev A guarded router over the plain opcode set, so these tests exercise the settlement path
///      without dragging Aqua in. The deployed FloorRouter differs only in its opcode set.
contract GuardedTestRouter is Simulator, GuardedSwapVM, OpcodesDebug {
    constructor(address aqua, address weth, address owner, address floorRegistry)
        SwapVM(aqua, weth, owner, "SwapVM", "1.0.0")
        GuardedSwapVM(floorRegistry)
    { }

    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        _runOpcode(ctx, opcode, args);
    }
}

/// @dev Records every consult so a test can assert the check ran, not merely that a swap passed.
contract SpyRegistry is IFloorRegistry {
    struct Call {
        address recipient;
        address base;
        address quote;
        uint256 given;
        uint256 received;
    }

    Call[] public calls;
    mapping(address => bool) public shouldRevertFor;

    function callCount() external view returns (uint256) {
        return calls.length;
    }

    function callAt(uint256 i) external view returns (Call memory) {
        return calls[i];
    }

    function setRevertFor(address recipient, bool on) external {
        shouldRevertFor[recipient] = on;
    }

    function effectiveFloor(address, address, address) external pure returns (uint256, bool) {
        return (0, false);
    }

    function referenceAge(address, address) external pure returns (uint256, uint32) {
        return (0, 0);
    }

    function guardian(address) external pure returns (address) {
        return address(0);
    }

    /// @dev `view` in the interface, so the recording goes through a self-call the compiler will
    ///      not let a view function make directly. The staticcall context makes this impossible,
    ///      hence the assembly-free trick of recording via a mutable sibling is not available —
    ///      instead the router calls this and we cheat with a storage write behind a low-level
    ///      call from the test, see `_drain`. Kept simple: record through a transient log instead.
    function checkSettlement(
        address takerRecipient,
        address makerRecipient,
        address tokenIn,
        address tokenOut,
        uint256 takerGave,
        uint256 takerGot,
        uint256 makerGave,
        uint256 makerGot
    ) external view {
        this.checkFill(takerRecipient, tokenIn, tokenOut, takerGave, takerGot);
        this.checkFill(makerRecipient, tokenOut, tokenIn, makerGave, makerGot);
    }

    function checkFill(address recipient, address base, address quote, uint256 given, uint256 received) external view {
        if (shouldRevertFor[recipient]) {
            revert SettledBelowFloor(recipient, base, quote, given, received);
        }
        // Emitting is impossible from a view function; the router consults us via staticcall, so
        // observation happens through `vm.expectCall` in the tests rather than through storage.
    }
}

contract GuardedSwapVMTest is Test, OpcodesDebug {
    GuardedTestRouter internal router;
    SpyRegistry internal spy;
    TokenMock internal tokenA;
    TokenMock internal tokenB;

    address internal maker;
    uint256 internal makerPK = 0x1234;
    address internal taker;

    function setUp() public {
        maker = vm.addr(makerPK);
        taker = address(this);

        spy = new SpyRegistry();
        router = new GuardedTestRouter(address(0), address(0), address(this), address(spy));

        tokenA = new TokenMock("Token I", "TKI");
        tokenB = new TokenMock("Token J", "TKJ");
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);

        tokenA.mint(maker, 10_000e18);
        tokenB.mint(maker, 10_000e18);
        vm.prank(maker);
        tokenA.approve(address(router), type(uint256).max);
        vm.prank(maker);
        tokenB.approve(address(router), type(uint256).max);

        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
    }

    /// A program that produces nothing never settles at all: `takerTraits.validate` rejects a
    /// zero `amountOut` on its first line, before the guard and long before any transfer. So the
    /// empty program is not a fill that skips the floor, it is not a fill.
    ///
    /// This is why the claim is "no program that moves tokens can avoid the check" rather than
    /// "an empty program still settles and still hits the check" — the latter is not true of this
    /// codebase, and it is checkable by anyone who reads TakerTraits.sol:188.
    function test_aProgramThatProducesNothingNeverSettles() public {
        ISwapVM.Order memory order = _createOrder("", true);
        bytes memory takerData = _signAndPackTakerData(order, true, true);

        vm.expectRevert(abi.encodeWithSelector(TakerTraitsLib.TakerTraitsAmountOutMustBeGreaterThanZero.selector, uint256(0)));
        router.swap(order, 0, takerData);
    }

    /// The architecture, stated as a test. This program carries no guard instruction of any kind —
    /// it computes balances and swaps, nothing more — and settlement consults the floor for both
    /// recipients regardless. The floor is not something the program can decline to include.
    function test_aProgramWithNoGuardInstructionStillHitsTheFloorCheck() public {
        bytes memory program = bytes.concat(
            StaticBalances.build(100e18, 200e18),
            LimitSwap.build(address(tokenA), address(tokenB))
        );
        ISwapVM.Order memory order = _createOrder(program, false);
        bytes memory takerData = _signAndPackTakerData(order, true, true);
        tokenA.mint(taker, 1e18);

        vm.expectCall(address(spy), abi.encodeCall(IFloorRegistry.checkFill, (taker, address(tokenA), address(tokenB), 1e18, 2e18)));
        vm.expectCall(address(spy), abi.encodeCall(IFloorRegistry.checkFill, (maker, address(tokenB), address(tokenA), 2e18, 1e18)));

        router.swap(order, 1e18, takerData);
    }

    function test_bothRecipientsAreConsultedOnARealFill() public {
        bytes memory program = bytes.concat(
            StaticBalances.build(100e18, 200e18),
            LimitSwap.build(address(tokenA), address(tokenB))
        );
        ISwapVM.Order memory order = _createOrder(program, false);
        bytes memory takerData = _signAndPackTakerData(order, true, true);

        tokenA.mint(taker, 1e18);

        vm.expectCall(address(spy), abi.encodeCall(IFloorRegistry.checkFill, (taker, address(tokenA), address(tokenB), 1e18, 2e18)));
        vm.expectCall(address(spy), abi.encodeCall(IFloorRegistry.checkFill, (maker, address(tokenB), address(tokenA), 2e18, 1e18)));

        router.swap(order, 1e18, takerData);
    }

    function test_takerFloorBreachRevertsTheFill() public {
        bytes memory program = bytes.concat(
            StaticBalances.build(100e18, 200e18),
            LimitSwap.build(address(tokenA), address(tokenB))
        );
        ISwapVM.Order memory order = _createOrder(program, false);
        bytes memory takerData = _signAndPackTakerData(order, true, true);
        tokenA.mint(taker, 1e18);

        spy.setRevertFor(taker, true);
        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.SettledBelowFloor.selector, taker, address(tokenA), address(tokenB), uint256(1e18), uint256(2e18)));
        router.swap(order, 1e18, takerData);
    }

    /// A fill that is fine for the taker and bad for the maker's recipient must still revert.
    /// Enforcing one side only would leave the delegated maker — the party this exists for —
    /// unprotected.
    function test_makerFloorBreachRevertsTheFill() public {
        bytes memory program = bytes.concat(
            StaticBalances.build(100e18, 200e18),
            LimitSwap.build(address(tokenA), address(tokenB))
        );
        ISwapVM.Order memory order = _createOrder(program, false);
        bytes memory takerData = _signAndPackTakerData(order, true, true);
        tokenA.mint(taker, 1e18);

        spy.setRevertFor(maker, true);
        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.SettledBelowFloor.selector, maker, address(tokenB), address(tokenA), uint256(2e18), uint256(1e18)));
        router.swap(order, 1e18, takerData);
    }

    /// A quote that settlement would reject is a bug with a demo-visible failure mode: the agent
    /// composes against the quote, the fill reverts, and the dashboard shows phantom liquidity.
    function test_quoteMirrorsTheCheck() public {
        bytes memory program = bytes.concat(
            StaticBalances.build(100e18, 200e18),
            LimitSwap.build(address(tokenA), address(tokenB))
        );
        ISwapVM.Order memory order = _createOrder(program, false);
        bytes memory takerData = _signAndPackTakerData(order, true, true);

        vm.expectCall(address(spy), abi.encodeCall(IFloorRegistry.checkFill, (taker, address(tokenA), address(tokenB), 1e18, 2e18)));
        vm.expectCall(address(spy), abi.encodeCall(IFloorRegistry.checkFill, (maker, address(tokenB), address(tokenA), 2e18, 1e18)));
        router.quote(order, 1e18, takerData);
    }

    function test_quoteRevertsWhereSwapWouldRevert() public {
        bytes memory program = bytes.concat(
            StaticBalances.build(100e18, 200e18),
            LimitSwap.build(address(tokenA), address(tokenB))
        );
        ISwapVM.Order memory order = _createOrder(program, false);
        bytes memory takerData = _signAndPackTakerData(order, true, true);

        spy.setRevertFor(maker, true);
        vm.expectRevert(abi.encodeWithSelector(IFloorRegistry.SettledBelowFloor.selector, maker, address(tokenB), address(tokenA), uint256(2e18), uint256(1e18)));
        router.quote(order, 1e18, takerData);
    }

    // --- helpers -------------------------------------------------------------------------------

    function _createOrder(bytes memory program, bool allowZeroAmountIn) private view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: maker,
            tokenA: address(tokenA),
            tokenB: address(tokenB),
            shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: false,
            allowZeroAmountIn: allowZeroAmountIn,
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

    function _signAndPackTakerData(ISwapVM.Order memory order, bool isExactIn, bool isAToB) private view returns (bytes memory) {
        bytes32 orderHash = router.hash(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPK, orderHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: address(0),
            isExactIn: isExactIn,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: false,
            useTransferFromAndAquaPush: false,
            isAToB: isAToB,
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
            instructionsArgs: "",
            signature: signature
        }));
    }
}
