// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Context } from "../libs/VM.sol";
import { AquaOpcodes } from "./AquaOpcodes.sol";
import { SubfloorGuardDispatch } from "./SubfloorGuardDispatch.sol";

/// @notice The Aqua opcode set plus SUBFLOOR's three optional guards. This is what ships.
abstract contract SubfloorOpcodes is AquaOpcodes, SubfloorGuardDispatch {
    function _runOpcode(Context memory ctx, uint256 opcode, bytes calldata args) internal virtual override {
        if (!_runSubfloorGuard(ctx, opcode, args)) super._runOpcode(ctx, opcode, args);
    }
}
