// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { ISwapVM } from "../../src/interfaces/ISwapVM.sol";
import { SwapVM } from "../../src/SwapVM.sol";
import { Context } from "../../src/libs/VM.sol";
import { MakerTraitsLib } from "../../src/libs/MakerTraits.sol";
import { TakerTraitsLib } from "../../src/libs/TakerTraits.sol";
import { Opcodes } from "../../src/opcodes/Opcodes.sol";
import { AquaOpcodes } from "../../src/opcodes/AquaOpcodes.sol";
import { FloorRouter } from "../../src/routers/FloorRouter.sol";
import { GuardedSwapVM } from "../../src/subfloor/GuardedSwapVM.sol";
import { FloorRegistry } from "../../src/subfloor/FloorRegistry.sol";
import { IFloorRegistry } from "../../src/subfloor/IFloorRegistry.sol";
import { AquaGuardVault } from "../../src/subfloor/AquaGuardVault.sol";
import { ConcentratedBook } from "../../src/subfloor/strategies/ConcentratedBook.sol";
import { Salt } from "../../src/instructions/Controls.sol";
import { JumpIfDirection } from "../../src/instructions/Jumps.sol";
import { Decay } from "../../src/instructions/Decay.sol";
import { FeeFlatIn } from "../../src/instructions/FeeFlat.sol";
import { XYCConcentrateSwap } from "../../src/instructions/XYCConcentrate.sol";
import { OraclePriceAdjuster } from "../../src/instructions/OraclePriceAdjuster.sol";
import { ValidateSeriesEpoch } from "../../src/instructions/SeriesEpochManager.sol";
import { MockTaker } from "../mocks/MockTaker.sol";

