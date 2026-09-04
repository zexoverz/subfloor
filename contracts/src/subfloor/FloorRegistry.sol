// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IFloorRegistry } from "./IFloorRegistry.sol";

interface IAggregatorV3 {
    function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title FloorRegistry
/// @notice The worst rate a recipient will accept, held outside any program and consulted at
///         settlement. A floor has two components and the effective floor is the stronger of the
///         two: a reference-relative tolerance (max adverse deviation in bps from a Chainlink
///         reference) and an absolute backstop rate that binds even when the oracle is wrong.
///
/// The asymmetry is the design. Strengthening protection is one call from the recipient itself.
/// Weakening it is the one high-risk action and takes a signature from a key the trading machine
/// never holds; that path lands with the guardian work and is deliberately absent here rather
/// than stubbed open.
///
/// Fail closed. Where this contract cannot prove the reference is fresh, it reverts rather than
/// guessing: a stale feed with no backstop stops trading, it does not wave a fill through.
contract FloorRegistry is IFloorRegistry, Ownable {
    uint256 internal constant _BPS = 10_000;
    uint256 internal constant _RATE_ONE = 1e18;

    /// @dev One slot: 8 + 16 + 232 = 256 bits. A recipient who never opted in costs the router a
    ///      single cold SLOAD that finds zero, and `configured == false` returns immediately.
    struct Floor {
        bool configured;
        uint16 maxAdverseBps;
        uint232 absoluteRate;
    }

    struct Tolerance {
        bool configured;
        uint16 maxAdverseBps;
    }

    /// @dev `scale` is precomputed at registration so the hot path does no exponentiation:
    ///      forward  refRate = answer * scale / 10**feedDecimals
    ///      inverted refRate = 10**feedDecimals * scale / answer
    ///      with scale = 1e18 * 10**quoteDecimals / 10**baseDecimals.
    struct Reference {
        address feed;
        bool inverted;
        uint32 stalenessBound;
        uint8 feedDecimals;
        uint256 scale;
    }

    /// @notice floor[recipient][base][quote], where `base` is the token the recipient gives and
    ///         `quote` the token it receives.
    mapping(address => mapping(address => mapping(address => Floor))) public floor;
    /// @notice Applies to any pair this recipient has no specific entry for.
    mapping(address => Tolerance) public defaultTolerance;
    /// @notice The key that may weaken this recipient's protection. Hardware, in the live run.
    mapping(address => address) public guardian;
    /// @notice Owner-curated reference feeds, one entry per ordered pair.
    mapping(address => mapping(address => Reference)) public referenceFeed;

    error MaxAdverseBpsOutOfRange(uint16 maxAdverseBps);
    error AbsoluteRateTooLarge(uint256 absoluteRate);
    error BadReferenceConfig();

    constructor(address initialOwner) Ownable(initialOwner) { }

    // --- reads -----------------------------------------------------------------------------

    /// @inheritdoc IFloorRegistry
    function effectiveFloor(address recipient, address base, address quote) public view returns (uint256 floorRate, bool enforced) {
        Floor memory f = floor[recipient][base][quote];

        uint16 bps;
        uint256 absolute;
        if (f.configured) {
            bps = f.maxAdverseBps;
            absolute = uint256(f.absoluteRate);
        } else {
            Tolerance memory d = defaultTolerance[recipient];
            if (!d.configured) return (0, false);
            bps = d.maxAdverseBps;
        }

        // A tolerance of exactly _BPS is "any adverse deviation is acceptable": the relative
        // component contributes nothing and only the backstop can bind.
        if (bps < _BPS) {
            uint256 refRate = _referenceRate(base, quote, absolute > 0);
            // refRate == 0 is only reachable when the reference was stale and a backstop exists,
            // in which case the backstop is the whole floor.
            if (refRate != 0) {
                // Round the floor up. It is a minimum, so truncation would make it
                // marginally weaker than configured, which is the wrong direction here.
                floorRate = Math.mulDiv(refRate, _BPS - bps, _BPS, Math.Rounding.Ceil);
            }
        }

        return (Math.max(floorRate, absolute), true);
    }

    /// @inheritdoc IFloorRegistry
    function checkFill(address recipient, address base, address quote, uint256 given, uint256 received) external view {
        (uint256 floorRate, bool enforced) = effectiveFloor(recipient, base, quote);
        if (!enforced) return;
        uint256 executionRate = given == 0 ? type(uint256).max : Math.mulDiv(received, _RATE_ONE, given);
        require(executionRate >= floorRate, SettledBelowFloor(recipient, base, quote, executionRate, floorRate));
    }

    /// @notice The reference rate for a pair in the canonical convention, or 0 when the feed is
    ///         stale and the caller told us a backstop exists to carry the floor instead.
    function _referenceRate(address base, address quote, bool backstopExists) internal view returns (uint256) {
        Reference memory r = referenceFeed[base][quote];
        require(r.feed != address(0), NoReferenceFeed(base, quote));

        (, int256 answer,, uint256 updatedAt,) = IAggregatorV3(r.feed).latestRoundData();
        if (block.timestamp > updatedAt + r.stalenessBound) {
            if (backstopExists) return 0;
            revert StaleReference(base, quote, updatedAt, r.stalenessBound);
        }
        require(answer > 0, BadReferenceAnswer(base, quote, answer));

        uint256 unit = 10 ** r.feedDecimals;
        return r.inverted ? Math.mulDiv(unit, r.scale, uint256(answer)) : Math.mulDiv(uint256(answer), r.scale, unit);
    }

    // --- strengthening: the recipient's own call, no signature -----------------------------

    /// @notice Strengthen the floor for one pair. Neither component may move in the weakening
    ///         direction; a smaller tolerance and a larger backstop are both stronger.
    function raiseFloor(address base, address quote, uint16 newMaxAdverseBps, uint256 newAbsoluteRate) external {
        require(newMaxAdverseBps <= _BPS, MaxAdverseBpsOutOfRange(newMaxAdverseBps));
        require(newAbsoluteRate <= type(uint232).max, AbsoluteRateTooLarge(newAbsoluteRate));

        Floor storage f = floor[msg.sender][base][quote];
        uint16 oldBps = f.configured ? f.maxAdverseBps : uint16(_BPS);
        uint256 oldAbsolute = uint256(f.absoluteRate);
        require(newMaxAdverseBps <= oldBps && newAbsoluteRate >= oldAbsolute, NotARaise(oldBps, newMaxAdverseBps, oldAbsolute, newAbsoluteRate));

        f.configured = true;
        f.maxAdverseBps = newMaxAdverseBps;
        f.absoluteRate = uint232(newAbsoluteRate);

        if (newAbsoluteRate != oldAbsolute) emit FloorRaised(msg.sender, base, quote, oldAbsolute, newAbsoluteRate);
        if (newMaxAdverseBps != oldBps) emit ToleranceTightened(msg.sender, base, quote, oldBps, newMaxAdverseBps);
    }

    /// @notice Strengthen the tolerance that applies to every pair without a specific entry.
    function tightenDefaultTolerance(uint16 newMaxAdverseBps) external {
        require(newMaxAdverseBps <= _BPS, MaxAdverseBpsOutOfRange(newMaxAdverseBps));

        Tolerance storage d = defaultTolerance[msg.sender];
        uint16 oldBps = d.configured ? d.maxAdverseBps : uint16(_BPS);
        require(newMaxAdverseBps <= oldBps, NotARaise(oldBps, newMaxAdverseBps, 0, 0));

        d.configured = true;
        d.maxAdverseBps = newMaxAdverseBps;
        emit DefaultToleranceTightened(msg.sender, oldBps, newMaxAdverseBps);
    }

    /// @notice Register or rotate the key that may weaken this recipient's protection.
    function setGuardian(address newGuardian) external {
        address oldGuardian = guardian[msg.sender];
        guardian[msg.sender] = newGuardian;
        emit GuardianSet(msg.sender, oldGuardian, newGuardian);
    }

    // --- owner-curated references ------------------------------------------------------------

    /// @notice Register the reference feed for one ordered pair.
    /// @param stalenessBound Seconds. Set it from the measured inter-round gap distribution of the
    ///        feed, never from a round-looking guess: a bound below the real distribution fails the
    ///        vault closed through ordinary quiet periods.
    function setReferenceFeed(
        address base,
        address quote,
        address feed,
        bool inverted,
        uint32 stalenessBound,
        uint8 feedDecimals,
        uint8 baseDecimals,
        uint8 quoteDecimals
    ) external onlyOwner {
        require(base != address(0) && quote != address(0) && base != quote, BadReferenceConfig());
        require(feed == address(0) || stalenessBound > 0, BadReferenceConfig());

        uint256 scale = feed == address(0) ? 0 : Math.mulDiv(_RATE_ONE, 10 ** quoteDecimals, 10 ** baseDecimals);
        require(feed == address(0) || scale > 0, BadReferenceConfig());

        referenceFeed[base][quote] = Reference({ feed: feed, inverted: inverted, stalenessBound: stalenessBound, feedDecimals: feedDecimals, scale: scale });
        emit ReferenceFeedSet(base, quote, feed, inverted, stalenessBound);
    }
}
