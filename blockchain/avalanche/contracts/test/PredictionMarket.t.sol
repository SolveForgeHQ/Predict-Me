// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PredictionMarket.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PredictionMarketTest is Test {
    PredictionMarket public market;

    address public owner = address(this);
    address public alice = address(0xA11CE);
    address public bob   = address(0xB0B);
    address public carol = address(0xCA901);
    address public dave  = address(0xDA7E);

    uint256 constant MIN_STAKE    = 0.01 ether;
    uint256 constant GRACE_PERIOD = 7 days;

    // ── Events (must match contract) ──
    event MarketCreated(uint256 indexed marketId, string question, string[] outcomes, uint64 closeTime, string resolutionCriteria);
    event SharesBought(uint256 indexed marketId, address indexed buyer, uint256 outcomeIndex, uint256 amount);
    event MarketResolved(uint256 indexed marketId, uint256 winningOutcome);
    event MarketCancelled(uint256 indexed marketId);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 payout);
    event Refunded(uint256 indexed marketId, address indexed user, uint256 amount);

    function setUp() public {
        market = new PredictionMarket(owner, MIN_STAKE, GRACE_PERIOD);
        vm.deal(alice, 100 ether);
        vm.deal(bob,   100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave,  100 ether);
    }

    // ── Helpers ──

    function labels2() internal pure returns (string[] memory l) {
        l = new string[](2);
        l[0] = "YES";
        l[1] = "NO";
    }

    function labels4() internal pure returns (string[] memory l) {
        l = new string[](4);
        l[0] = "Alice";
        l[1] = "Bob";
        l[2] = "Carol";
        l[3] = "Dave";
    }

    function _closeTime() internal view returns (uint64) {
        return uint64(block.timestamp + 1 days);
    }

    function _createDefault() internal returns (uint256) {
        return market.createMarket("Will AVAX reach $100?", labels2(), _closeTime(), "Owner decides");
    }

    function _warpPastClose() internal {
        vm.warp(block.timestamp + 1 days + 1);
    }

    // =========================================================================
    // 1. Market Creation
    // =========================================================================

    function test_CreateMarket_Success() public {
        uint64 ct = _closeTime();
        uint256 marketId = market.createMarket("Will AVAX reach $100?", labels2(), ct, "Owner decides");
        assertEq(marketId, 1);
        assertEq(market.marketCount(), 1);

        PredictionMarket.Market memory m = market.getMarket(1);
        assertEq(m.question, "Will AVAX reach $100?");
        assertEq(m.closeTime, ct);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Open));
        assertEq(m.outcomeLabels.length, 2);
        assertEq(m.pools[0], 0);
        assertEq(m.pools[1], 0);
        assertEq(m.totalPool, 0);
    }

    function test_CreateMarket_FourOutcomes() public {
        uint256 id = market.createMarket("Q?", labels4(), _closeTime(), "criteria");
        assertEq(market.getOutcomes(id).length, 4);
    }

    function test_CreateMarket_RevertIf_EmptyQuestion() public {
        vm.expectRevert(PredictionMarket.EmptyQuestion.selector);
        market.createMarket("", labels2(), _closeTime(), "criteria");
    }

    function test_CreateMarket_RevertIf_EmptyResolutionCriteria() public {
        vm.expectRevert(PredictionMarket.EmptyResolutionCriteria.selector);
        market.createMarket("Q?", labels2(), _closeTime(), "");
    }

    function test_CreateMarket_RevertIf_PastCloseTime() public {
        vm.expectRevert(PredictionMarket.InvalidCloseTime.selector);
        market.createMarket("Q?", labels2(), uint64(block.timestamp), "criteria");
    }

    function test_CreateMarket_RevertIf_SingleOutcome() public {
        string[] memory l = new string[](1);
        l[0] = "Only";
        vm.expectRevert(PredictionMarket.InvalidOutcomeCount.selector);
        market.createMarket("Q?", l, _closeTime(), "criteria");
    }

    function test_CreateMarket_RevertIf_EmptyLabel() public {
        string[] memory l = new string[](2);
        l[0] = "A";
        l[1] = "";
        vm.expectRevert(PredictionMarket.EmptyOutcomeLabel.selector);
        market.createMarket("Q?", l, _closeTime(), "criteria");
    }

    function test_CreateMarket_RevertIf_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        market.createMarket("Q?", labels2(), _closeTime(), "criteria");
    }

    // =========================================================================
    // 2. Buying Shares
    // =========================================================================

    function test_BuyShares_BothSides() public {
        uint256 id = _createDefault();

        vm.prank(alice);
        market.buyShares{value: 10 ether}(id, 0);

        vm.prank(bob);
        market.buyShares{value: 30 ether}(id, 1);

        (uint256[] memory pools, uint256 total) = market.getPools(id);
        assertEq(pools[0], 10 ether);
        assertEq(pools[1], 30 ether);
        assertEq(total, 40 ether);
        assertEq(address(market).balance, 40 ether);
    }

    function test_BuyShares_FourOutcomes() public {
        uint256 id = market.createMarket("Who wins?", labels4(), _closeTime(), "criteria");
        vm.prank(alice);  market.buyShares{value: 10 ether}(id, 0);
        vm.prank(bob);    market.buyShares{value: 20 ether}(id, 1);
        vm.prank(carol);  market.buyShares{value: 30 ether}(id, 2);
        vm.prank(dave);   market.buyShares{value: 40 ether}(id, 3);
        (, uint256 total) = market.getPools(id);
        assertEq(total, 100 ether);
    }

    function test_BuyShares_RevertIf_ZeroDeposit() public {
        uint256 id = _createDefault();
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.ZeroDeposit.selector);
        market.buyShares{value: 0}(id, 0);
    }

    function test_BuyShares_RevertIf_BelowMinStake() public {
        uint256 id = _createDefault();
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.InsufficientStake.selector);
        market.buyShares{value: MIN_STAKE - 1}(id, 0);
    }

    function test_BuyShares_RevertIf_MarketNotFound() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotFound.selector);
        market.buyShares{value: 1 ether}(999, 0);
    }

    function test_BuyShares_RevertIf_InvalidOutcome() public {
        uint256 id = _createDefault();
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.InvalidOutcome.selector);
        market.buyShares{value: 1 ether}(id, 5);
    }

    function test_BuyShares_RevertIf_AfterCloseTime() public {
        uint256 id = _createDefault();
        _warpPastClose();
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketExpired.selector);
        market.buyShares{value: 1 ether}(id, 0);
    }

    function test_BuyShares_RevertIf_AlreadyResolved() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 1 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 1 ether}(id, 1);
        _warpPastClose();
        market.resolveMarket(id, 0);
        vm.prank(carol);
        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.buyShares{value: 1 ether}(id, 0);
    }

    // =========================================================================
    // 3. Resolving Markets
    // =========================================================================

    function test_ResolveMarket_Success() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 1 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 1 ether}(id, 1);
        _warpPastClose();
        market.resolveMarket(id, 0);
        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Resolved));
        assertEq(m.winningOutcome, 0);
    }

    function test_ResolveMarket_RevertIf_BeforeCloseTime() public {
        uint256 id = _createDefault();
        vm.expectRevert(PredictionMarket.ResolutionTooEarly.selector);
        market.resolveMarket(id, 0);
    }

    function test_ResolveMarket_RevertIf_InvalidOutcome() public {
        uint256 id = _createDefault();
        _warpPastClose();
        vm.expectRevert(PredictionMarket.InvalidOutcome.selector);
        market.resolveMarket(id, 9);
    }

    function test_ResolveMarket_RevertIf_NotOwner() public {
        uint256 id = _createDefault();
        _warpPastClose();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        market.resolveMarket(id, 0);
    }

    function test_ResolveMarket_RevertIf_AlreadyResolved() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 1 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 1 ether}(id, 1);
        _warpPastClose();
        market.resolveMarket(id, 0);
        vm.expectRevert(PredictionMarket.MarketAlreadyFinalised.selector);
        market.resolveMarket(id, 1);
    }

    function test_ResolveMarket_AutoCancels_WhenWinningPoolIsZero() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 1 ether}(id, 0); // only YES backed
        _warpPastClose();
        vm.expectEmit(true, false, false, false);
        emit MarketCancelled(id);
        market.resolveMarket(id, 1); // NO has 0 backers → auto-cancel
        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Cancelled));
    }

    // =========================================================================
    // 4. Cancel Market (owner) + cancelUnresolved (anyone)
    // =========================================================================

    function test_CancelMarket_Owner() public {
        uint256 id = _createDefault();
        market.cancelMarket(id);
        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Cancelled));
    }

    function test_CancelMarket_RevertIf_NotOwner() public {
        uint256 id = _createDefault();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        market.cancelMarket(id);
    }

    function test_CancelUnresolved_WorksAfterGracePeriod() public {
        uint256 id = _createDefault();
        vm.warp(block.timestamp + 1 days + GRACE_PERIOD + 1);
        market.cancelUnresolved(id);
        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.MarketStatus.Cancelled));
    }

    function test_CancelUnresolved_RevertIf_GracePeriodNotExpired() public {
        uint256 id = _createDefault();
        _warpPastClose();
        vm.expectRevert(PredictionMarket.GracePeriodNotExpired.selector);
        market.cancelUnresolved(id);
    }

    // =========================================================================
    // 5. Claim Winnings
    // =========================================================================

    function test_ClaimWinnings_SingleWinner() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 10 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 30 ether}(id, 1);
        _warpPastClose();
        market.resolveMarket(id, 0);

        uint256 before = alice.balance;
        vm.prank(alice);
        market.claimWinnings(id);
        assertEq(alice.balance, before + 40 ether);
        assertEq(address(market).balance, 0);
    }

    function test_ClaimWinnings_NoDust_MultipleWinners() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 10 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 30 ether}(id, 0);
        vm.prank(carol); market.buyShares{value: 60 ether}(id, 1);
        _warpPastClose();
        market.resolveMarket(id, 0);

        uint256 ab = alice.balance;
        vm.prank(alice); market.claimWinnings(id);
        assertEq(alice.balance, ab + 25 ether);

        uint256 bb = bob.balance;
        vm.prank(bob); market.claimWinnings(id);
        assertEq(bob.balance, bb + 75 ether);

        assertEq(address(market).balance, 0);
    }

    function test_ClaimWinnings_RevertIf_NotResolved() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 1 ether}(id, 0);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotResolved.selector);
        market.claimWinnings(id);
    }

    function test_ClaimWinnings_RevertIf_DoubleClaim() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 1 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 1 ether}(id, 1);
        _warpPastClose();
        market.resolveMarket(id, 0);
        vm.prank(alice); market.claimWinnings(id);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(id);
    }

    function test_ClaimWinnings_RevertIf_Loser() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 1 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 1 ether}(id, 1);
        _warpPastClose();
        market.resolveMarket(id, 0);
        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NoWinningShares.selector);
        market.claimWinnings(id);
    }

    // =========================================================================
    // 6. Refund (cancelled markets)
    // =========================================================================

    function test_Refund_AfterOwnerCancel() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 5 ether}(id, 0);
        vm.prank(bob);   market.buyShares{value: 3 ether}(id, 1);
        market.cancelMarket(id);

        uint256 ab = alice.balance;
        vm.prank(alice); market.refund(id);
        assertEq(alice.balance, ab + 5 ether);

        uint256 bb = bob.balance;
        vm.prank(bob); market.refund(id);
        assertEq(bob.balance, bb + 3 ether);

        assertEq(address(market).balance, 0);
    }

    function test_Refund_RevertIf_DoubleRefund() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 5 ether}(id, 0);
        market.cancelMarket(id);
        vm.prank(alice); market.refund(id);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NothingToRefund.selector);
        market.refund(id);
    }

    function test_Refund_RevertIf_NotCancelled() public {
        uint256 id = _createDefault();
        vm.prank(alice); market.buyShares{value: 5 ether}(id, 0);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotCancelled.selector);
        market.refund(id);
    }
}
