// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import { Context, ContextLib } from "../libs/VM.sol";
import { Opcode } from "../libs/OpcodeList.sol";
import { MemoryPtr, MemoryPtrLib } from "../libs/MemoryPtr.sol";
import { InstructionBuilder } from "../libs/InstructionBuilder.sol";
import { InstructionArgs } from "../libs/InstructionArgs.sol";
import { IFloorRegistry } from "../subfloor/IFloorRegistry.sol";

/// @notice Refuse the fill unless the pair's reference answer is fresher than `maxAge` seconds.
///
/// This is optional and in-program, layered *above* the mandatory settlement floor rather than
/// instead of it. It protects the floor itself: the registry's staleness bound has to clear the
/// feed's real inter-round gap distribution or the vault fails closed through ordinary quiet
/// periods, so it is necessarily loose. A strategy that only wants to quote when the reference is
/// genuinely current asks for that here, per strategy, without dragging the global bound down.
///
/// @dev Encoding: [uint32 maxAge]. Do not set `maxAge` from a round-looking guess. The measured
///      Base ETH/USD gaps are p50 210s and max 1232s over an active 20.6 hours, so anything under
///      about 1300s will refuse fills during normal operation, and the quiet-period heartbeat that
///      actually binds has not been observed yet.
library RequireFreshReference {
    using InstructionArgs for bytes;
    using InstructionArgs for bytes32;
    using MemoryPtrLib for MemoryPtr;
    using InstructionBuilder for MemoryPtr;
    using ContextLib for Context;

    error RequireFreshReferenceFailed(address base, address quote, uint256 age, uint256 maxAge, uint256 registryBound);

    Opcode constant opcode = Opcode.RequireFreshReference;

    function sizeOf() internal pure returns (uint256) {
        return InstructionBuilder.sizeOf() + 4;
    }

    function build(uint32 maxAge) internal pure returns (bytes memory) {
        return build(MemoryPtrLib.alloc(sizeOf()), maxAge).resolve();
    }

    function build(MemoryPtr ptrStart, uint32 maxAge) internal pure returns (MemoryPtr ptr) {
        ptr = ptrStart.pushHeader(opcode);
        ptr = ptr.push(maxAge, 4);
        ptrStart.patchLength(ptr);
    }

    function parse(bytes calldata args) internal pure returns (uint32 maxAge) {
        maxAge = args.at(0).asU32();
    }

    function exec(Context memory ctx, bytes calldata args, IFloorRegistry registry) internal view {
        uint32 maxAge = parse(args);
        address base = ctx.query.tokenIn;
        address quote = ctx.query.tokenOut;

        (uint256 age, uint32 registryBound) = registry.referenceAge(base, quote);
        require(age <= maxAge, RequireFreshReferenceFailed(base, quote, age, maxAge, registryBound));
    }
}

