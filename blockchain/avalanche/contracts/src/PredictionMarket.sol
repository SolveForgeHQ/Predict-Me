// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PredictionMarket
 * @notice Multi-outcome parimutuel prediction market on Avalanche where users purchase
 *         shares on one of N >= 2 outcomes using native AVAX.
 *         Binary YES/NO is the N=2 case with outcomes ["YES","NO"].
 *
 * Feature parity with PredictionMarketERC20 (Sonic), replacing ERC-20 with native AVAX:
 * - Ownable2Step (deployer can differ from owner)
 * - resolutionCriteria emitted in MarketCreated for auditability
 * - closeTime enforced: resolution only allowed after closeTime
 * - cancelMarket (owner), cancelUnresolved (anyone after grace period)
 * - refund for cancelled markets
 * - Dust-free payouts via remainingPool / remainingWinningShares bookkeeping
 * - minStake enforced per buyShares call
 * - Auto-cancel if winning outcome pool is zero on resolution
 */
contract PredictionMarket is Ownable2Step, ReentrancyGuard {

    // -----------------------------------------------------------------------
    // Enums
    // -----------------------------------------------------------------------

    enum MarketStatus {
        Open,
        Resolved,
        Cancelled
    }

    // -----------------------------------------------------------------------
    // Structs
    // -----------------------------------------------------------------------

    struct Market {
        string question;
        string resolutionCriteria;
        uint64 closeTime;
        MarketStatus status;
        uint256 winningOutcome;          // valid only when Resolved
        string[] outcomeLabels;
        uint256[] pools;
        uint256 totalPool;
        // Bookkeeping for dust-free payout distribution
        uint256 remainingPool;
        uint256 remainingWinningShares;
    }

    // -----------------------------------------------------------------------
    // Immutables & constants
    // -----------------------------------------------------------------------

    /// @notice Minimum AVAX (in wei) per buyShares call.
    uint256 public immutable minStake;

    /// @notice Seconds after closeTime before anyone can force-cancel an unresolved market.
    uint256 public immutable resolutionGracePeriod;

    uint256 public constant MIN_OUTCOMES = 2;
    uint256 public constant MAX_OUTCOMES = 32;

    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    uint256 public marketCount;
    mapping(uint256 => Market) public markets;

    /// @notice shares[marketId][outcomeIndex][user] — share balance in wei (1:1 with AVAX deposited)
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public shares;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event MarketCreated(
        uint256 indexed marketId,
        string question,
        string[] outcomes,
        uint64 closeTime,
        string resolutionCriteria
    );
    event SharesBought(uint256 indexed marketId, address indexed buyer, uint256 outcomeIndex, uint256 amount);
    event MarketResolved(uint256 indexed marketId, uint256 winningOutcome);
    event MarketCancelled(uint256 indexed marketId);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 payout);
    event Refunded(uint256 indexed marketId, address indexed user, uint256 amount);

    // -----------------------------------------------------------------------
    // Custom errors
    // -----------------------------------------------------------------------

    error ZeroAddress();
    error ZeroMinStake();
    error EmptyQuestion();
    error EmptyOutcomeLabel();
    error EmptyResolutionCriteria();
    error InvalidOutcomeCount();
    error InvalidOutcome();
    error MarketNotFound();
    error MarketNotOpen();
    error MarketExpired();
    error InvalidCloseTime();
    error MarketNotResolved();
    error MarketNotCancelled();
    error MarketAlreadyFinalised();
    error InsufficientStake();
    error ZeroDeposit();
    error ResolutionTooEarly();
    error GracePeriodNotExpired();
    error NothingToRefund();
    error NoWinningShares();
    error TransferFailed();

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /**
     * @param initialOwner The owner who can create and resolve markets.
     *        May differ from the deployer — ownership uses the two-step accept pattern.
     * @param _minStake Minimum AVAX (wei) per buyShares call.
     * @param _resolutionGracePeriod Seconds after closeTime before anyone can
     *        force-cancel an unresolved market via cancelUnresolved.
     */
    constructor(
        address initialOwner,
        uint256 _minStake,
        uint256 _resolutionGracePeriod
    ) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        if (_minStake == 0) revert ZeroMinStake();
        minStake = _minStake;
        resolutionGracePeriod = _resolutionGracePeriod;
    }

    // -----------------------------------------------------------------------
    // createMarket
    // -----------------------------------------------------------------------

    /**
     * @notice Creates a new multi-outcome prediction market. Owner only.
     * @param question Human-readable market question.
     * @param outcomes Labels for each outcome (2–32 entries).
     * @param closeTime Unix timestamp after which trading closes and resolution is allowed.
     * @param resolutionCriteria How the outcome will be determined, for auditability.
     */
    function createMarket(
        string memory question,
        string[] memory outcomes,
        uint64 closeTime,
        string memory resolutionCriteria
    ) external onlyOwner returns (uint256) {
        if (bytes(question).length == 0) revert EmptyQuestion();
        if (bytes(resolutionCriteria).length == 0) revert EmptyResolutionCriteria();
        if (outcomes.length < MIN_OUTCOMES || outcomes.length > MAX_OUTCOMES) revert InvalidOutcomeCount();
        if (closeTime <= block.timestamp) revert InvalidCloseTime();

        for (uint256 i = 0; i < outcomes.length; i++) {
            if (bytes(outcomes[i]).length == 0) revert EmptyOutcomeLabel();
        }

        marketCount++;
        uint256 marketId = marketCount;

        Market storage m = markets[marketId];
        m.question = question;
        m.resolutionCriteria = resolutionCriteria;
        m.closeTime = closeTime;
        m.status = MarketStatus.Open;
        m.winningOutcome = 0;
        m.totalPool = 0;
        m.remainingPool = 0;
        m.remainingWinningShares = 0;

        for (uint256 i = 0; i < outcomes.length; i++) {
            m.outcomeLabels.push(outcomes[i]);
            m.pools.push(0);
        }

        emit MarketCreated(marketId, question, outcomes, closeTime, resolutionCriteria);
        return marketId;
    }

    // -----------------------------------------------------------------------
    // buyShares
    // -----------------------------------------------------------------------

    /**
     * @notice Buys shares on one outcome using native AVAX (sent as msg.value).
     *         Shares are 1:1 with wei deposited. Must be >= minStake.
     * @param marketId The market to buy shares in.
     * @param outcomeIndex Index of the outcome to back (0 .. N-1).
     */
    function buyShares(uint256 marketId, uint256 outcomeIndex) external payable nonReentrant {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        if (msg.value == 0) revert ZeroDeposit();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= market.closeTime) revert MarketExpired();
        if (msg.value < minStake) revert InsufficientStake();
        if (outcomeIndex >= market.outcomeLabels.length) revert InvalidOutcome();

        market.pools[outcomeIndex] += msg.value;
        shares[marketId][outcomeIndex][msg.sender] += msg.value;
        market.totalPool += msg.value;

        emit SharesBought(marketId, msg.sender, outcomeIndex, msg.value);
    }

    // -----------------------------------------------------------------------
    // resolveMarket
    // -----------------------------------------------------------------------

    /**
     * @notice Resolves a market to its winning outcome. Owner only, only after closeTime.
     *         If nobody backed the winning outcome (pool == 0), the market is cancelled
     *         instead so funds are not stranded.
     */
    function resolveMarket(uint256 marketId, uint256 winningIndex) external onlyOwner {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketAlreadyFinalised();
        if (block.timestamp < market.closeTime) revert ResolutionTooEarly();
        if (winningIndex >= market.outcomeLabels.length) revert InvalidOutcome();

        // Auto-cancel if nobody backed the winning outcome
        if (market.pools[winningIndex] == 0) {
            market.status = MarketStatus.Cancelled;
            emit MarketCancelled(marketId);
            return;
        }

        market.status = MarketStatus.Resolved;
        market.winningOutcome = winningIndex;
        market.remainingPool = market.totalPool;
        market.remainingWinningShares = market.pools[winningIndex];

        emit MarketResolved(marketId, winningIndex);
    }

    // -----------------------------------------------------------------------
    // cancelMarket
    // -----------------------------------------------------------------------

    /**
     * @notice Cancels an unresolved market. Owner only.
     *         Stakers can then call refund() to reclaim their AVAX.
     */
    function cancelMarket(uint256 marketId) external onlyOwner {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketAlreadyFinalised();

        market.status = MarketStatus.Cancelled;
        emit MarketCancelled(marketId);
    }

    // -----------------------------------------------------------------------
    // cancelUnresolved
    // -----------------------------------------------------------------------

    /**
     * @notice Allows anyone to cancel a market still unresolved after
     *         closeTime + resolutionGracePeriod. Protects users if the owner
     *         disappears. Stakers can then call refund().
     */
    function cancelUnresolved(uint256 marketId) external {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketAlreadyFinalised();
        if (block.timestamp <= uint256(market.closeTime) + resolutionGracePeriod) revert GracePeriodNotExpired();

        market.status = MarketStatus.Cancelled;
        emit MarketCancelled(marketId);
    }

    // -----------------------------------------------------------------------
    // claimWinnings
    // -----------------------------------------------------------------------

    /**
     * @notice Claims a proportional share of the AVAX pool for holders of the winning outcome.
     *         Uses remainingPool / remainingWinningShares so the last claimer receives
     *         the exact remainder — no dust stranded in the contract.
     */
    function claimWinnings(uint256 marketId) external nonReentrant {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Resolved) revert MarketNotResolved();

        uint256 winner = market.winningOutcome;
        uint256 userShares = shares[marketId][winner][msg.sender];
        if (userShares == 0) revert NoWinningShares();

        uint256 payout = (userShares * market.remainingPool) / market.remainingWinningShares;

        // Effects: zero shares first (CEI), then update running totals
        shares[marketId][winner][msg.sender] = 0;
        market.remainingPool -= payout;
        market.remainingWinningShares -= userShares;

        // Interactions: send native AVAX
        (bool success, ) = payable(msg.sender).call{value: payout}("");
        if (!success) revert TransferFailed();

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    // -----------------------------------------------------------------------
    // refund
    // -----------------------------------------------------------------------

    /**
     * @notice Refunds the caller's total stake across all outcomes in a cancelled market.
     *         Shares are zeroed before the transfer (CEI).
     */
    function refund(uint256 marketId) external nonReentrant {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Cancelled) revert MarketNotCancelled();

        uint256 totalRefund = 0;
        uint256 len = market.outcomeLabels.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 userShares = shares[marketId][i][msg.sender];
            if (userShares > 0) {
                totalRefund += userShares;
                shares[marketId][i][msg.sender] = 0; // zero before transfer
            }
        }

        if (totalRefund == 0) revert NothingToRefund();

        (bool success, ) = payable(msg.sender).call{value: totalRefund}("");
        if (!success) revert TransferFailed();

        emit Refunded(marketId, msg.sender, totalRefund);
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    function getMarket(uint256 marketId) external view returns (Market memory) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        return markets[marketId];
    }

    function getOutcomes(uint256 marketId) external view returns (string[] memory) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        return markets[marketId].outcomeLabels;
    }

    function getPools(uint256 marketId) external view returns (uint256[] memory outcomePools, uint256 totalPool) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        Market storage market = markets[marketId];
        return (market.pools, market.totalPool);
    }

    function getPosition(uint256 marketId, address user) external view returns (uint256[] memory balances) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        Market storage market = markets[marketId];
        balances = new uint256[](market.outcomeLabels.length);
        for (uint256 i = 0; i < market.outcomeLabels.length; i++) {
            balances[i] = shares[marketId][i][user];
        }
        return balances;
    }

    function getShares(uint256 marketId, uint256 outcomeIndex, address user) external view returns (uint256) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        return shares[marketId][outcomeIndex][user];
    }
}
