// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Context } from "../libs/VM.sol";
import { Opcode, OpcodeOps } from "../libs/OpcodeList.sol";
import { RequireFreshReference, NotionalThrottle, ApprovalGate } from "../instructions/SubfloorGuards.sol";
import { IFloorRegistry } from "../subfloor/IFloorRegistry.sol";

/// @notice SUBFLOOR's three optional guards, as a mixin that composes onto any opcode set.
///
/// Kept separate from a particular base set because the deployed router is Aqua-backed while the
/// tests exercise the guards against the full standard set, and duplicating the dispatch in both
/// is how the two drift apart.
///
/// These sit *above* the mandatory settlement floor, never instead of it. Each closes something the
/// floor alone does not: reference freshness tighter than the registry-wide bound, how many fills
/// happen at a fair price, and a human seeing a fill before it lands.
abstract contract SubfloorGuardDispatch {
    using OpcodeOps for Opcode;

    IFloorRegistry public immutable GUARD_REGISTRY;

    /// @notice Per-order epoch usage for `NotionalThrottle`. Instructions are libraries and hold no
    ///         storage, so the one storage-writing guard keeps its state here.
    mapping(bytes32 => NotionalThrottle.Usage) public throttleUsage;

    constructor(address registry) {
        GUARD_REGISTRY = IFloorRegistry(registry);
    }

    /// @return handled True when the opcode was one of ours, so the caller falls through otherwise.
    function _runSubfloorGuard(Context memory ctx, uint256 opcode, bytes calldata args) internal returns (bool handled) {
        if (opcode == RequireFreshReference.opcode.asU8()) {
            RequireFreshReference.exec(ctx, args, GUARD_REGISTRY);
        } else if (opcode == NotionalThrottle.opcode.asU8()) {
            NotionalThrottle.exec(ctx, args, throttleUsage);
        } else if (opcode == ApprovalGate.opcode.asU8()) {
            ApprovalGate.exec(ctx, args, GUARD_REGISTRY);
        } else {
            return false;
        }
        return true;
    }
}
