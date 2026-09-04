// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";

/// @title AquaGuardVault
/// @notice The smart account that holds the inventory and *is* the Aqua maker.
///
/// This exists because of one objection: an agent holding a raw wallet key simply trades
/// somewhere else, and no settlement guarantee on one venue can stop it. The answer has to be
/// custody, and custody only answers it if it is built rather than asserted — so the delegate's
/// reachable surface is enumerated here and nothing else is added to it.
///
/// **The delegate can do exactly four things: ship, dock, updateQuote, and rescueApproval.**
/// There is no arbitrary-call passthrough, no delegate-reachable `approve`, and no
/// delegate-reachable `transfer`. Approvals leave this contract only to canonical Aqua and only in
/// finite amounts. Everything that can move value in any other direction is owner-only.
///
/// `Aqua.pull` is `safeTransferFrom(maker, to, amount)` against a virtual balance that
/// underflow-reverts past what was shipped, so even a compromised or broken router's blast radius
/// is the shipped inventory rather than the vault.
contract AquaGuardVault is Ownable, EIP712 {
    using SafeERC20 for IERC20;

    IAqua public immutable AQUA;

    /// @notice The key the agent holds. Its entire authority is the four functions marked
    ///         `onlyDelegate`, and every one of them is bounded by a device-signed mandate.
    address public delegate;

    /// @notice The key that signs mandates. Hardware, in the live run. Never on the agent's host.
    address public guardian;

    /// @notice Docking can only stop trading, never worsen a price, so software may hold it.
    mapping(address => bool) public dockOperator;

    /// @notice Consumed mandate nonces. A mandate is single-use.
    mapping(uint256 => bool) public mandateUsed;

    /// @notice Total shipped and not yet docked, per token, across every live strategy.
    ///
    /// The vault's approval to Aqua is a single allowance per token, shared by every strategy that
    /// uses it — Aqua's per-strategy accounting is virtual and does not extend to the ERC20
    /// allowance. So the allowance has to be the sum across live strategies. Setting it to one
    /// strategy's amount, or clearing it on any dock, silently breaks every other live strategy
    /// holding that token: Aqua's ledger still shows them funded and their `pull` reverts on the
    /// transfer. That matters here because the vault is meant to run several strategies at once on
    /// shared inventory.
    mapping(address => uint256) public committed;

    /// @notice What a device signature authorises: this delegate, this app, these tokens, at most
    ///         these amounts of each, until this time.
    ///
    /// @dev `maxAmounts` is parallel to `tokens` and is a **per-token** cap, deliberately not one
    ///      aggregate figure. A single summed bound is decimals-blind and price-blind: summing raw
    ///      amounts across an 8-decimal token and a 6-decimal one means a budget the guardian sized
    ///      against the small-unit token can be spent entirely on the large-unit one, and the
    ///      delegate chooses the split. The cap has to bind per token or it does not bind.
    ///
    /// @dev `app` is as security-critical as the amounts. `Aqua.pull` is permissionless and keys
    ///      off `msg.sender` as the app, so whatever address is named here is the only contract
    ///      that can ever pull the shipped balance. A guardian reviewing a mandate is approving
    ///      that address as much as the numbers.
    struct Mandate {
        address delegate;
        address app;
        address[] tokens;
        uint256[] maxAmounts;
        uint256 nonce;
        uint256 expiry;
    }

    bytes32 internal constant _MANDATE_TYPEHASH =
        keccak256("Mandate(address delegate,address app,address[] tokens,uint256[] maxAmounts,uint256 nonce,uint256 expiry)");

    event DelegateSet(address oldDelegate, address newDelegate);
    event GuardianSet(address oldGuardian, address newGuardian);
    event DockOperatorSet(address operator, bool allowed);
    event Shipped(address indexed app, bytes32 indexed strategyHash, uint256 nonce);
    event Docked(address indexed app, bytes32 indexed strategyHash);

    error NotDelegate(address caller);
    error NotDockAuthorised(address caller);
    error MandateExpired(uint256 expiry);
    error MandateAlreadyUsed(uint256 nonce);
    error MandateWrongDelegate(address mandateDelegate, address caller);
    error MandateWrongApp(address mandateApp, address app);
    error NoGuardian();
    error BadMandateSignature();
    error TokenOutsideMandate(address token);
    error AmountAboveMandate(address token, uint256 amount, uint256 maxAmount);
    error LengthMismatch(uint256 tokens, uint256 amounts);
    error RenounceDisabled();

    modifier onlyDelegate() {
        require(msg.sender == delegate, NotDelegate(msg.sender));
        _;
    }

    constructor(address aqua, address initialOwner) Ownable(initialOwner) EIP712("SUBFLOOR AquaGuardVault", "1") {
        AQUA = IAqua(aqua);
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // --- the delegate surface, in full ---------------------------------------------------------

    /// @notice Ship a strategy to canonical Aqua with this vault as the maker.
    /// @dev The approval granted here is finite and to Aqua alone. Aqua's `pull` is the only thing
    ///      that can spend it, and only down to the shipped amount.
    function ship(
        address app,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts,
        Mandate calldata mandate,
        bytes calldata signature
    ) external onlyDelegate returns (bytes32 strategyHash) {
        return _ship(app, strategy, tokens, amounts, mandate, signature);
    }

    function _ship(
        address app,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts,
        Mandate calldata mandate,
        bytes calldata signature
    ) internal returns (bytes32 strategyHash) {
        require(tokens.length == amounts.length, LengthMismatch(tokens.length, amounts.length));
        require(mandate.tokens.length == mandate.maxAmounts.length, LengthMismatch(mandate.tokens.length, mandate.maxAmounts.length));
        _consumeMandate(mandate, app, signature);

        for (uint256 i = 0; i < tokens.length; ++i) {
            uint256 cap = _capFor(mandate, tokens[i]);
            require(amounts[i] <= cap, AmountAboveMandate(tokens[i], amounts[i], cap));

            committed[tokens[i]] += amounts[i];
            IERC20(tokens[i]).forceApprove(address(AQUA), committed[tokens[i]]);
        }

        strategyHash = AQUA.ship(app, strategy, tokens, amounts);
        emit Shipped(app, strategyHash, mandate.nonce);
    }

    /// @notice Stop a strategy. Reachable by the delegate and by any dock operator, because docking
    ///         can only stop trading and never worsen a price — the fail-safe direction, so
    ///         software may hold this key.
    /// @dev Lives on canonical Aqua and is keyed to this vault as maker, so it still works when the
    ///      modified router is compromised or bricked.
    function dock(address app, bytes32 strategyHash, address[] calldata tokens) external {
        require(msg.sender == delegate || dockOperator[msg.sender] || msg.sender == owner(), NotDockAuthorised(msg.sender));

        _dockAndRelease(app, strategyHash, tokens);
        emit Docked(app, strategyHash);
    }

    /// @dev Releases only this strategy's own outstanding balance from the shared allowance, read
    ///      from Aqua before docking clears it. Anything still committed by another live strategy
    ///      keeps its approval.
    function _dockAndRelease(address app, bytes32 strategyHash, address[] calldata tokens) internal {
        uint256[] memory outstanding = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; ++i) {
            (uint248 balance,) = AQUA.rawBalances(address(this), app, strategyHash, tokens[i]);
            outstanding[i] = balance;
        }

        AQUA.dock(app, strategyHash, tokens);

        for (uint256 i = 0; i < tokens.length; ++i) {
            uint256 c = committed[tokens[i]];
            c = outstanding[i] >= c ? 0 : c - outstanding[i];
            committed[tokens[i]] = c;
            IERC20(tokens[i]).forceApprove(address(AQUA), c);
        }
    }

    /// @notice Re-quote a live strategy: dock the old one and ship its replacement, under a fresh
    ///         mandate. Kept as one call so a strategy is never left docked with the agent unable
    ///         to continue.
    function updateQuote(
        address app,
        bytes32 oldStrategyHash,
        address[] calldata tokens,
        bytes calldata newStrategy,
        uint256[] calldata newAmounts,
        Mandate calldata mandate,
        bytes calldata signature
    ) external onlyDelegate returns (bytes32 strategyHash) {
        _dockAndRelease(app, oldStrategyHash, tokens);
        emit Docked(app, oldStrategyHash);
        // Internal, not `this.ship(...)`: an external self-call would make msg.sender the vault
        // and the mandate's delegate binding would check against the wrong address.
        return _ship(app, newStrategy, tokens, newAmounts, mandate, signature);
    }

    /// @notice Drop a stale approval to zero. It can only ever reduce the vault's exposure, so the
    ///         delegate may call it; there is no argument that widens anything. It clears the
    ///         vault's own commitment record with it, so a later ship re-approves only what it ships.
    function rescueApproval(address token) external onlyDelegate {
        committed[token] = 0;
        IERC20(token).forceApprove(address(AQUA), 0);
    }

    // --- owner only ------------------------------------------------------------------------------

    function setDelegate(address newDelegate) external onlyOwner {
        emit DelegateSet(delegate, newDelegate);
        delegate = newDelegate;
    }

    function setGuardian(address newGuardian) external onlyOwner {
        emit GuardianSet(guardian, newGuardian);
        guardian = newGuardian;
    }

    function setDockOperator(address operator, bool allowed) external onlyOwner {
        dockOperator[operator] = allowed;
        emit DockOperatorSet(operator, allowed);
    }

    function withdraw(address token, uint256 amount, address to) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice The way out if this contract is wrong. "A vault bug locking funds" is a stated
    ///         residual risk, so the owner keeps an unrestricted call — and this is exactly why it
    ///         is owner-only and why the delegate can never reach it.
    function execute(address target, uint256 value, bytes calldata data) external onlyOwner returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call{ value: value }(data);
        require(ok, "AquaGuardVault: rescue call failed");
        return ret;
    }

    /// @notice Disabled. Renouncing would permanently remove the owner rescue path, and that path
    ///         is the stated answer to "a vault bug locks the funds". A vault with inventory in it
    ///         and no owner is not decentralised, it is bricked.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    receive() external payable { }

    // --- mandate ----------------------------------------------------------------------------------

    /// @dev `abi.encodePacked` on an array pads each element to 32 bytes, which is exactly EIP-712's
    ///      array rule, so this digest is reproducible by ordinary `signTypedData` tooling and by
    ///      the device's clear-signing path. Checked rather than assumed.
    function hashMandate(Mandate calldata m) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                _MANDATE_TYPEHASH,
                m.delegate,
                m.app,
                keccak256(abi.encodePacked(m.tokens)),
                keccak256(abi.encodePacked(m.maxAmounts)),
                m.nonce,
                m.expiry
            )
        );
    }

    function _consumeMandate(Mandate calldata m, address app, bytes calldata signature) internal {
        require(block.timestamp <= m.expiry, MandateExpired(m.expiry));
        require(!mandateUsed[m.nonce], MandateAlreadyUsed(m.nonce));
        require(m.delegate == msg.sender, MandateWrongDelegate(m.delegate, msg.sender));
        require(m.app == app, MandateWrongApp(m.app, app));

        address signer = guardian;
        require(signer != address(0), NoGuardian());
        require(SignatureChecker.isValidSignatureNow(signer, _hashTypedDataV4(hashMandate(m)), signature), BadMandateSignature());

        mandateUsed[m.nonce] = true;
    }

    /// @dev The per-token cap, or a revert if the token is not in the mandate at all.
    function _capFor(Mandate calldata m, address token) internal pure returns (uint256) {
        for (uint256 i = 0; i < m.tokens.length; ++i) {
            if (m.tokens[i] == token) return m.maxAmounts[i];
        }
        revert TokenOutsideMandate(token);
    }
}
