// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:copyright © 2026 SUBFLOOR

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { FloorRegistry } from "../src/subfloor/FloorRegistry.sol";

/// @notice Lower a floor. The one operation software cannot do alone.
///
/// Raising a floor is one call from the recipient and needs no permission — strengthening your own
/// protection is always allowed. Lowering it is the opposite: it needs an EIP-712 signature from the
/// guardian, which on the live run is a hardware device. That asymmetry is the mechanism, and this
/// script is the only path through it.
///
/// Two passes, because the digest has to exist before it can be signed. On the demo the second
/// signature comes off a Ledger; here it comes off the dev key, and nothing else about the flow
/// changes — which is the point of doing it this way rather than adding a device-only branch.
///
/// ```
/// forge script script/LowerFloor.s.sol --sig "digest()" --rpc-url $RPC
/// cast wallet sign --no-hash <digest> --account subfloor-dev
/// SUBFLOOR_LOWER_SIG=0x... forge script script/LowerFloor.s.sol --sig "run()" \
///   --rpc-url $RPC --account subfloor-dev --broadcast
/// ```
///
/// The nonce is read from the registry rather than passed in: `_consume` requires it to equal
/// `nonces[recipient]` exactly, so a guessed one reverts `WrongNonce` after the signature has
/// already been produced against the wrong digest.
contract LowerFloor is Script {
    bytes32 internal constant _FLOOR_LOWERING_TYPEHASH =
        keccak256("FloorLowering(address recipient,address base,address quote,uint16 maxAdverseBps,uint256 absoluteRate,uint256 nonce,uint256 deadline)");

    address internal constant WETH = 0x4200000000000000000000000000000000000006;

    function _params()
        internal
        view
        returns (FloorRegistry registry, address recipient, address quote, uint16 bps, uint256 absolute, uint256 nonce, uint256 deadline)
    {
        registry = FloorRegistry(vm.envAddress("SUBFLOOR_REGISTRY"));
        recipient = vm.envAddress("SUBFLOOR_VAULT");
        quote = vm.envAddress("SUBFLOOR_TUSDC");
        bps = uint16(vm.envOr("SUBFLOOR_NEW_BPS", uint256(100)));
        absolute = vm.envUint("SUBFLOOR_NEW_FLOOR");
        nonce = registry.nonces(recipient);
        deadline = vm.envOr("SUBFLOOR_DEADLINE", block.timestamp + 3600);
    }

    function digest() external view {
        (FloorRegistry registry, address recipient, address quote, uint16 bps, uint256 absolute, uint256 nonce, uint256 deadline) = _params();

        bytes32 structHash =
            keccak256(abi.encode(_FLOOR_LOWERING_TYPEHASH, recipient, WETH, quote, bps, absolute, nonce, deadline));
        bytes32 d = keccak256(abi.encodePacked("\x19\x01", registry.DOMAIN_SEPARATOR(), structHash));

        console2.log("nonce   ", nonce);
        console2.log("deadline", deadline);
        console2.log("digest  ", vm.toString(d));
        console2.log("");
        console2.log("Sign this on the guardian device, then re-run with SUBFLOOR_LOWER_SIG and the");
        console2.log("same SUBFLOOR_DEADLINE, or the digest moves and the signature stops matching.");
    }

    function run() external {
        (FloorRegistry registry, address recipient, address quote, uint16 bps, uint256 absolute, uint256 nonce, uint256 deadline) = _params();
        bytes memory signature = vm.envBytes("SUBFLOOR_LOWER_SIG");

        vm.startBroadcast();
        registry.lowerFloor(recipient, WETH, quote, bps, absolute, nonce, deadline, signature);
        vm.stopBroadcast();

        (uint256 floorRate, bool enforced) = registry.effectiveFloor(recipient, WETH, quote);
        console2.log("floor now", floorRate, enforced);
        console2.log("registry nonce advanced to", registry.nonces(recipient));
    }
}
