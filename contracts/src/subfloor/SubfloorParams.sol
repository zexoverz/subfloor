// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd (SwapVM), © 2026 SUBFLOOR (this file)

/// @title SubfloorParams
/// @notice Deployment parameters that are measurements, not preferences. Each one carries where
///         its number came from, so a later session can tell a reading from a guess.
library SubfloorParams {
    /// @notice Base ETH/USD Chainlink aggregator. `description()` returned "ETH / USD" on an
    ///         `eth_call` against Base mainnet, 3 Sep 2026.
    address internal constant BASE_ETH_USD_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;
    uint8 internal constant BASE_ETH_USD_DECIMALS = 8;

    /// @notice Staleness bound for the Base ETH/USD reference, in seconds. **PROVISIONAL.**
    ///
    /// Measured, not guessed: the gap sampler (`chainlink_gap.py`, running under `--loop` since
    /// 3 Sep) had 124 rounds over 20.6 hours at the 4 Sep read, giving inter-round gaps of
    /// p50 210s, p90 1230s, p99 1232s, max 1232s. This constant is 2x that observed max.
    ///
    /// Why it is still provisional: those 20.6 hours were an active market, and the observed max
    /// is therefore a lower bound on the real worst case. What actually binds this number is the
    /// feed's heartbeat during a flat weekend, which has not been observed yet. Re-read the
    /// sampler after a quiet period and revise before the number is published anywhere.
    ///
    /// Why not 300s: it is the round number a reasonable person reaches for, it sits above the
    /// p50 but well below the observed p90, and a bound there would fail the vault closed through
    /// ordinary quiet periods — safe in direction, unusable in practice.
    uint32 internal constant ETH_USD_STALENESS_BOUND_PROVISIONAL = 2464;

    /// @notice Canonical Aqua registry on Base. Sourcify exact_match (creation and runtime),
    ///         verified 2026-07-19; live code confirmed by RPC.
    address internal constant BASE_AQUA = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;

    /// @notice Canonical AquaSwapVMRouter on Base. Sourcify exact_match, verified 2026-07-30.
    address internal constant BASE_AQUA_SWAPVM_ROUTER = 0x111111338c5091E8440b67B168bAe16a668AC0De;

    address internal constant BASE_WETH = 0x4200000000000000000000000000000000000006;
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
}
