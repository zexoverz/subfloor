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
import { GuardedSwapVM } from "../../src/subfloor/GuardedSwapVM.sol";
import { Opcodes } from "../../src/opcodes/Opcodes.sol";
import { StaticBalances } from "../../src/instructions/Balances.sol";
import { LimitSwap } from "../../src/instructions/LimitSwap.sol";
import { XYCSwap } from "../../src/instructions/XYCSwap.sol";
import { Salt } from "../../src/instructions/Controls.sol";
import { Deadline } from "../../src/instructions/Controls.sol";
import { RequireMinRate } from "../../src/instructions/MinRate.sol";
import { FloorRegistry } from "../../src/subfloor/FloorRegistry.sol";

contract InvRouter is Simulator, GuardedSwapVM, Opcodes {
    constructor(address aqua, address weth, address owner, address registry)
        SwapVM(aqua, weth, owner, "SwapVM", "1.0.0")
        GuardedSwapVM(registry)
    { }

    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        _runOpcode(ctx, opcode, args);
    }
}

/// @notice Invariant 1: no program the VM can run can move tokens to a recipient at a rate below
///         that recipient's floor.
///
/// The check is made from **token balance deltas**, not from the amounts the contract reports. That
/// matters: scoring the invariant on `amountIn`/`amountOut` would be asking the code under test
/// whether it behaved, and would miss exactly the class of bug where the reported amounts and the
/// transferred amounts disagree.
///
/// This is the seed of the fuzz suite, not its final form. It samples program shapes from the
/// standard instruction set; the hostile surface — Extruction, the Jump family, nested MinRate,
/// fee stacking, exactOut and partial fills — is the expansion tracked separately.
contract FloorInvariantsTest is Test {
    FloorRegistry internal registry;
    InvRouter internal router;
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
        router = new InvRouter(address(0), address(0), address(this), address(registry));

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

    /// @param shape       which program the VM runs
    /// @param takerFloor  the taker recipient's absolute floor, 0 for "did not opt in"
    /// @param makerFloor  the maker recipient's absolute floor, 0 for "did not opt in"
    function testFuzz_noProgramSettlesAnyRecipientBelowItsFloor(
        uint8 shape,
        uint96 takerFloor,
        uint96 makerFloor,
        uint96 amountRaw
    ) public {
        uint256 amount = bound(uint256(amountRaw), 1e12, 10e18);

        if (takerFloor > 0) {
            vm.prank(taker);
            registry.raiseFloor(address(tokenA), address(tokenB), 10_000, takerFloor);
        }
        if (makerFloor > 0) {
            vm.prank(maker);
            registry.raiseFloor(address(tokenB), address(tokenA), 10_000, makerFloor);
        }

        bytes memory program = _program(shape);
        ISwapVM.Order memory order = _createOrder(program);
        bytes memory takerData = _takerData(order);
        tokenA.mint(taker, amount);

        uint256 takerAbefore = tokenA.balanceOf(taker);
        uint256 takerBbefore = tokenB.balanceOf(taker);
        uint256 makerAbefore = tokenA.balanceOf(maker);
        uint256 makerBbefore = tokenB.balanceOf(maker);

        try router.swap(order, amount, takerData) {
            // Measured from what actually moved, not from what the router said moved.
            uint256 takerGave = takerAbefore - tokenA.balanceOf(taker);
            uint256 takerGot = tokenB.balanceOf(taker) - takerBbefore;
            uint256 makerGave = makerBbefore - tokenB.balanceOf(maker);
            uint256 makerGot = tokenA.balanceOf(maker) - makerAbefore;

            if (takerFloor > 0 && takerGave > 0) {
                assertGe(_rate(takerGot, takerGave), takerFloor, "taker settled below its floor");
            }
            if (makerFloor > 0 && makerGave > 0) {
                assertGe(_rate(makerGot, makerGave), makerFloor, "maker settled below its floor");
            }
        } catch {
            // A refused fill is the correct outcome whenever the floor would have been breached,
            // and refusing for any other reason is the VM's business, not this invariant's.
        }
    }

    /// Invariant 2: `quote()` and `swap()` agree about whether a fill is allowed. A quote the
    /// settlement would reject is a bug with a demo-visible failure mode — the agent composes
    /// against the quote, the fill reverts, and the dashboard shows liquidity that is not there.
    ///
    /// Checked as an equivalence, not a one-way implication: quote succeeding must mean swap
    /// succeeds, *and* quote reverting must mean swap reverts. A mirror that only ever refuses more
    /// than settlement would still be wrong, just quieter.
    function testFuzz_quoteAndSwapAlwaysAgree(
        uint8 shape,
        uint96 takerFloor,
        uint96 makerFloor,
        uint96 amountRaw
    ) public {
        uint256 amount = bound(uint256(amountRaw), 1e12, 10e18);

        if (takerFloor > 0) {
            vm.prank(taker);
            registry.raiseFloor(address(tokenA), address(tokenB), 10_000, takerFloor);
        }
        if (makerFloor > 0) {
            vm.prank(maker);
            registry.raiseFloor(address(tokenB), address(tokenA), 10_000, makerFloor);
        }

        ISwapVM.Order memory order = _createOrder(_program(shape));
        bytes memory takerData = _takerData(order);
        tokenA.mint(taker, amount);

        bool quoteOk;
        try router.quote(order, amount, takerData) returns (uint256, uint256, bytes32) {
            quoteOk = true;
        } catch {
            quoteOk = false;
        }

        bool swapOk;
        try router.swap(order, amount, takerData) returns (uint256, uint256, bytes32) {
            swapOk = true;
        } catch {
            swapOk = false;
        }

        assertEq(quoteOk, swapOk, "quote and swap disagreed about the same fill");
    }

    function _rate(uint256 received, uint256 given) private pure returns (uint256) {
        return given == 0 ? type(uint256).max : received * 1e18 / given;
    }

    function _program(uint8 shape) private view returns (bytes memory) {
        uint8 s = shape % 5;
        if (s == 0) {
            return bytes.concat(StaticBalances.build(1e24, 2e24), LimitSwap.build(address(tokenA), address(tokenB)));
        } else if (s == 1) {
            return bytes.concat(StaticBalances.build(1e24, 2e24), XYCSwap.build());
        } else if (s == 2) {
            // A program that carries the maker's own optional guard as well as the mandatory one.
            return bytes.concat(
                StaticBalances.build(1e24, 2e24),
                RequireMinRate.build(1e18, 3e18),
                LimitSwap.build(address(tokenA), address(tokenB))
            );
        } else if (s == 3) {
            // Noise instructions around the swap: neither should change the floor outcome.
            return bytes.concat(
                Deadline.build(uint40(block.timestamp + 1 days)),
                StaticBalances.build(1e24, 2e24),
                Salt.build(uint64(shape)),
                LimitSwap.build(address(tokenA), address(tokenB))
            );
        }
        // A different pool shape, so the rate is not always the same 2:1.
        return bytes.concat(StaticBalances.build(3e24, 1e24), XYCSwap.build());
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
