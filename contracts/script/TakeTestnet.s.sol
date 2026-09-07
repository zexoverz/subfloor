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

/// @notice Takes the vault's quote from a plain EOA, on Base Sepolia.
///
/// This is the self-operated taker §8 requires and requires to be disclosed. It is not a market
/// participant and nothing here pretends otherwise: it exists so the venue produces real fills with
/// real gas and real adverse selection, which is what makes the execution-quality dataset a
/// measurement rather than a claim.
///
/// The settlement path is `useTransferFromAndAquaPush`, which pulls `amountIn` from the taker with
/// `transferFrom` after an approval. The tests use a contract taker with a pre-transfer callback;
/// an EOA cannot do that, and this is the path an EOA actually has.
///
/// ```
/// forge script script/TakeTestnet.s.sol --sig "quote()" --rpc-url $RPC
/// forge script script/TakeTestnet.s.sol --sig "run()" --rpc-url $RPC --account subfloor-dev --broadcast
/// ```
contract TakeTestnet is Script {
    address internal constant WETH = 0x4200000000000000000000000000000000000006;

    uint256 internal constant REFERENCE = uint256(2480_630000);
    uint16 internal constant SPREAD_BPS = 50;

    function _order() internal view returns (ISwapVM.Order memory) {
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(REFERENCE, SPREAD_BPS);

        ConcentratedBook.Book memory book;
        book.sqrtPriceMin = lo;
        book.sqrtPriceMax = hi;
        book.feeBps = 3000;
        book.decayPeriod = 600;
        book.salt = uint64(vm.envOr("SUBFLOOR_SALT", uint256(1)));

        address usdc = vm.envAddress("SUBFLOOR_TUSDC");
        (address a, address b) = WETH < usdc ? (WETH, usdc) : (usdc, WETH);

        // Must reconstruct byte-for-byte what was shipped: Aqua keys inventory by
        // `keccak256(abi.encode(order))`, so any difference here looks like an empty book.
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

    /// @dev `isAToB` is about the sorted pair, not about which token is "first" in any human sense.
    ///      Getting it backwards quotes the other side of the book, which looks like a pricing bug.
    function _isAToB(address tokenIn) internal view returns (bool) {
        address usdc = vm.envAddress("SUBFLOOR_TUSDC");
        (address a,) = WETH < usdc ? (WETH, usdc) : (usdc, WETH);
        return tokenIn == a;
    }

    function _takerData(address taker, bool isAToB) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: taker,
            isExactIn: true,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: false,
            // The EOA path: the router pulls `amountIn` with `transferFrom` and pushes it to Aqua.
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

    function quote() external view {
        address router = vm.envAddress("SUBFLOOR_ROUTER");
        address tokenIn = vm.envAddress("SUBFLOOR_TOKEN_IN");
        uint256 amountIn = vm.envUint("SUBFLOOR_AMOUNT_IN");
        address taker = vm.envAddress("SUBFLOOR_TAKER");

        console2.log("orderHash", vm.toString(ISwapVM(router).hash(_order())));
        console2.log("isAToB   ", _isAToB(tokenIn));
        (uint256 inAmt, uint256 outAmt,) =
            ISwapVM(router).quote(_order(), amountIn, _takerData(taker, _isAToB(tokenIn)));

        console2.log("amountIn ", inAmt);
        console2.log("amountOut", outAmt);
        if (inAmt > 0) console2.log("rate 1e18", (outAmt * 1e18) / inAmt);
    }

    function run() external {
        address router = vm.envAddress("SUBFLOOR_ROUTER");
        address tokenIn = vm.envAddress("SUBFLOOR_TOKEN_IN");
        uint256 amountIn = vm.envUint("SUBFLOOR_AMOUNT_IN");
        address taker = vm.envAddress("SUBFLOOR_TAKER");

        vm.startBroadcast();
        IERC20(tokenIn).approve(router, amountIn);
        (uint256 inAmt, uint256 outAmt,) =
            ISwapVM(router).swap(_order(), amountIn, _takerData(taker, _isAToB(tokenIn)));
        vm.stopBroadcast();

        console2.log("filled in ", inAmt);
        console2.log("filled out", outAmt);
        if (inAmt > 0) console2.log("rate 1e18", (outAmt * 1e18) / inAmt);
    }
}
