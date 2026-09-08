// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";
import { ConcentratedBook } from "../../src/subfloor/strategies/ConcentratedBook.sol";

contract PrintBookTest is Test {
    function test_printTheBook() public pure {
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(2478669714, 50);
        ConcentratedBook.Book memory b;
        b.sqrtPriceMin = lo;
        b.sqrtPriceMax = hi;
        b.salt = 1;
        bytes memory p = ConcentratedBook.build(b);

        console2.log("program bytes:", p.length);
        uint256 i = 0;
        uint256 n = 0;
        while (i + 1 < p.length) {
            uint8 op = uint8(p[i]);
            uint8 len = uint8(p[i + 1]);
            console2.log("  step", n, "opcode", uint256(op));
            i += 2 + len;
            ++n;
        }
        console2.log("instructions:", n);
    }
}
