// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:copyright © 2026 SUBFLOOR

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { FloorRegistry } from "../src/subfloor/FloorRegistry.sol";

/// @notice The registry on a second chain where canonical Aqua is live, to show the modification
///         travels.
///
/// No vault, no funding, no taker, no live run. The claim being made is portability: the router
/// plugs into canonical Aqua by address and nothing else, so a verified deployment somewhere else is
/// a checkable statement that this is not a Base-shaped thing. Two live runs would be two of
/// everything that can fail during a demo, on the one axis where failure takes all three tracks down
/// together.
///
/// Canonical Aqua answers at `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` on Base, Ethereum,
/// Arbitrum, Optimism, Polygon, BSC and Sepolia — same address, same 5,619 bytes, checked by
/// `eth_getCode` on each rather than taken from a list.
///
/// The router is deliberately **not** deployed by this script. `forge script` and `forge build`
/// compile `FloorRouter` to different bytecode in this repo, so a script-deployed router matches no
/// commit and cannot be verified — see #167. Deploy it with the bytes the verifier itself produces,
/// the way the Base Sepolia one was.
contract DeploySecondChain is Script {
    function run() external {
        address owner = vm.envAddress("SUBFLOOR_OWNER");
        address weth = vm.envAddress("SUBFLOOR_WETH");
        address usdc = vm.envAddress("SUBFLOOR_USDC");
        address feed = vm.envAddress("SUBFLOOR_ETH_USD_FEED");
        uint32 staleness = uint32(vm.envUint("SUBFLOOR_STALENESS_BOUND"));

        vm.startBroadcast();

        // Zero lowering delay, matching Base Sepolia: the guardian signature is already the ceremony
        // and a timelock on top of it protects against nothing this deployment models.
        FloorRegistry registry = new FloorRegistry(owner, 0);

        // Both directions, because a floor is per ordered pair and a book quotes both ways. The
        // inverted flag is what makes the reverse direction score against the same feed rather than
        // against a reference 10^24 out of scale.
        registry.setReferenceFeed(weth, usdc, feed, false, staleness, 8, 18, 6);
        registry.setReferenceFeed(usdc, weth, feed, true, staleness, 8, 6, 18);

        vm.stopBroadcast();

        console2.log("chainId  ", block.chainid);
        console2.log("registry ", address(registry));
        console2.log("");
        console2.log("Next: deploy FloorRouter from the bytes Sourcify recompiles, not through forge");
        console2.log("script. See docs/SPEC.md on why, and #167.");
    }
}
