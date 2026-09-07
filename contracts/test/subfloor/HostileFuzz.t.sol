// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { SwapVM } from "../../src/SwapVM.sol";
import { Context, SwapQuery, SwapRegisters } from "../../src/libs/VM.sol";
import { MakerTraitsLib } from "../../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../../src/libs/TakerTraits.sol";
import { GuardedSwapVM } from "../../src/subfloor/GuardedSwapVM.sol";
import { Opcodes } from "../../src/opcodes/Opcodes.sol";
import { StaticBalances } from "../../src/instructions/Balances.sol";
import { LimitSwap } from "../../src/instructions/LimitSwap.sol";
import { XYCSwap } from "../../src/instructions/XYCSwap.sol";
import { Extruction } from "../../src/instructions/Extruction.sol";
import { RequireMinRate, AdjustMinRate } from "../../src/instructions/MinRate.sol";
import { FeeFlatIn, FeeFlatOut } from "../../src/instructions/FeeFlat.sol";
import { Jump } from "../../src/instructions/Jumps.sol";
import { Salt } from "../../src/instructions/Controls.sol";
import { FloorRegistry } from "../../src/subfloor/FloorRegistry.sol";

contract HostileRouter is Simulator, GuardedSwapVM, Opcodes {
    constructor(address aqua, address weth, address owner, address registry)
        SwapVM(aqua, weth, owner, "SwapVM", "1.0.0")
        GuardedSwapVM(registry)
    { }

    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        _runOpcode(ctx, opcode, args);
    }
}

/// @notice An Extruction target that does the worst thing the interface permits: replace every
///         swap register with a value of its choosing and set the program counter anywhere.
///
/// This is not a strawman. `Extruction.sol` documents that a target "may modify the swap registers,
/// set the program counter" — so this is the instruction behaving exactly as specified, aimed at us.
/// It is the single most likely source of a real counterexample, which is why the fuzz suite is
/// worth little until it runs through here.
contract HostileExtruction {
    uint256 public nextPC;
    SwapRegisters public regs;
    uint256 public chop;

    function arm(uint256 nextPC_, uint256 balanceIn, uint256 balanceOut, uint256 amountIn, uint256 amountOut, uint256 chop_) external {
        nextPC = nextPC_;
        regs = SwapRegisters({ balanceIn: balanceIn, balanceOut: balanceOut, amountIn: amountIn, amountOut: amountOut });
        chop = chop_;
    }

    function extruction(bool, uint256, SwapQuery calldata, SwapRegisters calldata, bytes calldata, bytes calldata)
        external
        view
        returns (uint256, uint256, SwapRegisters memory)
    {
        return (nextPC, chop, regs);
    }
}

