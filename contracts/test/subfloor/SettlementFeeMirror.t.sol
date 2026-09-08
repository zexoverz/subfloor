// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Test } from "forge-std/Test.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { ProtocolFee, FeeMeta, FeeMetaLib, FeeReceiver, FeeReceiverLib } from "../../src/libs/ProtocolFee.sol";
import { SettlementFeeLib } from "../../src/subfloor/SettlementFeeLib.sol";

/// @notice `SettlementFeeLib` says it mirrors the upstream fee arithmetic, and until now nothing
///         checked that.
///
/// The library's own doc comment named this file as the thing pinning the two together. The file did
/// not exist, and no test in the suite referenced `settlementFee` at all — so the guard's most
/// load-bearing assumption was an assertion in a comment.
///
/// It matters more than an untested helper usually does. `_settlementGuard` runs *before* the
/// transfers, so it asks this library what the fee will be in order to score the maker's real rate.
/// If the answer is too small, the guard scores a rate better than what lands, and a fill sitting
/// near the floor **passes** and pays out below it. Nothing reverts. The floor just quietly stops
/// meaning what it says.
contract SettlementFeeMirrorTest is Test {
    /// The upstream path, wrapped so its `totalFee` can be compared. `resolveInSafeTransfer` moves
    /// tokens as it goes, which is the only difference between it and the mirror.
    function _upstreamIn(ProtocolFee memory data, address token, uint256 amountIn) internal returns (uint256) {
        return FeeMetaLib.resolveInSafeTransfer(data, token, amountIn);
    }

    function _upstreamOut(ProtocolFee memory data, address token, uint256 amountOut, address maker) internal returns (uint256) {
        return FeeMetaLib.resolveOutSafeTransferFromMaker(data, token, amountOut, maker);
    }

    TokenMock internal token;
    address internal maker = makeAddr("maker");
    address internal receiverA = makeAddr("receiverA");
    address internal receiverB = makeAddr("receiverB");

    function setUp() public {
        token = new TokenMock("Fee Token", "FEE");
        token.mint(address(this), 1_000_000e18);
        token.mint(maker, 1_000_000e18);
        vm.prank(maker);
        token.approve(address(this), type(uint256).max);
    }

    function _feeIn(uint8 count, uint24 totalBps, uint216 estimate, uint256 feeTotal) internal view returns (ProtocolFee memory data) {
        data.meta = FeeMetaLib.encode(true, count, totalBps, estimate);
        data.feeTotal = feeTotal;
        data.receivers = new FeeReceiver[](count);
        for (uint8 i = 0; i < count; ++i) {
            data.receivers[i] = FeeReceiverLib.encode(i == 0 ? receiverA : receiverB, 5_000, 1_000);
        }
    }

    function _feeOut(uint8 count, uint24 totalBps, uint216 estimate, uint256 feeTotal) internal view returns (ProtocolFee memory data) {
        data.meta = FeeMetaLib.encode(false, count, totalBps, estimate);
        data.feeTotal = feeTotal;
        data.receivers = new FeeReceiver[](count);
        for (uint8 i = 0; i < count; ++i) {
            data.receivers[i] = FeeReceiverLib.encode(i == 0 ? receiverA : receiverB, 5_000, 1_000);
        }
    }

    function test_tokenInMirrorsUpstream() public {
        ProtocolFee memory a = _feeIn(2, 10_000, 900e18, 10e18);
        ProtocolFee memory b = _feeIn(2, 10_000, 900e18, 10e18);

        uint256 mirrored = SettlementFeeLib.settlementFee(a, true, 1_000e18);
        uint256 upstream = _upstreamIn(b, address(token), 1_000e18);

        assertEq(mirrored, upstream, "tokenIn fee disagrees with what the transfer path takes");
    }

    function test_tokenOutMirrorsUpstream() public {
        ProtocolFee memory a = _feeOut(2, 10_000, 1_100e18, 10e18);
        ProtocolFee memory b = _feeOut(2, 10_000, 1_100e18, 10e18);

        uint256 mirrored = SettlementFeeLib.settlementFee(a, false, 1_000e18);
        uint256 upstream = _upstreamOut(b, address(token), 1_000e18, maker);

        assertEq(mirrored, upstream, "tokenOut fee disagrees with what the transfer path takes");
    }

    /// The side the fee is not charged on must answer zero, or the guard subtracts a fee twice.
    function test_theOtherSideIsAlwaysZero() public view {
        ProtocolFee memory inSide = _feeIn(2, 10_000, 900e18, 10e18);
        assertEq(SettlementFeeLib.settlementFee(inSide, false, 1_000e18), 0);

        ProtocolFee memory outSide = _feeOut(2, 10_000, 1_100e18, 10e18);
        assertEq(SettlementFeeLib.settlementFee(outSide, true, 1_000e18), 0);
    }

    function test_noReceiversIsNoFee() public view {
        ProtocolFee memory none = _feeIn(0, 10_000, 0, 0);
        assertEq(SettlementFeeLib.settlementFee(none, true, 1_000e18), 0);
    }

    /// The surplus branch is where the two implementations could most easily drift: it reads the
    /// estimate off the meta and compares it against what really moved, and the two sides move it in
    /// opposite directions.
    function testFuzz_mirrorsUpstreamAcrossSurplus(uint216 estimate, uint96 amount, uint96 feeTotal) public {
        uint256 amt = uint256(bound(amount, 1e18, 1_000e18));
        uint256 total = uint256(bound(feeTotal, 0, amt / 2));
        uint216 est = uint216(bound(estimate, 0, 2_000e18));

        ProtocolFee memory a = _feeIn(2, 10_000, est, total);
        ProtocolFee memory b = _feeIn(2, 10_000, est, total);

        assertEq(
            SettlementFeeLib.settlementFee(a, true, amt),
            _upstreamIn(b, address(token), amt),
            "surplus handling drifted"
        );
    }
}
