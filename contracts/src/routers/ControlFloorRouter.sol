// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Context } from "../libs/VM.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

import { SwapVM } from "../SwapVM.sol";
import { FloorGuardOpcodes } from "../opcodes/FloorGuardOpcodes.sol";

/// @title ControlFloorRouter
/// @notice **Never deploy this with real money.** It is the control arm of the experiment: an
///         unmodified `SwapVM` whose only floor is the optional `RequireFloor` instruction, so a
///         program that omits the opcode settles with no floor at all.
///
///         It exists so the claim about settlement enforcement is demonstrated against something
///         rather than asserted. `RedThenGreen.t.sol` runs one hostile program against this and
///         against `FloorRouter` and shows the difference.
contract ControlFloorRouter is Simulator, SwapVM, FloorGuardOpcodes {
    constructor(address aqua, address weth, address owner, string memory name, string memory version, address floorRegistry)
        SwapVM(aqua, weth, owner, name, version)
        FloorGuardOpcodes(floorRegistry)
    { }

    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        _runOpcode(ctx, opcode, args);
    }
}
