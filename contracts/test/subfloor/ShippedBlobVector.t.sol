// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Test } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { MakerTraits } from "../../src/libs/MakerTraits.sol";
import { ConcentratedBook } from "../../src/subfloor/strategies/ConcentratedBook.sol";

/// @notice A real `Shipped` blob, for the subgraph decoder's test.
///
/// `Aqua.ship` carries `abi.encode(order)`, not the program — the program is inside the Order's
/// `data`. The decoder was reading the blob directly and taking the maker's address as its first
/// instructions. Pinning that test to bytes this file produces means the decoder is checked against
/// what the chain actually emits rather than against bytes the test wrote for itself.
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

        ISwapVM.Order memory order = ISwapVM.Order({
            maker: 0x441EE52d939E46A33919C4295e88d32458797503,
            traits: MakerTraits.wrap(0),
            data: program
        });

        console2.log("program", vm.toString(program));
        console2.log("shippedBlob", vm.toString(abi.encode(order)));
    }
}
