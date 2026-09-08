// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { TokenCustomDecimalsMock } from "@1inch/solidity-utils/contracts/mocks/TokenCustomDecimalsMock.sol";

import { TestnetFaucet } from "../../src/subfloor/TestnetFaucet.sol";

contract TestnetFaucetTest is Test {
    TokenCustomDecimalsMock internal token;
    TestnetFaucet internal faucet;

    address internal owner = makeAddr("owner");
    address internal zikri = makeAddr("zikri");
    address internal judge = makeAddr("judge");

    uint256 internal constant AMOUNT = 25_000e6;
    uint256 internal constant COOLDOWN = 12 hours;

    function setUp() public {
        vm.prank(owner);
        token = new TokenCustomDecimalsMock("SUBFLOOR Test USD", "tUSDC", 0, 6);

        faucet = new TestnetFaucet(address(token), AMOUNT, COOLDOWN, owner);

        // The faucet can only mint because it holds the token's ownership.
        vm.prank(owner);
        token.transferOwnership(address(faucet));
    }

    function test_anyoneCanDrawWithoutAskingUs() public {
        vm.prank(zikri);
        faucet.draw();
        assertEq(token.balanceOf(zikri), AMOUNT);
    }

    function test_aSecondDrawWaitsForTheCooldown() public {
        vm.prank(zikri);
        faucet.draw();

        vm.prank(zikri);
        vm.expectRevert(abi.encodeWithSelector(TestnetFaucet.TooSoon.selector, block.timestamp + COOLDOWN));
        faucet.draw();

        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(zikri);
        faucet.draw();
        assertEq(token.balanceOf(zikri), AMOUNT * 2);
    }

    /// The cooldown is per recipient. Paying gas for somebody else must not reset their limit, or
    /// draining the faucet is one script with a fresh key each call.
    function test_drawingForSomeoneElseUsesTheirCooldownNotYours() public {
        vm.prank(zikri);
        faucet.drawTo(judge);
        assertEq(token.balanceOf(judge), AMOUNT);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TestnetFaucet.TooSoon.selector, block.timestamp + COOLDOWN));
        faucet.drawTo(judge);

        // And the caller's own limit was never touched.
        vm.prank(zikri);
        faucet.draw();
        assertEq(token.balanceOf(zikri), AMOUNT);
    }

    function test_onlyTheOwnerRetunesIt() public {
        vm.prank(zikri);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, zikri));
        faucet.setAmount(1);

        vm.prank(owner);
        faucet.setAmount(1e6);
        assertEq(faucet.amount(), 1e6);
    }

    /// The way out if the faucet is wrong. Without it a bad faucet strands the only mintable token
    /// on the deployment, because the token's `mint` is owner-only and the owner would be a contract
    /// that cannot be changed.
    function test_theTokenCanBeTakenBack() public {
        vm.prank(owner);
        faucet.returnTokenOwnership(owner);
        assertEq(token.owner(), owner);

        vm.prank(owner);
        token.mint(owner, 1);
        assertEq(token.balanceOf(owner), 1);
    }

    function test_aScreenCanShowTheCountdownRatherThanRevert() public {
        assertEq(faucet.nextDrawAt(zikri), 0, "a first-time address should read as ready");

        vm.prank(zikri);
        faucet.draw();
        assertEq(faucet.nextDrawAt(zikri), block.timestamp + COOLDOWN);
    }
}
