// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { AquaGuardVault } from "./AquaGuardVault.sol";

/// @title VaultFactory
/// @notice Deploys an `AquaGuardVault` owned by whoever asks for one.
///
/// The floor itself never needed this. `FloorRegistry` is recipient-keyed, so anyone can set a floor
/// for themselves and be protected on every fill through the router without deploying anything. A
/// vault answers a narrower question: how an agent trades on your behalf without ever holding a key
/// to your funds.
///
/// This exists so that question has an answer for someone other than us. Without it the interface
/// offers an experience nobody but the deployer can have.
///
/// Deliberately thin. It holds no funds, has no owner, and takes no fee — the vault it deploys is
/// the audited thing, and a factory that could be upgraded or paused would put a trusted party back
/// into a design whose whole argument is that there is not one.
contract VaultFactory {
    /// @notice Canonical Aqua. Fixed at deployment: a factory that could point new vaults at a
    ///         different Aqua would be a way to redirect where inventory goes.
    address public immutable AQUA;

    /// @notice Every vault this factory has deployed, in order.
    address[] public vaults;

    /// @notice Vaults by owner. An owner may have several — one per mandate relationship is the
    ///         expected shape, not one per person.
    mapping(address => address[]) public vaultsOf;

    event VaultCreated(address indexed owner, address indexed vault, uint256 index);

    constructor(address aqua) {
        AQUA = aqua;
    }

    /// @notice Deploy a vault owned by the caller.
    /// @dev Ownership goes to `msg.sender` directly rather than to the factory, so the factory is
    ///      never in a position to act on a vault it created.
    function createVault() external returns (address vault) {
        vault = address(new AquaGuardVault(AQUA, msg.sender));

        vaults.push(vault);
        vaultsOf[msg.sender].push(vault);

        emit VaultCreated(msg.sender, vault, vaults.length - 1);
    }

    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }

    /// @notice Every vault an owner has, for the interface to find without walking events.
    function vaultsOfOwner(address owner) external view returns (address[] memory) {
        return vaultsOf[owner];
    }
}
