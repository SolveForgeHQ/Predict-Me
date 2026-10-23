// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PredictionMarketERC20
 * @notice Multi-outcome parimutuel prediction market that uses an ERC-20 token (e.g. USDC)
 *         for staking and payouts instead of native gas token. Winners split the total pool
 *         proportionally. If the winning outcome has zero backers the market is cancelled
 *         and all stakers can reclaim their funds.
 */
contract PredictionMarketERC20 is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

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
        uint256 winningOutcome; // valid only when Resolved
        string[] outcomeLabels;
        uint256[] pools;
        uint256 totalPool;
        // Bookkeeping for exact, dust-free payout distribution
        uint256 remainingPool;
        uint256 remainingWinningShares;
    }

    // -----------------------------------------------------------------------
    // Immutables & constants
    // -----------------------------------------------------------------------

    IERC20 public immutable token;
    uint256 public immutable minStake;
    uint256 public immutable resolutionGracePeriod;

    uint256 public constant MIN_OUTCOMES = 2;
    uint256 public constant MAX_OUTCOMES = 32;

    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
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
    error ZeroAmount();
    error BalanceNotIncreased();
    error ResolutionTooEarly();
    error GracePeriodNotExpired();
    error NothingToRefund();
    error NoWinningShares();

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /**
     * @param _token The ERC-20 token used for staking and payouts (e.g. USDC).
     * @param initialOwner The owner who can create and resolve markets. May differ from
     *        the deployer key — ownership uses the two-step accept pattern.
     * @param _minStake Minimum token amount per buyShares call (in base units).
     * @param _resolutionGracePeriod Seconds after closeTime before anyone can force-cancel
     *        an unresolved market via cancelUnresolved.
     */
    constructor(
        address _token,
        address initialOwner,
        uint256 _minStake,
        uint256 _resolutionGracePeriod
    ) Ownable(initialOwner) {
        if (_token == address(0)) revert ZeroAddress();
        if (initialOwner == address(0)) revert ZeroAddress();
        if (_minStake == 0) revert ZeroMinStake();

        token = IERC20(_token);
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
     *        Must be in the future.
     * @param resolutionCriteria Description of how the outcome will be determined, for auditability.
     * @return marketId The ID of the newly created market.
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
     * @notice Buys shares on one outcome by pulling ERC-20 tokens from the caller.
     *         Shares are 1:1 with token base units. Rejects fee-on-transfer tokens
     *         by verifying the contract balance increased by exactly `amount`.
     * @param marketId The market to buy shares in.
     * @param outcomeIndex Index of the outcome to back (0 .. N-1).
     * @param amount Token amount to stake (must be >= minStake).
     */
    function buyShares(uint256 marketId, uint256 outcomeIndex, uint256 amount) external nonReentrant {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        if (amount == 0) revert ZeroAmount();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= market.closeTime) revert MarketExpired();
        if (amount < minStake) revert InsufficientStake();
        if (outcomeIndex >= market.outcomeLabels.length) revert InvalidOutcome();

        // Pull tokens and verify exact amount received (rejects fee-on-transfer tokens)
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = token.balanceOf(address(this));
        if (balanceAfter - balanceBefore != amount) revert BalanceNotIncreased();

        // Effects
        market.pools[outcomeIndex] += amount;
        shares[marketId][outcomeIndex][msg.sender] += amount;
        market.totalPool += amount;

        emit SharesBought(marketId, msg.sender, outcomeIndex, amount);
    }

    // -----------------------------------------------------------------------
    // resolveMarket
    // -----------------------------------------------------------------------

    /**
     * @notice Resolves a market to its winning outcome. Owner only, and only after
     *         closeTime. If nobody backed the winning outcome (pool == 0), the market
     *         is cancelled instead so funds are not stranded.
     * @param marketId The market to resolve.
     * @param winningIndex The index of the winning outcome.
     */
    function resolveMarket(uint256 marketId, uint256 winningIndex) external onlyOwner {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketAlreadyFinalised();
        if (block.timestamp < market.closeTime) revert ResolutionTooEarly();
        if (winningIndex >= market.outcomeLabels.length) revert InvalidOutcome();

        // If nobody backed the winning outcome, cancel instead of stranding funds
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
     * @notice Cancels an unresolved market. Owner only. Stakers can then call
     *         refund() to reclaim their tokens.
     * @param marketId The market to cancel.
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
     * @notice Allows anyone to cancel a market that is still unresolved after
     *         closeTime + resolutionGracePeriod. Protects users if the owner
     *         disappears. Stakers can then call refund().
     * @param marketId The market to cancel.
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
     * @notice Claims a proportional share of the total pool for holders of the winning
     *         outcome. Uses remainingPool / remainingWinningShares bookkeeping so the
     *         last claimer receives the exact remainder with no stranded dust.
     * @param marketId The resolved market to claim from.
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

        // Interactions
        token.safeTransfer(msg.sender, payout);

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    // -----------------------------------------------------------------------
    // refund
    // -----------------------------------------------------------------------

    /**
     * @notice Refunds the caller's total stake across all outcomes in a cancelled market.
     *         Shares are zeroed before the transfer (CEI).
     * @param marketId The cancelled market to refund from.
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
                shares[marketId][i][msg.sender] = 0; // Effects: zero first
            }
        }

        if (totalRefund == 0) revert NothingToRefund();

        // Interactions
        token.safeTransfer(msg.sender, totalRefund);

        emit Refunded(marketId, msg.sender, totalRefund);
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /**
     * @return The full Market struct for a given market ID.
     */
    function getMarket(uint256 marketId) external view returns (Market memory) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        return markets[marketId];
    }

    /**
     * @return The outcome labels for a given market.
     */
    function getOutcomes(uint256 marketId) external view returns (string[] memory) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        return markets[marketId].outcomeLabels;
    }

    /**
     * @return outcomePools Per-outcome pool amounts.
     * @return totalPool The combined pool across all outcomes.
     */
    function getPools(uint256 marketId) external view returns (uint256[] memory outcomePools, uint256 totalPool) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        Market storage market = markets[marketId];
        return (market.pools, market.totalPool);
    }

    /**
     * @return balances The caller's share balance for each outcome.
     */
    function getPosition(uint256 marketId, address user) external view returns (uint256[] memory balances) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotFound();
        Market storage market = markets[marketId];
        balances = new uint256[](market.outcomeLabels.length);
        for (uint256 i = 0; i < market.outcomeLabels.length; i++) {
            balances[i] = shares[marketId][i][user];
        }
        return balances;
    }
}
