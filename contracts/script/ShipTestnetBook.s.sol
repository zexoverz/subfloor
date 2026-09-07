// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { ISwapVM } from "../src/interfaces/ISwapVM.sol";
import { MakerTraits } from "../src/libs/MakerTraits.sol";
import { AquaGuardVault } from "../src/subfloor/AquaGuardVault.sol";
import { FloorRegistry } from "../src/subfloor/FloorRegistry.sol";
import { ConcentratedBook } from "../src/subfloor/strategies/ConcentratedBook.sol";

/// @notice Raises the vault's floors and ships one concentrated book, on Base Sepolia.
///
/// Two passes, because the mandate is signed off-chain and the digest has to exist before it can be
/// signed:
///
/// ```
/// # 1. print the digest
/// forge script script/ShipTestnetBook.s.sol --sig "digest()" --rpc-url $RPC
/// # 2. sign it with the guardian key
/// cast wallet sign --no-hash <digest> --account subfloor-dev
/// # 3. ship
/// SUBFLOOR_MANDATE_SIG=0x... forge script script/ShipTestnetBook.s.sol --sig "run()" \
///   --rpc-url $RPC --account subfloor-dev --broadcast
/// ```
///
/// The floor is raised through `vault.execute` so it is keyed to the vault, which is the recipient
/// at settlement. Raising it from the deployer would key it to an address that never appears in a
/// fill — see #130, which is exactly that mistake.
contract ShipTestnetBook is Script {
    address internal constant WETH = 0x4200000000000000000000000000000000000006;

    /// Reference price used to centre the book, 1e18 scaled: tUSDC per WETH.
    uint256 internal constant REFERENCE = 2500e18;
    uint16 internal constant SPREAD_BPS = 50;

    uint256 internal constant WETH_SHIPPED = 0.004e18;
    uint256 internal constant USDC_SHIPPED = 10_000e6;

    function _vault() internal view returns (AquaGuardVault) {
        return AquaGuardVault(payable(vm.envAddress("SUBFLOOR_VAULT")));
    }

    function _tokens() internal view returns (address[] memory tokens) {
        tokens = new address[](2);
        address usdc = vm.envAddress("SUBFLOOR_TUSDC");
        // Aqua requires the token list sorted, and the curve reads direction from tokenIn < tokenOut.
        (tokens[0], tokens[1]) = WETH < usdc ? (WETH, usdc) : (usdc, WETH);
    }

    function _mandate() internal view returns (AquaGuardVault.Mandate memory m) {
        address[] memory tokens = _tokens();
        uint256[] memory caps = new uint256[](2);
        caps[0] = tokens[0] == WETH ? 1e18 : 1_000_000e6;
        caps[1] = tokens[1] == WETH ? 1e18 : 1_000_000e6;

        m = AquaGuardVault.Mandate({
            delegate: vm.envAddress("SUBFLOOR_DELEGATE"),
            app: vm.envAddress("SUBFLOOR_ROUTER"),
            tokens: tokens,
            maxAmounts: caps,
            nonce: vm.envOr("SUBFLOOR_NONCE", uint256(0)),
            expiry: vm.envOr("SUBFLOOR_EXPIRY", uint256(4102444800))
        });
    }

    function _program() internal view returns (bytes memory) {
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(REFERENCE, SPREAD_BPS);

        ConcentratedBook.Book memory book;
        book.sqrtPriceMin = lo;
        book.sqrtPriceMax = hi;
        book.feeBps = 3000;
        book.decayPeriod = 600;
        book.salt = uint64(vm.envOr("SUBFLOOR_SALT", uint256(1)));
        return ConcentratedBook.build(book);
    }

    /// @notice Pass one: the EIP-712 digest the guardian has to sign.
    function digest() external view {
        AquaGuardVault vault = _vault();
        bytes32 structHash = vault.hashMandate(_mandate());
        bytes32 d = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));
        console2.log("digest", vm.toString(d));
    }

    /// @notice Pass two: raise the floors, then ship.
    function run() external {
        AquaGuardVault vault = _vault();
        FloorRegistry registry = FloorRegistry(vm.envAddress("SUBFLOOR_REGISTRY"));
        address usdc = vm.envAddress("SUBFLOOR_TUSDC");
        bytes memory signature = vm.envBytes("SUBFLOOR_MANDATE_SIG");

        ISwapVM.Order memory order =
            ISwapVM.Order({ maker: address(vault), traits: MakerTraits.wrap(0), data: _program() });

        address[] memory tokens = _tokens();
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = tokens[0] == WETH ? WETH_SHIPPED : USDC_SHIPPED;
        amounts[1] = tokens[1] == WETH ? WETH_SHIPPED : USDC_SHIPPED;

        vm.startBroadcast();

        // 100 bps of tolerance either way, no absolute backstop, so the floor tracks the reference.
        vault.execute(address(registry), 0, abi.encodeCall(FloorRegistry.raiseFloor, (WETH, usdc, 100, 0)));
        vault.execute(address(registry), 0, abi.encodeCall(FloorRegistry.raiseFloor, (usdc, WETH, 100, 0)));

        bytes32 strategyHash =
            vault.ship(vm.envAddress("SUBFLOOR_ROUTER"), abi.encode(order), tokens, amounts, _mandate(), signature);

        vm.stopBroadcast();

        console2.log("strategyHash", vm.toString(strategyHash));
        (uint256 f1, bool e1) = registry.effectiveFloor(address(vault), WETH, usdc);
        (uint256 f2, bool e2) = registry.effectiveFloor(address(vault), usdc, WETH);
        console2.log("floor WETH->tUSDC", f1, e1);
        console2.log("floor tUSDC->WETH", f2, e2);
    }
}
