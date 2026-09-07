// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { FloorRegistry } from "../src/subfloor/FloorRegistry.sol";

/// @notice Puts real rows in the Base Sepolia subgraph so the frontend has something to render.
///
/// Only the floor half. Raising a floor is one call from the recipient and needs nothing else to
/// exist — no inventory, no strategy, no counterparty — so it is the cheapest way to get `Floor`
/// and `FloorChange` populated with numbers that came from a chain rather than from a fixture.
///
/// ```
/// export SUBFLOOR_REGISTRY=0x...
/// forge script script/SeedTestnet.s.sol --rpc-url https://sepolia.base.org \
///   --account subfloor-dev --broadcast
/// ```
contract SeedTestnet is Script {
    address internal constant SEPOLIA_WETH = 0x4200000000000000000000000000000000000006;
    address internal constant SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        FloorRegistry registry = FloorRegistry(vm.envAddress("SUBFLOOR_REGISTRY"));

        vm.startBroadcast();

        // Selling WETH for USDC. 100 bps of tolerance, no absolute backstop, so the floor tracks
        // the reference rather than sitting at a fixed number.
        registry.raiseFloor(SEPOLIA_WETH, SEPOLIA_USDC, 100, 0);

        // Tightened straight away, so the history has more than one row and the screen can show a
        // floor that moved. Tightening is a raise, so it needs no signature.
        registry.raiseFloor(SEPOLIA_WETH, SEPOLIA_USDC, 50, 0);

        // The other direction of the pair, because a floor is keyed on (given, received) and the
        // two sides of a fill look them up in opposite orders.
        registry.raiseFloor(SEPOLIA_USDC, SEPOLIA_WETH, 100, 0);

        vm.stopBroadcast();

        (uint256 floorRate, bool enforced) = registry.effectiveFloor(msg.sender, SEPOLIA_WETH, SEPOLIA_USDC);
        console2.log("recipient      ", msg.sender);
        console2.log("floor WETH->USDC", floorRate);
        console2.log("enforced       ", enforced);
    }
}