/// @notice Cap how much of a token a strategy may move within an epoch.
///
/// The floor bounds the *price* of every fill and says nothing about how many there are. A
/// compromised agent that cannot get a bad price can still churn the whole book at a fair one,
/// paying the spread away trade by trade. This is the bound on that, and it is the one guard here
/// that has to write storage.
///
/// @dev Encoding: [uint32 epochLength][uint128 maxPerEpoch]. Keyed by order hash, so two strategies
///      from the same maker throttle independently. See `docs/gas.md` for what the write costs.
library NotionalThrottle {
    using InstructionArgs for bytes;
    using InstructionArgs for bytes32;
    using MemoryPtrLib for MemoryPtr;
    using InstructionBuilder for MemoryPtr;
    using ContextLib for Context;

    error NotionalThrottleExceeded(bytes32 orderHash, uint256 epoch, uint256 used, uint256 amount, uint256 maxPerEpoch);
    error NotionalThrottleBadEpoch();

    struct Usage {
        uint64 epoch;
        uint192 used;
    }

    Opcode constant opcode = Opcode.NotionalThrottle;

    function sizeOf() internal pure returns (uint256) {
        return InstructionBuilder.sizeOf() + 4 + 16;
    }

    function build(uint32 epochLength, uint128 maxPerEpoch) internal pure returns (bytes memory) {
        return build(MemoryPtrLib.alloc(sizeOf()), epochLength, maxPerEpoch).resolve();
    }

    function build(MemoryPtr ptrStart, uint32 epochLength, uint128 maxPerEpoch) internal pure returns (MemoryPtr ptr) {
        ptr = ptrStart.pushHeader(opcode);
        ptr = ptr.push(epochLength, 4).push(maxPerEpoch, 16);
        ptrStart.patchLength(ptr);
    }

    function parse(bytes calldata args) internal pure returns (uint32 epochLength, uint128 maxPerEpoch) {
        epochLength = args.at(0).asU32();
        maxPerEpoch = args.at(4).asU128();
    }

    /// @dev Runs the rest of the program first, so it throttles the amount that actually settles
    ///      rather than the amount requested.
    function exec(Context memory ctx, bytes calldata args, mapping(bytes32 => Usage) storage usage) internal {
        (uint32 epochLength, uint128 maxPerEpoch) = parse(args);
        require(epochLength > 0, NotionalThrottleBadEpoch());

        (uint256 amountIn,) = ctx.runLoop();

        bytes32 orderHash = ctx.query.orderHash;
        uint64 epoch = uint64(block.timestamp / epochLength);

        Usage memory u = usage[orderHash];
        uint256 used = u.epoch == epoch ? uint256(u.used) : 0;
        uint256 total = used + amountIn;
        require(total <= maxPerEpoch, NotionalThrottleExceeded(orderHash, epoch, used, amountIn, maxPerEpoch));

        usage[orderHash] = Usage({ epoch: epoch, used: uint192(total) });
    }
}

/// @notice Refuse the fill unless the taker's args carry a guardian signature over this exact fill.
///
/// Human-in-the-loop before funds move, as an instruction. Strategies above a risk threshold ship
/// with this and each fill is clear-signed on the device. The guardian is the same key the registry
/// already knows for this maker, so there is no second trust root to explain.
///
/// @dev Encoding: none. The signature travels in the taker's instruction args, not in the program,
///      because the program is fixed at ship time and the fill is not.
library ApprovalGate {
    using MemoryPtrLib for MemoryPtr;
    using InstructionBuilder for MemoryPtr;
    using ContextLib for Context;

    error ApprovalGateNoGuardian(address maker);
    error ApprovalGateBadSignature(address maker, address guardian, bytes32 digest);

    /// @dev Not an EIP-712 domain of its own: this is signed as a raw digest over the fill's
    ///      identity so the device sees one hash bound to one order, one pair and one amount.
    bytes32 internal constant APPROVAL_PREFIX = keccak256("SUBFLOOR.ApprovalGate.v1");

    Opcode constant opcode = Opcode.ApprovalGate;

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

    function digest(Context memory ctx, uint256 amountIn, uint256 amountOut) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                APPROVAL_PREFIX,
                block.chainid,
                ctx.query.orderHash,
                ctx.query.maker,
                ctx.query.taker,
                ctx.query.tokenIn,
                ctx.query.tokenOut,
                amountIn,
                amountOut
            )
        );
    }

    /// @dev The signature is chopped from the front of the taker args as [uint16 length][sig], so a
    ///      65-byte ECDSA signature and a longer ERC-1271 blob both work and the guardian may be a
    ///      smart account.
    function exec(Context memory ctx, bytes calldata, IFloorRegistry registry) internal {
        uint256 length = uint256(uint16(bytes2(ctx.tryChopTakerArgs(2))));
        bytes calldata signature = ctx.tryChopTakerArgs(length);

        (uint256 amountIn, uint256 amountOut) = ctx.runLoop();

        address guardian = registry.guardian(ctx.query.maker);
        require(guardian != address(0), ApprovalGateNoGuardian(ctx.query.maker));

        bytes32 d = digest(ctx, amountIn, amountOut);
        require(SignatureChecker.isValidSignatureNow(guardian, d, signature), ApprovalGateBadSignature(ctx.query.maker, guardian, d));
    }
}
