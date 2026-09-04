// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Context } from "../libs/VM.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

import { SwapVM } from "../SwapVM.sol";
import { GuardedSwapVM } from "../subfloor/GuardedSwapVM.sol";
import { AquaOpcodes } from "../opcodes/AquaOpcodes.sol";

/// @title FloorRouter
/// @notice The deployed router: Aqua-backed strategies, with the floor checked at settlement.
/// @dev Aqua positions reference the VM by address, so this plugs into canonical Aqua unchanged.
///      Aqua itself is never forked.
contract FloorRouter is Simulator, GuardedSwapVM, AquaOpcodes {
    constructor(
        address aqua,
        address weth,
        address owner,
        string memory name,
        string memory version,
        address floorRegistry
    ) SwapVM(aqua, weth, owner, name, version) GuardedSwapVM(floorRegistry) { }

    /// @dev Dispatches an opcode to its handler for VM execution
    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        _runOpcode(ctx, opcode, args);
    }
}
