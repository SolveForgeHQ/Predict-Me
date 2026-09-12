// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PredictionMarket.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PredictionMarketTest is Test {
    PredictionMarket public market;

    address public owner = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public carol = address(0xCA901);
    address public dave = address(0xDA7E);

    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime);
    event SharesBought(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed marketId, bool outcome);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 payout);

    function setUp() public {
        market = new PredictionMarket();

        // Fund test accounts with AVAX
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave, 100 ether);
    }

    // =========================================================================
    // 1. Market Creation Tests
    // =========================================================================

    function test_CreateMarket_Success() public {
        uint256 endTime = block.timestamp + 1 days;
        string memory question = "Will AVAX reach $100 by EOY?";

        vm.expectEmit(true, false, false, true);
        emit MarketCreated(1, question, endTime);

        uint256 marketId = market.createMarket(question, endTime);
        assertEq(marketId, 1);
        assertEq(market.marketCount(), 1);

        PredictionMarket.Market memory m = market.getMarket(1);
        assertEq(m.question, question);
        assertEq(m.endTime, endTime);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Open));
        assertEq(m.outcome, false);
        assertEq(m.yesPool, 0);
        assertEq(m.noPool, 0);
        assertEq(m.totalPool, 0);
    }

    function test_CreateMarket_RevertIf_EmptyQuestion() public {
        vm.expectRevert(PredictionMarket.EmptyQuestion.selector);
        market.createMarket("", block.timestamp + 1 days);
    }

    function test_CreateMarket_RevertIf_PastEndTime() public {
        vm.expectRevert(PredictionMarket.InvalidEndTime.selector);
        market.createMarket("Question", block.timestamp);
    }

    function test_CreateMarket_RevertIf_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        market.createMarket("Question", block.timestamp + 1 days);
    }

    // =========================================================================
    // 2. Buying Shares Tests (Both YES and NO sides)
    // =========================================================================

    function test_BuyShares_BothSides() public {
        uint256 endTime = block.timestamp + 1 days;
        uint256 marketId = market.createMarket("Will AVAX reach $100?", endTime);

        // Alice buys 10 AVAX of YES shares
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit SharesBought(marketId, alice, true, 10 ether);
        market.buyShares{value: 10 ether}(marketId, true);

        // Bob buys 30 AVAX of NO shares
        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit SharesBought(marketId, bob, false, 30 ether);
        market.buyShares{value: 30 ether}(marketId, false);

        // Verify pool totals
        (uint256 yesPool, uint256 noPool, uint256 totalPool) = market.getPoolTotals(marketId);
        assertEq(yesPool, 10 ether);
        assertEq(noPool, 30 ether);
        assertEq(totalPool, 40 ether);

        // Verify positions
        (uint256 aliceYes, uint256 aliceNo) = market.getPosition(marketId, alice);
        assertEq(aliceYes, 10 ether);
        assertEq(aliceNo, 0);

        (uint256 bobYes, uint256 bobNo) = market.getPosition(marketId, bob);
        assertEq(bobYes, 0);
        assertEq(bobNo, 30 ether);

        // Verify contract AVAX balance
        assertEq(address(market).balance, 40 ether);
    }

    function test_BuyShares_RevertIf_ZeroDeposit() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.ZeroDeposit.selector);
        market.buyShares{value: 0}(marketId, true);
    }

    function test_BuyShares_RevertIf_MarketNotFound() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotFound.selector);
        market.buyShares{value: 1 ether}(999, true);
    }

    function test_BuyShares_RevertIf_MarketExpired() public {
        uint256 endTime = block.timestamp + 1 days;
        uint256 marketId = market.createMarket("Will AVAX reach $100?", endTime);

        // Fast forward time past endTime
        vm.warp(endTime + 1);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketExpired.selector);
        market.buyShares{value: 1 ether}(marketId, true);
    }

    // =========================================================================
    // 3. Resolving Market Tests
    // =========================================================================

    function test_ResolveMarket_Success_YES() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        vm.expectEmit(true, false, false, true);
        emit MarketResolved(marketId, true);
        market.resolveMarket(marketId, true);

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Resolved));
        assertEq(m.outcome, true);
    }

    function test_ResolveMarket_Success_NO() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        vm.expectEmit(true, false, false, true);
        emit MarketResolved(marketId, false);
        market.resolveMarket(marketId, false);

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Resolved));
        assertEq(m.outcome, false);
    }

    function test_ResolveMarket_RevertIf_NotOwner() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        market.resolveMarket(marketId, true);
    }

    function test_ResolveMarket_RevertIf_AlreadyResolved() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);
        market.resolveMarket(marketId, true);

        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.resolveMarket(marketId, true);
    }

    function test_BuyShares_RevertIf_AlreadyResolved() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);
        market.resolveMarket(marketId, true);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.buyShares{value: 1 ether}(marketId, true);
    }

    // =========================================================================
    // 4. Claiming Winnings Tests (Proportional payout & multi-user split)
    // =========================================================================

    function test_ClaimWinnings_ProportionalPayout_SingleWinner() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        // Alice: 10 AVAX YES, Bob: 30 AVAX NO -> Total Pool: 40 AVAX
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, true);

        vm.prank(bob);
        market.buyShares{value: 30 ether}(marketId, false);

        // Resolve to YES
        market.resolveMarket(marketId, true);

        uint256 aliceBalBefore = alice.balance;

        // Alice claims winnings
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit WinningsClaimed(marketId, alice, 40 ether);
        market.claimWinnings(marketId);

        // Alice should receive the entire 40 AVAX pool
        assertEq(alice.balance, aliceBalBefore + 40 ether);

        // Alice's YES shares should now be 0
        (uint256 aliceYes, ) = market.getPosition(marketId, alice);
        assertEq(aliceYes, 0);

        // Contract balance should now be 0
        assertEq(address(market).balance, 0);
    }

    function test_ClaimWinnings_ProportionalPayout_MultipleWinners() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        // Alice buys 10 AVAX YES (25% of YES pool)
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, true);

        // Bob buys 30 AVAX YES (75% of YES pool)
        vm.prank(bob);
        market.buyShares{value: 30 ether}(marketId, true);

        // Carol buys 60 AVAX NO
        vm.prank(carol);
        market.buyShares{value: 60 ether}(marketId, false);

        // Total Pool = 100 AVAX, YES Pool = 40 AVAX, NO Pool = 60 AVAX
        (uint256 yesPool, uint256 noPool, uint256 totalPool) = market.getPoolTotals(marketId);
        assertEq(yesPool, 40 ether);
        assertEq(noPool, 60 ether);
        assertEq(totalPool, 100 ether);

        // Resolve to YES
        market.resolveMarket(marketId, true);

        // Alice claims: payout = (10 * 100) / 40 = 25 AVAX
        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        market.claimWinnings(marketId);
        assertEq(alice.balance, aliceBalBefore + 25 ether);

        // Bob claims: payout = (30 * 100) / 40 = 75 AVAX
        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        market.claimWinnings(marketId);
        assertEq(bob.balance, bobBalBefore + 75 ether);

        // Contract balance should now be 0
        assertEq(address(market).balance, 0);
    }

    function test_ClaimWinnings_ProportionalPayout_NO_Wins() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        // Alice: 20 AVAX YES, Bob: 80 AVAX NO -> Total: 100 AVAX
        vm.prank(alice);
        market.buyShares{value: 20 ether}(marketId, true);

        vm.prank(bob);
        market.buyShares{value: 80 ether}(marketId, false);

        // Resolve to NO
        market.resolveMarket(marketId, false);

        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        market.claimWinnings(marketId);
        assertEq(bob.balance, bobBalBefore + 100 ether);

        // Bob's NO shares are now 0
        (, uint256 bobNo) = market.getPosition(marketId, bob);
        assertEq(bobNo, 0);
    }

    // =========================================================================
    // 5. Rejection & Failure Mode Tests
    // =========================================================================

    function test_ClaimWinnings_RevertIf_NotResolved() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, true);

        // Attempting to claim before resolution must revert
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotResolved.selector);
        market.claimWinnings(marketId);
    }

    function test_ClaimWinnings_RevertIf_DoubleClaim() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, true);

        vm.prank(bob);
        market.buyShares{value: 10 ether}(marketId, false);

        market.resolveMarket(marketId, true);

        // First claim succeeds
        vm.prank(alice);
        market.claimWinnings(marketId);

        // Second claim attempt must revert with NoWinningShares
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
    }

    function test_ClaimWinnings_RevertIf_LosingPosition() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, true);

        vm.prank(bob);
        market.buyShares{value: 10 ether}(marketId, false);

        // Resolve to YES (Bob lost)
        market.resolveMarket(marketId, true);

        // Bob attempts to claim
        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
    }

    function test_ClaimWinnings_RevertIf_NonParticipant() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days);

        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, true);

        market.resolveMarket(marketId, true);

        // Dave never bought any shares
        vm.prank(dave);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
    }
}
