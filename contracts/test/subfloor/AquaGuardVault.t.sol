// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { AquaGuardVault } from "../../src/subfloor/AquaGuardVault.sol";
import { FloorRegistry } from "../../src/subfloor/FloorRegistry.sol";

/// @notice The custody model, tested. The point of this contract is what the delegate *cannot*
///         reach, so most of these are negative tests.
contract AquaGuardVaultTest is Test {
    Aqua internal aqua;
    AquaGuardVault internal vault;
    TokenMock internal tokenA;
    TokenMock internal tokenB;
    TokenMock internal outsider;

    address internal owner = makeAddr("owner");
    address internal app = makeAddr("app");
    address internal monitor = makeAddr("monitor");

    address internal agent;
    uint256 internal agentPK = 0xA6E27;
    address internal ledger;
    uint256 internal ledgerPK = 0x1EDCE1;
    address internal attacker;
    uint256 internal attackerPK = 0xBAD;

    bytes32 internal constant MANDATE_TYPEHASH =
        keccak256("Mandate(address delegate,address app,address[] tokens,uint256[] maxAmounts,uint256 nonce,uint256 expiry)");

    function setUp() public {
        agent = vm.addr(agentPK);
        ledger = vm.addr(ledgerPK);
        attacker = vm.addr(attackerPK);

        vm.warp(1_757_000_000);
        aqua = new Aqua();
        vault = new AquaGuardVault(address(aqua), owner);

        tokenA = new TokenMock("Token A", "TKA");
        tokenB = new TokenMock("Token B", "TKB");
        outsider = new TokenMock("Outsider", "OUT");

        tokenA.mint(address(vault), 1_000e18);
        tokenB.mint(address(vault), 1_000e18);
        outsider.mint(address(vault), 1_000e18);

        vm.startPrank(owner);
        vault.setDelegate(agent);
        vault.setGuardian(ledger);
        vault.setDockOperator(monitor, true);
        vm.stopPrank();
    }

    // --- the happy path ---------------------------------------------------------------------------

    function test_delegateShipsUnderADeviceSignedMandate() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 1_000e18, 0);

        bytes memory sig = _sign(m, ledgerPK);
        vm.prank(agent);
        bytes32 hash = vault.ship(app, "strategy", tokens, amounts, m, sig);

        assertEq(hash, keccak256("strategy"));
        (uint248 balA,) = aqua.rawBalances(address(vault), app, hash, address(tokenA));
        assertEq(balA, 100e18);
        // Finite, and to Aqua alone.
        assertEq(tokenA.allowance(address(vault), address(aqua)), 100e18);
    }

    function test_pullBeyondShippedUnderflowReverts() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 1_000e18, 0);
        bytes memory sig = _sign(m, ledgerPK);
        vm.prank(agent);
        bytes32 hash = vault.ship(app, "strategy", tokens, amounts, m, sig);

        // The app can take what was shipped.
        vm.prank(app);
        aqua.pull(address(vault), hash, address(tokenA), 100e18, attacker);
        assertEq(tokenA.balanceOf(attacker), 100e18);

        // And not one wei more, even though the vault still holds 900.
        assertEq(tokenA.balanceOf(address(vault)), 900e18);
        vm.prank(app);
        vm.expectRevert();
        aqua.pull(address(vault), hash, address(tokenA), 1, attacker);
    }

    // --- the negative surface -----------------------------------------------------------------------

    /// The defining property. Every value-moving function that is not one of the four delegate
    /// entry points must refuse the delegate.
    function test_delegateCannotReachAnythingThatMovesValue() public {
        vm.startPrank(agent);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.withdraw(address(tokenA), 1, agent);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.execute(address(tokenA), 0, abi.encodeCall(IERC20.transfer, (agent, 1)));

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.setDelegate(attacker);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.setGuardian(attacker);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.setDockOperator(attacker, true);

        vm.stopPrank();
        assertEq(tokenA.balanceOf(address(vault)), 1_000e18);
    }

    /// There is no ABI on this contract that lets the delegate approve or transfer anything. If a
    /// passthrough is ever added, this test is what should stop it.
    function test_thereIsNoDelegateReachableApproveOrTransfer() public {
        bytes4[3] memory absent = [
            bytes4(keccak256("approve(address,address,uint256)")),
            bytes4(keccak256("transfer(address,address,uint256)")),
            bytes4(keccak256("call(address,uint256,bytes)"))
        ];
        for (uint256 i = 0; i < absent.length; ++i) {
            vm.prank(agent);
            (bool ok,) = address(vault).call(abi.encodeWithSelector(absent[i], address(tokenA), agent, uint256(1)));
            assertFalse(ok, "a passthrough exists that should not");
        }
    }

    function test_shipWithoutAMandateSignatureFails() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 1_000e18, 0);
        bytes memory forged = _sign(m, attackerPK);

        vm.prank(agent);
        vm.expectRevert(AquaGuardVault.BadMandateSignature.selector);
        vault.ship(app, "strategy", tokens, amounts, m, forged);
    }

    function test_expiredMandateFails() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 1_000e18, 0);
        bytes memory sig = _sign(m, ledgerPK);
        vm.warp(m.expiry + 1);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AquaGuardVault.MandateExpired.selector, m.expiry));
        vault.ship(app, "strategy", tokens, amounts, m, sig);
    }

    function test_mandateIsSingleUse() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 1_000e18, 0);
        bytes memory sig = _sign(m, ledgerPK);

        vm.prank(agent);
        vault.ship(app, "strategy", tokens, amounts, m, sig);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AquaGuardVault.MandateAlreadyUsed.selector, uint256(0)));
        vault.ship(app, "strategy2", tokens, amounts, m, sig);
    }

    function test_tokenOutsideTheMandateFails() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(outsider);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100e18;

        address[] memory allowed = new address[](2);
        allowed[0] = address(tokenA);
        allowed[1] = address(tokenB);
        AquaGuardVault.Mandate memory m = _mandate(allowed, 1_000e18, 0);

        bytes memory sig = _sign(m, ledgerPK);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AquaGuardVault.TokenOutsideMandate.selector, address(outsider)));
        vault.ship(app, "strategy", tokens, amounts, m, sig);
    }

    function test_amountAboveThePerTokenCapFails() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 150e18, 0);

        bytes memory sig = _sign(m, ledgerPK);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AquaGuardVault.AmountAboveMandate.selector, address(tokenB), uint256(200e18), uint256(150e18)));
        vault.ship(app, "strategy", tokens, amounts, m, sig);
    }

    /// The cap binds per token, not as one summed budget. A summed bound is decimals-blind: the
    /// delegate chooses the split, so a budget sized against a 6-decimal token can be spent
    /// entirely on an 8-decimal one and mean a hundred times the intended exposure.
    function test_theWholeBudgetCannotBeRoutedIntoOneToken() public {
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 300e18; // the entire notional of the old aggregate bound
        amounts[1] = 0;

        AquaGuardVault.Mandate memory m = _mandate(tokens, 150e18, 0);
        bytes memory sig = _sign(m, ledgerPK);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AquaGuardVault.AmountAboveMandate.selector, address(tokenA), uint256(300e18), uint256(150e18)));
        vault.ship(app, "strategy", tokens, amounts, m, sig);
    }

    function test_aMandateForAnotherDelegateIsRefused() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 1_000e18, 0);
        m.delegate = attacker;
        bytes memory sig = _sign(m, ledgerPK);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AquaGuardVault.MandateWrongDelegate.selector, attacker, agent));
        vault.ship(app, "strategy", tokens, amounts, m, sig);
    }

    function test_aMandateForAnotherAppIsRefused() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 1_000e18, 0);

        bytes memory sig = _sign(m, ledgerPK);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AquaGuardVault.MandateWrongApp.selector, app, attacker));
        vault.ship(attacker, "strategy", tokens, amounts, m, sig);
    }

    function test_nonDelegateCannotShipAtAll() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 1_000e18, 0);
        bytes memory sig = _sign(m, ledgerPK);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(AquaGuardVault.NotDelegate.selector, attacker));
        vault.ship(app, "strategy", tokens, amounts, m, sig);
    }

    // --- the kill switch ------------------------------------------------------------------------

    /// Docking only ever stops trading, so a software monitor may hold it. It drops the approval
    /// too, which is what actually removes the router's reach.
    function test_monitorCanDockAndTheApprovalGoesToZero() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 1_000e18, 0);
        bytes memory sig = _sign(m, ledgerPK);
        vm.prank(agent);
        bytes32 hash = vault.ship(app, "strategy", tokens, amounts, m, sig);

        vm.prank(monitor);
        vault.dock(app, hash, tokens);

        assertEq(tokenA.allowance(address(vault), address(aqua)), 0);
        vm.prank(app);
        vm.expectRevert();
        aqua.pull(address(vault), hash, address(tokenA), 1, attacker);
    }

    function test_anUnauthorisedCallerCannotDock() public {
        (address[] memory tokens, uint256[] memory amounts) = _pair(100e18, 200e18);
        AquaGuardVault.Mandate memory m = _mandate(tokens, 1_000e18, 0);
        bytes memory sig = _sign(m, ledgerPK);
        vm.prank(agent);
        bytes32 hash = vault.ship(app, "strategy", tokens, amounts, m, sig);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(AquaGuardVault.NotDockAuthorised.selector, attacker));
        vault.dock(app, hash, tokens);
    }

    /// "A vault bug locking funds" is a stated residual risk, so the owner keeps a way out — and
    /// this is exactly why it is owner-only.
    function test_ownerRescuePathWorks() public {
        vm.prank(owner);
        vault.execute(address(tokenA), 0, abi.encodeCall(IERC20.transfer, (owner, 500e18)));
        assertEq(tokenA.balanceOf(owner), 500e18);
    }

    // --- several strategies on shared inventory ---------------------------------------------------

    /// The vault is meant to run several strategies at once on one inventory, and Aqua's balance
    /// accounting is virtual: the ERC20 allowance to Aqua is a single number shared by all of them.
    /// Docking one strategy must not strand the others. Before the per-token commitment tracking,
    /// docking X set the shared allowance to zero and Y's pull reverted with Y's Aqua ledger still
    /// showing it fully funded.
    function test_dockingOneStrategyLeavesAnotherLiveOneSpendable() public {
        address appX = makeAddr("appX");
        address appY = makeAddr("appY");

        address[] memory tokens = new address[](1);
        tokens[0] = address(tokenA);
        uint256[] memory amtX = new uint256[](1);
        amtX[0] = 100e18;
        uint256[] memory amtY = new uint256[](1);
        amtY[0] = 50e18;

        AquaGuardVault.Mandate memory mx = _mandate(tokens, 1_000e18, 0);
        mx.app = appX;
        AquaGuardVault.Mandate memory my = _mandate(tokens, 1_000e18, 1);
        my.app = appY;
        bytes memory sigX = _sign(mx, ledgerPK);
        bytes memory sigY = _sign(my, ledgerPK);

        vm.prank(agent);
        bytes32 hx = vault.ship(appX, "strategyX", tokens, amtX, mx, sigX);
        vm.prank(agent);
        bytes32 hy = vault.ship(appY, "strategyY", tokens, amtY, my, sigY);

        assertEq(vault.committed(address(tokenA)), 150e18);
        assertEq(tokenA.allowance(address(vault), address(aqua)), 150e18);

        vm.prank(agent);
        vault.dock(appX, hx, tokens);

        // X's 100 is released, Y's 50 is not.
        assertEq(vault.committed(address(tokenA)), 50e18);
        assertEq(tokenA.allowance(address(vault), address(aqua)), 50e18);

        vm.prank(appY);
        aqua.pull(address(vault), hy, address(tokenA), 50e18, attacker);
        assertEq(tokenA.balanceOf(attacker), 50e18);
    }

    /// And shipping a second strategy must not reduce the first one's spendable allowance either.
    function test_shippingASecondStrategyAddsToTheAllowanceRatherThanReplacingIt() public {
        address appX = makeAddr("appX");
        address appY = makeAddr("appY");

        address[] memory tokens = new address[](1);
        tokens[0] = address(tokenA);
        uint256[] memory big = new uint256[](1);
        big[0] = 100e18;
        uint256[] memory small = new uint256[](1);
        small[0] = 1e18;

        AquaGuardVault.Mandate memory mx = _mandate(tokens, 1_000e18, 0);
        mx.app = appX;
        AquaGuardVault.Mandate memory my = _mandate(tokens, 1_000e18, 1);
        my.app = appY;
        bytes memory sigX = _sign(mx, ledgerPK);
        bytes memory sigY = _sign(my, ledgerPK);

        vm.prank(agent);
        bytes32 hx = vault.ship(appX, "strategyX", tokens, big, mx, sigX);
        vm.prank(agent);
        vault.ship(appY, "strategyY", tokens, small, my, sigY);

        // The small second ship must not have overwritten the allowance down to 1e18.
        assertEq(tokenA.allowance(address(vault), address(aqua)), 101e18);
        vm.prank(appX);
        aqua.pull(address(vault), hx, address(tokenA), 100e18, attacker);
        assertEq(tokenA.balanceOf(attacker), 100e18);
    }

    // --- invariant 3: the delegate surface ---------------------------------------------------------

    /// The delegate-reachable surface is gated in CI rather than here: `scripts/check-delegate-surface.sh`
    /// reads the compiled ABI and fails if any state-changing function appears that is not either
    /// owner-gated or one of ship/dock/updateQuote/rescueApproval. Solidity cannot filter the ABI
    /// JSON usefully, and a hand-written list in a test only ever proves the functions I remembered.
    ///
    /// That check exists because the fuzz below is weaker than it looks. It passed with a
    /// deliberately-added `sweep(address,address,uint256)` passthrough sitting in the contract:
    /// random bytes essentially never form a valid selector with valid arguments. An invariant that
    /// cannot fail is worse than none, because it gets believed.

    /// Renouncing would permanently remove the rescue path that "a vault bug locking funds" relies
    /// on, leaving inventory in a contract nobody can act on.
    function test_ownershipCannotBeRenounced() public {
        vm.prank(owner);
        vm.expectRevert(AquaGuardVault.RenounceDisabled.selector);
        vault.renounceOwnership();
    }

    /// The complement: whatever calldata the delegate sends, including malformed and unknown
    /// selectors, nothing leaves and nobody but Aqua gains an allowance. On its own this is weak
    /// (see above); alongside the ABI check it covers the fallback and receive paths.
    function testFuzz_noDelegateCallMovesValueOrApprovesAnyoneButAqua(bytes calldata data, address spender) public {
        vm.assume(spender != address(aqua));

        uint256 aBefore = tokenA.balanceOf(address(vault));
        uint256 bBefore = tokenB.balanceOf(address(vault));
        uint256 outBefore = outsider.balanceOf(address(vault));

        vm.prank(agent);
        (bool ok,) = address(vault).call(data);
        ok; // a revert is a fine outcome; what matters is what is true afterwards

        assertGe(tokenA.balanceOf(address(vault)), aBefore, "tokenA left the vault");
        assertGe(tokenB.balanceOf(address(vault)), bBefore, "tokenB left the vault");
        assertGe(outsider.balanceOf(address(vault)), outBefore, "outsider token left the vault");

        assertEq(tokenA.allowance(address(vault), spender), 0, "a non-Aqua spender was approved");
        assertEq(tokenB.allowance(address(vault), spender), 0, "a non-Aqua spender was approved");
        assertEq(outsider.allowance(address(vault), spender), 0, "a non-Aqua spender was approved");
    }

    /// The same question with the delegate's own signing key in play, so the fuzzer can attempt a
    /// forged mandate rather than only malformed calldata. It cannot produce the guardian's
    /// signature, so no ship should ever succeed.
    function testFuzz_theDelegateCannotForgeAMandate(uint256 wrongPK, uint96 amount, uint256 nonce) public {
        uint256 pk = bound(wrongPK, 1, type(uint128).max);
        vm.assume(vm.addr(pk) != ledger);

        (address[] memory tokens, uint256[] memory amounts) = _pair(uint256(amount), uint256(amount));
        AquaGuardVault.Mandate memory m = _mandate(tokens, type(uint256).max, nonce);
        bytes memory sig = _sign(m, pk);

        uint256 before = tokenA.balanceOf(address(vault));
        vm.prank(agent);
        (bool ok,) = address(vault).call(
            abi.encodeCall(AquaGuardVault.ship, (app, "strategy", tokens, amounts, m, sig))
        );

        assertFalse(ok, "a mandate not signed by the guardian was accepted");
        assertEq(tokenA.balanceOf(address(vault)), before);
        assertEq(tokenA.allowance(address(vault), address(aqua)), 0);
    }

    // --- helpers ------------------------------------------------------------------------------------

    function _pair(uint256 a, uint256 b) private view returns (address[] memory tokens, uint256[] memory amounts) {
        tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        amounts = new uint256[](2);
        amounts[0] = a;
        amounts[1] = b;
    }

    function _mandate(address[] memory tokens, uint256 capEach, uint256 nonce)
        private
        view
        returns (AquaGuardVault.Mandate memory)
    {
        uint256[] memory caps = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; ++i) caps[i] = capEach;
        return AquaGuardVault.Mandate({
            delegate: agent,
            app: app,
            tokens: tokens,
            maxAmounts: caps,
            nonce: nonce,
            expiry: block.timestamp + 1 days
        });
    }

    function _sign(AquaGuardVault.Mandate memory m, uint256 pk) private view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                MANDATE_TYPEHASH,
                m.delegate,
                m.app,
                keccak256(abi.encodePacked(m.tokens)),
                keccak256(abi.encodePacked(m.maxAmounts)),
                m.nonce,
                m.expiry
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
    // --- the floor has to be keyed to the vault, not to its owner ---------------------------------

    /// @dev The seeding mistake this pins: `raiseFloor` keys off `msg.sender`, so broadcasting it
    ///      from the deployer registers the floor to the deployer. At settlement the maker-side
    ///      recipient is `order.traits.receiver(order.maker)` and the maker is this vault, so an
    ///      owner-keyed floor binds an address that never appears in a fill. The registry and the
    ///      subgraph both show a floor; the vault settles with none.
    function test_aFloorRaisedByTheOwnerDirectlyDoesNotCoverTheVault() public {
        // Backstop only (tolerance at _BPS), so the floor binds without a reference feed and the
        // test is about who the floor is keyed to rather than about the oracle.
        FloorRegistry registry = new FloorRegistry(owner, 0);

        vm.prank(owner);
        registry.raiseFloor(address(tokenA), address(tokenB), 10_000, 1e18);

        (, bool ownerEnforced) = registry.effectiveFloor(owner, address(tokenA), address(tokenB));
        assertTrue(ownerEnforced, "the owner got a floor");

        (uint256 vaultRate, bool vaultEnforced) =
            registry.effectiveFloor(address(vault), address(tokenA), address(tokenB));
        assertFalse(vaultEnforced, "the vault, which is what settles, has none");
        assertEq(vaultRate, 0);
    }

    /// @dev And the shape that fixes it, which is what `script/SeedTestnet.s.sol` now does.
    function test_theOwnerRaisesTheVaultsFloorThroughExecute() public {
        // Backstop only (tolerance at _BPS), so the floor binds without a reference feed and the
        // test is about who the floor is keyed to rather than about the oracle.
        FloorRegistry registry = new FloorRegistry(owner, 0);

        vm.prank(owner);
        vault.execute(
            address(registry),
            0,
            abi.encodeCall(FloorRegistry.raiseFloor, (address(tokenA), address(tokenB), 10_000, 1e18))
        );

        (uint256 vaultRate, bool vaultEnforced) =
            registry.effectiveFloor(address(vault), address(tokenA), address(tokenB));
        assertTrue(vaultEnforced, "the vault is the recipient the floor is keyed to");
        assertEq(vaultRate, 1e18);
    }

    /// @dev `execute` is the owner rescue path and the delegate must never reach it, or the whole
    ///      custody argument collapses into an arbitrary-call passthrough.
    function test_theDelegateCannotRaiseAFloorThroughExecute() public {
        // Backstop only (tolerance at _BPS), so the floor binds without a reference feed and the
        // test is about who the floor is keyed to rather than about the oracle.
        FloorRegistry registry = new FloorRegistry(owner, 0);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent));
        vault.execute(
            address(registry),
            0,
            abi.encodeCall(FloorRegistry.raiseFloor, (address(tokenA), address(tokenB), 10_000, 1e18))
        );
    }
}
