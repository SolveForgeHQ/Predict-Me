// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PredictionMarketERC20} from "../src/PredictionMarketERC20.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";

contract PredictionMarketERC20Test is Test {
    MockERC20 token;
    PredictionMarketERC20 market;

    address owner = address(this);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave = makeAddr("dave");

    uint256 constant MIN_STAKE = 1e6; // 1 USDC
    uint256 constant GRACE_PERIOD = 1 days;
    uint64 closeTime;

    function setUp() public {
        token = new MockERC20();
        market = new PredictionMarketERC20(address(token), owner, MIN_STAKE, GRACE_PERIOD);

        uint256 mintAmt = 100_000e6;
        token.mint(alice, mintAmt);
        token.mint(bob, mintAmt);
        token.mint(carol, mintAmt);
        token.mint(dave, mintAmt);

        vm.prank(alice);
        token.approve(address(market), type(uint256).max);
        vm.prank(bob);
        token.approve(address(market), type(uint256).max);
        vm.prank(carol);
        token.approve(address(market), type(uint256).max);
        vm.prank(dave);
        token.approve(address(market), type(uint256).max);

        closeTime = uint64(block.timestamp + 1 days);
    }

    // ─────────────── Helpers ───────────────

    function _createBinary() internal returns (uint256) {
        string[] memory outcomes = new string[](2);
        outcomes[0] = "YES";
        outcomes[1] = "NO";
        return market.createMarket("Test?", outcomes, closeTime, "criteria");
    }

    function _create4Outcome() internal returns (uint256) {
        string[] memory outcomes = new string[](4);
        outcomes[0] = "A";
        outcomes[1] = "B";
        outcomes[2] = "C";
        outcomes[3] = "D";
        return market.createMarket("Test?", outcomes, closeTime, "criteria");
    }

    function _buy(address user, uint256 marketId, uint256 outcomeIndex, uint256 amount) internal {
        vm.prank(user);
        market.buyShares(marketId, outcomeIndex, amount);
    }

    function _warpToClose() internal {
        vm.warp(closeTime + 1);
    }

    function _warpPastGrace() internal {
        vm.warp(uint256(closeTime) + GRACE_PERIOD + 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // buyShares
    // ═══════════════════════════════════════════════════════════════════════

    function test_Buy_MultipleOutcomesMultipleUsers() public {
        uint256 mId = _createBinary();

        _buy(alice, mId, 0, 5e6);
        _buy(bob, mId, 1, 3e6);
        _buy(carol, mId, 0, 2e6);

        (uint256[] memory pools, uint256 totalPool) = market.getPools(mId);
        assertEq(pools[0], 7e6, "yes pool");
        assertEq(pools[1], 3e6, "no pool");
        assertEq(totalPool, 10e6, "total pool");

        uint256[] memory posAlice = market.getPosition(mId, alice);
        assertEq(posAlice[0], 5e6, "alice yes shares");
        assertEq(posAlice[1], 0, "alice no shares");

        uint256[] memory posBob = market.getPosition(mId, bob);
        assertEq(posBob[0], 0, "bob yes shares");
        assertEq(posBob[1], 3e6, "bob no shares");
    }

    function test_Buy_RevertsOnZeroAmount() public {
        uint256 mId = _createBinary();
        vm.expectRevert(PredictionMarketERC20.ZeroAmount.selector);
        _buy(alice, mId, 0, 0);
    }

    function test_Buy_RevertsBelowMinStake() public {
        uint256 mId = _createBinary();
        vm.expectRevert(PredictionMarketERC20.InsufficientStake.selector);
        _buy(alice, mId, 0, MIN_STAKE - 1);
    }

    function test_Buy_RevertsInvalidOutcomeIndex() public {
        uint256 mId = _createBinary();
        vm.expectRevert(PredictionMarketERC20.InvalidOutcome.selector);
        _buy(alice, mId, 2, 5e6);
    }

    function test_Buy_RevertsAfterCloseTime() public {
        uint256 mId = _createBinary();
        vm.warp(closeTime);
        vm.expectRevert(PredictionMarketERC20.MarketExpired.selector);
        _buy(alice, mId, 0, 5e6);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Access control
    // ═══════════════════════════════════════════════════════════════════════

    function test_NonOwnerCannotCreate() public {
        string[] memory outcomes = new string[](2);
        outcomes[0] = "YES";
        outcomes[1] = "NO";
        vm.prank(alice);
        vm.expectRevert();
        market.createMarket("Test?", outcomes, closeTime, "criteria");
    }

    function test_NonOwnerCannotResolve() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6);
        _warpToClose();
        vm.prank(alice);
        vm.expectRevert();
        market.resolveMarket(mId, 0);
    }

    function test_Resolve_RevertsBeforeCloseTime() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6);
        vm.expectRevert(PredictionMarketERC20.ResolutionTooEarly.selector);
        market.resolveMarket(mId, 0);
    }

    function test_Resolve_RevertsTwice() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6);
        _buy(bob, mId, 1, 3e6);
        _warpToClose();
        market.resolveMarket(mId, 0);
        vm.expectRevert(PredictionMarketERC20.MarketAlreadyFinalised.selector);
        market.resolveMarket(mId, 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Payout correctness — no dust
    // ═══════════════════════════════════════════════════════════════════════

    function test_Payout_ProRataCorrect_NoDust() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 100e6); // YES
        _buy(bob, mId, 0, 50e6); // YES
        _buy(carol, mId, 1, 150e6); // NO
        // total pool = 300e6, winning = YES (0), winning pool = 150e6

        _warpToClose();
        market.resolveMarket(mId, 0);

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);

        vm.prank(alice);
        market.claimWinnings(mId);
        vm.prank(bob);
        market.claimWinnings(mId);

        uint256 alicePayout = token.balanceOf(alice) - aliceBefore;
        uint256 bobPayout = token.balanceOf(bob) - bobBefore;

        // alice: (100 * 300) / 150 = 200
        assertEq(alicePayout, 200e6, "alice payout");
        // bob: (50 * 300) / 150 = 100
        assertEq(bobPayout, 100e6, "bob payout");

        // sum equals total pool exactly — no dust in contract
        assertEq(alicePayout + bobPayout, 300e6, "sum == total pool");
        assertEq(token.balanceOf(address(market)), 0, "no dust in contract");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Claim edge cases
    // ═══════════════════════════════════════════════════════════════════════

    function test_Claim_RevertsBeforeResolution() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6);
        vm.expectRevert(PredictionMarketERC20.MarketNotResolved.selector);
        vm.prank(alice);
        market.claimWinnings(mId);
    }

    function test_Claim_RevertsForLoser() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6); // YES
        _buy(bob, mId, 1, 3e6); // NO
        _warpToClose();
        market.resolveMarket(mId, 0); // YES wins
        vm.expectRevert(PredictionMarketERC20.NoWinningShares.selector);
        vm.prank(bob);
        market.claimWinnings(mId);
    }

    function test_Claim_RevertsOnDoubleClaim() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6);
        _buy(bob, mId, 1, 3e6);
        _warpToClose();
        market.resolveMarket(mId, 0);
        vm.startPrank(alice);
        market.claimWinnings(mId);
        vm.expectRevert(PredictionMarketERC20.NoWinningShares.selector);
        market.claimWinnings(mId);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Resolve to unbacked outcome → cancel + refund
    // ═══════════════════════════════════════════════════════════════════════

    function test_Resolve_UnbackedOutcome_CancelsAndRefund() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6); // YES only
        _buy(bob, mId, 0, 3e6); // YES only
        // NO pool is 0
        _warpToClose();
        market.resolveMarket(mId, 1); // resolve to NO → cancel

        (, , PredictionMarketERC20.MarketStatus status) = _getMarketStatus(mId);
        assertEq(uint8(status), uint8(PredictionMarketERC20.MarketStatus.Cancelled), "status == cancelled");

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);

        vm.prank(alice);
        market.refund(mId);
        vm.prank(bob);
        market.refund(mId);

        assertEq(token.balanceOf(alice) - aliceBefore, 5e6, "alice refund");
        assertEq(token.balanceOf(bob) - bobBefore, 3e6, "bob refund");
        assertEq(token.balanceOf(address(market)), 0, "no dust after refunds");
    }

    function test_Refund_RevertsOnDoubleRefund() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6);
        _warpToClose();
        market.resolveMarket(mId, 1); // cancel (no backers on NO)

        vm.startPrank(alice);
        market.refund(mId);
        vm.expectRevert(PredictionMarketERC20.NothingToRefund.selector);
        market.refund(mId);
        vm.stopPrank();
    }

    function test_CancelMarket_OwnerOnly() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6);
        market.cancelMarket(mId);

        (, , PredictionMarketERC20.MarketStatus status) = _getMarketStatus(mId);
        assertEq(uint8(status), uint8(PredictionMarketERC20.MarketStatus.Cancelled), "cancelled");

        vm.prank(alice);
        market.refund(mId);
        assertEq(token.balanceOf(alice), 100_000e6, "alice got full refund");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // cancelUnresolved
    // ═══════════════════════════════════════════════════════════════════════

    function test_CancelUnresolved_RevertsBeforeGracePeriod() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6);
        vm.warp(uint256(closeTime) + 1); // past close, within grace
        vm.expectRevert(PredictionMarketERC20.GracePeriodNotExpired.selector);
        market.cancelUnresolved(mId);
    }

    function test_CancelUnresolved_WorksAfterGracePeriod() public {
        uint256 mId = _createBinary();
        _buy(alice, mId, 0, 5e6);
        _warpPastGrace();
        market.cancelUnresolved(mId);

        (, , PredictionMarketERC20.MarketStatus status) = _getMarketStatus(mId);
        assertEq(uint8(status), uint8(PredictionMarketERC20.MarketStatus.Cancelled), "cancelled");

        vm.prank(alice);
        market.refund(mId);
        assertEq(token.balanceOf(alice), 100_000e6, "alice refunded");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Fee-on-transfer rejection
    // ═══════════════════════════════════════════════════════════════════════

    function test_FeeOnTransfer_RejectedOnBuyShares() public {
        FeeOnTransferToken fotToken = new FeeOnTransferToken(100); // 1% fee
        PredictionMarketERC20 fotMarket =
            new PredictionMarketERC20(address(fotToken), owner, MIN_STAKE, GRACE_PERIOD);

        fotToken.mint(alice, 100e6);
        vm.prank(alice);
        fotToken.approve(address(fotMarket), type(uint256).max);

        string[] memory outcomes = new string[](2);
        outcomes[0] = "YES";
        outcomes[1] = "NO";
        uint64 ct = uint64(block.timestamp + 1 days);
        uint256 mId = fotMarket.createMarket("Test?", outcomes, ct, "criteria");

        vm.prank(alice);
        vm.expectRevert(PredictionMarketERC20.BalanceNotIncreased.selector);
        fotMarket.buyShares(mId, 0, 10e6);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Reentrancy
    // ═══════════════════════════════════════════════════════════════════════

    function test_Reentrancy_ClaimWinningsFails() public {
        ReentrantToken rToken = new ReentrantToken();
        PredictionMarketERC20 rMarket =
            new PredictionMarketERC20(address(rToken), owner, MIN_STAKE, GRACE_PERIOD);

        rToken.mint(alice, 100e6);
        rToken.mint(bob, 100e6);
        vm.prank(alice);
        rToken.approve(address(rMarket), type(uint256).max);
        vm.prank(bob);
        rToken.approve(address(rMarket), type(uint256).max);

        string[] memory outcomes = new string[](2);
        outcomes[0] = "YES";
        outcomes[1] = "NO";
        uint64 ct = uint64(block.timestamp + 1 days);
        uint256 mId = rMarket.createMarket("Test?", outcomes, ct, "criteria");

        vm.prank(alice);
        rMarket.buyShares(mId, 0, 50e6);
        vm.prank(bob);
        rMarket.buyShares(mId, 1, 30e6);

        vm.warp(uint256(ct) + 1);
        rMarket.resolveMarket(mId, 0);

        // Arm the reentrancy attack — token.transfer will try to reenter claimWinnings
        rToken.arm(address(rMarket), mId, true);

        uint256 aliceBefore = rToken.balanceOf(alice);
        vm.prank(alice);
        rMarket.claimWinnings(mId); // should NOT revert — reentrancy is caught, payout still succeeds

        // Alice should have received her payout (the try/catch in the token swallows the revert)
        uint256 aliceAfter = rToken.balanceOf(alice);
        assertGt(aliceAfter, aliceBefore, "alice still got paid");
        assertEq(rToken.balanceOf(address(rMarket)), 0, "no dust");
    }

    function test_Reentrancy_RefundFails() public {
        ReentrantToken rToken = new ReentrantToken();
        PredictionMarketERC20 rMarket =
            new PredictionMarketERC20(address(rToken), owner, MIN_STAKE, GRACE_PERIOD);

        rToken.mint(alice, 100e6);
        vm.prank(alice);
        rToken.approve(address(rMarket), type(uint256).max);

        string[] memory outcomes = new string[](2);
        outcomes[0] = "YES";
        outcomes[1] = "NO";
        uint64 ct = uint64(block.timestamp + 1 days);
        uint256 mId = rMarket.createMarket("Test?", outcomes, ct, "criteria");

        vm.prank(alice);
        rMarket.buyShares(mId, 0, 50e6);

        vm.warp(uint256(ct) + 1);
        rMarket.cancelMarket(mId);

        // Arm the reentrancy attack — token.transfer will try to reenter refund
        rToken.arm(address(rMarket), mId, false);

        uint256 aliceBefore = rToken.balanceOf(alice);
        vm.prank(alice);
        rMarket.refund(mId);

        uint256 aliceAfter = rToken.balanceOf(alice);
        assertGt(aliceAfter, aliceBefore, "alice still got refunded");
        assertEq(rToken.balanceOf(address(rMarket)), 0, "no dust");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Fuzz: contract balance is zero after all claims
    // ═══════════════════════════════════════════════════════════════════════

    function testFuzz_NoDustAfterAllClaims(uint256 stakeA, uint256 stakeB, uint256 stakeC, uint256 winningIdx) public {
        stakeA = bound(stakeA, MIN_STAKE, 1_000e6);
        stakeB = bound(stakeB, MIN_STAKE, 1_000e6);
        stakeC = bound(stakeC, MIN_STAKE, 1_000e6);
        winningIdx = bound(winningIdx, 0, 1);

        // Ensure enough minted tokens
        if (token.balanceOf(alice) < stakeA) token.mint(alice, stakeA * 2);
        if (token.balanceOf(bob) < stakeB) token.mint(bob, stakeB * 2);
        if (token.balanceOf(carol) < stakeC) token.mint(carol, stakeC * 2);

        uint256 mId = _createBinary();

        _buy(alice, mId, 0, stakeA); // YES
        _buy(bob, mId, 1, stakeB); // NO
        _buy(carol, mId, winningIdx, stakeC); // winning side

        _warpToClose();
        market.resolveMarket(mId, winningIdx);

        // All winning-side holders claim
        _claimIfWinner(alice, mId, winningIdx, 0);
        _claimIfWinner(bob, mId, winningIdx, 1);
        _claimIfWinner(carol, mId, winningIdx, winningIdx);

        assertEq(token.balanceOf(address(market)), 0, "contract balance must be zero after all claims");
    }

    function _claimIfWinner(address user, uint256 mId, uint256 winningIdx, uint256 userOutcome) internal {
        if (userOutcome == winningIdx) {
            vm.prank(user);
            market.claimWinnings(mId);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Full flow: 2 outcomes
    // ═══════════════════════════════════════════════════════════════════════

    function test_FullFlow_2Outcomes() public {
        uint256 mId = _createBinary();

        // Buy
        _buy(alice, mId, 0, 40e6);
        _buy(bob, mId, 1, 60e6);
        _buy(carol, mId, 0, 20e6);
        // pool: yes=60, no=60, total=120

        _warpToClose();
        market.resolveMarket(mId, 0); // YES wins

        // Payouts: yes pool = 60, total = 120
        // alice: (40 * 120) / 60 = 80
        // carol: (20 * 120) / 60 = 40

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 carolBefore = token.balanceOf(carol);

        vm.prank(alice);
        market.claimWinnings(mId);
        vm.prank(carol);
        market.claimWinnings(mId);

        assertEq(token.balanceOf(alice) - aliceBefore, 80e6, "alice payout");
        assertEq(token.balanceOf(carol) - carolBefore, 40e6, "carol payout");
        assertEq(token.balanceOf(address(market)), 0, "no dust");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Full flow: 4 outcomes
    // ═══════════════════════════════════════════════════════════════════════

    function test_FullFlow_4Outcomes() public {
        uint256 mId = _create4Outcome();

        _buy(alice, mId, 0, 100e6); // A
        _buy(bob, mId, 1, 200e6); // B
        _buy(carol, mId, 1, 300e6); // B
        _buy(dave, mId, 3, 400e6); // D
        // pool: A=100, B=500, C=0, D=400, total=1000

        _warpToClose();
        market.resolveMarket(mId, 1); // B wins

        // Payouts: winning pool = 500, total = 1000
        // bob: (200 * 1000) / 500 = 400
        // carol: (300 * 1000) / 500 = 600

        uint256 bobBefore = token.balanceOf(bob);
        uint256 carolBefore = token.balanceOf(carol);

        vm.prank(bob);
        market.claimWinnings(mId);
        vm.prank(carol);
        market.claimWinnings(mId);

        assertEq(token.balanceOf(bob) - bobBefore, 400e6, "bob payout");
        assertEq(token.balanceOf(carol) - carolBefore, 600e6, "carol payout");
        assertEq(token.balanceOf(address(market)), 0, "no dust");
    }

    // ─────────────── View helper ───────────────

    function _getMarketStatus(uint256 mId)
        internal
        view
        returns (string memory question, string memory criteria, PredictionMarketERC20.MarketStatus status)
    {
        PredictionMarketERC20.Market memory m = market.getMarket(mId);
        return (m.question, m.resolutionCriteria, m.status);
    }
}
