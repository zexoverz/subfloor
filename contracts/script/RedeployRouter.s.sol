// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:copyright © 2026 SUBFLOOR

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { AquaGuardVault } from "../src/subfloor/AquaGuardVault.sol";
import { FloorRegistry } from "../src/subfloor/FloorRegistry.sol";
import { FloorRouter } from "../src/routers/FloorRouter.sol";

/// @notice Replace the router, and nothing else.
///
/// The deployed router does not correspond to any commit (#167). It is 23,983 bytes; the commit
/// that added the three opcodes builds 24,323 and the one before it builds 23,176, so it came off a
/// working tree nobody committed. It is also missing the dispatch for `0x48` ValidateSeriesEpoch,
/// `0xb2` OraclePriceAdjuster and `0x30` JumpIfDirection, which is why the live book has four steps
/// where `ConcentratedBook.build` emits seven — the §4 position is not the one trading.
///
/// Only the router moves. The registry is not bound to any router (`checkSettlement` is a view with
/// no caller restriction), the vault takes the app as an argument to `ship`, and the floors and the
/// inventory are keyed to the vault. Redeploying the registry would throw away the floors and the
/// guardian registration for no reason.
///
/// The old strategy is docked in the same transaction batch. Leaving it live would leave a book
/// quoting on a router whose settlement guard nobody is watching, and a taker that finds it first
/// would fill against the wrong generation.
///
/// ```
/// # 1. deploy the router and dock the old book
/// SUBFLOOR_OLD_STRATEGY=0x... forge script script/RedeployRouter.s.sol --sig "run()" \
///   --rpc-url $RPC --account subfloor-dev --broadcast
///
/// # 2. point the repo at it, in one place
/// node scripts/set-router.mjs 0x<new address> <deployment block>
///
/// # 3. sign a mandate for the NEW app and reship
/// forge script script/ShipTestnetBook.s.sol --sig "digest()" --rpc-url $RPC
/// ```
contract RedeployRouter is Script {
    function run() external {
        address aqua = vm.envAddress("SUBFLOOR_AQUA");
        address weth = vm.envAddress("SUBFLOOR_WETH");
        address registry = vm.envAddress("SUBFLOOR_REGISTRY");
        AquaGuardVault vault = AquaGuardVault(payable(vm.envAddress("SUBFLOOR_VAULT")));
        address owner = vm.envAddress("SUBFLOOR_OWNER");

        address oldRouter = vm.envAddress("SUBFLOOR_ROUTER");
        bytes32 oldStrategy = vm.envOr("SUBFLOOR_OLD_STRATEGY", bytes32(0));

        vm.startBroadcast();

        FloorRouter router = new FloorRouter(aqua, weth, owner, registry);

        // Dock the old book on the old app. `dock` is reachable by the delegate, a dock operator or
        // the owner, because docking can only stop trading and never worsen a price.
        if (oldStrategy != bytes32(0)) {
            address[] memory tokens = new address[](2);
            tokens[0] = weth;
            tokens[1] = vm.envAddress("SUBFLOOR_TUSDC");
            vault.dock(oldRouter, oldStrategy, tokens);
            console2.log("docked the old book on the old router");
        }

        vm.stopBroadcast();

        console2.log("new FloorRouter", address(router));
        console2.log("registry (unchanged)", registry);
        console2.log("vault (unchanged)", address(vault));
        console2.log("");
        console2.log("The floors and the inventory did not move: they are keyed to the vault, and the");
        console2.log("registry is not bound to a router. Only the app address changed.");
        console2.log("");
        console2.log("Next: node scripts/set-router.mjs", vm.toString(address(router)));
        console2.log("Then sign a mandate for the NEW app and reship the book.");

        // Guard against shipping a router that cannot run the position, which is the exact failure
        // #167 records. Cheap, and it fails the run rather than the demo.
        require(address(router).code.length > 24_000, "router smaller than expected: wrong build?");
        FloorRegistry(registry).referenceAge(weth, vm.envAddress("SUBFLOOR_TUSDC"));
    }
}
