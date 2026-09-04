// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
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
contract FloorRegistry is IFloorRegistry, Ownable, EIP712 {
    uint256 internal constant _BPS = 10_000;
    uint256 internal constant _RATE_ONE = 1e18;

    /// @dev One slot: 8 + 16 + 232 = 256 bits. A recipient who never opted in costs the router a
    ///      single cold SLOAD that finds zero, and `configured == false` returns immediately.
    struct Floor {
        bool configured;
        uint16 maxAdverseBps;
        uint232 absoluteRate;
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
    /// @notice The key that may weaken this recipient's protection. Hardware, in the live run.
    mapping(address => address) public guardian;
    /// @notice A weakening waiting out the timelock. Empty when the delay is zero.
    struct PendingLowering {
        bool exists;
        uint16 maxAdverseBps;
        uint64 effectiveAt;
        uint232 absoluteRate;
    }

    /// @notice Set at deployment and never after. Zero means a signed weakening applies at once,
    ///         which is how the live run is configured: the guardian signature is already the
    ///         hardware-in-the-loop moment, and a delay would stall floor adjustments on shoot day.
    ///         Non-zero makes every weakening observable on-chain before it binds, so even a
    ///         compromised owner key cannot instantly gut a floor.
    uint32 public immutable LOWERING_DELAY;

    mapping(address => mapping(address => mapping(address => PendingLowering))) public pendingLowering;

    /// @notice Owner-curated reference feeds, one entry per ordered pair.
    mapping(address => mapping(address => Reference)) public referenceFeed;

    /// @notice One counter per recipient. The typehashes differ, so a signature for one action can
    ///         never be replayed as another, and consuming the counter retires all of them at once.
    mapping(address => uint256) public nonces;

    bytes32 internal constant _FLOOR_LOWERING_TYPEHASH =
        keccak256("FloorLowering(address recipient,address base,address quote,uint16 maxAdverseBps,uint256 absoluteRate,uint256 nonce,uint256 deadline)");
    bytes32 internal constant _GUARDIAN_ROTATION_TYPEHASH =
        keccak256("GuardianRotation(address recipient,address newGuardian,uint256 nonce,uint256 deadline)");

    error MaxAdverseBpsOutOfRange(uint16 maxAdverseBps);
    error NoGuardianRegistered(address recipient);
    error BadGuardianSignature(address recipient, address guardian, bytes32 digest);
    error SignatureExpired(uint256 deadline);
    error NoPendingLowering(address recipient, address base, address quote);
    error LoweringStillTimelocked(uint64 effectiveAt);
    error WrongNonce(uint256 expected, uint256 given);
    error AbsoluteRateTooLarge(uint256 absoluteRate);
    error BadReferenceConfig();
    /// @notice A pair's reference is write-once. See `setReferenceFeed`.
    error ReferenceAlreadySet(address base, address quote, address existingFeed);

    constructor(address initialOwner, uint32 loweringDelay) Ownable(initialOwner) EIP712("SUBFLOOR FloorRegistry", "1") {
        LOWERING_DELAY = loweringDelay;
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // --- reads -----------------------------------------------------------------------------

    /// @inheritdoc IFloorRegistry
    function effectiveFloor(address recipient, address base, address quote) public view returns (uint256 floorRate, bool enforced) {
        // One cold SLOAD, and a recipient who never opted in stops here. There is deliberately no
        // per-recipient default fallback: it was built, measured at 4,628 gas on every fill, and
        // removed. It was a third of the whole settlement overhead, it was charged to recipients
        // who got nothing for it, and it was the reason the opt-out path cost more than the opt-in
        // one. Setting a floor per pair is one call.
        Floor memory f = floor[recipient][base][quote];
        if (!f.configured) return (0, false);

        uint16 bps = f.maxAdverseBps;
        uint256 absolute = uint256(f.absoluteRate);

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
        _checkFill(recipient, base, quote, given, received);
    }

    /// @inheritdoc IFloorRegistry
    function checkSettlement(
        address takerRecipient,
        address makerRecipient,
        address tokenIn,
        address tokenOut,
        uint256 takerGave,
        uint256 takerGot,
        uint256 makerGave,
        uint256 makerGot
    ) external view {
        _checkFill(takerRecipient, tokenIn, tokenOut, takerGave, takerGot);
        _checkFill(makerRecipient, tokenOut, tokenIn, makerGave, makerGot);
    }

    function _checkFill(address recipient, address base, address quote, uint256 given, uint256 received) internal view {
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

    /// @notice Register the key that may weaken this recipient's protection. Callable by the
    ///         recipient only while no guardian is set; rotating an existing one is a weakening
    ///         action and goes through `rotateGuardian`.
    ///
    /// Without that asymmetry the guardian is decorative: a recipient key that has been taken over
    /// would simply appoint a guardian it controls and then lower the floor with it, and the
    /// hardware in the design would be protecting nothing.
    function setGuardian(address newGuardian) external {
        require(guardian[msg.sender] == address(0), NoGuardianRegistered(msg.sender));
        guardian[msg.sender] = newGuardian;
        emit GuardianSet(msg.sender, address(0), newGuardian);
    }

    /// @notice Replace the guardian, under a signature from the guardian being replaced.
    function rotateGuardian(address recipient, address newGuardian, uint256 nonce, uint256 deadline, bytes calldata signature) external {
        address oldGuardian = _consume(
            recipient,
            keccak256(abi.encode(_GUARDIAN_ROTATION_TYPEHASH, recipient, newGuardian, nonce, deadline)),
            nonce,
            deadline,
            signature
        );

        guardian[recipient] = newGuardian;
        emit GuardianSet(recipient, oldGuardian, newGuardian);
    }

    // --- weakening: the one action that needs the key the trading machine never holds ----------

    /// @notice Weaken the floor for one pair. Either component may move in either direction; the
    ///         guardian signature is what authorises it.
    function lowerFloor(
        address recipient,
        address base,
        address quote,
        uint16 newMaxAdverseBps,
        uint256 newAbsoluteRate,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(newMaxAdverseBps <= _BPS, MaxAdverseBpsOutOfRange(newMaxAdverseBps));
        require(newAbsoluteRate <= type(uint232).max, AbsoluteRateTooLarge(newAbsoluteRate));

        address signer = _consume(
            recipient,
            keccak256(abi.encode(_FLOOR_LOWERING_TYPEHASH, recipient, base, quote, newMaxAdverseBps, newAbsoluteRate, nonce, deadline)),
            nonce,
            deadline,
            signature
        );

        if (LOWERING_DELAY == 0) {
            _applyLowering(recipient, base, quote, newMaxAdverseBps, newAbsoluteRate, signer);
        } else {
            uint64 effectiveAt = uint64(block.timestamp) + LOWERING_DELAY;
            pendingLowering[recipient][base][quote] =
                PendingLowering({ exists: true, maxAdverseBps: newMaxAdverseBps, effectiveAt: effectiveAt, absoluteRate: uint232(newAbsoluteRate) });
            emit FloorLoweringScheduled(recipient, base, quote, newMaxAdverseBps, newAbsoluteRate, effectiveAt, signer);
        }
    }

    /// @notice Apply a weakening that has waited out the timelock. Permissionless: the signature
    ///         was already checked when it was scheduled, and anyone executing it only does what
    ///         the guardian already authorised.
    function executeLowering(address recipient, address base, address quote) external {
        PendingLowering memory p = pendingLowering[recipient][base][quote];
        require(p.exists, NoPendingLowering(recipient, base, quote));
        require(block.timestamp >= p.effectiveAt, LoweringStillTimelocked(p.effectiveAt));

        delete pendingLowering[recipient][base][quote];
        _applyLowering(recipient, base, quote, p.maxAdverseBps, uint256(p.absoluteRate), guardian[recipient]);
    }

    function _applyLowering(address recipient, address base, address quote, uint16 newMaxAdverseBps, uint256 newAbsoluteRate, address signer) internal {
        Floor storage f = floor[recipient][base][quote];
        uint16 oldBps = f.configured ? f.maxAdverseBps : uint16(_BPS);
        uint256 oldAbsolute = uint256(f.absoluteRate);

        f.configured = true;
        f.maxAdverseBps = newMaxAdverseBps;
        f.absoluteRate = uint232(newAbsoluteRate);

        if (newAbsoluteRate != oldAbsolute) emit FloorLowered(recipient, base, quote, oldAbsolute, newAbsoluteRate, signer);
        if (newMaxAdverseBps != oldBps) emit ToleranceWidened(recipient, base, quote, oldBps, newMaxAdverseBps, signer);
    }

    /// @dev Checks the deadline, the nonce and the guardian signature, then burns the nonce.
    ///      Accepts ERC-1271 as well as ECDSA, so the guardian may be a smart account.
    function _consume(address recipient, bytes32 structHash, uint256 nonce, uint256 deadline, bytes calldata signature)
        internal
        returns (address signer)
    {
        require(block.timestamp <= deadline, SignatureExpired(deadline));
        require(nonces[recipient] == nonce, WrongNonce(nonces[recipient], nonce));

        signer = guardian[recipient];
        require(signer != address(0), NoGuardianRegistered(recipient));

        bytes32 digest = _hashTypedDataV4(structHash);
        require(SignatureChecker.isValidSignatureNow(signer, digest, signature), BadGuardianSignature(recipient, signer, digest));

        nonces[recipient] = nonce + 1;
    }

    // --- owner-curated references ------------------------------------------------------------

    /// @notice Register the reference feed for one ordered pair. **Write once, permanently.**
    ///
    /// The owner curates which feed a pair is scored against, and that is the only power over a
    /// floor this contract grants anyone other than the recipient and its guardian. Leaving it
    /// mutable would have made it a second, unsigned way to weaken every relative floor at once:
    /// repoint a pair at a feed reporting a lower price and every recipient accepts fills below
    /// what they configured, with their own stored numbers untouched; or raise `stalenessBound` and
    /// the fail-closed guarantee quietly stops applying. Neither would leave a trace in the floor
    /// storage anyone is watching.
    ///
    /// So a pair can be set once and never changed. The cost is that migrating a pair to a
    /// different feed means deploying a new registry and having recipients move, which is a real
    /// operational cost and the right way round: the guarantee holds without anyone having to
    /// trust the owner, rather than holding only while the owner behaves.
    ///
    /// @param stalenessBound Seconds. Set it from the measured inter-round gap distribution of the
    ///        feed, never from a round-looking guess: a bound below the real distribution fails the
    ///        vault closed through ordinary quiet periods. It is immutable with the rest of the
    ///        config, so it cannot be widened later to defeat the staleness check.
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
        require(feed != address(0) && stalenessBound > 0, BadReferenceConfig());
        require(referenceFeed[base][quote].feed == address(0), ReferenceAlreadySet(base, quote, referenceFeed[base][quote].feed));

        uint256 scale = Math.mulDiv(_RATE_ONE, 10 ** quoteDecimals, 10 ** baseDecimals);
        require(scale > 0, BadReferenceConfig());

        referenceFeed[base][quote] = Reference({ feed: feed, inverted: inverted, stalenessBound: stalenessBound, feedDecimals: feedDecimals, scale: scale });
        emit ReferenceFeedSet(base, quote, feed, inverted, stalenessBound);
    }
}
