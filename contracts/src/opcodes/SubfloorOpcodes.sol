// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Context } from "../libs/VM.sol";
import { Opcode, OpcodeOps } from "../libs/OpcodeList.sol";
import { AquaOpcodes } from "./AquaOpcodes.sol";
import { SubfloorGuardDispatch } from "./SubfloorGuardDispatch.sol";
import { ValidateSeriesEpoch } from "../instructions/SeriesEpochManager.sol";
import { OraclePriceAdjuster } from "../instructions/OraclePriceAdjuster.sol";
import { JumpIfDirection } from "../instructions/Jumps.sol";

/// @notice The Aqua opcode set, SUBFLOOR's three guards, and the three instructions the position
///         needs that the Aqua set leaves out. This is what ships.
///
/// @dev `AquaOpcodes` is the upstream set, and it omits `ValidateSeriesEpoch`, `OraclePriceAdjuster`
///      and `JumpIfDirection`. That mattered more than it looked: §4's position is a concentrated
///      book with an oracle improvement, mass-invalidatable as a series, and a router without these
///      three reverts `UnknownOpcode` at fill time on a program that builds fine. Measured cost of
///      adding them is in `docs/gas.md`; the full instruction set does not fit under EIP-170, which
///      is why this is three additions rather than a switch to `Opcodes`.
abstract contract SubfloorOpcodes is AquaOpcodes, SubfloorGuardDispatch {
    using OpcodeOps for Opcode;

    function _runOpcode(Context memory ctx, uint256 opcode, bytes calldata args) internal virtual override {
        if (_runSubfloorGuard(ctx, opcode, args)) return;

        if (opcode == ValidateSeriesEpoch.opcode.asU8()) ValidateSeriesEpoch.exec(ctx, args);
        else if (opcode == OraclePriceAdjuster.opcode.asU8()) OraclePriceAdjuster.exec(ctx, args);
        else if (opcode == JumpIfDirection.opcode.asU8()) JumpIfDirection.exec(ctx, args);
        else super._runOpcode(ctx, opcode, args);
    }
}
