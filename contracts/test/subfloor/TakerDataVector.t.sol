// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Test } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";
import { TakerTraitsLib } from "../../src/libs/TakerTraits.sol";

/// @notice Reference taker data for the TypeScript taker, in the one shape an EOA can use.
///
/// The bot builds these bytes itself, and a wrong bit produces a swap that reverts for a reason
/// unrelated to what actually went wrong. So the bytes come from the library the chain runs and the
/// TypeScript is asserted against them.
///
/// Regenerate with `forge test --match-contract TakerDataVector -vv`.
contract TakerDataVectorTest is Test {
    function _build(bool isAToB) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: address(0xBEEF),
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

    function test_printTakerData() public pure {
        console2.log("aToB  ", vm.toString(_build(true)));
        console2.log("bToA  ", vm.toString(_build(false)));
    }
}
