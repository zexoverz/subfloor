// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

import { AquaGuardVault } from "./AquaGuardVault.sol";
import { FloorRegistry } from "./FloorRegistry.sol";

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
        _record(vault);
    }

    /// @notice What a vault needs before it is safe to fund, in one transaction.
    ///
    /// @dev Onboarding was nine transactions, and three of them were `execute` carrying ABI-encoded
    ///      calldata. A wallet renders that as "Execute" over an unreadable blob, which is the shape
    ///      a drainer asks for — a poor thing for a security product to teach a user in their first
    ///      minute, and a worse habit to leave them with.
    ///
    ///      The friction was not the real cost. A vault existed and could trade from the moment
    ///      `createVault` returned, so a user who stopped halfway owned something that looked
    ///      finished and had no floor. This closes that window rather than shortening it: the vault
    ///      that exists is the vault that is protected, because there is no moment in between.
    struct InitialSetup {
        address delegate;
        address guardian;
        /// The floor registry. Zero configures no floors, for a vault that only wants custody.
        address registry;
        /// Ordered pairs. `base[i]` is what the vault gives up, `quote[i]` what it receives.
        address[] base;
        address[] quote;
        uint16[] maxAdverseBps;
        uint256[] absoluteRate;
    }

    error SetupLengthMismatch();

    /// @notice Deploy a vault and configure it, ending owned by the caller.
    ///
    /// @dev The factory owns the vault for the length of this call and hands it over before
    ///      returning. The property the comment above defends — that the factory is never in a
    ///      position to act on a vault it created — holds where it matters: the only window is
    ///      before the caller has funded anything, and the factory is ownerless, immutable, holds no
    ///      funds and has no path that outlives this function.
    ///
    ///      Doing it here rather than in the vault's constructor is deliberate. `AquaGuardVault` is
    ///      the audited contract and it is deployed and verified; changing its constructor would
    ///      leave the live vault matching no commit, which is the exact problem #167 cost a day to
    ///      unpick. Only the factory address moves.
    function createVault(InitialSetup calldata setup) external returns (address vault) {
        require(
            setup.base.length == setup.quote.length && setup.base.length == setup.maxAdverseBps.length
                && setup.base.length == setup.absoluteRate.length,
            SetupLengthMismatch()
        );

        AquaGuardVault v = new AquaGuardVault(AQUA, address(this));

        if (setup.delegate != address(0)) v.setDelegate(setup.delegate);
        if (setup.guardian != address(0)) v.setGuardian(setup.guardian);

        if (setup.registry != address(0)) {
            // The registry-side guardian, which is a different one from the vault's and is the one
            // that gets missed. Skipping it is completely silent: the vault trades, and `lowerFloor`
            // reverts `NoGuardianRegistered` forever. Our own first deployment shipped that way.
            if (setup.guardian != address(0)) {
                v.execute(setup.registry, 0, abi.encodeCall(FloorRegistry.setGuardian, (setup.guardian)));
            }

            // Keyed to the vault, because the vault is the recipient at settlement. A floor raised by
            // the owner instead protects an address that never appears in a fill — #130.
            for (uint256 i = 0; i < setup.base.length; ++i) {
                v.execute(
                    setup.registry,
                    0,
                    abi.encodeCall(
                        FloorRegistry.raiseFloor,
                        (setup.base[i], setup.quote[i], setup.maxAdverseBps[i], setup.absoluteRate[i])
                    )
                );
            }
        }

        v.transferOwnership(msg.sender);

        vault = address(v);
        _record(vault);
    }

    function _record(address vault) internal {
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
