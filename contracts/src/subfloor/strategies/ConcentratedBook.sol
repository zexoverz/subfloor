// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2026 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { MemoryPtr, MemoryPtrLib } from "../../libs/MemoryPtr.sol";
import { Salt } from "../../instructions/Controls.sol";
import { JumpIfDirection } from "../../instructions/Jumps.sol";
import { Decay } from "../../instructions/Decay.sol";
import { FeeFlatIn } from "../../instructions/FeeFlat.sol";
import { XYCConcentrateSwap } from "../../instructions/XYCConcentrate.sol";
import { OraclePriceAdjuster } from "../../instructions/OraclePriceAdjuster.sol";
import { ValidateSeriesEpoch } from "../../instructions/SeriesEpochManager.sol";

/// @title ConcentratedBook
/// @notice One two-sided market-making book, as SwapVM bytecode.
///
/// The vault ships a program, not a pair of orders. A single `XYCConcentrateSwap` curve quotes
/// both directions off the *same* shipped inventory — `direction` inside that instruction is read
/// from `tokenIn < tokenOut` per fill — so a bid and an ask are never two positions that can drift
/// apart or be filled twice against the same coins. That is the whole reason this is a book rather
/// than two limit orders.
///
/// What the pieces are for, in the order the VM meets them:
///
/// - `Salt` (0x02) makes two books with identical parameters distinct orders. Aqua keys inventory
///   by strategy hash, so without it a re-quote at the same numbers would collide with the live
///   position instead of replacing it.
/// - `ValidateSeriesEpoch` (0x48) pins the book to a maker-scoped `(seriesId, epoch)`. One
///   `seriesEpochIncrease` cancels every book pinned to that series at once, which is what an
///   agent needs when the reference moves and re-quoting one order at a time is too slow.
/// - `Decay` (0x9c) charges the counter-swap. Each fill raises an offset against the opposite
///   direction that bleeds away over `decayPeriod`, so an immediate round trip pays for the
///   privilege. Without it a two-sided book at a spread is a free option on every tick.
/// - `FeeFlatIn` (0x70) is the maker's spread income on top of the curve, in `tokenIn`.
/// - `XYCConcentrateSwap` (0x51) is the curve: constant product concentrated between
///   `sqrtPriceMin` and `sqrtPriceMax`, which is where the capital efficiency comes from and what
///   makes a fixed inventory quote a tight spread on both sides.
/// - `OraclePriceAdjuster` (0xb2), optional, hands the taker the better of the curve price and the
///   feed price. It is single-direction by construction — a Chainlink feed is quoted one way round
///   and the instruction only ever moves the price in the taker's favour — so applying it to both
///   sides of a book would give away the spread twice. It is therefore emitted behind a
///   `JumpIfDirection` (0x30) that skips it on the other side.
///
/// @dev **Opcode set.** `Decay`, `FeeFlatIn` and `XYCConcentrateSwap` are all in `AquaOpcodes`,
///      which is what the deployed `FloorRouter` dispatches. `ValidateSeriesEpoch`,
///      `OraclePriceAdjuster` and `JumpIfDirection` are in the full `Opcodes` set but *not* in
///      `AquaOpcodes`, so a book that pins a series or carries a feed reverts `UnknownOpcode` on a
///      router built from the Aqua set. Leave `pinnedToSeries` false and `oracle.feed` zero for
///      `FloorRouter`; both are checked here rather than discovered at fill time.
///
/// @dev The floor is not in this program and cannot be. It is checked at settlement by
///      `GuardedSwapVM`, on every fill this book takes, whatever bytecode it contains.
library ConcentratedBook {
    using MemoryPtrLib for MemoryPtr;

    using Math for uint256;

    /// @notice `referencePrice` is zero, or `spreadBps` is outside `(0, 10000)`. A zero spread is
    ///         a degenerate range the curve rejects, and a spread at or past 100% would put
    ///         `sqrtPriceMin` at zero.
    error ConcentratedBookBadSpread(uint256 referencePrice, uint16 spreadBps);

    /// @notice The curve needs a non-empty range, and `XYCConcentrateSwap` reverts on one that is
    ///         not strictly increasing. Caught here so a bad book fails at build rather than at the
    ///         first fill.
    error ConcentratedBookEmptyRange(uint256 sqrtPriceMin, uint256 sqrtPriceMax);

    /// @notice Prices are 1e18 fixed point, so their square roots are too: `sqrt(price * 1e18)`.
    uint256 internal constant ONE = 1e18;

    /// @notice Spread denominator. Basis points, as everywhere else in SUBFLOOR.
    uint256 internal constant BPS = 10_000;

    /// @param feed         Chainlink-shaped aggregator, or zero to omit the adjuster entirely.
    /// @param maxStaleness Seconds; zero skips the freshness check, which this library allows but
    ///                     the SUBFLOOR guards do not — see `RequireFreshReference`.
    /// @param decimals     Feed decimals. Zero makes the instruction call `decimals()` on the feed.
    /// @param maxPriceDecay Cap on the adjustment, 1e18 scaled, strictly below `ONE`.
    /// @param onDirectionAToB The single direction the feed is quoted for: true when the feed
    ///                     prices `tokenB` per `tokenA` with `tokenA < tokenB`.
    struct Oracle {
        address feed;
        uint16 maxStaleness;
        uint8 decimals;
        uint64 maxPriceDecay;
        bool onDirectionAToB;
    }

    /// @param sqrtPriceMin  Lower bound, `sqrt(price * 1e18)`. Build it with `bounds`.
    /// @param sqrtPriceMax  Upper bound, same scale.
    /// @param feeBps        `FeeFlatIn` fee, denominated in 1e7 rather than 1e4 — the instruction's
    ///                      own scale, not this library's `BPS`.
    /// @param decayPeriod   Seconds for the counter-swap offset to bleed to zero. Zero omits `Decay`.
    /// @param salt          Distinguishes otherwise identical books.
    /// @param seriesId      Mass-cancel group, meaningful only when `pinnedToSeries`.
    /// @param epoch         The epoch this book is valid in.
    /// @param pinnedToSeries Emit `ValidateSeriesEpoch`. Series 0 epoch 0 is a legitimate pin, so
    ///                      this cannot be inferred from the numbers.
    struct Book {
        uint256 sqrtPriceMin;
        uint256 sqrtPriceMax;
        uint24 feeBps;
        uint16 decayPeriod;
        uint64 salt;
        uint32 seriesId;
        uint32 epoch;
        bool pinnedToSeries;
        Oracle oracle;
    }

    /// @notice A symmetric range around a reference, which is how a market maker actually thinks
    ///         about it: one price and one spread, not two square roots.
    /// @param referencePrice `tokenB` per `tokenA` in raw token units, 1e18 scaled, with
    ///        `tokenA < tokenB`. Raw units, so decimals are the caller's to carry: WETH/USDC at
    ///        2500 is `2500e6 * 1e18 / 1e18` per wei, not `2500e18`.
    /// @param spreadBps Half-width of the range. 500 puts the bounds at ±5%.
    function bounds(uint256 referencePrice, uint16 spreadBps) internal pure returns (uint256 sqrtPriceMin, uint256 sqrtPriceMax) {
        require(referencePrice > 0 && spreadBps > 0 && spreadBps < BPS, ConcentratedBookBadSpread(referencePrice, spreadBps));

        sqrtPriceMin = referencePrice.mulDiv((BPS - spreadBps) * ONE, BPS).sqrt();
        sqrtPriceMax = referencePrice.mulDiv((BPS + spreadBps) * ONE, BPS).sqrt();
    }

    function sizeOf(Book memory book) internal pure returns (uint256 size) {
        size = Salt.sizeOf(book.salt) + XYCConcentrateSwap.sizeOf(book.sqrtPriceMin, book.sqrtPriceMax);

        if (book.pinnedToSeries) size += ValidateSeriesEpoch.sizeOf(book.seriesId, book.epoch);
        if (book.decayPeriod > 0) size += Decay.sizeOf(book.decayPeriod);
        if (book.feeBps > 0) size += FeeFlatIn.sizeOf(book.feeBps);
        if (book.oracle.feed != address(0)) {
            size += JumpIfDirection.sizeOf(book.oracle.onDirectionAToB, 0) +
                OraclePriceAdjuster.sizeOf(book.oracle.maxPriceDecay, book.oracle.maxStaleness, book.oracle.decimals, book.oracle.feed);
        }
    }

    /// @notice The program bytes, ready to hand to `AquaGuardVault.ship`.
    /// @dev Allocated once and written in place, following `Strategies`: the per-instruction
    ///      `build(bytes)` overloads each allocate their own slice, and concatenating them copies
    ///      every byte a second time.
    function build(Book memory book) internal pure returns (bytes memory) {
        require(book.sqrtPriceMin > 0 && book.sqrtPriceMin < book.sqrtPriceMax, ConcentratedBookEmptyRange(book.sqrtPriceMin, book.sqrtPriceMax));

        // The jump target is the end of the program, which terminates the run loop. Known before
        // anything is written because every instruction here is fixed width.
        uint256 programSize = sizeOf(book);
        MemoryPtr ptr = MemoryPtrLib.alloc(programSize);

        ptr = Salt.build(ptr, book.salt);
        if (book.pinnedToSeries) ptr = ValidateSeriesEpoch.build(ptr, book.seriesId, book.epoch);

        // Decay outside the fee: both wrap the rest of the program via `runLoop`, and the offsets
        // Decay stores have to be the amounts the taker actually moved, fee included.
        if (book.decayPeriod > 0) ptr = Decay.build(ptr, book.decayPeriod);
        if (book.feeBps > 0) ptr = FeeFlatIn.build(ptr, book.feeBps);

        ptr = XYCConcentrateSwap.build(ptr, book.sqrtPriceMin, book.sqrtPriceMax);

        // After the curve, because the adjuster reads the amounts the curve computed. Skipped on
        // the direction the feed is not quoted for.
        if (book.oracle.feed != address(0)) {
            ptr = JumpIfDirection.build(ptr, !book.oracle.onDirectionAToB, uint16(programSize));
            ptr = OraclePriceAdjuster.build(ptr, book.oracle.maxPriceDecay, book.oracle.maxStaleness, book.oracle.decimals, book.oracle.feed);
        }

        return ptr.resolve();
    }
}
