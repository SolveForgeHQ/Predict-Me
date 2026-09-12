// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PredictionMarket
 * @notice Binary prediction market on Avalanche where users can purchase YES or NO shares using native AVAX.
 *         The owner can create markets and resolve outcomes. Winners split the total pool proportionally.
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
        bool outcome; // true = YES, false = NO (valid only when Resolved)
        uint256 yesPool;
        uint256 noPool;
        uint256 totalPool;
    }

    /// @notice Auto-incrementing market ID counter
    uint256 public marketCount;

    /// @notice Mapping from market ID to Market details
    mapping(uint256 => Market) public markets;

    /// @notice Mapping from market ID => user address => YES share balance (in wei)
    mapping(uint256 => mapping(address => uint256)) public yesShares;

    /// @notice Mapping from market ID => user address => NO share balance (in wei)
    mapping(uint256 => mapping(address => uint256)) public noShares;

    // Events
    event MarketCreated(uint256 indexed marketId, string question, uint256 endTime);
    event SharesBought(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed marketId, bool outcome);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 payout);

    // Custom errors
    error InvalidEndTime();
    error EmptyQuestion();
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
     * @notice Creates a new binary prediction market. Restricted to contract owner.
     * @param question The question / proposition of the market.
     * @param endTime Unix timestamp after which no more shares can be bought.
     * @return marketId The ID of the newly created market.
     */
    function createMarket(string memory question, uint256 endTime) external onlyOwner returns (uint256) {
        if (bytes(question).length == 0) revert EmptyQuestion();
        if (endTime <= block.timestamp) revert InvalidEndTime();

        marketCount++;
        uint256 marketId = marketCount;

        markets[marketId] = Market({
            question: question,
            endTime: endTime,
            status: MarketStatus.Open,
            outcome: false,
            yesPool: 0,
            noPool: 0,
            totalPool: 0
        });

        emit MarketCreated(marketId, question, endTime);
        return marketId;
    }

    /**
     * @notice Buys YES or NO shares in a market using native AVAX.
     * @param marketId The ID of the market.
     * @param isYes True to buy YES shares, false to buy NO shares.
     */
    function buyShares(uint256 marketId, bool isYes) external payable nonReentrant {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        if (msg.value == 0) revert ZeroDeposit();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= market.endTime) revert MarketExpired();

        if (isYes) {
            market.yesPool += msg.value;
            yesShares[marketId][msg.sender] += msg.value;
        } else {
            market.noPool += msg.value;
            noShares[marketId][msg.sender] += msg.value;
        }
        market.totalPool += msg.value;

        emit SharesBought(marketId, msg.sender, isYes, msg.value);
    }

    /**
     * @notice Resolves an open market with its final outcome. Restricted to contract owner.
     * @param marketId The ID of the market.
     * @param outcome True if YES won, false if NO won.
     */
    function resolveMarket(uint256 marketId, bool outcome) external onlyOwner {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();

        market.status = MarketStatus.Resolved;
        market.outcome = outcome;

        emit MarketResolved(marketId, outcome);
    }

    /**
     * @notice Claims pro-rata winnings for the caller if they hold shares on the winning side.
     *         Zeroes out the caller's winning shares to prevent double claiming.
     * @param marketId The ID of the resolved market.
     */
    function claimWinnings(uint256 marketId) external nonReentrant {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Resolved) revert MarketNotResolved();

        bool winningOutcome = market.outcome;
        uint256 userShares = winningOutcome ? yesShares[marketId][msg.sender] : noShares[marketId][msg.sender];
        if (userShares == 0) revert NoWinningShares();

        uint256 winningPool = winningOutcome ? market.yesPool : market.noPool;
        // Total pool is split proportionally among winning share holders: (userShares * totalPool) / winningPool
        uint256 payout = (userShares * market.totalPool) / winningPool;

        // Reset shares before sending funds to prevent reentrancy
        if (winningOutcome) {
            yesShares[marketId][msg.sender] = 0;
        } else {
            noShares[marketId][msg.sender] = 0;
        }

        (bool success, ) = payable(msg.sender).call{value: payout}("");
        if (!success) revert TransferFailed();

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    // --- View Functions ---

    /**
     * @notice Returns the pool totals (YES, NO, and total pool) for a market.
     * @param marketId The ID of the market.
     * @return yesPool Total AVAX deposited for YES.
     * @return noPool Total AVAX deposited for NO.
     * @return totalPool Total AVAX in the market pool.
     */
    function getPoolTotals(uint256 marketId) external view returns (uint256 yesPool, uint256 noPool, uint256 totalPool) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        Market storage market = markets[marketId];
        return (market.yesPool, market.noPool, market.totalPool);
    }

    /**
     * @notice Returns the caller's or any address's YES and NO share position for a market.
     * @param marketId The ID of the market.
     * @param user The address to query position for.
     * @return yesBalance YES shares owned by the user.
     * @return noBalance NO shares owned by the user.
     */
    function getPosition(uint256 marketId, address user) external view returns (uint256 yesBalance, uint256 noBalance) {
        return (yesShares[marketId][user], noShares[marketId][user]);
    }

    /**
     * @notice Returns the full market details for a given market ID.
     * @param marketId The ID of the market.
     */
    function getMarket(uint256 marketId) external view returns (Market memory) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        return markets[marketId];
    }
}
