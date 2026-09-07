// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { VaultFactory } from "../../src/subfloor/VaultFactory.sol";
import { AquaGuardVault } from "../../src/subfloor/AquaGuardVault.sol";

/// @notice The factory exists so someone other than us can have a vault. These tests are mostly
///         about what it must *not* be able to do to the vaults it creates.
contract VaultFactoryTest is Test {
    Aqua internal aqua;
    VaultFactory internal factory;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        aqua = new Aqua();
        factory = new VaultFactory(address(aqua));
    }

    function test_theCallerOwnsTheVaultNotTheFactory() public {
        vm.prank(alice);
        AquaGuardVault v = AquaGuardVault(payable(factory.createVault()));

        assertEq(v.owner(), alice, "the caller owns it");
        assertTrue(v.owner() != address(factory), "the factory must not");
    }

    /// The factory holds nothing and can do nothing to what it created. A factory that could act on
    /// its vaults would put a trusted party back into a design whose argument is that there is none.
    function test_theFactoryCannotTouchAVaultItCreated() public {
        vm.prank(alice);
        AquaGuardVault v = AquaGuardVault(payable(factory.createVault()));

        vm.startPrank(address(factory));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(factory)));
        v.setDelegate(bob);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(factory)));
        v.withdraw(address(0xdead), 1, bob);
        vm.stopPrank();
    }

    function test_vaultsAreIndependent() public {
        vm.prank(alice);
        AquaGuardVault a = AquaGuardVault(payable(factory.createVault()));
        vm.prank(bob);
        AquaGuardVault b = AquaGuardVault(payable(factory.createVault()));

        assertTrue(address(a) != address(b));
        assertEq(a.owner(), alice);
        assertEq(b.owner(), bob);

        // Alice cannot reach into Bob's.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        b.setDelegate(alice);
    }

    /// One per mandate relationship is the expected shape, not one per person.
    function test_anOwnerCanHaveSeveral() public {
        vm.startPrank(alice);
        address first = factory.createVault();
        address second = factory.createVault();
        vm.stopPrank();

        address[] memory hers = factory.vaultsOfOwner(alice);
        assertEq(hers.length, 2);
        assertEq(hers[0], first);
        assertEq(hers[1], second);
        assertEq(factory.vaultCount(), 2);
        assertEq(factory.vaultsOfOwner(bob).length, 0);
    }

    function test_everyVaultPointsAtCanonicalAqua() public {
        vm.prank(alice);
        AquaGuardVault v = AquaGuardVault(payable(factory.createVault()));
        assertEq(address(v.AQUA()), address(aqua));
    }

    function testFuzz_anyoneCanCreateOneAndOwnsIt(address caller) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        AquaGuardVault v = AquaGuardVault(payable(factory.createVault()));
        assertEq(v.owner(), caller);
    }
}
