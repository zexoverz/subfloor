// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:copyright © 2026 SUBFLOOR

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

interface IMintable {
    function mint(address account, uint256 amount) external;
    function transferOwnership(address newOwner) external;
}

/// @notice Hands out `tUSDC` so anyone can try the app without asking us for tokens.
///
/// The stand-in token's `mint` is `onlyOwner`, which made the deployer a bottleneck for every person
/// who wanted to exercise a flow: the frontend developer, and any judge who opens the link and wants
/// to set a floor against a book that actually fills. A demo whose first step is "message us for test
/// tokens" is a demo most people do not finish.
///
/// Testnet only. It exists because `tUSDC` exists, and `tUSDC` exists because Circle's testnet USDC
/// is not permissionlessly mintable. Neither is deployed to mainnet.
contract TestnetFaucet is Ownable {
    IMintable public immutable TOKEN;

    /// @notice How much one call hands out.
    uint256 public amount;
    /// @notice How long an address must wait before drawing again.
    uint256 public cooldown;

    mapping(address => uint256) public lastDrawnAt;

    error TooSoon(uint256 nextAllowedAt);

    event Drawn(address indexed to, uint256 amount);

    constructor(address token, uint256 initialAmount, uint256 initialCooldown, address owner) Ownable(owner) {
        TOKEN = IMintable(token);
        amount = initialAmount;
        cooldown = initialCooldown;
    }

    /// @notice Draw to the caller. The cooldown is per recipient, not per caller, so paying the gas
    ///         for somebody else still respects their limit rather than resetting it.
    function draw() external {
        _draw(msg.sender);
    }

    /// @notice Draw to another address, which is how a screen can fund a wallet the user just
    ///         connected without asking them to send a transaction first.
    function drawTo(address to) external {
        _draw(to);
    }

    function _draw(address to) internal {
        uint256 next = lastDrawnAt[to] + cooldown;
        require(lastDrawnAt[to] == 0 || block.timestamp >= next, TooSoon(next));

        lastDrawnAt[to] = block.timestamp;
        TOKEN.mint(to, amount);
        emit Drawn(to, amount);
    }

    /// @notice When the next draw is allowed for `who`, so a screen can show a countdown rather than
    ///         letting the user send a transaction that reverts.
    function nextDrawAt(address who) external view returns (uint256) {
        return lastDrawnAt[who] == 0 ? 0 : lastDrawnAt[who] + cooldown;
    }

    function setAmount(uint256 newAmount) external onlyOwner {
        amount = newAmount;
    }

    function setCooldown(uint256 newCooldown) external onlyOwner {
        cooldown = newCooldown;
    }

    /// @notice Give the token back. The faucet holds the token's ownership while it runs, and this
    ///         is the way out if it turns out to be wrong — without it a bad faucet would strand the
    ///         only mintable token on the deployment.
    function returnTokenOwnership(address to) external onlyOwner {
        TOKEN.transferOwnership(to);
    }
}
