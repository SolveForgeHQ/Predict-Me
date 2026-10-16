// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PredictionMarket
 * @notice Multi-outcome prediction market on Avalanche where users purchase
 *         shares on one of N >= 2 outcomes using native AVAX.
 *         Binary YES/NO is the N=2 case with outcomes ["YES","NO"]
 *         (index 0 = YES, 1 = NO). Winners split the total pool proportionally.
 */
contract PredictionMarket is Ownable, ReentrancyGuard {
    enum MarketStatus {
        Open,
        Resolved
    }

    struct Market {
        string question;
        uint256 endTime;
        MarketStatus status;
        uint256 winningOutcome; // valid only when Resolved
        string[] outcomeLabels;
        uint256[] pools;
        uint256 totalPool;
    }

    /// @notice Minimum and maximum outcomes per market
    uint256 public constant MIN_OUTCOMES = 2;
    uint256 public constant MAX_OUTCOMES = 32;

    /// @notice Auto-incrementing market ID counter
    uint256 public marketCount;

    /// @notice Mapping from market ID to Market details
    mapping(uint256 => Market) public markets;

    /// @notice Mapping market ID => outcome index => user => shares (in wei)
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public shares;

    // Events (outcome as uint256 index; N=2: 0=YES, 1=NO)
    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime);
    event SharesBought(
        uint256 indexed marketId,
        address indexed buyer,
        uint256 outcomeIndex,
        uint256 amount
    );
    event MarketResolved(uint256 indexed marketId, uint256 winningOutcome);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 payout);

    // Custom errors
    error InvalidEndTime();
    error EmptyQuestion();
    error EmptyOutcomeLabel();
    error InvalidOutcomeCount();
    error InvalidOutcome();
    error MarketNotFound();
    error MarketNotOpen();
    error MarketExpired();
    error MarketNotResolved();
    error ZeroDeposit();
    error NoWinningShares();
    error TransferFailed();

    /**
     * @notice Initializes the contract and sets the contract deployer as the initial owner.
     */
    constructor() Ownable(msg.sender) {}

    /**
     * @notice Creates a new multi-outcome prediction market. Restricted to owner.
     */
    function createMarket(
        string memory question,
        uint256 endTime,
        string[] memory outcomeLabels
    ) public onlyOwner returns (uint256) {
        return _createMarket(question, endTime, outcomeLabels);
    }

    /**
     * @notice Backward-compat binary market creation (N=2: ["YES","NO"]).
     */
    function createMarket(
        string memory question,
        uint256 endTime
    ) external onlyOwner returns (uint256) {
        string[] memory labels = new string[](2);
        labels[0] = "YES";
        labels[1] = "NO";
        return _createMarket(question, endTime, labels);
    }

    function _createMarket(
        string memory question,
        uint256 endTime,
        string[] memory outcomeLabels
    ) internal returns (uint256) {
        if (bytes(question).length == 0) revert EmptyQuestion();
        if (endTime <= block.timestamp) revert InvalidEndTime();
        if (outcomeLabels.length < MIN_OUTCOMES || outcomeLabels.length > MAX_OUTCOMES)
            revert InvalidOutcomeCount();
        for (uint256 i = 0; i < outcomeLabels.length; i++) {
            if (bytes(outcomeLabels[i]).length == 0) revert EmptyOutcomeLabel();
        }

        marketCount++;
        uint256 marketId = marketCount;

        Market storage m = markets[marketId];
        m.question = question;
        m.endTime = endTime;
        m.status = MarketStatus.Open;
        m.winningOutcome = 0;
        m.totalPool = 0;
        for (uint256 i = 0; i < outcomeLabels.length; i++) {
            m.outcomeLabels.push(outcomeLabels[i]);
            m.pools.push(0);
        }

        emit MarketCreated(marketId, question, endTime);
        return marketId;
    }

    /**
     * @notice Buys shares on one outcome using native AVAX.
     * @param marketId The ID of the market.
     * @param outcomeIndex Outcome index 0..N-1 (N=2: 0=YES, 1=NO).
     */
    function buyShares(uint256 marketId, uint256 outcomeIndex) public payable nonReentrant {
        _buyShares(marketId, outcomeIndex);
    }

    /**
     * @notice Backward-compat binary buy (maps YES->0, NO->1). Same code path.
     */
    function buyShares(uint256 marketId, bool isYes) external payable nonReentrant {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        if (markets[marketId].outcomeLabels.length != 2) revert InvalidOutcome();
        _buyShares(marketId, isYes ? 0 : 1);
    }

    function _buyShares(uint256 marketId, uint256 outcomeIndex) internal {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        if (msg.value == 0) revert ZeroDeposit();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= market.endTime) revert MarketExpired();
        if (outcomeIndex >= market.outcomeLabels.length) revert InvalidOutcome();

        market.pools[outcomeIndex] += msg.value;
        shares[marketId][outcomeIndex][msg.sender] += msg.value;
        market.totalPool += msg.value;

        emit SharesBought(marketId, msg.sender, outcomeIndex, msg.value);
    }

    /**
     * @notice Resolves an open market with its winning outcome. Restricted to owner.
     */
    function resolveMarket(uint256 marketId, uint256 winningOutcome) public onlyOwner {
        _resolveMarket(marketId, winningOutcome);
    }

    /**
     * @notice Backward-compat binary resolve (YES->0, NO->1). Same code path.
     */
    function resolveMarket(uint256 marketId, bool outcome) external onlyOwner {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        if (markets[marketId].outcomeLabels.length != 2) revert InvalidOutcome();
        _resolveMarket(marketId, outcome ? uint256(0) : uint256(1));
    }

    function _resolveMarket(uint256 marketId, uint256 winningOutcome) internal {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (winningOutcome >= market.outcomeLabels.length) revert InvalidOutcome();

        market.status = MarketStatus.Resolved;
        market.winningOutcome = winningOutcome;

        emit MarketResolved(marketId, winningOutcome);
    }

    /**
     * @notice Claims pro-rata winnings for the caller if they hold shares on the winning outcome.
     */
    function claimWinnings(uint256 marketId) external nonReentrant {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Resolved) revert MarketNotResolved();

        uint256 winner = market.winningOutcome;
        uint256 userShares = shares[marketId][winner][msg.sender];
        if (userShares == 0) revert NoWinningShares();

        uint256 winningPool = market.pools[winner];
        if (winningPool == 0) revert NoWinningShares();
        uint256 payout = (userShares * market.totalPool) / winningPool;

        shares[marketId][winner][msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: payout}("");
        if (!success) revert TransferFailed();

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    // --- View Functions ---

    function getPools(
        uint256 marketId
    ) external view returns (uint256[] memory outcomePools, uint256 totalPool) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        Market storage market = markets[marketId];
        return (market.pools, market.totalPool);
    }

    /**
     * @notice Binary-compat pool totals (requires N=2). Returns (yesPool, noPool, totalPool).
     */
    function getPoolTotals(
        uint256 marketId
    ) external view returns (uint256 yesPool, uint256 noPool, uint256 totalPool) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        Market storage market = markets[marketId];
        if (market.outcomeLabels.length != 2) revert InvalidOutcome();
        return (market.pools[0], market.pools[1], market.totalPool);
    }

    /**
     * @notice Returns one user's shares across all outcomes.
     */
    function getPosition(
        uint256 marketId,
        address user
    ) external view returns (uint256[] memory balances) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        Market storage market = markets[marketId];
        balances = new uint256[](market.outcomeLabels.length);
        for (uint256 i = 0; i < market.outcomeLabels.length; i++) {
            balances[i] = shares[marketId][i][user];
        }
        return balances;
    }

    function getShares(
        uint256 marketId,
        uint256 outcomeIndex,
        address user
    ) external view returns (uint256) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        return shares[marketId][outcomeIndex][user];
    }

    function getOutcomes(uint256 marketId) external view returns (string[] memory) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        return markets[marketId].outcomeLabels;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        return markets[marketId];
    }
}