/// @notice Invariant 1 again, but over the hostile surface rather than well-behaved programs.
///
/// The earlier version sampled five ordinary program shapes. That proved the floor holds for
/// programs that behave. This one lets a maker-chosen contract rewrite the settled amounts to
/// anything at all, jump the program counter anywhere, and stack fees and nested rate guards around
/// it — and still asks whether either recipient can end up below its floor.
contract HostileFuzzTest is Test {
    FloorRegistry internal registry;
    HostileRouter internal router;
    HostileExtruction internal hostile;
    TokenMock internal tokenA;
    TokenMock internal tokenB;

    address internal maker;
    uint256 internal makerPK = 0x1234;
    address internal taker;

    function setUp() public {
        maker = vm.addr(makerPK);
        taker = address(this);

        vm.warp(1_757_000_000);
        registry = new FloorRegistry(address(this), 0);
        router = new HostileRouter(address(0), address(0), address(this), address(registry));
        hostile = new HostileExtruction();

        tokenA = new TokenMock("Token A", "TKA");
        tokenB = new TokenMock("Token B", "TKB");
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);

        tokenA.mint(maker, 1e30);
        tokenB.mint(maker, 1e30);
        vm.startPrank(maker);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        vm.stopPrank();
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
    }

    /// The headline. A hostile Extruction target rewrites the swap registers to fuzz-chosen values
    /// and sets the program counter to a fuzz-chosen offset, inside a fuzz-chosen program shape.
    /// If either recipient's tokens move at a rate below its floor, this fails.
    function testFuzz_hostileExtructionCannotSettleBelowAFloor(
        uint8 shape,
        uint96 takerFloor,
        uint96 makerFloor,
        uint96 amountRaw,
        uint128 forcedIn,
        uint128 forcedOut,
        uint8 forcedPC
    ) public {
        uint256 amount = bound(uint256(amountRaw), 1e12, 10e18);

        // `amountIn` is pinned to what the taker asked for. Leaving it fuzzed makes
        // `takerTraits.validate` reject on a mismatch before settlement is ever reached, so every
        // run reverts and the suite proves nothing — which is what the first version of this test
        // did. The realistic attack keeps the taker's amount intact and shrinks what comes back.
        uint256 forcedOutBounded = bound(uint256(forcedOut), 0, 4e18);
        forcedIn; // kept in the signature so the fuzzer still varies the corpus shape
        hostile.arm(uint256(forcedPC), 1e24, 2e24, amount, forcedOutBounded, 0);

        // Bounded into the band a real fill actually lands in. Raw uint96 floors are ~1e28, which
        // every fill fails, so the guard would refuse everything and the test would never observe a
        // settled fill at all.
        uint256 tFloor = takerFloor == 0 ? 0 : bound(uint256(takerFloor), 0.1e18, 4e18);
        uint256 mFloor = makerFloor == 0 ? 0 : bound(uint256(makerFloor), 0.1e18, 4e18);

        if (tFloor > 0) {
            vm.prank(taker);
            registry.raiseFloor(address(tokenA), address(tokenB), 10_000, tFloor);
        }
        if (mFloor > 0) {
            vm.prank(maker);
            registry.raiseFloor(address(tokenB), address(tokenA), 10_000, mFloor);
        }

        ISwapVM.Order memory order = _createOrder(_hostileProgram(shape));
        bytes memory takerData = _takerData(order);
        tokenA.mint(taker, amount);

        uint256 tA = tokenA.balanceOf(taker);
        uint256 tB = tokenB.balanceOf(taker);
        uint256 mA = tokenA.balanceOf(maker);
        uint256 mB = tokenB.balanceOf(maker);

        try router.swap(order, amount, takerData) {
            uint256 takerGave = tA - tokenA.balanceOf(taker);
            uint256 takerGot = tokenB.balanceOf(taker) - tB;
            uint256 makerGave = mB - tokenB.balanceOf(maker);
            uint256 makerGot = tokenA.balanceOf(maker) - mA;

            if (tFloor > 0 && takerGave > 0) {
                assertGe(_rate(takerGot, takerGave), tFloor, "taker below floor through Extruction");
            }
            if (mFloor > 0 && makerGave > 0) {
                assertGe(_rate(makerGot, makerGave), mFloor, "maker below floor through Extruction");
            }
        } catch { }
    }

    /// Quote and swap must still agree when a hostile target is in the program. Divergence here is
    /// the failure mode the spec calls out: the agent composes against a quote and the fill reverts.
    function testFuzz_hostileExtructionKeepsQuoteAndSwapInAgreement(
        uint8 shape,
        uint96 makerFloor,
        uint96 amountRaw,
        uint128 forcedIn,
        uint128 forcedOut
    ) public {
        uint256 amount = bound(uint256(amountRaw), 1e12, 10e18);
        forcedIn;
        hostile.arm(0, 1e24, 2e24, amount, bound(uint256(forcedOut), 0, 4e18), 0);

        if (makerFloor > 0) {
            vm.prank(maker);
            registry.raiseFloor(address(tokenB), address(tokenA), 10_000, bound(uint256(makerFloor), 0.1e18, 4e18));
        }

        ISwapVM.Order memory order = _createOrder(_hostileProgram(shape));
        bytes memory takerData = _takerData(order);
        tokenA.mint(taker, amount);

        bool quoteOk;
        try router.quote(order, amount, takerData) returns (uint256, uint256, bytes32) { quoteOk = true; } catch { }
        bool swapOk;
        try router.swap(order, amount, takerData) returns (uint256, uint256, bytes32) { swapOk = true; } catch { }

        assertEq(quoteOk, swapOk, "quote and swap disagreed with a hostile target in the program");
    }

    function _rate(uint256 received, uint256 given) private pure returns (uint256) {
        return given == 0 ? type(uint256).max : received * 1e18 / given;
    }

    /// Program shapes built around the hostile call: fee stacking, nested rate guards, a jump, and
    /// the swap curves. Each is a place a real strategy would put an Extruction.
    function _hostileProgram(uint8 shape) private view returns (bytes memory) {
        bytes memory ext = Extruction.build(address(hostile), "");
        uint8 s = shape % 6;

        if (s == 0) {
            return bytes.concat(StaticBalances.build(1e24, 2e24), ext, LimitSwap.build(address(tokenA), address(tokenB)));
        } else if (s == 1) {
            // The guard the docs tell makers to put in front of Extruction, nested with ours.
            return bytes.concat(
                StaticBalances.build(1e24, 2e24),
                RequireMinRate.build(1e18, 3e18),
                ext,
                LimitSwap.build(address(tokenA), address(tokenB))
            );
        } else if (s == 2) {
            return bytes.concat(StaticBalances.build(1e24, 2e24), AdjustMinRate.build(1e18, 3e18), ext, XYCSwap.build());
        } else if (s == 3) {
            // Fee stacking around the hostile call, on both sides.
            return bytes.concat(
                StaticBalances.build(1e24, 2e24),
                FeeFlatIn.build(10),
                ext,
                FeeFlatOut.build(10),
                LimitSwap.build(address(tokenA), address(tokenB))
            );
        } else if (s == 4) {
            return bytes.concat(StaticBalances.build(1e24, 2e24), ext, XYCSwap.build(), Salt.build(uint64(shape)));
        }
        // Extruction last, so it has the final word on the registers before settlement.
        return bytes.concat(StaticBalances.build(1e24, 2e24), LimitSwap.build(address(tokenA), address(tokenB)), ext);
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

    function _takerData(ISwapVM.Order memory order) private view returns (bytes memory) {
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
            instructionsArgs: "",
            signature: abi.encodePacked(r, s, v)
        }));
    }
}
