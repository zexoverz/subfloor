// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Context } from "../libs/VM.sol";
import { ISwapVM } from "../interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "../libs/MakerTraits.sol";
import { TakerTraits, TakerTraitsLib } from "../libs/TakerTraits.sol";
import { SwapVM } from "../SwapVM.sol";
import { IFloorRegistry } from "./IFloorRegistry.sol";
import { SettlementFeeLib } from "./SettlementFeeLib.sol";

/// @title GuardedSwapVM
/// @notice SwapVM with the floor consulted where tokens move.
///
/// The check is not an instruction. The run loop only computes amounts, and program bytecode can
/// neither reach nor skip settlement, so there is nothing here for an attacker to omit: a program
/// carrying no guard instruction at all still arrives at this check. A program that produces nothing
/// never gets this far, because `takerTraits.validate` rejects a zero `amountOut` first, so it never
/// settles either. That is the whole difference between this and a guard a maker opts into per order.
///
/// Both sides are scored, each against its own entry, and `quote()` runs the identical check so a
/// quote can never report a rate settlement would reject.
abstract contract GuardedSwapVM is SwapVM {
    using MakerTraitsLib for *;
    using TakerTraitsLib for TakerTraits;

    IFloorRegistry public immutable FLOOR_REGISTRY;

    constructor(address floorRegistry) {
        FLOOR_REGISTRY = IFloorRegistry(floorRegistry);
    }

    /// @inheritdoc SwapVM
    function _settlementGuard(
        Context memory ctx,
        ISwapVM.Order calldata order,
        TakerTraits takerTraits,
        bytes calldata takerData,
        uint256 amountIn,
        uint256 amountOut
    ) internal view override {
        address tokenIn = ctx.query.tokenIn;
        address tokenOut = ctx.query.tokenOut;

        // The taker's ratio is untouched by fees. Whichever token the fee is charged in, the taker
        // still parts with exactly `amountIn` and still receives exactly `amountOut`: on the
        // tokenIn side the fee is carved out of what the maker gets, and on the tokenOut side it is
        // pulled from the maker separately while the taker is paid the full amount.
        // The maker's is not. It receives `amountIn` less any tokenIn fee and pays `amountOut` plus
        // any tokenOut fee, so the fee has to be resolved here rather than assumed away.
        uint256 feeIn = SettlementFeeLib.settlementFee(ctx.fee, true, amountIn);
        uint256 feeOut = SettlementFeeLib.settlementFee(ctx.fee, false, amountOut);

        // One call rather than two: this runs on every swap, so a second CALL and calldata frame is
        // pure overhead on the hot path.
        FLOOR_REGISTRY.checkSettlement(
            takerTraits.to(takerData, ctx.query.taker),
            order.traits.receiver(order.maker),
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            amountOut + feeOut,
            amountIn - feeIn
        );
    }
}
