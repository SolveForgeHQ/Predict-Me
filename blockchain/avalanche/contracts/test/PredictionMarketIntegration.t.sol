// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PredictionMarket.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PredictionMarketIntegrationTest is Test {
    PredictionMarket public market;

    address public owner = address(this);
    address public alice = address(0xA11CE);
    address public bob   = address(0xB0B);
    address public carol = address(0xCA901);
    address public dave  = address(0xDA7E);

    uint256 constant MIN_STAKE    = 0.01 ether;
    uint256 constant GRACE_PERIOD = 7 days;

    function setUp() public {
        market = new PredictionMarket(owner, MIN_STAKE, GRACE_PERIOD);
        vm.deal(alice, 200 ether);
        vm.deal(bob,   200 ether);
        vm.deal(carol, 200 ether);
        vm.deal(dave,  200 ether);
    }

    function labels2() internal pure returns (string[] memory l) {
        l = new string[](2); l[0] = "YES"; l[1] = "NO";
    }

    function labels4() internal pure returns (string[] memory l) {
        l = new string[](4); l[0] = "A"; l[1] = "B"; l[2] = "C"; l[3] = "D";
    }

    function _ct() internal view returns (uint64) {
        return uint64(block.timestamp + 3 days);
    }

    function _warpPastClose() internal {
        vm.warp(block.timestamp + 3 days + 1);
    }

    // ── Full flow: single YES winner ──────────────────────────────────────────

    function test_Integration_FullFlow_SingleWinner_YES() public {
        uint256 aliceStart = alice.balance;
        uint256 bobStart   = bob.balance;

        uint256 id = market.createMarket("Will AVAX reach $100?", labels2(), _ct(), "Owner decides");

        vm.prank(alice); market.buyShares{value: 40 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 60 ether}(id, 1);

        assertEq(alice.balance, aliceStart - 40 ether);
        assertEq(bob.balance,   bobStart   - 60 ether);

        _warpPastClose();
        market.resolveMarket(id, 0);

        uint256 ab = alice.balance;
        vm.prank(alice); market.claimWinnings(id);
        assertEq(alice.balance, ab + 100 ether);
        assertEq(alice.balance, aliceStart + 60 ether);   // net +60
        assertEq(address(market).balance, 0);

        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(id);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(id);
    }

    // ── Full flow: single NO winner ───────────────────────────────────────────

    function test_Integration_FullFlow_SingleWinner_NO() public {
        uint256 bobStart = bob.balance;
        uint256 id = market.createMarket("Will gas exceed 100 nAVAX?", labels2(), _ct(), "Owner decides");

        vm.prank(alice); market.buyShares{value: 30 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 70 ether}(id, 1);

        _warpPastClose();
        market.resolveMarket(id, 1);

        uint256 bb = bob.balance;
        vm.prank(bob); market.claimWinnings(id);
        assertEq(bob.balance, bb + 100 ether);
        assertEq(bob.balance, bobStart + 30 ether);
        assertEq(address(market).balance, 0);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(id);
    }

    // ── Full flow: multiple winners, proportional split, no dust ─────────────

    function test_Integration_FullFlow_MultiWinner_ProportionalSplit() public {
        uint256 id = market.createMarket("Will TPS exceed 1000?", labels2(), _ct(), "Owner decides");

        vm.prank(alice); market.buyShares{value: 20 ether}(id, 0);
        vm.prank(carol); market.buyShares{value: 60 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 120 ether}(id, 1);

        _warpPastClose();
        market.resolveMarket(id, 0);

        uint256 ab = alice.balance;
        vm.prank(alice); market.claimWinnings(id);
        assertEq(alice.balance, ab + 50 ether);

        uint256 cb = carol.balance;
        vm.prank(carol); market.claimWinnings(id);
        assertEq(carol.balance, cb + 150 ether);

        assertEq(address(market).balance, 0);

        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(id);
    }

    // ── Full flow: 4 outcomes ─────────────────────────────────────────────────

    function test_Integration_FullFlow_4Outcomes() public {
        uint256 id = market.createMarket("Who wins?", labels4(), _ct(), "Owner decides");

        vm.prank(alice); market.buyShares{value: 10 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 20 ether}(id, 1);
        vm.prank(carol); market.buyShares{value: 30 ether}(id, 2);
        vm.prank(dave);  market.buyShares{value: 40 ether}(id, 3);

        _warpPastClose();
        market.resolveMarket(id, 2); // C wins

        uint256 cb = carol.balance;
        vm.prank(carol); market.claimWinnings(id);
        assertEq(carol.balance, cb + 100 ether);
        assertEq(address(market).balance, 0);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(id);
    }

    // ── Cannot claim before resolution ───────────────────────────────────────

    function test_Integration_CannotClaimBeforeResolution() public {
        uint256 id = market.createMarket("Q?", labels2(), _ct(), "criteria");
        vm.prank(alice); market.buyShares{value: 1 ether}(id, 0);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotResolved.selector);
        market.claimWinnings(id);
    }

    // ── Cannot buy after expiration ───────────────────────────────────────────

    function test_Integration_CannotBuyAfterExpiration() public {
        uint256 id = market.createMarket("Q?", labels2(), _ct(), "criteria");
        _warpPastClose();
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketExpired.selector);
        market.buyShares{value: 1 ether}(id, 0);
    }

    // ── Non-owner cannot resolve ──────────────────────────────────────────────

    function test_Integration_NonOwnerCannotResolve() public {
        uint256 id = market.createMarket("Q?", labels2(), _ct(), "criteria");
        vm.prank(alice); market.buyShares{value: 1 ether}(id, 0);
        _warpPastClose();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        market.resolveMarket(id, 0);
    }

    // ── Auto-cancel when winning pool is zero, then full refund ──────────────

    function test_Integration_AutoCancel_UnbackedOutcome_FullRefund() public {
        uint256 id = market.createMarket("Q?", labels2(), _ct(), "criteria");
        vm.prank(alice); market.buyShares{value: 5 ether}(id, 0); // YES only
        vm.prank(bob);   market.buyShares{value: 3 ether}(id, 0);

        _warpPastClose();
        market.resolveMarket(id, 1); // NO has 0 → auto-cancel

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Cancelled));

        uint256 ab = alice.balance;
        vm.prank(alice); market.refund(id);
        assertEq(alice.balance, ab + 5 ether);

        uint256 bb = bob.balance;
        vm.prank(bob); market.refund(id);
        assertEq(bob.balance, bb + 3 ether);

        assertEq(address(market).balance, 0);
    }

    // ── cancelUnresolved after grace period ───────────────────────────────────

    function test_Integration_CancelUnresolved_AfterGracePeriod() public {
        uint256 id = market.createMarket("Q?", labels2(), _ct(), "criteria");
        vm.prank(alice); market.buyShares{value: 5 ether}(id, 0);

        vm.warp(block.timestamp + 3 days + GRACE_PERIOD + 1);
        market.cancelUnresolved(id); // anyone can call

        uint256 ab = alice.balance;
        vm.prank(alice); market.refund(id);
        assertEq(alice.balance, ab + 5 ether);
        assertEq(address(market).balance, 0);
    }
}
