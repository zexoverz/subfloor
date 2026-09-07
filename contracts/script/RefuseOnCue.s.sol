// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ISwapVM } from "../src/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../src/libs/TakerTraits.sol";
import { ConcentratedBook } from "../src/subfloor/strategies/ConcentratedBook.sol";
import { FloorRegistry } from "../src/subfloor/FloorRegistry.sol";
import { AquaGuardVault } from "../src/subfloor/AquaGuardVault.sol";

/// @notice Produces a `SettledBelowFloor` revert on cue, on a live deployment.
///
/// §12 beat 2 needs a refused fill on camera with a clickable transaction, and the refusals that
/// happen on their own arrive whenever the book drifts through the floor — which is not a schedule.
/// This finds the smallest size that breaches the recipient's floor and broadcasts it, so the revert
/// is a thing that can be asked for.
///
/// It is not a rigged demo. Nothing here weakens the floor, patches the router, or uses a privileged
/// key: it is an ordinary taker asking for an ordinary fill at a size the curve prices through the
/// floor, and settlement refusing it. The same transaction from anyone else does the same thing.
///
/// ```
/// forge script script/RefuseOnCue.s.sol --sig "find()" --rpc-url $RPC
/// forge script script/RefuseOnCue.s.sol --sig "run()" --rpc-url $RPC --account subfloor-dev --broadcast
/// ```
contract RefuseOnCue is Script {
    address internal constant WETH = 0x4200000000000000000000000000000000000006;

    uint256 internal constant REFERENCE = uint256(2478669714);
    uint16 internal constant SPREAD_BPS = 50;

    error NoBreachingSizeFound(uint256 largestTried);

    function _order() internal view returns (ISwapVM.Order memory) {
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(REFERENCE, SPREAD_BPS);

        ConcentratedBook.Book memory book;
        book.sqrtPriceMin = lo;
        book.sqrtPriceMax = hi;
        book.feeBps = 3000;
        book.decayPeriod = 600;
        book.salt = uint64(vm.envOr("SUBFLOOR_SALT", uint256(5)));

        address usdc = vm.envAddress("SUBFLOOR_TUSDC");
        (address a, address b) = WETH < usdc ? (WETH, usdc) : (usdc, WETH);

        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: vm.envAddress("SUBFLOOR_VAULT"),
            tokenA: a,
            tokenB: b,
            shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true,
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
            program: ConcentratedBook.build(book)
        }));
    }

    function _takerData(bool isAToB) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: address(0),
            isExactIn: true,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: false,
            useTransferFromAndAquaPush: true,
            isAToB: isAToB,
            allowPartialFill: false,
            threshold: "",
            to: address(0),
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
            signature: ""
        }));
    }

    /// @notice Reads the book's current rate and the vault's floor, so the gap is visible before
    ///         anything is changed.
    function inspect() external view {
        address router = vm.envAddress("SUBFLOOR_ROUTER");
        address usdc = vm.envAddress("SUBFLOOR_TUSDC");
        FloorRegistry registry = FloorRegistry(vm.envAddress("SUBFLOOR_REGISTRY"));

        (uint256 floorRate, bool enforced) = registry.effectiveFloor(vm.envAddress("SUBFLOOR_VAULT"), WETH, usdc);
        (uint256 inAmt, uint256 outAmt,) = ISwapVM(router).quote(_order(), 1e6, _takerData(false));

        console2.log("maker rate now  ", inAmt * 1e18 / outAmt);
        console2.log("vault floor     ", floorRate, enforced);
    }

    /// @notice Raises the vault's floor above what the book is currently quoting.
    ///
    /// This is the demo's cue, and it is an ordinary owner action rather than a rig: §10 makes
    /// raising a floor one click, free, immediate and device-free, precisely because it can only
    /// help the owner. Afterwards an ordinary fill at an ordinary size is refused by settlement,
    /// which is the thing worth filming — the floor is live, and it binds the moment it moves.
    ///
    /// Raising is `msg.sender`-keyed, so it goes through `vault.execute`: the floor has to belong to
    /// the vault, which is the recipient at settlement.
    function arm() external {
        address usdc = vm.envAddress("SUBFLOOR_TUSDC");
        FloorRegistry registry = FloorRegistry(vm.envAddress("SUBFLOOR_REGISTRY"));
        AquaGuardVault vault = AquaGuardVault(payable(vm.envAddress("SUBFLOOR_VAULT")));
        uint232 floor = uint232(vm.envUint("SUBFLOOR_FLOOR"));

        vm.startBroadcast();
        // Tolerance is left where it is and only the backstop moves.
        //
        // Widening the tolerance to let the backstop stand alone would be a *weakening* of the
        // relative component, and weakening needs the guardian's signature — the asymmetry is the
        // design, and `raiseFloor` reverts rather than quietly allowing it. Found by trying.
        vault.execute(address(registry), 0, abi.encodeCall(FloorRegistry.raiseFloor, (WETH, usdc, 100, floor)));
        vm.stopBroadcast();

        (uint256 floorRate, bool enforced) = registry.effectiveFloor(address(vault), WETH, usdc);
        console2.log("floor now", floorRate, enforced);
    }

    /// @notice The ordinary fill that settlement now refuses.
    function run() external {
        address router = vm.envAddress("SUBFLOOR_ROUTER");
        address usdc = vm.envAddress("SUBFLOOR_TUSDC");
        uint256 amountIn = vm.envOr("SUBFLOOR_AMOUNT_IN", uint256(1e6));

        vm.startBroadcast();
        IERC20(usdc).approve(router, amountIn);
        ISwapVM(router).swap(_order(), amountIn, _takerData(false));
        vm.stopBroadcast();
    }
}
