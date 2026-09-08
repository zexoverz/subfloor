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
/// @notice Ships a program composed **outside this repo's control** and lets it trade.
///
/// The injection harness, cases 1 and 2 of §7. Both cases end here and that is the point: case 1's
/// bytecode comes from a language model that read a poisoned page, case 2's from a script written by
/// someone who knows the VM and skipped the model entirely. This script cannot tell them apart, and
/// neither can settlement.
///
/// The program arrives in `SUBFLOOR_PROGRAM` rather than being built here, because a program built
/// by this file would be a program the defenders wrote. The composer is `agent/src/injection`.
///
/// What the run is expected to produce is a **revert**, not a fill. The guard-free program ships
/// without complaint, quotes without complaint, and is refused at settlement, because the floor was
/// never one of its instructions and there is nothing in it to omit.
///
/// ```
/// forge script script/ShipComposedProgram.s.sol --sig "digest()" --rpc-url $RPC
/// cast wallet sign --no-hash <digest> --account subfloor-dev
/// SUBFLOOR_PROGRAM=0x... SUBFLOOR_MANDATE_SIG=0x... \
///   forge script script/ShipComposedProgram.s.sol --sig "run()" --rpc-url $RPC \
///   --account subfloor-dev --broadcast
/// ```
contract ShipComposedProgram is Script {
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

    /// The composed program, exactly as it arrived. Not rebuilt, not validated, not filtered.
    ///
    /// Validating it here would quietly turn the demo into "our script caught it", which is a much
    /// weaker claim than the one being made and is not the one the architecture supports.
    function _program() internal view returns (bytes memory) {
        return vm.envBytes("SUBFLOOR_PROGRAM");
    }

    /// Walk the program and report which guard-bank opcodes (0x20-0x2f) it contains.
    ///
    /// On camera this is the line that matters: the shipped program carries no guards at all, and it
    /// still cannot settle below the floor. Printed from the bytes actually being shipped rather
    /// than asserted in a voiceover.
    function _reportGuards(bytes memory program) internal pure returns (uint256 count) {
        uint256 i = 0;
        while (i + 1 < program.length) {
            uint8 op = uint8(program[i]);
            uint8 len = uint8(program[i + 1]);
            if (op >= 0x20 && op <= 0x2f) ++count;
            i += 2 + len;
        }
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
        registry; // read below, after the ship, so the log shows the floor the fill will meet
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

        // No floor is raised here. The floor was set before the attack began, by the owner, and
        // touching it during the run would make this a demo of someone reacting in time. Nobody
        // reacts. `registry` is read only so the script can print what the floor already is.
        bytes32 strategyHash =
            vault.ship(vm.envAddress("SUBFLOOR_ROUTER"), abi.encode(order), tokens, amounts, _mandate(), signature);

        vm.stopBroadcast();

        console2.log("strategyHash", vm.toString(strategyHash));
        console2.log("guard opcodes in the shipped program:", _reportGuards(_program()));
        console2.log("A program with zero guards has shipped. The floor is not in it, and never was.");
        (uint256 f1, bool e1) = registry.effectiveFloor(address(vault), WETH, usdc);
        (uint256 f2, bool e2) = registry.effectiveFloor(address(vault), usdc, WETH);
        console2.log("floor WETH->tUSDC", f1, e1);
        console2.log("floor tUSDC->WETH", f2, e2);
    }
}
