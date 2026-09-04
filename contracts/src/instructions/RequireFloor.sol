// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Context, ContextLib } from "../libs/VM.sol";
import { Opcode } from "../libs/OpcodeList.sol";
import { MemoryPtr, MemoryPtrLib } from "../libs/MemoryPtr.sol";
import { InstructionBuilder } from "../libs/InstructionBuilder.sol";
import { IFloorRegistry } from "../subfloor/IFloorRegistry.sol";

/// @notice The floor as an in-program instruction. **This is the control, not the product.**
///
/// It exists to be broken. Every prior design in this space — Ballast included — put the guard in
/// the instruction set, and this is a faithful version of that: same registry, same arithmetic,
/// same two recipients. The only difference is that a program can decline to contain it, and the
/// fuzz suite's first job is to find a program that does exactly that and settles below the floor
/// anyway. That counterexample is the argument for putting the check in settlement instead.
///
/// It is weaker than the settlement check in three ways beyond being optional, and all three are
/// inherent to being an instruction rather than incidental to this implementation:
///
/// 1. **Optional.** Omit the opcode and nothing is enforced. This is the one that matters.
/// 2. **Keyed to the wrong addresses.** The run loop's context carries `maker` and `taker`, not
///    `order.traits.receiver(...)` and `takerTraits.to(...)`. An instruction cannot see where the
///    tokens are actually going, so it protects the counterparties rather than the recipients, and
///    an order with a custom receiver slips out from under it.
/// 3. **Blind to fees.** It runs before settlement resolves the protocol fee, so it scores the
///    maker on `amountIn` rather than on the `amountIn` less fee that the maker actually receives.
///
/// @dev Encoding: no arguments.
library RequireFloor {
    using MemoryPtrLib for MemoryPtr;
    using InstructionBuilder for MemoryPtr;
    using ContextLib for Context;

    Opcode constant opcode = Opcode.RequireFloor;

    function sizeOf() internal pure returns (uint256) {
        return InstructionBuilder.sizeOf();
    }

    function build() internal pure returns (bytes memory) {
        return build(MemoryPtrLib.alloc(sizeOf())).resolve();
    }

    function build(MemoryPtr ptrStart) internal pure returns (MemoryPtr ptr) {
        ptr = ptrStart.pushHeader(opcode);
        ptrStart.patchLength(ptr);
    }

    function exec(Context memory ctx, bytes calldata, IFloorRegistry registry) internal {
        (uint256 amountIn, uint256 amountOut) = ctx.runLoop();

        registry.checkFill(ctx.query.taker, ctx.query.tokenIn, ctx.query.tokenOut, amountIn, amountOut);
        registry.checkFill(ctx.query.maker, ctx.query.tokenOut, ctx.query.tokenIn, amountOut, amountIn);
    }
}
