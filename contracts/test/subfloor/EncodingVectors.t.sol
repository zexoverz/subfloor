// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Test } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";

import { Deadline } from "../../src/instructions/Controls.sol";
import { FeeFlatIn } from "../../src/instructions/FeeFlat.sol";
import { XYCConcentrateSwap } from "../../src/instructions/XYCConcentrate.sol";
import { StaticBalances } from "../../src/instructions/Balances.sol";
import { ValidateSeriesEpoch } from "../../src/instructions/SeriesEpochManager.sol";
import { DutchAuctionBalanceIn } from "../../src/instructions/DutchAuction.sol";
import { RequireFreshReference, NotionalThrottle } from "../../src/instructions/SubfloorGuards.sol";

/// @notice Reference vectors for the TypeScript program builder.
///
/// The SDK encodes SwapVM programs off-chain and the VM decodes them on-chain. Those two encoders
/// agreeing is not something a TypeScript test can establish on its own — it would only be checking
/// the SDK against itself. So the bytes come from the instruction libraries that the VM actually
/// runs, are printed here, and are asserted byte-for-byte in `sdk/src/program.test.ts`.
///
/// Regenerate with:
///   forge test --match-contract EncodingVectors -vv
contract EncodingVectorsTest is Test {
    function test_printVectors() public pure {
        console2.log("deadline_1700000000", vm.toString(Deadline.build(1_700_000_000)));
        console2.log("feeFlatIn_30bps", vm.toString(FeeFlatIn.build(30)));
        console2.log("xycConcentrate_1e18_2e18", vm.toString(XYCConcentrateSwap.build(1e18, 2e18)));
        console2.log("staticBalances_1e18_2500e6", vm.toString(StaticBalances.build(1e18, 2500e6)));
        console2.log("seriesEpoch_7_3", vm.toString(ValidateSeriesEpoch.build(7, 3)));
        console2.log("freshReference_2464", vm.toString(RequireFreshReference.build(2464)));
        console2.log("notionalThrottle_3600_1e21", vm.toString(NotionalThrottle.build(3600, 1e21)));
    }
}
