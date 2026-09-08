// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { ISwapVM } from "../src/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "../src/libs/MakerTraits.sol";
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

    /// Reference price used to centre the book, 1e18 scaled and in **raw** units: how many raw
    /// tUSDC one raw WETH buys, times 1e18. tUSDC is six decimals and WETH is eighteen, so that is
    /// `2500e6 * 1e18 / 1e18` = `2500e6`, not `2500e18`.
    ///
    /// The eighteen-decimal version quotes a book 1e12 out and it does not look like a bug: it
    /// fills, it just fills at a price nobody meant. The curve works on raw balances and does not
    /// know the tokens have different decimals — the registry's floors already carry the same raw
    /// convention, which is why they read 2.45e9 and 4e26 rather than anything human.
    uint256 internal constant REFERENCE = uint256(2478669714);
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

        address[] memory tokens = _tokens();

        // Built through MakerTraitsLib, not by hand. The traits word carries `tokenA`, `tokenB` and
        // `useAquaInsteadOfSignature`, and the program goes in through `build` rather than straight
        // into `data`. A hand-made order with `traits = 0` ships and hashes fine, and then never
        // fills: the router takes the signature path, computes a different order hash, and finds no
        // Aqua balance under it. Caught by a quote returning zero rather than by a bad fill.
        ISwapVM.Order memory order = MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: address(vault),
            tokenA: tokens[0],
            tokenB: tokens[1],
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
            program: _program()
        }));

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = tokens[0] == WETH ? WETH_SHIPPED : USDC_SHIPPED;
        amounts[1] = tokens[1] == WETH ? WETH_SHIPPED : USDC_SHIPPED;

        vm.startBroadcast();

        // 100 bps of tolerance either way, no absolute backstop, so the floor tracks the reference.
        //
        // Only where no floor exists yet. `raiseFloor` refuses anything that weakens either
        // component, and a re-run against a deployment whose backstop has since been raised is
        // exactly that: passing 0 for the absolute rate when the stored one is 2457774000 reverts
        // `NotARaise`. The asymmetry is the design and the script has no business arguing with it,
        // so it reads the floor first and leaves a configured one alone.
        _raiseIfUnset(vault, registry, WETH, usdc);
        _raiseIfUnset(vault, registry, usdc, WETH);

        bytes32 strategyHash =
            vault.ship(vm.envAddress("SUBFLOOR_ROUTER"), abi.encode(order), tokens, amounts, _mandate(), signature);

        vm.stopBroadcast();

        console2.log("strategyHash", vm.toString(strategyHash));
        (uint256 f1, bool e1) = registry.effectiveFloor(address(vault), WETH, usdc);
        (uint256 f2, bool e2) = registry.effectiveFloor(address(vault), usdc, WETH);
        console2.log("floor WETH->tUSDC", f1, e1);
        console2.log("floor tUSDC->WETH", f2, e2);
    }

    function _raiseIfUnset(AquaGuardVault vault, FloorRegistry registry, address base, address quote) internal {
        (bool configured, uint16 bps, uint232 absolute) = registry.floor(address(vault), base, quote);
        if (configured) {
            console2.log("floor already set, left alone:", vm.toString(base), vm.toString(quote));
            console2.log("  maxAdverseBps", bps, "absoluteRate", uint256(absolute));
            return;
        }
        vault.execute(address(registry), 0, abi.encodeCall(FloorRegistry.raiseFloor, (base, quote, 100, 0)));
    }
}
