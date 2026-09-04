// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

/// @title IFloorRegistry
/// @notice The worst rate a recipient will accept, keyed to the recipient rather than chosen
///         per order by the caller.
///
/// Rate convention, one canonical direction everywhere in this system: a rate is
/// `received * 1e18 / given` in raw token units, from the point of view of one party. Higher is
/// better for that party. A floor is a minimum on that number. Both sides of a fill are scored
/// the same way, each against its own entry, so there is no orientation to get backwards at the
/// call site: the caller always passes (what this party gives, what this party receives).
interface IFloorRegistry {
    /// @dev `base` is the token the recipient gives, `quote` the token it receives.
    error SettledBelowFloor(address recipient, address tokenIn, address tokenOut, uint256 executionRate, uint256 floorRate);

    /// @notice The reference feed for a configured relative floor is older than its bound and no
    ///         absolute backstop exists. Fail closed: no trading beats a bad fill.
    error StaleReference(address base, address quote, uint256 updatedAt, uint256 bound);
    /// @notice A relative floor is configured for a pair that has no reference feed, so the floor
    ///         cannot be evaluated. Fail closed.
    error NoReferenceFeed(address base, address quote);
    /// @notice The reference feed answered with a non-positive price.
    error BadReferenceAnswer(address base, address quote, int256 answer);
    /// @notice A raise must not weaken protection on either component.
    error NotARaise(uint16 oldMaxAdverseBps, uint16 newMaxAdverseBps, uint256 oldAbsoluteRate, uint256 newAbsoluteRate);

    /// @notice Emitted when the absolute backstop for a pair changes in the protective direction.
    event FloorRaised(address indexed recipient, address indexed base, address indexed quote, uint256 oldFloor, uint256 newFloor);
    /// @notice Emitted when the absolute backstop for a pair is weakened under a guardian signature.
    event FloorLowered(address indexed recipient, address indexed base, address indexed quote, uint256 oldFloor, uint256 newFloor, address guardian);
    /// @notice Emitted when the reference-relative tolerance changes in the protective direction
    ///         (a smaller tolerance is a stronger floor).
    event ToleranceTightened(address indexed recipient, address indexed base, address indexed quote, uint16 oldMaxAdverseBps, uint16 newMaxAdverseBps);
    /// @notice Emitted when the reference-relative tolerance is widened under a guardian signature.
    event ToleranceWidened(address indexed recipient, address indexed base, address indexed quote, uint16 oldMaxAdverseBps, uint16 newMaxAdverseBps, address guardian);

    /// @notice A weakening has been signed and is waiting out the timelock. Only emitted when the
    ///         registry was deployed with a non-zero lowering delay.
    event FloorLoweringScheduled(address indexed recipient, address indexed base, address indexed quote, uint16 maxAdverseBps, uint256 absoluteRate, uint64 effectiveAt, address guardian);
    event GuardianSet(address indexed recipient, address oldGuardian, address newGuardian);
    event ReferenceFeedSet(address indexed base, address indexed quote, address feed, bool inverted, uint32 stalenessBound);

    /// @notice The effective floor for one party of a fill, in the canonical rate convention.
    /// @param recipient The party being protected.
    /// @param base      The token that party gives.
    /// @param quote     The token that party receives.
    /// @return floorRate The minimum acceptable `received * 1e18 / given`.
    /// @return enforced  False when this recipient has no floor configured for this pair; the
    ///                   caller must not enforce `floorRate` in that case.
    function effectiveFloor(address recipient, address base, address quote) external view returns (uint256 floorRate, bool enforced);

    /// @notice How old this pair's reference answer is, and the registry-wide staleness bound.
    function referenceAge(address base, address quote) external view returns (uint256 age, uint32 registryBound);

    /// @notice The key that may weaken this recipient's protection.
    function guardian(address recipient) external view returns (address);

    /// @notice Reverts `SettledBelowFloor` if the realised amounts breach this party's floor.
    function checkFill(address recipient, address base, address quote, uint256 given, uint256 received) external view;

    /// @notice Both sides of one fill in a single call.
    /// @dev The settlement guard runs on every swap, so the second external call is pure overhead
    ///      on the hot path. Same arithmetic, one CALL and one calldata frame instead of two.
    /// @param takerGave   what the taker parts with, in `tokenIn`
    /// @param takerGot    what the taker receives, in `tokenOut`
    /// @param makerGave   what the maker parts with, in `tokenOut`, protocol fee included
    /// @param makerGot    what the maker receives, in `tokenIn`, protocol fee deducted
    function checkSettlement(
        address takerRecipient,
        address makerRecipient,
        address tokenIn,
        address tokenOut,
        uint256 takerGave,
        uint256 takerGot,
        uint256 makerGave,
        uint256 makerGot
    ) external view;
}
