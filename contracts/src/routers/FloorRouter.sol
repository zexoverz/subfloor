// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Context } from "../libs/VM.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";

import { SwapVM } from "../SwapVM.sol";
import { GuardedSwapVM } from "../subfloor/GuardedSwapVM.sol";
import { SubfloorOpcodes } from "../opcodes/SubfloorOpcodes.sol";
import { SubfloorGuardDispatch } from "../opcodes/SubfloorGuardDispatch.sol";

/// @title FloorRouter
/// @notice The deployed router: Aqua-backed strategies, with the floor checked at settlement.
/// @dev Aqua positions reference the VM by address, so this plugs into canonical Aqua unchanged.
///      Aqua itself is never forked.
contract FloorRouter is Simulator, GuardedSwapVM, SubfloorOpcodes {
    /// @dev The EIP-712 domain name and version are constants rather than constructor arguments.
    ///      They never vary, and `forge script` fails to encode a deployment whose constructor takes
    ///      `string` parameters — it aborts with `type check failed for "offset (usize)"` *before*
    ///      broadcasting, so the run prints addresses from simulation and deploys nothing. Found on
    ///      Base Sepolia 7 Sep, where all four addresses came back with no code.
    string internal constant _EIP712_NAME = "SUBFLOOR";
    string internal constant _EIP712_VERSION = "1";

    constructor(
        address aqua,
        address weth,
        address owner,
        address floorRegistry
    ) SwapVM(aqua, weth, owner, _EIP712_NAME, _EIP712_VERSION) GuardedSwapVM(floorRegistry) SubfloorGuardDispatch(floorRegistry) { }

    /// @dev Dispatches an opcode to its handler for VM execution
    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        _runOpcode(ctx, opcode, args);
    }
}