/// @dev A Chainlink-shaped feed with no `decimals()`, so a book that omits `oracle.decimals` would
///      revert rather than silently read a default. The books here always name it.
contract FeedMock {
    int256 public answer;
    uint256 public updatedAt;

    constructor(int256 answer_, uint256 updatedAt_) {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function set(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

/// @dev The deployed `FloorRouter` dispatches `AquaOpcodes`, which carries the curve, the decay and
///      the fee but neither `ValidateSeriesEpoch` nor `OraclePriceAdjuster`. This router is the
///      same settlement guard over the full instruction set, so the two optional pieces of the book
///      can be exercised for real instead of asserted from their encoding.
contract FullSetFloorRouter is Simulator, GuardedSwapVM, Opcodes {
    constructor(address aqua, address weth, address owner, address floorRegistry)
        SwapVM(aqua, weth, owner, "SwapVM", "1.0.0")
        GuardedSwapVM(floorRegistry)
    { }

    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        _runOpcode(ctx, opcode, args);
    }
}

/// @notice The 1inch "sophisticated position": one concentrated two-sided book on shared inventory,
///         shipped by the vault under a device-signed mandate, filled on both sides through the
///         router that checks the floor at settlement.
contract ConcentratedBookTest is Test {
    Aqua internal aqua;
    FloorRegistry internal registry;
    FloorRouter internal router;
    FullSetFloorRouter internal fullRouter;
    AquaGuardVault internal vault;
    MockTaker internal taker;
    MockTaker internal fullTaker;

    /// @dev Two 18-decimal mocks standing in for WETH/USDC. Same decimals on both sides, so the
    ///      raw-unit price the curve works in is also the human one and the arithmetic below reads
    ///      as it would on paper. `ConcentratedBook.bounds` carries the raw-unit rule for the pairs
    ///      where the two differ.
    TokenMock internal tokenA;
    TokenMock internal tokenB;

    address internal owner = makeAddr("owner");
    address internal agent;
    uint256 internal agentPK = 0xA6E27;
    address internal ledger;
    uint256 internal ledgerPK = 0x1EDCE1;

    bytes32 internal constant MANDATE_TYPEHASH =
        keccak256("Mandate(address delegate,address app,address[] tokens,uint256[] maxAmounts,uint256 nonce,uint256 expiry)");

    /// tokenB per tokenA. The book is symmetric around it.
    uint256 internal constant REFERENCE = 2500e18;
    uint16 internal constant SPREAD_BPS = 500;
    /// `FeeFlatIn` denominates in 1e7, not 1e4: 1e4 here is 10 bps.
    uint24 internal constant FEE = 1e4;
    uint16 internal constant DECAY_PERIOD = 300;

    uint256 internal constant INVENTORY_A = 10e18;
    uint256 internal constant INVENTORY_B = 25_000e18;

    uint32 internal constant SERIES = 7;

    /// The vault's own floor on the pair it gives tokenB for: at least this much tokenA per tokenB.
    /// Between the rate a 1e18 fill realises and the rate a 5e18 one does, so it binds the first
    /// and not the second.
    uint256 internal constant MAKER_FLOOR = 4.03e14;
    /// What a 1e18 fill actually realises against the book built by `_book()`. Written down rather
    /// than read back, so a change to the book breaks this test instead of moving with it.
    uint256 internal constant SMALL_FILL_RATE = 401_878_463_647_935;

    uint256 internal nextNonce;

    function setUp() public {
        agent = vm.addr(agentPK);
        ledger = vm.addr(ledgerPK);

        vm.warp(1_757_000_000);

        aqua = new Aqua();
        registry = new FloorRegistry(address(this), 0);
        router = new FloorRouter(address(aqua), address(0), owner, address(registry));
        fullRouter = new FullSetFloorRouter(address(aqua), address(0), owner, address(registry));
        vault = new AquaGuardVault(address(aqua), owner);

        taker = new MockTaker(aqua, SwapVM(payable(address(router))), address(this));
        fullTaker = new MockTaker(aqua, SwapVM(payable(address(fullRouter))), address(this));

        tokenA = new TokenMock("Token I", "TKI");
        tokenB = new TokenMock("Token J", "TKJ");
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);

        tokenA.mint(address(vault), 1_000e18);
        tokenB.mint(address(vault), 5_000_000e18);

        vm.startPrank(owner);
        vault.setDelegate(agent);
        vault.setGuardian(ledger);
        vm.stopPrank();
    }

    // --- the program ------------------------------------------------------------------------------

    /// The bytes, spelled out. A builder that silently reorders the wrapping instructions would
    /// still produce a program that runs, and would quote a different book.
    function test_theBookBuildsToTheInstructionsItClaims() public pure {
        ConcentratedBook.Book memory book = _book();

        assertEq(
            ConcentratedBook.build(book),
            bytes.concat(
                Salt.build(book.salt),
                Decay.build(DECAY_PERIOD),
                FeeFlatIn.build(FEE),
                XYCConcentrateSwap.build(book.sqrtPriceMin, book.sqrtPriceMax)
            ),
            "the Aqua-set book"
        );

        ConcentratedBook.Book memory pinned = _book();
        pinned.pinnedToSeries = true;
        pinned.seriesId = SERIES;
        pinned.epoch = 0;
        pinned.oracle = ConcentratedBook.Oracle({
            feed: address(0xFEED),
            maxStaleness: 3600,
            decimals: 8,
            maxPriceDecay: 0.9e18,
            onDirectionAToB: true,
            // Deliberately not the fixture's own decimals. Only the bytes are under test here, and
            // two different numbers catch a builder that pushes them the wrong way round.
            tokenADecimals: 18,
            tokenBDecimals: 6
        });

        bytes memory expected = bytes.concat(
            Salt.build(pinned.salt),
            ValidateSeriesEpoch.build(SERIES, 0),
            Decay.build(DECAY_PERIOD),
            FeeFlatIn.build(FEE),
            XYCConcentrateSwap.build(pinned.sqrtPriceMin, pinned.sqrtPriceMax),
            JumpIfDirection.build(false, uint16(ConcentratedBook.sizeOf(pinned))),
            OraclePriceAdjuster.build(0.9e18, 3600, 8, 18, 6, address(0xFEED))
        );
        assertEq(ConcentratedBook.build(pinned), expected, "the full-set book");
        assertEq(expected.length, ConcentratedBook.sizeOf(pinned), "sizeOf agrees with build");
    }

    /// The range is symmetric in price, which is not the same as symmetric in its square root.
    function test_boundsBracketTheReference() public pure {
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(REFERENCE, SPREAD_BPS);

        assertLt(lo * lo / 1e18, REFERENCE, "lower bound below the reference");
        assertGt(hi * hi / 1e18, REFERENCE, "upper bound above it");
        assertApproxEqRel(lo * lo / 1e18, REFERENCE * (10_000 - SPREAD_BPS) / 10_000, 1e12);
        assertApproxEqRel(hi * hi / 1e18, REFERENCE * (10_000 + SPREAD_BPS) / 10_000, 1e12);
    }

    function test_aZeroSpreadIsRefused() public {
        vm.expectRevert(abi.encodeWithSelector(ConcentratedBook.ConcentratedBookBadSpread.selector, REFERENCE, uint16(0)));
        this.buildBounds(REFERENCE, 0);
    }

    // --- shipping ---------------------------------------------------------------------------------

    /// One ship, one mandate, one strategy hash, and both tokens behind the same allowance. The
    /// book quotes both sides off this single shipped inventory.
    function test_theBookShipsThroughTheVaultUnderAMandate() public {
        (ISwapVM.Order memory order, bytes32 strategyHash) = _shipBook(_book(), address(router));

        assertEq(strategyHash, router.hash(order), "Aqua keyed the strategy by the order hash");

        (uint256 balA, uint256 balB) = aqua.safeBalances(address(vault), address(router), strategyHash, address(tokenA), address(tokenB));
        assertEq(balA, INVENTORY_A);
        assertEq(balB, INVENTORY_B);
    }

    // --- both sides -------------------------------------------------------------------------------

    /// A two-sided book is one that answers in both directions off the same coins. Quoting is the
    /// cheap proof; the fills below are the expensive one.
    function test_itQuotesBothDirections() public {
        (ISwapVM.Order memory order,) = _shipBook(_book(), address(router));

        (uint256 inAB, uint256 outAB) = _quote(order, 1e18, true);
        (uint256 inBA, uint256 outBA) = _quote(order, 2_500e18, false);

        assertEq(inAB, 1e18);
        assertApproxEqRel(outAB, 2_500e18, 0.05e18, "tokenA sells near the reference");

        assertEq(inBA, 2_500e18);
        assertApproxEqRel(outBA, 1e18, 0.05e18, "and tokenB buys it back near the reference");
    }

    /// Both fills, in one test, against one position. The second direction is served out of the
    /// inventory the first one moved, which is what "shared inventory" means and what two separate
    /// one-sided orders would not give.
    function test_itFillsBothDirectionsThroughTheFloorRouter() public {
        (ISwapVM.Order memory order, bytes32 strategyHash) = _shipBook(_book(), address(router));

        _fund(taker, 1e18, true);
        (uint256 inAB, uint256 outAB) = _swap(order, 1e18, true);
        assertEq(inAB, 1e18);
        assertGt(outAB, 0);
        assertEq(tokenB.balanceOf(address(taker)), outAB, "the taker was paid in tokenB");

        (uint256 balA, uint256 balB) = aqua.safeBalances(address(vault), address(router), strategyHash, address(tokenA), address(tokenB));
        assertEq(balA, INVENTORY_A + inAB, "the book took the tokenA in");
        assertEq(balB, INVENTORY_B - outAB, "and paid the tokenB out");

        // Past the decay window, so the counter-swap is priced by the curve rather than by the
        // penalty the first fill left behind. That the penalty exists is Decay's own test.
        vm.warp(block.timestamp + DECAY_PERIOD + 1);

        _fund(taker, 2_500e18, false);
        (uint256 inBA, uint256 outBA) = _swap(order, 2_500e18, false);
        assertEq(inBA, 2_500e18);
        assertGt(outBA, 0);

        (balA, balB) = aqua.safeBalances(address(vault), address(router), strategyHash, address(tokenA), address(tokenB));
        assertEq(balA, INVENTORY_A + inAB - outBA, "the same inventory, the other way");
        assertEq(balB, INVENTORY_B - outAB + inBA);
    }

    // --- the floor --------------------------------------------------------------------------------

    /// The point of the whole system. The book is the thing being guaranteed; this is the
    /// guarantee. Nothing in the program above mentions the floor, and the fill is refused anyway.
    ///
    /// The floor is a fixed number, not one read back from the quote, so it stays put when the book
    /// changes: widen the spread and this test starts failing rather than quietly re-deriving a
    /// floor the new book happens to clear. Price impact means the maker's rate *improves* with
    /// size on a constant-product curve, so the same floor that refuses a 1e18 fill lets a 5e18 one
    /// through — which is what makes this a floor rather than a switch that turns the book off.
    function test_aFillBelowTheVaultsFloorReverts() public {
        (ISwapVM.Order memory order,) = _shipBook(_book(), address(router));

        // The maker gives tokenB and receives tokenA, so its rate is scored on that pair: tokenA
        // received per tokenB given. 4.03e14 is one tokenA per 2481 tokenB, a little under the
        // 2500 reference — the most the vault will pay for a tokenA.
        vm.prank(owner);
        vault.execute(
            address(registry),
            0,
            abi.encodeCall(FloorRegistry.raiseFloor, (address(tokenB), address(tokenA), uint16(10_000), MAKER_FLOOR))
        );

        _fund(taker, 1e18, true);
        vm.expectRevert(
            abi.encodeWithSelector(
                IFloorRegistry.SettledBelowFloor.selector, address(vault), address(tokenB), address(tokenA), SMALL_FILL_RATE, MAKER_FLOOR
            )
        );
        _swap(order, 1e18, true);

        // And the quote refuses identically, so a taker is never shown a rate settlement would
        // reject.
        vm.expectRevert(
            abi.encodeWithSelector(
                IFloorRegistry.SettledBelowFloor.selector, address(vault), address(tokenB), address(tokenA), SMALL_FILL_RATE, MAKER_FLOOR
            )
        );
        _quote(order, 1e18, true);

        // Teeth, in the other direction: the floor is a minimum on the rate, not a halt.
        (uint256 bigIn, uint256 bigOut) = _quote(order, 5e18, true);
        assertGt(bigIn * 1e18 / bigOut, MAKER_FLOOR, "a larger fill realises a better maker rate");
        _fund(taker, 5e18, true);
        (uint256 filledIn,) = _swap(order, 5e18, true);
        assertEq(filledIn, 5e18, "and it settles under the same floor");
    }

    // --- the optional pieces ----------------------------------------------------------------------

    /// Mass invalidation. One book here, but the epoch is maker-scoped and series-scoped, so the
    /// same increment cancels every book pinned to the series at once — the point of pinning.
    function test_advancingTheSeriesEpochCancelsTheBook() public {
        ConcentratedBook.Book memory book = _book();
        book.pinnedToSeries = true;
        book.seriesId = SERIES;

        (ISwapVM.Order memory order,) = _shipBook(book, address(fullRouter));

        _fund(fullTaker, 1e18, true);
        (uint256 amountIn,) = _swapOn(fullRouter, fullTaker, order, 1e18, true);
        assertEq(amountIn, 1e18, "it fills while the epoch matches");

        vm.prank(owner);
        vault.execute(address(fullRouter), 0, abi.encodeWithSignature("seriesEpochIncrease(uint256)", uint256(SERIES)));

        _fund(fullTaker, 1e18, true);
        vm.expectRevert(
            abi.encodeWithSelector(ValidateSeriesEpoch.ValidateSeriesEpochWrongEpoch.selector, address(vault), uint256(SERIES), uint256(0), uint256(1))
        );
        _swapOn(fullRouter, fullTaker, order, 1e18, true);
    }

    /// The adjuster hands the taker the feed price when it beats the curve. It is single-direction
    /// by construction, so the book emits it behind a `JumpIfDirection`: applying it to both sides
    /// would give the spread away twice. This is that gate, measured.
    ///
    /// @dev The declared decimals are the fixture's, eighteen on both sides, which is the case the
    ///      adjuster was always safe on. `OracleAdjusterMismatchedPair.t.sol` runs the same gate on
    ///      an eighteen-and-six pair, which is where it was not.
    function test_theOracleImprovesOneDirectionAndLeavesTheOtherAlone() public {
        FeedMock feed = new FeedMock(int256(2_600e8), block.timestamp);

        ConcentratedBook.Book memory plain = _book();
        (ISwapVM.Order memory plainOrder,) = _shipBook(plain, address(fullRouter));

        ConcentratedBook.Book memory adjusted = _book();
        adjusted.salt = plain.salt + 1;
        adjusted.oracle = ConcentratedBook.Oracle({
            feed: address(feed),
            maxStaleness: 3600,
            decimals: 8,
            maxPriceDecay: 0.9e18,
            onDirectionAToB: true,
            tokenADecimals: 18,
            tokenBDecimals: 18
        });
        (ISwapVM.Order memory adjustedOrder,) = _shipBook(adjusted, address(fullRouter));

        (, uint256 plainOutAB) = _quoteOn(fullRouter, plainOrder, 1e18, true);
        (, uint256 adjustedOutAB) = _quoteOn(fullRouter, adjustedOrder, 1e18, true);
        assertGt(adjustedOutAB, plainOutAB, "the taker gets the feed price on the feed's direction");

        (, uint256 plainOutBA) = _quoteOn(fullRouter, plainOrder, 2_500e18, false);
        (, uint256 adjustedOutBA) = _quoteOn(fullRouter, adjustedOrder, 2_500e18, false);
        assertEq(adjustedOutBA, plainOutBA, "and nothing at all on the other one");
    }

    /// A pinned book runs on the deployed router.
    ///
    /// This test used to assert the opposite, and it was right to at the time: `AquaOpcodes` is the
    /// upstream set and it dispatches the curve, the decay and the fee but not `ValidateSeriesEpoch`,
    /// so a book that pinned a series built fine and reverted `UnknownOpcode` at fill time. §4's
    /// position is mass-invalidatable as a series, so the router was refusing a program the
    /// submission claims it runs. `SubfloorOpcodes` now dispatches it, at a measured +1,089 bytes
    /// for the three additions, leaving 593 under EIP-170.
    ///
    /// Kept pointed at the shipped router on purpose. The property worth pinning is not "the
    /// upstream set lacks an opcode" — that is upstream's business — it is "the thing we deploy runs
    /// the position we describe".
    function test_aPinnedBookRunsOnTheDeployedRouter() public {
        ConcentratedBook.Book memory book = _book();
        book.pinnedToSeries = true;
        book.seriesId = SERIES;

        (ISwapVM.Order memory order,) = _shipBook(book, address(router));

        _fund(taker, 1e18, true);
        (, uint256 amountOut) = _swap(order, 1e18, true);
        assertGt(amountOut, 0, "a pinned book fills like any other");
    }

    // --- helpers ----------------------------------------------------------------------------------

    /// @dev External so `expectRevert` sees a call frame rather than an inlined library revert.
    function buildBounds(uint256 referencePrice, uint16 spreadBps) external pure returns (uint256, uint256) {
        return ConcentratedBook.bounds(referencePrice, spreadBps);
    }

    function _book() internal pure returns (ConcentratedBook.Book memory book) {
        (uint256 lo, uint256 hi) = ConcentratedBook.bounds(REFERENCE, SPREAD_BPS);

        book.sqrtPriceMin = lo;
        book.sqrtPriceMax = hi;
        book.feeBps = FEE;
        book.decayPeriod = DECAY_PERIOD;
        book.salt = 0xB00C;
    }

    function _shipBook(ConcentratedBook.Book memory book, address app)
        internal
        returns (ISwapVM.Order memory order, bytes32 strategyHash)
    {
        order = _order(ConcentratedBook.build(book));

        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = INVENTORY_A;
        amounts[1] = INVENTORY_B;

        uint256[] memory caps = new uint256[](2);
        caps[0] = 100e18;
        caps[1] = 1_000_000e18;

        AquaGuardVault.Mandate memory mandate = AquaGuardVault.Mandate({
            delegate: agent,
            app: app,
            tokens: tokens,
            maxAmounts: caps,
            nonce: nextNonce++,
            expiry: block.timestamp + 1 days
        });

        // Signed before the prank: `_sign` reads `DOMAIN_SEPARATOR()` off the vault, and a call
        // made while a one-shot prank is armed consumes it.
        bytes memory signature = _sign(mandate, ledgerPK);

        vm.prank(agent);
        strategyHash = vault.ship(app, abi.encode(order), tokens, amounts, mandate, signature);
    }

    function _order(bytes memory program) internal view returns (ISwapVM.Order memory) {
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: address(vault),
            tokenA: address(tokenA),
            tokenB: address(tokenB),
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

    function _takerData(address takerAddress, bool isAToB) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(TakerTraitsLib.Args({
            taker: takerAddress,
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

    function _quote(ISwapVM.Order memory order, uint256 amount, bool isAToB) internal view returns (uint256, uint256) {
        return _quoteOn(SwapVM(payable(address(router))), order, amount, isAToB);
    }

    /// @dev Cast rather than `asView()`: that accessor is itself an external call, and a call made
    ///      while `expectRevert` is armed consumes it.
    function _quoteOn(SwapVM on, ISwapVM.Order memory order, uint256 amount, bool isAToB) internal view returns (uint256, uint256) {
        (uint256 amountIn, uint256 amountOut,) = ISwapVM(address(on)).quote(order, amount, _takerData(address(this), isAToB));
        return (amountIn, amountOut);
    }

    function _swap(ISwapVM.Order memory order, uint256 amount, bool isAToB) internal returns (uint256, uint256) {
        return _swapOn(SwapVM(payable(address(router))), taker, order, amount, isAToB);
    }

    /// @dev Funding is separate so the swap is the *first* call after an `expectRevert`.
    function _swapOn(SwapVM, MockTaker who, ISwapVM.Order memory order, uint256 amount, bool isAToB)
        internal
        returns (uint256, uint256)
    {
        return who.swap(order, amount, _takerData(address(who), isAToB));
    }

    function _fund(MockTaker who, uint256 amount, bool isAToB) internal {
        (isAToB ? tokenA : tokenB).mint(address(who), amount);
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
