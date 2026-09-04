// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Context } from "../libs/VM.sol";
import { Opcode, OpcodeOps } from "../libs/OpcodeList.sol";
import { Opcodes } from "./Opcodes.sol";
import { RequireFloor } from "../instructions/RequireFloor.sol";
import { IFloorRegistry } from "../subfloor/IFloorRegistry.sol";

/// @notice The standard opcode set plus the in-program floor guard, for the control router only.
/// @dev The registry lives here rather than in the instruction args so the control is a fair
///      comparison: same registry the settlement check consults, reached the same way. Letting the
///      program name its own registry would make the control a strawman.
abstract contract FloorGuardOpcodes is Opcodes {
    using OpcodeOps for Opcode;

    IFloorRegistry public immutable OPCODE_FLOOR_REGISTRY;

    constructor(address floorRegistry) {
        OPCODE_FLOOR_REGISTRY = IFloorRegistry(floorRegistry);
    }

    function _runOpcode(Context memory ctx, uint256 opcode, bytes calldata args) internal virtual override {
        if (opcode == RequireFloor.opcode.asU8()) RequireFloor.exec(ctx, args, OPCODE_FLOOR_REGISTRY);
        else super._runOpcode(ctx, opcode, args);
    }
}
