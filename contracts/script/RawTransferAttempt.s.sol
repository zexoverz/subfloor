// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:copyright © 2026 SUBFLOOR

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AquaGuardVault } from "../src/subfloor/AquaGuardVault.sol";

/// @notice Case 3 of the injection harness: the compromised agent tries to steal, and cannot.
///
/// The first two cases show a poisoned agent trading badly and being refused at settlement. A judge
/// is entitled to ask the obvious follow-up: if the agent is compromised, why does it bother pricing
/// at all — why not just move the money out? §1 answers that the delegate has no such capability.
/// This script is that answer performed rather than asserted, which is the only version worth
/// putting on camera.
///
/// Run it **as the delegate**, the same key the agent uses:
///
/// ```
/// forge script script/RawTransferAttempt.s.sol --sig "run()" --rpc-url $RPC \
///   --account subfloor-delegate --broadcast
/// ```
///
/// Every attempt below is expected to fail. The script does not revert on them — it catches each
/// one and prints what came back, because the log is the artifact.
///
/// This script proves nothing that is not already proven. `testFuzz_noDelegateCallMovesValueOrApprovesAnyoneButAqua`
/// in `test/subfloor/AquaGuardVault.t.sol` fires arbitrary calldata at the vault as the delegate,
/// 256 runs a suite, and asserts no token ever leaves and no spender but Aqua is ever approved —
/// which is strictly stronger than the three fixed attempts here. What this adds is a log a viewer
/// can read, against a real deployment, in the same run as the fills. The claim is settled in the
/// test suite; this is where it becomes visible.
contract RawTransferAttempt is Script {
    function run() external {
        AquaGuardVault vault = AquaGuardVault(payable(vm.envAddress("SUBFLOOR_VAULT")));
        address token = vm.envAddress("SUBFLOOR_TUSDC");
        address attacker = vm.envOr("SUBFLOOR_ATTACKER", address(0xBAD));

        address me = msg.sender;
        uint256 vaultHeld = IERC20(token).balanceOf(address(vault));
        uint256 agentHeld = IERC20(token).balanceOf(me);

        console2.log("agent (delegate):", me);
        console2.log("is the delegate:", me == vault.delegate());
        console2.log("vault holds (raw):", vaultHeld);
        console2.log("agent holds (raw):", agentHeld);
        console2.log("");

        vm.startBroadcast();

        // 1. The obvious move: use the vault's rescue path to send the inventory away.
        //    `execute` is owner-only, and the delegate is not the owner. There is no argument to
        //    this call that makes it work; the restriction is on who is calling.
        try vault.execute(token, 0, abi.encodeCall(IERC20.transfer, (attacker, vaultHeld))) {
            console2.log("1. execute(transfer) SUCCEEDED - the custody claim is false");
        } catch {
            console2.log("1. execute(transfer) refused: owner-only, and the delegate is not the owner");
        }

        // 2. Approve the attacker instead, and let them pull. Same wall: reaching `approve` on the
        //    token needs the same owner-only passthrough.
        try vault.execute(token, 0, abi.encodeCall(IERC20.approve, (attacker, type(uint256).max))) {
            console2.log("2. execute(approve) SUCCEEDED - the custody claim is false");
        } catch {
            console2.log("2. execute(approve) refused: there is no delegate-reachable approve");
        }

        // 3. Give up on the vault and move whatever the agent itself holds. This one is *allowed* —
        //    and moves nothing, because the agent's own address is not where the money is. The
        //    delegate key is an instruction key, not a custody key.
        if (agentHeld == 0) {
            console2.log("3. transfer from the agent's own balance: nothing to take, it holds 0");
        } else {
            IERC20(token).transfer(attacker, agentHeld);
            console2.log("3. transfer from the agent's own balance moved:", agentHeld);
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("vault still holds (raw):", IERC20(token).balanceOf(address(vault)));
        console2.log("The delegate surface is ship, dock, updateQuote, rescueApproval. That is all of it.");
    }
}
