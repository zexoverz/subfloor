// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { FloorRegistry } from "../src/subfloor/FloorRegistry.sol";
import { FloorRouter } from "../src/routers/FloorRouter.sol";
import { AquaGuardVault } from "../src/subfloor/AquaGuardVault.sol";
import { VaultFactory } from "../src/subfloor/VaultFactory.sol";

/// @notice Base Sepolia deployment, so the frontend can integrate against real contracts and real
///         events without waiting for the mainnet run.
///
/// **Canonical Aqua is not deployed on Base Sepolia** — checked with `cast code`, both the registry
/// and the canonical router return empty. So this deploys our own Aqua from the vendored source.
/// That is fine for integration and is not fine for anything else: the mainnet deployment plugs
/// into canonical Aqua and never forks it, which is the whole reason a redeployed router works.
///
/// ```
/// export SUBFLOOR_OWNER=0x...
/// forge script script/DeploySubfloorTestnet.s.sol \
///   --rpc-url https://sepolia.base.org --account <keystore> --broadcast
/// ```
contract DeploySubfloorTestnet is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    /// @dev Verified live: `description()` returns "ETH / USD" on Base Sepolia.
    address internal constant SEPOLIA_ETH_USD_FEED = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;
    address internal constant SEPOLIA_WETH = 0x4200000000000000000000000000000000000006;
    address internal constant SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    /// @dev Deliberately far looser than the mainnet bound. Testnet feeds update on their own
    ///      schedule and a bound measured against mainnet activity would fail this deployment
    ///      closed constantly, which would waste the frontend's time on a problem that is not real.
    ///      Nothing measured here transfers to mainnet.
    uint32 internal constant TESTNET_STALENESS_BOUND = 86_400;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, WrongChain(block.chainid, BASE_SEPOLIA_CHAIN_ID));

        address owner = vm.envAddress("SUBFLOOR_OWNER");

        vm.startBroadcast();

        Aqua aqua = new Aqua();
        // Deployed to the broadcaster first, because the reference feeds below are onlyOwner and
        // the final owner is usually a colder key that is not the one paying gas. Ownership is
        // handed over at the end, once the write-once feeds are set.
        address deployer = msg.sender;
        FloorRegistry registry = new FloorRegistry(deployer, 0);

        registry.setReferenceFeed(SEPOLIA_WETH, SEPOLIA_USDC, SEPOLIA_ETH_USD_FEED, false, TESTNET_STALENESS_BOUND, 8, 18, 6);
        registry.setReferenceFeed(SEPOLIA_USDC, SEPOLIA_WETH, SEPOLIA_ETH_USD_FEED, true, TESTNET_STALENESS_BOUND, 8, 6, 18);

        FloorRouter router = new FloorRouter(address(aqua), SEPOLIA_WETH, owner, address(registry));
        AquaGuardVault vault = new AquaGuardVault(address(aqua), owner);

        // The feeds are write-once and now set, so the owner key never needs to touch them.
        registry.transferOwnership(owner);

        // So someone other than us can have a vault. The factory owns nothing and cannot act on
        // what it creates; the vault below is ours, deployed the same way anyone else would.
        VaultFactory factory = new VaultFactory(address(aqua));

        vm.stopBroadcast();

        console2.log("--- Base Sepolia, for frontend integration only ---");
        console2.log("Aqua (ours, not canonical)", address(aqua));
        console2.log("FloorRegistry             ", address(registry));
        console2.log("FloorRouter               ", address(router));
        console2.log("AquaGuardVault            ", address(vault));
        console2.log("VaultFactory              ", address(factory));
        console2.log("owner                     ", owner);
        console2.log("");
        console2.log("WETH", SEPOLIA_WETH);
        console2.log("USDC", SEPOLIA_USDC);
        console2.log("ETH/USD feed", SEPOLIA_ETH_USD_FEED);
    }
}
