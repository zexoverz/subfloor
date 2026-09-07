// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { FloorRegistry } from "../src/subfloor/FloorRegistry.sol";
import { AquaGuardVault } from "../src/subfloor/AquaGuardVault.sol";

/// @notice Puts real rows in the Base Sepolia subgraph so the frontend has something to render.
///
/// Only the floor half. Raising a floor is one call from the recipient and needs nothing else to
/// exist — no inventory, no strategy, no counterparty — so it is the cheapest way to get `Floor`
/// and `FloorChange` populated with numbers that came from a chain rather than from a fixture.
///
/// **The recipient has to be the vault.** `raiseFloor` keys off `msg.sender`, so an earlier version
/// of this script that broadcast the calls directly registered every floor to the deployer EOA — an
/// address that never appears in a fill. At settlement the maker-side recipient is
/// `order.traits.receiver(order.maker)` and the maker is the vault, so the vault would have settled
/// with no floor at all while the registry and the subgraph both showed floors that looked set. The
/// calls therefore go through `AquaGuardVault.execute`, which is owner-only and exists for exactly
/// this class of thing.
///
/// ```
/// export SUBFLOOR_REGISTRY=0x...
/// export SUBFLOOR_VAULT=0x...
/// forge script script/SeedTestnet.s.sol --rpc-url https://sepolia.base.org \
///   --account subfloor-dev --broadcast
/// ```
contract SeedTestnet is Script {
    address internal constant SEPOLIA_WETH = 0x4200000000000000000000000000000000000006;
    address internal constant SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        FloorRegistry registry = FloorRegistry(vm.envAddress("SUBFLOOR_REGISTRY"));
        AquaGuardVault vault = AquaGuardVault(payable(vm.envAddress("SUBFLOOR_VAULT")));

        vm.startBroadcast();

        // Selling WETH for USDC. 100 bps of tolerance, no absolute backstop, so the floor tracks
        // the reference rather than sitting at a fixed number.
        _raise(vault, address(registry), SEPOLIA_WETH, SEPOLIA_USDC, 100, 0);

        // Tightened straight away, so the history has more than one row and the screen can show a
        // floor that moved. Tightening is a raise, so it needs no signature.
        _raise(vault, address(registry), SEPOLIA_WETH, SEPOLIA_USDC, 50, 0);

        // The other direction of the pair, because a floor is keyed on (given, received) and the
        // two sides of a fill look them up in opposite orders. One side covered is an agent that
        // can still sell the other way at any price.
        _raise(vault, address(registry), SEPOLIA_USDC, SEPOLIA_WETH, 100, 0);

        vm.stopBroadcast();

        _report(registry, address(vault), SEPOLIA_WETH, SEPOLIA_USDC, "WETH->USDC");
        _report(registry, address(vault), SEPOLIA_USDC, SEPOLIA_WETH, "USDC->WETH");
    }

    function _raise(
        AquaGuardVault vault,
        address registry,
        address tokenIn,
        address tokenOut,
        uint16 maxAdverseBps,
        uint232 absoluteRate
    ) internal {
        vault.execute(
            registry,
            0,
            abi.encodeCall(FloorRegistry.raiseFloor, (tokenIn, tokenOut, maxAdverseBps, absoluteRate))
        );
    }

    /// @dev Reads back from the registry rather than trusting the broadcast. `forge script` prints
    ///      addresses from simulation and has aborted before broadcasting before now, so a run that
    ///      looks clean is not evidence that anything landed.
    function _report(FloorRegistry registry, address recipient, address tokenIn, address tokenOut, string memory label)
        internal
        view
    {
        (uint256 floorRate, bool enforced) = registry.effectiveFloor(recipient, tokenIn, tokenOut);
        console2.log("recipient (vault)", recipient);
        console2.log(label, floorRate);
        console2.log("enforced         ", enforced);
    }
}
