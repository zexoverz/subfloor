// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { FloorRouter } from "../../src/routers/FloorRouter.sol";

/// @notice The router is close enough to the EIP-170 ceiling that the next feature can make it
///         undeployable, and this is where that gets noticed.
///
/// At the time of writing the runtime is 24,323 bytes against a 24,576 limit: 253 bytes of room,
/// roughly one more opcode case. Without this test the failure surfaces as a deployment that reverts
/// with no message, on the day someone is deploying — which is a bad day to learn it.
///
/// If this fails, the answer is not to raise the number. It is to move something out of the router:
/// `ControlFloorRouter` already sits at 28,914 bytes and is not deployable for exactly this reason.
contract RouterSizeTest is Test {
    uint256 internal constant EIP170_LIMIT = 24_576;

    /// Deployed rather than measured off `type(...).runtimeCode`, which solc refuses for a contract
    /// with immutables — and the router has twelve of them.
    function _routerSize() internal returns (uint256) {
        FloorRouter r = new FloorRouter(makeAddr("aqua"), makeAddr("weth"), makeAddr("owner"), makeAddr("registry"));
        return address(r).code.length;
    }

    function test_theRouterStillFitsOnChain() public {
        assertLt(_routerSize(), EIP170_LIMIT, "FloorRouter exceeds the EIP-170 limit and cannot be deployed");
    }

    /// A second, tighter line. Crossing it is not yet fatal, but it means the next change probably
    /// is, and it should be a decision rather than a surprise.
    function test_theRouterHasRoomForOneMoreChange() public {
        uint256 size = _routerSize();
        if (size + 200 >= EIP170_LIMIT) {
            emit log_named_uint("FloorRouter runtime bytes", size);
            emit log_named_uint("bytes remaining", EIP170_LIMIT - size);
            emit log_string("Under 200 bytes of headroom. Move something out before adding more.");
        }
        assertLt(size, EIP170_LIMIT);
    }
}
