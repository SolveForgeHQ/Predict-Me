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
    event SharesBought(
        uint256 indexed marketId,
        address indexed buyer,
        uint256 outcomeIndex,
        uint256 amount
    );
    event MarketResolved(uint256 indexed marketId, uint256 winningOutcome);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 payout);

    function setUp() public {
        market = new PredictionMarket();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave, 100 ether);
    }

    function labels2() internal pure returns (string[] memory) {
        string[] memory l = new string[](2);
        l[0] = "YES";
        l[1] = "NO";
        return l;
    }

    function labels4() internal pure returns (string[] memory) {
        string[] memory l = new string[](4);
        l[0] = "Alice";
        l[1] = "Bob";
        l[2] = "Carol";
        l[3] = "Dave";
        return l;
    }

    // =========================================================================
    // 1. Market Creation Tests
    // =========================================================================

    function test_CreateMarket_Success() public {
        uint256 endTime = block.timestamp + 1 days;
        string memory question = "Will AVAX reach $100 by EOY?";

        vm.expectEmit(true, false, false, true);
        emit MarketCreated(1, question, endTime);

        uint256 marketId = market.createMarket(question, endTime, labels2());
        assertEq(marketId, 1);
        assertEq(market.marketCount(), 1);

        PredictionMarket.Market memory m = market.getMarket(1);
        assertEq(m.question, question);
        assertEq(m.endTime, endTime);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Open));
        assertEq(m.outcomeLabels.length, 2);
        assertEq(m.pools.length, 2);
        assertEq(m.pools[0], 0);
        assertEq(m.pools[1], 0);
        assertEq(m.totalPool, 0);
    }

    function test_CreateMarket_BinaryCompat() public {
        uint256 marketId = market.createMarket("Q?", block.timestamp + 1 days);
        string[] memory out = market.getOutcomes(marketId);
        assertEq(out.length, 2);
        assertEq(out[0], "YES");
        assertEq(out[1], "NO");
    }

    function test_CreateMarket_RevertIf_EmptyQuestion() public {
        vm.expectRevert(PredictionMarket.EmptyQuestion.selector);
        market.createMarket("", block.timestamp + 1 days, labels2());
    }

    function test_CreateMarket_RevertIf_PastEndTime() public {
        vm.expectRevert(PredictionMarket.InvalidEndTime.selector);
        market.createMarket("Question", block.timestamp, labels2());
    }

    function test_CreateMarket_RevertIf_SingleOutcome() public {
        string[] memory l = new string[](1);
        l[0] = "Only";
        vm.expectRevert(PredictionMarket.InvalidOutcomeCount.selector);
        market.createMarket("Q?", block.timestamp + 1 days, l);
    }

    function test_CreateMarket_RevertIf_EmptyLabel() public {
        string[] memory l = new string[](2);
        l[0] = "A";
        l[1] = "";
        vm.expectRevert(PredictionMarket.EmptyOutcomeLabel.selector);
        market.createMarket("Q?", block.timestamp + 1 days, l);
    }

    function test_CreateMarket_RevertIf_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        market.createMarket("Question", block.timestamp + 1 days, labels2());
    }

    // =========================================================================
    // 2. Buying Shares Tests
    // =========================================================================

    function test_BuyShares_BothSides() public {
        uint256 endTime = block.timestamp + 1 days;
        uint256 marketId = market.createMarket("Will AVAX reach $100?", endTime, labels2());

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit SharesBought(marketId, alice, 0, 10 ether);
        market.buyShares{value: 10 ether}(marketId, uint256(0));

        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit SharesBought(marketId, bob, 1, 30 ether);
        market.buyShares{value: 30 ether}(marketId, uint256(1));

        (uint256[] memory pools, uint256 total) = market.getPools(marketId);
        assertEq(pools[0], 10 ether);
        assertEq(pools[1], 30 ether);
        assertEq(total, 40 ether);

        uint256[] memory aPos = market.getPosition(marketId, alice);
        assertEq(aPos[0], 10 ether);
        assertEq(aPos[1], 0);

        uint256[] memory bPos = market.getPosition(marketId, bob);
        assertEq(bPos[0], 0);
        assertEq(bPos[1], 30 ether);

        assertEq(address(market).balance, 40 ether);
    }

    function test_BuyShares_BoolCompat() public {
        uint256 marketId = market.createMarket("Q?", block.timestamp + 1 days, labels2());
        vm.prank(alice);
        market.buyShares{value: 5 ether}(marketId, true);
        assertEq(market.getShares(marketId, 0, alice), 5 ether);
        vm.prank(bob);
        market.buyShares{value: 7 ether}(marketId, false);
        assertEq(market.getShares(marketId, 1, bob), 7 ether);
    }

    function test_BuyShares_FourOutcomes() public {
        uint256 marketId = market.createMarket("Who wins?", block.timestamp + 1 days, labels4());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(0));
        vm.prank(bob);
        market.buyShares{value: 20 ether}(marketId, uint256(1));
        vm.prank(carol);
        market.buyShares{value: 30 ether}(marketId, uint256(2));
        vm.prank(dave);
        market.buyShares{value: 40 ether}(marketId, uint256(3));

        (uint256[] memory pools, uint256 total) = market.getPools(marketId);
        assertEq(pools[0], 10 ether);
        assertEq(pools[1], 20 ether);
        assertEq(pools[2], 30 ether);
        assertEq(pools[3], 40 ether);
        assertEq(total, 100 ether);
    }

    function test_BuyShares_RevertIf_ZeroDeposit() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.ZeroDeposit.selector);
        market.buyShares{value: 0}(marketId, uint256(0));
    }

    function test_BuyShares_RevertIf_MarketNotFound() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotFound.selector);
        market.buyShares{value: 1 ether}(999, uint256(0));
    }

    function test_BuyShares_RevertIf_InvalidOutcome() public {
        uint256 marketId = market.createMarket("Q?", block.timestamp + 1 days, labels2());
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.InvalidOutcome.selector);
        market.buyShares{value: 1 ether}(marketId, uint256(5));
    }

    function test_BuyShares_RevertIf_MarketExpired() public {
        uint256 endTime = block.timestamp + 1 days;
        uint256 marketId = market.createMarket("Will AVAX reach $100?", endTime, labels2());
        vm.warp(endTime + 1);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketExpired.selector);
        market.buyShares{value: 1 ether}(marketId, uint256(0));
    }

    // =========================================================================
    // 3. Resolving Market Tests
    // =========================================================================

    function test_ResolveMarket_Success_YES() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        vm.expectEmit(true, false, false, true);
        emit MarketResolved(marketId, 0);
        market.resolveMarket(marketId, uint256(0));

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Resolved));
        assertEq(m.winningOutcome, 0);
    }

    function test_ResolveMarket_Success_FourthOutcome() public {
        uint256 marketId = market.createMarket("Who wins?", block.timestamp + 1 days, labels4());
        market.resolveMarket(marketId, uint256(3));
        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.winningOutcome, 3);
    }

    function test_ResolveMarket_RevertIf_InvalidOutcome() public {
        uint256 marketId = market.createMarket("Q?", block.timestamp + 1 days, labels2());
        vm.expectRevert(PredictionMarket.InvalidOutcome.selector);
        market.resolveMarket(marketId, uint256(9));
    }

    function test_ResolveMarket_RevertIf_NotOwner() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        market.resolveMarket(marketId, uint256(0));
    }

    function test_ResolveMarket_RevertIf_AlreadyResolved() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        market.resolveMarket(marketId, uint256(0));
        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.resolveMarket(marketId, uint256(0));
    }

    function test_BuyShares_RevertIf_AlreadyResolved() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        market.resolveMarket(marketId, uint256(0));
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.buyShares{value: 1 ether}(marketId, uint256(0));
    }

    // =========================================================================
    // 4. Claiming Winnings Tests
    // =========================================================================

    function test_ClaimWinnings_ProportionalPayout_SingleWinner() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(0));
        vm.prank(bob);
        market.buyShares{value: 30 ether}(marketId, uint256(1));
        market.resolveMarket(marketId, uint256(0));

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit WinningsClaimed(marketId, alice, 40 ether);
        market.claimWinnings(marketId);

        assertEq(alice.balance, aliceBalBefore + 40 ether);
        assertEq(market.getShares(marketId, 0, alice), 0);
        assertEq(address(market).balance, 0);
    }

    function test_ClaimWinnings_ProportionalPayout_MultipleWinners() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(0));
        vm.prank(bob);
        market.buyShares{value: 30 ether}(marketId, uint256(0));
        vm.prank(carol);
        market.buyShares{value: 60 ether}(marketId, uint256(1));

        (uint256[] memory pools, uint256 total) = market.getPools(marketId);
        assertEq(pools[0], 40 ether);
        assertEq(pools[1], 60 ether);
        assertEq(total, 100 ether);

        market.resolveMarket(marketId, uint256(0));

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        market.claimWinnings(marketId);
        assertEq(alice.balance, aliceBalBefore + 25 ether);

        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        market.claimWinnings(marketId);
        assertEq(bob.balance, bobBalBefore + 75 ether);

        assertEq(address(market).balance, 0);
    }

    function test_ClaimWinnings_FourOutcomes_SoleWinner() public {
        uint256 marketId = market.createMarket("Who wins?", block.timestamp + 1 days, labels4());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(0));
        vm.prank(bob);
        market.buyShares{value: 20 ether}(marketId, uint256(1));
        vm.prank(carol);
        market.buyShares{value: 30 ether}(marketId, uint256(2));
        vm.prank(dave);
        market.buyShares{value: 40 ether}(marketId, uint256(3));

        market.resolveMarket(marketId, uint256(2));

        uint256 carolBefore = carol.balance;
        vm.prank(carol);
        market.claimWinnings(marketId);
        assertEq(carol.balance, carolBefore + 100 ether);
        assertEq(address(market).balance, 0);
    }

    function test_ClaimWinnings_FourOutcomes_Split() public {
        uint256 marketId = market.createMarket("Who wins?", block.timestamp + 1 days, labels4());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(1));
        vm.prank(bob);
        market.buyShares{value: 30 ether}(marketId, uint256(1));
        vm.prank(carol);
        market.buyShares{value: 60 ether}(marketId, uint256(0));

        market.resolveMarket(marketId, uint256(1));

        uint256 aBefore = alice.balance;
        vm.prank(alice);
        market.claimWinnings(marketId);
        assertEq(alice.balance, aBefore + 25 ether);

        uint256 bBefore = bob.balance;
        vm.prank(bob);
        market.claimWinnings(marketId);
        assertEq(bob.balance, bBefore + 75 ether);
    }

    // =========================================================================
    // 5. Rejection & Failure Mode Tests
    // =========================================================================

    function test_ClaimWinnings_RevertIf_NotResolved() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(0));
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotResolved.selector);
        market.claimWinnings(marketId);
    }

    function test_ClaimWinnings_RevertIf_DoubleClaim() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(0));
        vm.prank(bob);
        market.buyShares{value: 10 ether}(marketId, uint256(1));
        market.resolveMarket(marketId, uint256(0));

        vm.prank(alice);
        market.claimWinnings(marketId);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
    }

    function test_ClaimWinnings_RevertIf_LosingPosition() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(0));
        vm.prank(bob);
        market.buyShares{value: 10 ether}(marketId, uint256(1));
        market.resolveMarket(marketId, uint256(0));

        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
    }

    function test_ClaimWinnings_RevertIf_NonParticipant() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 1 days, labels2());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(0));
        market.resolveMarket(marketId, uint256(0));

        vm.prank(dave);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
    }
}
