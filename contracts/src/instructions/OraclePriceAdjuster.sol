// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (the decimals fix below)

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import { Context } from "../libs/VM.sol";
import { Opcode } from "../libs/OpcodeList.sol";
import { MemoryPtr, MemoryPtrLib } from "../libs/MemoryPtr.sol";
import { InstructionBuilder } from "../libs/InstructionBuilder.sol";
import { InstructionArgs } from "../libs/InstructionArgs.sol";
import { IPriceOracle } from "./interfaces/IPriceOracle.sol";

/// @notice OraclePriceAdjuster opcode, price adjustment towards a Chainlink oracle price with price percent cap
/// @dev Encoding: [uint64 maxPriceDecay, uint16 maxStaleness, uint8 oracleDecimals,
///   uint8 tokenInDecimals, uint8 tokenOutDecimals, address oracleAddress]
///   maxStaleness = 0 skips the staleness check, oracleDecimals = 0 fetches decimals from the oracle
/// @dev Supports only single direction swaps, adjustment is applied only if favorable for the taker
///
/// @dev **This diverges from upstream SwapVM and the encoding is not the upstream one.** Upstream
///      rescales the feed answer to 1e18 and compares it against `amountOut * 1e18 / amountIn`,
///      which is a price in **raw** token units. Those two are the same scale only when both tokens
///      carry eighteen decimals. On WETH/USDC the raw price is ~2.478e9 and the rescaled answer
///      ~2.478e21, so the feed looks better by twelve orders of magnitude on every fill, the ratio
///      hits `2e18 - maxPriceDecay`, and the taker is handed the clamp: twice the `tokenOut` the
///      curve priced. It does not revert. It fills, at a price nobody meant.
///
///      Tightening `maxPriceDecay` does not fix that, it only chooses how much is given away, and
///      no value is safe: `maxPriceDecay < ONE` is required at build, so `maxIncrease` is always
///      above `ONE` and some giveaway is always expressible. Nor does passing the pair's decimal
///      difference through `oracleDecimals` — it works in one direction and needs a negative
///      exponent in the other, which a `uint8` cannot hold.
///
///      So the answer is rescaled to `10 ** (18 + tokenOutDecimals - tokenInDecimals)`, the
///      convention the swap price is already in. On an eighteen-and-eighteen pair that exponent is
///      18 and this is the upstream instruction exactly.
///
///      The decimals are declared in the program rather than read from the tokens. Two `decimals()`
///      calls per fill is real gas on the hot path, a program is immutable once shipped and signed
///      by the maker, and the floor scores the settlement either way — which is what makes a wrong
///      declaration expensive to the party that made it rather than unbounded.
///
///      Measured in `test/subfloor/OracleAdjusterDecimals.t.sol`, which keeps the upstream
///      arithmetic inline so the failure is reproduced rather than described.
library OraclePriceAdjuster {
    using InstructionArgs for bytes;
    using InstructionArgs for bytes32;

    using MemoryPtrLib for MemoryPtr;
    using InstructionBuilder for MemoryPtr;

    using Math for uint256;
    using SafeCast for int256;

    error OraclePriceAdjusterWrongMaxPriceDecay(uint64 maxPriceDecay);
    error OraclePriceAdjusterOraclePriceStale(uint256 currentTime, uint256 updatedAt, uint16 maxStaleness);

    Opcode constant opcode = Opcode.OraclePriceAdjuster;

    uint256 constant ONE = 1e18;
    uint8 constant DECIMALS = 18;

    function sizeOf(uint64, uint16, uint8, uint8, uint8, address) internal pure returns (uint256) {
        return InstructionBuilder.sizeOf() + 8 + 2 + 1 + 1 + 1 + 20;
    }

    function build(
        uint64 maxPriceDecay,
        uint16 maxStaleness,
        uint8 oracleDecimals,
        uint8 tokenInDecimals,
        uint8 tokenOutDecimals,
        address oracleAddress
    ) internal pure returns (bytes memory) {
        return build(
            MemoryPtrLib.alloc(sizeOf(maxPriceDecay, maxStaleness, oracleDecimals, tokenInDecimals, tokenOutDecimals, oracleAddress)),
            maxPriceDecay, maxStaleness, oracleDecimals, tokenInDecimals, tokenOutDecimals, oracleAddress
        ).resolve();
    }

    function build(
        MemoryPtr ptrStart,
        uint64 maxPriceDecay,
        uint16 maxStaleness,
        uint8 oracleDecimals,
        uint8 tokenInDecimals,
        uint8 tokenOutDecimals,
        address oracleAddress
    ) internal pure returns (MemoryPtr ptr) {
        require(maxPriceDecay < ONE, OraclePriceAdjusterWrongMaxPriceDecay(maxPriceDecay));

        ptr = ptrStart.pushHeader(opcode);
        ptr = ptr.push(maxPriceDecay, 8).push(maxStaleness, 2).push(oracleDecimals).push(tokenInDecimals).push(tokenOutDecimals).push(oracleAddress);
        ptrStart.patchLength(ptr);
    }

    function parse(bytes calldata args) internal pure returns (
        uint64 maxPriceDecay,
        uint16 maxStaleness,
        uint8 oracleDecimals,
        uint8 tokenInDecimals,
        uint8 tokenOutDecimals,
        address oracleAddress
    ) {
        maxPriceDecay = args.at(0).asU64();
        maxStaleness = args.at(8).asU16();
        oracleDecimals = args.at(10).asU8();
        tokenInDecimals = args.at(11).asU8();
        tokenOutDecimals = args.at(12).asU8();
        oracleAddress = args.at(13).asAddress();
    }

    /// @notice The feed answer in the same units as `amountOut * 1e18 / amountIn`.
    /// @dev One net exponent rather than a scale-up followed by a scale-down. The two directions of
    ///      a WETH/USDC book want `10 ** -2` and `10 ** 22`; computing the first as
    ///      `answer * 1e24 / 1e26` would throw away the answer's low digits on the way.
    function scaleAnswer(
        uint256 answer,
        uint8 oracleDecimals,
        uint8 tokenInDecimals,
        uint8 tokenOutDecimals
    ) internal pure returns (uint256) {
        uint256 numerator = uint256(DECIMALS) + tokenOutDecimals;
        uint256 denominator = uint256(oracleDecimals) + tokenInDecimals;

        if (numerator >= denominator) return answer * 10 ** (numerator - denominator);
        return answer / 10 ** (denominator - numerator);
    }

    function exec(Context memory ctx, bytes calldata args) internal view {
        (
            uint64 maxPriceDecay,
            uint16 maxStaleness,
            uint8 oracleDecimals,
            uint8 tokenInDecimals,
            uint8 tokenOutDecimals,
            address oracleAddress
        ) = parse(args);

        // Get latest price data from Chainlink
        IPriceOracle oracle = IPriceOracle(oracleAddress);
        (, int256 answer, , uint256 updatedAt, ) = oracle.latestRoundData();

        // Check if oracle data is fresh using configured staleness threshold
        // If maxStaleness is 0, skip the staleness check
        require(maxStaleness == 0 || block.timestamp <= updatedAt + maxStaleness, OraclePriceAdjusterOraclePriceStale(block.timestamp, updatedAt, maxStaleness));

        // If oracleDecimals is 0, fetch from oracle (backward compatibility)
        if (oracleDecimals == 0) {
            oracleDecimals = oracle.decimals();
        }

        // Convert the oracle price to the raw-unit scale the swap price is computed in, which is
        // 1e18 only when both tokens have eighteen decimals. See the divergence note above.
        uint256 oraclePrice = scaleAnswer(answer.toUint256(), oracleDecimals, tokenInDecimals, tokenOutDecimals);

        // Calculate current swap price (tokenOut per tokenIn)
        // Price = amountOut / amountIn
        uint256 currentPrice = (ctx.swap.amountOut * ONE) / ctx.swap.amountIn;

        // Only adjust if oracle price is better for taker
        // If oracle price <= current price, no adjustment (already favorable for taker)
        if (oraclePrice <= currentPrice) return;

        // Oracle shows tokenOut is worth more tokenIn, so taker should get better deal
        if (ctx.query.isExactIn) {
            // exactIn: Taker provides fixed tokenIn, should get more tokenOut
            // Increase amountOut proportionally, but cap at maxIncrease
            uint256 priceRatio = (oraclePrice * ONE) / currentPrice;
            uint256 maxIncrease = (2 * ONE - maxPriceDecay); // Mirror of decay for increase
            uint256 adjustment = Math.min(priceRatio, maxIncrease);
            ctx.swap.amountOut = (ctx.swap.amountOut * adjustment) / ONE;
        } else {
            // exactOut: Taker wants fixed tokenOut, should pay less tokenIn
            // Reduce amountIn proportionally, but cap at maxPriceDecay
            uint256 priceRatio = (currentPrice * ONE) / oraclePrice;
            uint256 adjustment = Math.max(priceRatio, maxPriceDecay);
            ctx.swap.amountIn = (ctx.swap.amountIn * adjustment).ceilDiv(ONE);
        }
    }
}
