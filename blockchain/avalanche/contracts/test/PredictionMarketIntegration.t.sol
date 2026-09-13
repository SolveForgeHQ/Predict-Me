// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PredictionMarket.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PredictionMarketIntegrationTest
 * @notice End-to-end Foundry integration tests covering the complete prediction market lifecycle:
 *         createMarket -> buyShares (two+ addresses, YES and NO) -> resolveMarket -> claimWinnings
 *         with rigorous assertions on proportional payout splits, share zeroing, and failure modes.
 */
contract PredictionMarketIntegrationTest is Test {
    PredictionMarket public market;

    address public owner = address(this);
    address public alice = address(0xA11CE); // Trader 1 (YES)
    address public bob   = address(0xB0B);   // Trader 2 (NO)
    address public carol = address(0xCA901); // Trader 3 (YES co-winner)
    address public dave  = address(0xDA7E);  // Non-participant

    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime);
    event SharesBought(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed marketId, bool outcome);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 payout);

    function setUp() public {
        market = new PredictionMarket();

        // Fund test traders with initial AVAX balances
        vm.deal(alice, 100 ether);
        vm.deal(bob,   200 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave,  100 ether);
    }

    // =========================================================================
    // 1. Full Flow: Single Winner (YES Outcome)
    // =========================================================================

    function test_Integration_FullFlow_SingleWinner_YES() public {
        uint256 initialAliceBalance = alice.balance; // 100 ether
        uint256 initialBobBalance   = bob.balance;   // 200 ether

        // ── Step 1: Owner creates market ─────────────────────────────────────
        uint256 endTime = block.timestamp + 3 days;
        string memory question = "Will Avalanche Subnets surpass 500 in 2026?";

        vm.expectEmit(true, false, false, true);
        emit MarketCreated(1, question, endTime);
        uint256 marketId = market.createMarket(question, endTime);

        assertEq(marketId, 1, "Market ID should be 1");
        assertEq(market.marketCount(), 1, "Market count should be 1");

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.question, question);
        assertEq(m.endTime, endTime);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Open));
        assertEq(m.yesPool, 0);
        assertEq(m.noPool, 0);
        assertEq(m.totalPool, 0);

        // ── Step 2: Two addresses buy shares (Alice = YES, Bob = NO) ─────────
        // Alice buys 40 AVAX YES
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit SharesBought(marketId, alice, true, 40 ether);
        market.buyShares{value: 40 ether}(marketId, true);

        // Bob buys 60 AVAX NO
        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit SharesBought(marketId, bob, false, 60 ether);
        market.buyShares{value: 60 ether}(marketId, false);

        // Assert balances after purchase
        assertEq(alice.balance, initialAliceBalance - 40 ether, "Alice spent 40 AVAX");
        assertEq(bob.balance,   initialBobBalance - 60 ether,   "Bob spent 60 AVAX");

        // Assert pool totals
        (uint256 yesPool, uint256 noPool, uint256 totalPool) = market.getPoolTotals(marketId);
        assertEq(yesPool,   40 ether,  "YES pool should be 40 ether");
        assertEq(noPool,    60 ether,  "NO pool should be 60 ether");
        assertEq(totalPool, 100 ether, "Total pool should be 100 ether");
        assertEq(address(market).balance, 100 ether, "Contract balance should equal total pool");

        // Assert individual positions
        (uint256 aliceYes, uint256 aliceNo) = market.getPosition(marketId, alice);
        assertEq(aliceYes, 40 ether, "Alice YES shares");
        assertEq(aliceNo,  0,        "Alice NO shares");

        (uint256 bobYes, uint256 bobNo) = market.getPosition(marketId, bob);
        assertEq(bobYes, 0,        "Bob YES shares");
        assertEq(bobNo,  60 ether, "Bob NO shares");

        // ── Step 3: Owner resolves market to YES ─────────────────────────────
        vm.expectEmit(true, false, false, true);
        emit MarketResolved(marketId, true);
        market.resolveMarket(marketId, true);

        m = market.getMarket(marketId);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Resolved));
        assertTrue(m.outcome, "Market outcome should be YES");

        // Trades should now be rejected on resolved market
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.buyShares{value: 1 ether}(marketId, true);

        // ── Step 4: Claim Winnings & Payout Assertions ─────────────────────────
        // Alice holds 100% of winning YES shares (40 / 40)
        // Expected payout: (40 * 100) / 40 = 100 ether
        uint256 aliceBalBeforeClaim = alice.balance;

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit WinningsClaimed(marketId, alice, 100 ether);
        market.claimWinnings(marketId);

        // Alice receives the entire 100 AVAX total pool
        assertEq(alice.balance, aliceBalBeforeClaim + 100 ether, "Alice should receive 100 AVAX payout");
        assertEq(alice.balance, initialAliceBalance + 60 ether,  "Alice net profit should be +60 AVAX (Bob's 60 AVAX)");

        // Alice's YES shares must now be 0 (double-claim prevention)
        (aliceYes, ) = market.getPosition(marketId, alice);
        assertEq(aliceYes, 0, "Alice shares should be reset to 0");

        // Contract balance should be completely depleted
        assertEq(address(market).balance, 0, "Contract balance should be 0 after full payout");

        // Loser (Bob) cannot claim
        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);

        // Winner cannot double-claim
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);

        // Non-participant (Dave) cannot claim
        vm.prank(dave);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
    }

    // =========================================================================
    // 2. Full Flow: Single Winner (NO Outcome)
    // =========================================================================

    function test_Integration_FullFlow_SingleWinner_NO() public {
        uint256 initialBobBalance = bob.balance;

        uint256 endTime = block.timestamp + 1 days;
        uint256 marketId = market.createMarket("Will gas fees exceed 100 nAVAX?", endTime);

        // Alice buys 30 AVAX YES
        vm.prank(alice);
        market.buyShares{value: 30 ether}(marketId, true);

        // Bob buys 70 AVAX NO
        vm.prank(bob);
        market.buyShares{value: 70 ether}(marketId, false);

        // Resolve to NO (outcome = false)
        market.resolveMarket(marketId, false);

        // Bob claims full 100 AVAX pool
        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        market.claimWinnings(marketId);

        assertEq(bob.balance, bobBalBefore + 100 ether, "Bob should receive 100 AVAX payout");
        assertEq(bob.balance, initialBobBalance + 30 ether, "Bob net profit should be +30 AVAX");

        // Bob shares reset to 0
        (, uint256 bobNo) = market.getPosition(marketId, bob);
        assertEq(bobNo, 0, "Bob NO shares reset to 0");

        // Alice (loser) claim reverts
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);

        assertEq(address(market).balance, 0, "Contract balance should be 0");
    }

    // =========================================================================
    // 3. Full Flow: Multi-Winner Proportional Split
    // =========================================================================

    function test_Integration_FullFlow_MultiWinner_ProportionalSplit() public {
        uint256 initialAliceBalance = alice.balance; // 100 AVAX
        uint256 initialCarolBalance = carol.balance; // 100 AVAX
        uint256 initialBobBalance   = bob.balance;   // 200 AVAX

        uint256 marketId = market.createMarket("Will Avalanche TPS exceed 1000?", block.timestamp + 5 days);

        // Alice buys 20 AVAX YES (25% of YES pool)
        vm.prank(alice);
        market.buyShares{value: 20 ether}(marketId, true);

        // Carol buys 60 AVAX YES (75% of YES pool)
        vm.prank(carol);
        market.buyShares{value: 60 ether}(marketId, true);

        // Bob buys 120 AVAX NO (100% of NO pool)
        vm.prank(bob);
        market.buyShares{value: 120 ether}(marketId, false);

        // Total Pool = 200 AVAX
        // YES Pool   =  80 AVAX
        // NO Pool    = 120 AVAX
        (uint256 yesPool, uint256 noPool, uint256 totalPool) = market.getPoolTotals(marketId);
        assertEq(yesPool,   80 ether);
        assertEq(noPool,   120 ether);
        assertEq(totalPool, 200 ether);
        assertEq(address(market).balance, 200 ether);

        // Resolve to YES
        market.resolveMarket(marketId, true);

        // ── Alice claims 25% of total pool ───────────────────────────────────
        // Expected payout: (20 * 200) / 80 = 50 AVAX
        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit WinningsClaimed(marketId, alice, 50 ether);
        market.claimWinnings(marketId);

        assertEq(alice.balance, aliceBalBefore + 50 ether, "Alice payout should be 50 AVAX");
        assertEq(alice.balance, initialAliceBalance + 30 ether, "Alice net profit should be +30 AVAX");
        (uint256 aliceYes, ) = market.getPosition(marketId, alice);
        assertEq(aliceYes, 0, "Alice shares zeroed");

        // Contract balance remaining: 200 - 50 = 150 AVAX
        assertEq(address(market).balance, 150 ether);

        // ── Carol claims 75% of total pool ───────────────────────────────────
        // Expected payout: (60 * 200) / 80 = 150 AVAX
        uint256 carolBalBefore = carol.balance;
        vm.prank(carol);
        vm.expectEmit(true, true, false, true);
        emit WinningsClaimed(marketId, carol, 150 ether);
        market.claimWinnings(marketId);

        assertEq(carol.balance, carolBalBefore + 150 ether, "Carol payout should be 150 AVAX");
        assertEq(carol.balance, initialCarolBalance + 90 ether, "Carol net profit should be +90 AVAX");
        (uint256 carolYes, ) = market.getPosition(marketId, carol);
        assertEq(carolYes, 0, "Carol shares zeroed");

        // Contract balance now completely distributed
        assertEq(address(market).balance, 0, "All funds paid out");

        // Bob (loser) cannot claim
        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
        assertEq(bob.balance, initialBobBalance - 120 ether, "Bob lost full 120 AVAX stake");
    }

    // =========================================================================
    // 4. Edge Cases: Premature Claim, Non-Owner Resolve, Expiration
    // =========================================================================

    function test_Integration_CannotClaimBeforeResolution() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 2 days);

        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, true);

        // Cannot claim before market is resolved
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotResolved.selector);
        market.claimWinnings(marketId);
    }

    function test_Integration_NonOwnerCannotResolve() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 2 days);

        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, true);

        // Non-owner attempts resolution
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        market.resolveMarket(marketId, true);
    }

    function test_Integration_CannotBuyAfterExpiration() public {
        uint256 endTime = block.timestamp + 1 hours;
        uint256 marketId = market.createMarket("Will AVAX reach $100?", endTime);

        // Fast-forward past market expiration
        vm.warp(endTime + 1);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketExpired.selector);
        market.buyShares{value: 1 ether}(marketId, true);
    }
}
