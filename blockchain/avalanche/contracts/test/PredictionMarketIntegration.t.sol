// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PredictionMarket.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PredictionMarketIntegrationTest
 * @notice End-to-end lifecycle: create -> buy -> resolve -> claim
 *         Covers N=2 regression (YES=0, NO=1) and N=4 multi-outcome.
 */
contract PredictionMarketIntegrationTest is Test {
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
        vm.deal(bob, 200 ether);
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
        l[0] = "A";
        l[1] = "B";
        l[2] = "C";
        l[3] = "D";
        return l;
    }

    function test_Integration_FullFlow_SingleWinner_YES() public {
        uint256 initialAliceBalance = alice.balance;
        uint256 initialBobBalance = bob.balance;

        uint256 endTime = block.timestamp + 3 days;
        string memory question = "Will Avalanche Subnets surpass 500 in 2026?";

        vm.expectEmit(true, false, false, true);
        emit MarketCreated(1, question, endTime);
        uint256 marketId = market.createMarket(question, endTime, labels2());

        assertEq(marketId, 1);
        assertEq(market.marketCount(), 1);

        PredictionMarket.Market memory m = market.getMarket(marketId);
        assertEq(m.question, question);
        assertEq(m.endTime, endTime);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Open));
        assertEq(m.pools[0], 0);
        assertEq(m.pools[1], 0);
        assertEq(m.totalPool, 0);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit SharesBought(marketId, alice, 0, 40 ether);
        market.buyShares{value: 40 ether}(marketId, uint256(0));

        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit SharesBought(marketId, bob, 1, 60 ether);
        market.buyShares{value: 60 ether}(marketId, uint256(1));

        assertEq(alice.balance, initialAliceBalance - 40 ether);
        assertEq(bob.balance, initialBobBalance - 60 ether);

        (uint256 yesPool, uint256 noPool, uint256 totalPool) = market.getPoolTotals(marketId);
        assertEq(yesPool, 40 ether);
        assertEq(noPool, 60 ether);
        assertEq(totalPool, 100 ether);
        assertEq(address(market).balance, 100 ether);

        uint256[] memory aPos = market.getPosition(marketId, alice);
        assertEq(aPos[0], 40 ether);
        assertEq(aPos[1], 0);

        uint256[] memory bPos = market.getPosition(marketId, bob);
        assertEq(bPos[0], 0);
        assertEq(bPos[1], 60 ether);

        vm.expectEmit(true, false, false, true);
        emit MarketResolved(marketId, 0);
        market.resolveMarket(marketId, uint256(0));

        m = market.getMarket(marketId);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Resolved));
        assertEq(m.winningOutcome, 0);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.buyShares{value: 1 ether}(marketId, uint256(0));

        uint256 aliceBalBeforeClaim = alice.balance;
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit WinningsClaimed(marketId, alice, 100 ether);
        market.claimWinnings(marketId);

        assertEq(alice.balance, aliceBalBeforeClaim + 100 ether);
        assertEq(alice.balance, initialAliceBalance + 60 ether);
        assertEq(market.getShares(marketId, 0, alice), 0);
        assertEq(address(market).balance, 0);

        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);

        vm.prank(dave);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
    }

    function test_Integration_FullFlow_SingleWinner_NO() public {
        uint256 initialBobBalance = bob.balance;
        uint256 endTime = block.timestamp + 1 days;
        uint256 marketId = market.createMarket("Will gas fees exceed 100 nAVAX?", endTime, labels2());

        vm.prank(alice);
        market.buyShares{value: 30 ether}(marketId, uint256(0));
        vm.prank(bob);
        market.buyShares{value: 70 ether}(marketId, uint256(1));

        market.resolveMarket(marketId, uint256(1));

        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        market.claimWinnings(marketId);

        assertEq(bob.balance, bobBalBefore + 100 ether);
        assertEq(bob.balance, initialBobBalance + 30 ether);
        assertEq(market.getShares(marketId, 1, bob), 0);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);

        assertEq(address(market).balance, 0);
    }

    function test_Integration_FullFlow_MultiWinner_ProportionalSplit() public {
        uint256 initialAliceBalance = alice.balance;
        uint256 initialCarolBalance = carol.balance;
        uint256 initialBobBalance = bob.balance;

        uint256 marketId =
            market.createMarket("Will Avalanche TPS exceed 1000?", block.timestamp + 5 days, labels2());

        vm.prank(alice);
        market.buyShares{value: 20 ether}(marketId, uint256(0));
        vm.prank(carol);
        market.buyShares{value: 60 ether}(marketId, uint256(0));
        vm.prank(bob);
        market.buyShares{value: 120 ether}(marketId, uint256(1));

        (uint256 yesPool, uint256 noPool, uint256 totalPool) = market.getPoolTotals(marketId);
        assertEq(yesPool, 80 ether);
        assertEq(noPool, 120 ether);
        assertEq(totalPool, 200 ether);
        assertEq(address(market).balance, 200 ether);

        market.resolveMarket(marketId, uint256(0));

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit WinningsClaimed(marketId, alice, 50 ether);
        market.claimWinnings(marketId);

        assertEq(alice.balance, aliceBalBefore + 50 ether);
        assertEq(alice.balance, initialAliceBalance + 30 ether);
        assertEq(market.getShares(marketId, 0, alice), 0);
        assertEq(address(market).balance, 150 ether);

        uint256 carolBalBefore = carol.balance;
        vm.prank(carol);
        vm.expectEmit(true, true, false, true);
        emit WinningsClaimed(marketId, carol, 150 ether);
        market.claimWinnings(marketId);

        assertEq(carol.balance, carolBalBefore + 150 ether);
        assertEq(carol.balance, initialCarolBalance + 90 ether);
        assertEq(market.getShares(marketId, 0, carol), 0);
        assertEq(address(market).balance, 0);

        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
        assertEq(bob.balance, initialBobBalance - 120 ether);
    }

    function test_Integration_FourOutcomes_FullFlow() public {
        uint256 marketId =
            market.createMarket("Who wins?", block.timestamp + 2 days, labels4());

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

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(marketId);
    }

    function test_Integration_CannotClaimBeforeResolution() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 2 days, labels2());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(0));
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotResolved.selector);
        market.claimWinnings(marketId);
    }

    function test_Integration_NonOwnerCannotResolve() public {
        uint256 marketId = market.createMarket("Will AVAX reach $100?", block.timestamp + 2 days, labels2());
        vm.prank(alice);
        market.buyShares{value: 10 ether}(marketId, uint256(0));
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        market.resolveMarket(marketId, uint256(0));
    }

    function test_Integration_CannotBuyAfterExpiration() public {
        uint256 endTime = block.timestamp + 1 hours;
        uint256 marketId = market.createMarket("Will AVAX reach $100?", endTime, labels2());
        vm.warp(endTime + 1);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketExpired.selector);
        market.buyShares{value: 1 ether}(marketId, uint256(0));
    }
}
