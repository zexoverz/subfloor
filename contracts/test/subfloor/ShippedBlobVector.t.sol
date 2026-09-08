// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Test } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "../../src/libs/MakerTraits.sol";
import { ConcentratedBook } from "../../src/subfloor/strategies/ConcentratedBook.sol";

/// @notice A real `Shipped` blob, for the subgraph decoder's test.
///
/// `Aqua.ship` carries `abi.encode(order)`, not the program — the program is inside the Order's
/// `data`. The decoder was reading the blob directly and taking the maker's address as its first
/// instructions. Pinning that test to bytes this file produces means the decoder is checked against
/// what the chain actually emits rather than against bytes the test wrote for itself.
///
/// Built through `MakerTraitsLib.build`, which is the second half of that lesson. An order assembled
/// by hand with `traits = 0` puts the program alone in `data`; a real one puts `tokenA` and `tokenB`
/// in the first forty bytes and the program after them. This file produced the hand-made shape for
/// a week, the decoder was written to match it, and the two agreed with each other while disagreeing
/// with the chain — five of six live strategies decoded into instructions nobody shipped, and a
/// concentrated book was classified as pegged. A fixture that is not the thing it stands in for is
/// worse than no fixture.
///
/// Regenerate with `forge test --match-contract ShippedBlobVector -vv`.
contract ShippedBlobVectorTest is Test {
    function test_printShippedBlob() public pure {
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(2500e18, 50);

        ConcentratedBook.Book memory book;
        book.sqrtPriceMin = lo;
        book.sqrtPriceMax = hi;
        book.feeBps = 3000;
        book.decayPeriod = 600;
        book.salt = 42;

        bytes memory program = ConcentratedBook.build(book);

        ISwapVM.Order memory order = MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: 0x441EE52d939E46A33919C4295e88d32458797503,
            tokenA: 0x4200000000000000000000000000000000000006,
            tokenB: 0x90dceE47Dc225832B8BbD7Eb8EeAC60766D2D1aD,
            shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true,
            allowZeroAmountIn: false,
            receiver: address(0),
            hasPreTransferInHook: false,
            hasPostTransferInHook: false,
            hasPreTransferOutHook: false,
            hasPostTransferOutHook: false,
            preTransferInTarget: address(0),
            preTransferInData: "",
            postTransferInTarget: address(0),
            postTransferInData: "",
            preTransferOutTarget: address(0),
            preTransferOutData: "",
            postTransferOutTarget: address(0),
            postTransferOutData: "",
            program: program
        }));

        console2.log("program", vm.toString(program));
        console2.log("shippedBlob", vm.toString(abi.encode(order)));
    }
}
