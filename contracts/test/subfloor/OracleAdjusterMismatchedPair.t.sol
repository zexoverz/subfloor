// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { SwapVM } from "../../src/SwapVM.sol";
import { MakerTraitsLib } from "../../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../../src/libs/TakerTraits.sol";
import { FloorRouter } from "../../src/routers/FloorRouter.sol";
import { FloorRegistry } from "../../src/subfloor/FloorRegistry.sol";
import { AquaGuardVault } from "../../src/subfloor/AquaGuardVault.sol";
import { ConcentratedBook } from "../../src/subfloor/strategies/ConcentratedBook.sol";
import { TokenMockDecimals } from "../mocks/TokenMockDecimals.sol";

/// @dev Chainlink-shaped, answer and timestamp fixed at construction.
contract FeedMock {
    int256 private immutable _answer;
    uint256 private immutable _updatedAt;

    constructor(int256 answer_, uint256 updatedAt_) {
        _answer = answer_;
        _updatedAt = updatedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (0, _answer, 0, _updatedAt, 0);
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }
}

/// @notice The oracle adjuster on a book whose two tokens do not share decimals, which is the pair
///         this deployment trades on testnet and the pair mainnet trades: WETH/USDC, eighteen and
///         six.
///
/// `ConcentratedBook.t.sol` runs the same gate on an eighteen-and-eighteen fixture, and that fixture
/// is why the bug in #175 survived: on a matched pair the feed answer rescaled to 1e18 and the swap
/// price in raw units are the same scale, so the arithmetic reads correctly and tests pass. On this
/// pair the raw price is 1e12 smaller, and upstream's adjuster therefore found the feed better on
/// every fill and handed the taker `2e18 - maxPriceDecay`: twice the tokenOut the curve priced,
/// without reverting.
///
/// So the property under test is not "the adjuster improves the fill". It is "the adjuster improves
/// the fill by the amount the feed is actually better by", which is the assertion the old fixture
/// could not distinguish from the bug.
contract OracleAdjusterMismatchedPairTest is Test {
    Aqua internal aqua;
    FloorRegistry internal registry;
    /// The shipped router, not a test-local full set: `SubfloorOpcodes` dispatches the adjuster,
    /// so the property under test is what the deployment actually runs.
    FloorRouter internal router;
    AquaGuardVault internal vault;

    /// Eighteen decimals and six, sorted into the book's `tokenA < tokenB` on address. Which way
    /// round they land is not ours to choose, so the test derives the reference and the feed's
    /// direction from the ordering rather than assuming one.
    TokenMockDecimals internal weth;
    TokenMockDecimals internal usdc;
    address internal tokenA;
    address internal tokenB;
    bool internal wethIsA;

    address internal owner = makeAddr("owner");
    address internal agent;
    uint256 internal agentPK = 0xA6E27;
    address internal ledger;
    uint256 internal ledgerPK = 0x1EDCE1;

    bytes32 internal constant MANDATE_TYPEHASH =
        keccak256("Mandate(address delegate,address app,address[] tokens,uint256[] maxAmounts,uint256 nonce,uint256 expiry)");

    /// $2,478.67 per WETH, in the feed's eight decimals.
    int256 internal constant FEED_ANSWER = 247_867e6;
    uint8 internal constant FEED_DECIMALS = 8;

    /// The same price the curve is centred on, in raw units: 2478.67e6 tUSDC per 1e18 wei.
    uint256 internal constant REFERENCE_WETH_TO_USDC = 2_478_670_000;

    uint16 internal constant SPREAD_BPS = 500;

    uint256 internal constant INVENTORY_WETH = 1_000e18;
    uint256 internal constant INVENTORY_USDC = 5_000_000e6;

    uint256 internal nextNonce;

    function setUp() public {
        agent = vm.addr(agentPK);
        ledger = vm.addr(ledgerPK);
        vm.warp(1_757_000_000);

        aqua = new Aqua();
        registry = new FloorRegistry(address(this), 0);
        router = new FloorRouter(address(aqua), address(0), owner, address(registry));
        vault = new AquaGuardVault(address(aqua), owner);

        weth = new TokenMockDecimals("Wrapped Ether", "WETH", 18);
        usdc = new TokenMockDecimals("Test USDC", "tUSDC", 6);

        wethIsA = address(weth) < address(usdc);
        (tokenA, tokenB) = wethIsA ? (address(weth), address(usdc)) : (address(usdc), address(weth));

        weth.mint(address(vault), INVENTORY_WETH);
        usdc.mint(address(vault), INVENTORY_USDC);

        vm.startPrank(owner);
        vault.setDelegate(agent);
        vault.setGuardian(ledger);
        vm.stopPrank();
    }

    /// The fixture is the pair it claims to be. Without this the rest of the file could be quietly
    /// testing an eighteen-and-eighteen book again, which is exactly how #175 stayed hidden.
    function test_theFixtureIsAMismatchedPair() public view {
        assertEq(weth.decimals(), 18, "WETH is eighteen");
        assertEq(usdc.decimals(), 6, "tUSDC is six");
    }

    /// A book with no feed prices at the curve, which is the baseline everything else is read
    /// against.
    function test_theCurveAlonePricesAtTheReference() public {
        ISwapVM.Order memory order = _ship(_book(address(0), 0));
        assertApproxEqRel(_quoteWethIn(order, 1e18), REFERENCE_WETH_TO_USDC, 0.02e18, "one WETH buys ~2,478 tUSDC");
    }

    /// The whole of #175 in one assertion. The feed sits a fraction above the curve, so the correct
    /// adjustment is a fraction; upstream's arithmetic found the feed 1e12 better on any input and
    /// handed over the clamp instead. A feed *below* the curve would not discriminate between the
    /// two, because the fixed path returns early and the broken one does not reach that branch —
    /// which is why this case is priced deliberately tight rather than at the reference.
    function test_aFeedJustAboveTheCurveMovesTheFillJustAbove() public {
        uint256 plain = _quoteWethIn(_ship(_book(address(0), 0)), 1e18);
        uint256 adjusted = _quoteWethIn(_ship(_book(address(new FeedMock(253_000e6, block.timestamp)), 1)), 1e18);

        assertGt(adjusted, plain, "the feed is better, so the taker gets it");
        assertApproxEqRel(adjusted, 2_530_000_000, 0.001e18, "and gets the feed price, not a multiple of it");
        assertLt(adjusted, (plain * 101) / 100, "under one percent of movement, where upstream paid one hundred");
    }

    /// A feed that really is better moves the fill by what it is better by. `maxPriceDecay` is at
    /// its most permissive, so nothing but the arithmetic is holding the number down.
    function test_aBetterFeedMovesTheFillByTheRealDifference() public {
        uint256 plain = _quoteWethIn(_ship(_book(address(0), 0)), 1e18);
        uint256 adjusted = _quoteWethIn(_ship(_book(address(new FeedMock(260_000e6, block.timestamp)), 1)), 1e18);

        assertGt(adjusted, plain, "the taker gets the feed price");
        assertApproxEqRel(adjusted, 2_600_000_000, 0.01e18, "and it is the feed price, in tUSDC's six decimals");
        assertLt(adjusted, plain * 2, "nowhere near the clamp");
    }

    /// Adjustment is one-directional: a feed below the curve is the maker's spread, not a reason to
    /// reprice.
    function test_aWorseFeedIsIgnored() public {
        uint256 plain = _quoteWethIn(_ship(_book(address(0), 0)), 1e18);
        uint256 adjusted = _quoteWethIn(_ship(_book(address(new FeedMock(200_000e6, block.timestamp)), 1)), 1e18);

        assertEq(adjusted, plain, "the maker keeps the spread");
    }

    /// Declaring the decimals is the maker's job, and getting it wrong is not free. Pinned so that
    /// the cost of the design is written down next to the design.
    function test_misdeclaringTheDecimalsIsExpensiveToTheMaker() public {
        ConcentratedBook.Book memory book = _book(address(new FeedMock(FEED_ANSWER, block.timestamp)), 2);
        // Claim both sides are eighteen, which is what the old fixture assumed and upstream's
        // arithmetic hard-coded.
        book.oracle.tokenADecimals = 18;
        book.oracle.tokenBDecimals = 18;

        uint256 plain = _quoteWethIn(_ship(_book(address(0), 0)), 1e18);
        uint256 misdeclared = _quoteWethIn(_ship(book), 1e18);

        assertEq(misdeclared, plain * 2, "the taker is handed the clamp, exactly as in #175");
    }

    // --- helpers ----------------------------------------------------------------------------------

    /// A book centred on the reference, no fee and no decay, so the only thing moving the quote
    /// between cases is the oracle.
    function _book(address feed, uint64 salt) internal view returns (ConcentratedBook.Book memory book) {
        uint256 centre = wethIsA
            ? REFERENCE_WETH_TO_USDC
            : (1e18 * 1e18) / REFERENCE_WETH_TO_USDC;

        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(centre, SPREAD_BPS);
        book.sqrtPriceMin = lo;
        book.sqrtPriceMax = hi;
        book.salt = salt;

        if (feed == address(0)) return book;

        // The feed prices tUSDC per WETH, so the direction it is quoted for is whichever one has
        // WETH going in. `_adjusterDecimals` reads the pair the same way round.
        book.oracle = ConcentratedBook.Oracle({
            feed: feed,
            maxStaleness: 3600,
            decimals: FEED_DECIMALS,
            maxPriceDecay: 0,
            onDirectionAToB: wethIsA,
            tokenADecimals: wethIsA ? 18 : 6,
            tokenBDecimals: wethIsA ? 6 : 18
        });
    }

    function _ship(ConcentratedBook.Book memory book) internal returns (ISwapVM.Order memory order) {
        order = _order(ConcentratedBook.build(book));

        address[] memory tokens = new address[](2);
        tokens[0] = tokenA;
        tokens[1] = tokenB;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = wethIsA ? INVENTORY_WETH : INVENTORY_USDC;
        amounts[1] = wethIsA ? INVENTORY_USDC : INVENTORY_WETH;

        uint256[] memory caps = new uint256[](2);
        caps[0] = type(uint128).max;
        caps[1] = type(uint128).max;

        AquaGuardVault.Mandate memory mandate = AquaGuardVault.Mandate({
            delegate: agent,
            app: address(router),
            tokens: tokens,
            maxAmounts: caps,
            nonce: nextNonce++,
            expiry: block.timestamp + 1 days
        });

        // Signed before the prank: `_sign` reads `DOMAIN_SEPARATOR()` off the vault, and a call made
        // while a one-shot prank is armed consumes it.
        bytes memory signature = _sign(mandate, ledgerPK);

        vm.prank(agent);
        vault.ship(address(router), abi.encode(order), tokens, amounts, mandate, signature);
    }

    /// @notice tUSDC out for `amount` wei in, whichever way round the pair sorted.
    function _quoteWethIn(ISwapVM.Order memory order, uint256 amount) internal view returns (uint256 amountOut) {
        (, amountOut,) = ISwapVM(address(router)).quote(order, amount, _takerData(wethIsA));
    }

    function _order(bytes memory program) internal view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: address(vault),
            tokenA: tokenA,
            tokenB: tokenB,
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
            program: program
        }));
    }

    function _takerData(bool isAToB) internal view returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: address(this),
            isExactIn: true,
            shouldUnwrapWeth: false,
            isStrictThresholdAmount: false,
            isFirstTransferFromTaker: false,
            useTransferFromAndAquaPush: false,
            isAToB: isAToB,
            allowPartialFill: false,
            threshold: "",
            to: address(0),
            deadline: 0,
            hasPreTransferInCallback: true,
            hasPreTransferOutCallback: false,
            preTransferInHookData: "",
            postTransferInHookData: "",
            preTransferOutHookData: "",
            postTransferOutHookData: "",
            preTransferInCallbackData: "",
            preTransferOutCallbackData: "",
            instructionsArgs: "",
            signature: ""
        }));
    }

    function _sign(AquaGuardVault.Mandate memory m, uint256 pk) internal view returns (bytes memory) {
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
}
