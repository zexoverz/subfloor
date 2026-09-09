// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

import { VaultFactory } from "../../src/subfloor/VaultFactory.sol";
import { AquaGuardVault } from "../../src/subfloor/AquaGuardVault.sol";
import { FloorRegistry } from "../../src/subfloor/FloorRegistry.sol";

/// @notice The factory exists so someone other than us can have a vault. These tests are mostly
///         about what it must *not* be able to do to the vaults it creates.
contract VaultFactoryTest is Test {
    Aqua internal aqua;
    VaultFactory internal factory;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal agent = makeAddr("agent");
    address internal ledger = makeAddr("ledger");

    FloorRegistry internal registry;
    TokenMock internal tokenA;
    TokenMock internal tokenB;

    function setUp() public {
        aqua = new Aqua();
        factory = new VaultFactory(address(aqua));
        registry = new FloorRegistry(address(this), 0);
        tokenA = new TokenMock("Token I", "TKI");
        tokenB = new TokenMock("Token J", "TKJ");
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

    // --- one transaction instead of six ---------------------------------------------------------

    function _setup(address registryAddr) internal view returns (VaultFactory.InitialSetup memory s) {
        address[] memory base = new address[](2);
        address[] memory quote = new address[](2);
        uint16[] memory bps = new uint16[](2);
        uint256[] memory abs = new uint256[](2);

        base[0] = address(tokenA);
        quote[0] = address(tokenB);
        base[1] = address(tokenB);
        quote[1] = address(tokenA);
        bps[0] = 100;
        bps[1] = 100;
        abs[0] = 0;
        abs[1] = 0;

        s = VaultFactory.InitialSetup({
            delegate: agent,
            guardian: ledger,
            registry: registryAddr,
            base: base,
            quote: quote,
            maxAdverseBps: bps,
            absoluteRate: abs
        });
    }

    /// The whole point: after one call the vault is owned, delegated, guarded on both sides, and has
    /// floors on both directions. There is no half-configured state to be caught in.
    function test_oneCallLeavesNothingUnset() public {
        vm.prank(alice);
        address vault = factory.createVault(_setup(address(registry)));

        assertEq(AquaGuardVault(payable(vault)).owner(), alice, "owner");
        assertEq(AquaGuardVault(payable(vault)).delegate(), agent, "delegate");
        assertEq(AquaGuardVault(payable(vault)).guardian(), ledger, "vault guardian");

        // The one that used to be missed, and whose absence is silent.
        assertEq(registry.guardian(vault), ledger, "registry guardian");

        (bool configuredAB,,) = registry.floor(vault, address(tokenA), address(tokenB));
        (bool configuredBA,,) = registry.floor(vault, address(tokenB), address(tokenA));
        assertTrue(configuredAB, "floor A->B");
        assertTrue(configuredBA, "floor B->A");
    }

    /// The factory holds the vault only inside the call. Nothing about it survives.
    function test_theFactoryDoesNotKeepTheVault() public {
        vm.prank(alice);
        address vault = factory.createVault(_setup(address(registry)));

        assertNotEq(AquaGuardVault(payable(vault)).owner(), address(factory));

        // And it cannot act on one afterwards: `execute` is owner-only and the owner is the caller.
        vm.prank(address(factory));
        vm.expectRevert();
        AquaGuardVault(payable(vault)).execute(address(tokenA), 0, "");
    }

    function test_aVaultWithNoRegistryIsStillAVault() public {
        VaultFactory.InitialSetup memory s = _setup(address(0));

        vm.prank(alice);
        address vault = factory.createVault(s);

        assertEq(AquaGuardVault(payable(vault)).delegate(), agent);
        assertEq(registry.guardian(vault), address(0), "no registry calls when there is no registry");
    }

    function test_mismatchedPairArraysAreRefused() public {
        VaultFactory.InitialSetup memory s = _setup(address(registry));
        s.maxAdverseBps = new uint16[](1);

        vm.prank(alice);
        vm.expectRevert(VaultFactory.SetupLengthMismatch.selector);
        factory.createVault(s);
    }

    /// The bare path still exists, because a floor needs no vault at all and some callers only want
    /// custody.
    function test_theBareCallStillWorks() public {
        vm.prank(alice);
        address vault = factory.createVault();
        assertEq(AquaGuardVault(payable(vault)).owner(), alice);
        assertEq(AquaGuardVault(payable(vault)).delegate(), address(0));
    }
}
