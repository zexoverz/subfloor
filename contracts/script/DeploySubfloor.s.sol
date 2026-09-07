// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { FloorRegistry } from "../src/subfloor/FloorRegistry.sol";
import { FloorRouter } from "../src/routers/FloorRouter.sol";
import { AquaGuardVault } from "../src/subfloor/AquaGuardVault.sol";
import { SubfloorParams } from "../src/subfloor/SubfloorParams.sol";

/// @notice Deploys the three contracts to Base and wires the WETH/USDC reference.
///
/// Ordering matters and is not arbitrary. The registry's reference feeds are **write-once**, so the
/// WETH/USDC entries are set here, in the same transaction sequence as the deployment, and cannot
/// be corrected afterwards. A wrong staleness bound or a wrong feed address means deploying a new
/// registry. Read the values in `SubfloorParams` before broadcasting, and read the note on the
/// staleness bound — it is provisional and measured, not a round number.
///
/// The registry is deployed with `LOWERING_DELAY = 0`: a guardian-signed weakening applies at once.
/// That is settled for the live run, so floor adjustments are not stalled during filming.
///
/// ```
/// export SUBFLOOR_OWNER=0x...
/// forge script script/DeploySubfloor.s.sol \
///   --rpc-url "$RPC_URL" --account <keystore> --broadcast
/// ```
///
/// **Verify separately, do not pass `--verify` here.** `forge script` fails to decode this
/// deployment's constructor arguments — `FloorRouter` takes two `string` parameters and the decoder
/// errors on the offset — so the inline verification step aborts. Simulated against Base on 4 Sep:
/// the deployment itself runs clean and only the verification decode fails. Verify afterwards with
/// `forge verify-contract <addr> <Contract> --constructor-args $(cast abi-encode ...)`, on Sourcify
/// **and** Basescan the same day. An unverified router turns the demo's best artifact, a decoded
/// `SettledBelowFloor` revert on a public explorer, into hex soup.
contract DeploySubfloor is Script {
    /// @dev Base mainnet. Guard against a fat-fingered RPC pointing at the wrong chain, because the
    ///      addresses in SubfloorParams are Base-specific and would silently deploy against nothing.
    uint256 internal constant BASE_CHAIN_ID = 8453;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        require(block.chainid == BASE_CHAIN_ID, WrongChain(block.chainid, BASE_CHAIN_ID));

        address owner = vm.envAddress("SUBFLOOR_OWNER");
        uint32 loweringDelay = uint32(vm.envOr("SUBFLOOR_LOWERING_DELAY", uint256(0)));

        vm.startBroadcast();

        FloorRegistry registry = new FloorRegistry(owner, loweringDelay);

        // Both directions of the pair, because a floor is keyed on (token given, token received)
        // and the two sides of a fill look them up in opposite orders. Missing one means the maker
        // side of every WETH/USDC fill reverts NoReferenceFeed.
        registry.setReferenceFeed(
            SubfloorParams.BASE_WETH,
            SubfloorParams.BASE_USDC,
            SubfloorParams.BASE_ETH_USD_FEED,
            false,
            SubfloorParams.ETH_USD_STALENESS_BOUND_PROVISIONAL,
            SubfloorParams.BASE_ETH_USD_DECIMALS,
            18,
            6
        );
        registry.setReferenceFeed(
            SubfloorParams.BASE_USDC,
            SubfloorParams.BASE_WETH,
            SubfloorParams.BASE_ETH_USD_FEED,
            true,
            SubfloorParams.ETH_USD_STALENESS_BOUND_PROVISIONAL,
            SubfloorParams.BASE_ETH_USD_DECIMALS,
            6,
            18
        );

        FloorRouter router = new FloorRouter(
            SubfloorParams.BASE_AQUA,
            SubfloorParams.BASE_WETH,
            owner,
            "SUBFLOOR",
            "1",
            address(registry)
        );

        AquaGuardVault vault = new AquaGuardVault(SubfloorParams.BASE_AQUA, owner);

        vm.stopBroadcast();

        console2.log("FloorRegistry  ", address(registry));
        console2.log("FloorRouter    ", address(router));
        console2.log("AquaGuardVault ", address(vault));
        console2.log("owner          ", owner);
        console2.log("loweringDelay  ", loweringDelay);
        console2.log("");
        console2.log("Next, and none of it is optional before funding:");
        console2.log("  vault.setDelegate(<agent EOA>)     - owner only");
        console2.log("  vault.setGuardian(<Ledger address>) - owner only, and mandates fail without it");
        console2.log("  registry.setGuardian(<Ledger>)      - from the vault, once, cannot be replaced without it");
        console2.log("  registry.raiseFloor(...)            - from the vault, per pair");
        console2.log("Verify on Sourcify AND Basescan today, or the mainnet reverts show as hex soup.");
    }
}
