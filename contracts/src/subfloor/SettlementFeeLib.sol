// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { ProtocolFee, FeeMeta, FeeMetaLib, FeeReceiverLib } from "../libs/ProtocolFee.sol";

/// @title SettlementFeeLib
/// @notice What the protocol fee will be, computed without moving anything.
///
/// The settlement guard runs before `_transferIn`/`_transferOut`, but the fee is only resolved
/// inside them. Scoring a floor against the run loop's amounts would therefore score a number
/// better than what actually lands in the maker's wallet, and a fill sitting near the floor would
/// pass the check and still pay out below it.
///
/// This mirrors the arithmetic of the four `FeeMetaLib.resolve*` functions exactly — they differ
/// only in how they move tokens, never in how much they take — so the guard can ask what the fee
/// will be before it is taken. `SettlementFeeMirror.t.sol` pins the two implementations together.
library SettlementFeeLib {
    /// @param wantTokenIn True to ask for the fee denominated in tokenIn, false for tokenOut. The
    ///        fee is charged in exactly one of the two, so the other side always answers zero.
    /// @param amount `ctx.swap.amountIn` when asking about tokenIn, `ctx.swap.amountOut` for tokenOut.
    function settlementFee(ProtocolFee memory data, bool wantTokenIn, uint256 amount) internal pure returns (uint256 totalFee) {
        FeeMeta meta = data.meta;
        uint8 count = FeeMetaLib.decodeCount(meta);
        if (count == 0) return 0;
        if (wantTokenIn != FeeMetaLib.decodeIsTokenIn(meta)) return 0;

        uint24 totalBps = FeeMetaLib.decodeTotalBps(meta);
        uint256 totalFeeMax = data.feeTotal;
        uint256 estimated = FeeMetaLib.decodeSurplusEstimate(meta);

        // Surplus is measured against what the taker really brings in, or what the maker really
        // pays out; the two sides move the fee in opposite directions, exactly as upstream.
        uint256 surplus;
        if (wantTokenIn) {
            uint256 real = amount - totalFeeMax;
            if (real > estimated) surplus = real - estimated;
        } else {
            uint256 real = amount + totalFeeMax;
            if (estimated > real) surplus = estimated - real;
        }

        while (count > 0) {
            (, uint256 fee) = FeeReceiverLib.resolve(data.receivers[--count], totalFeeMax, totalBps, surplus);
            totalFee += fee;
        }
    }
}
