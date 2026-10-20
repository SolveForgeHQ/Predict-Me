/**
 * apps/web/lib/errors.ts
 * Centralized, chain-aware transaction and wallet error formatting.
 * Covers Avalanche (viem / wagmi / RPC) and Stellar (Soroban / Freighter) error cases:
 * - Wrong network selected in wallet
 * - Insufficient AVAX / XLM for gas and fees
 * - Transaction rejected / cancelled in wallet
 * - Custom smart contract reversions
 */

export interface ErrorFormatOptions {
  chain?: "avalanche" | "stellar" | "sonic";
  currency?: string;
  action?: "trade" | "create" | "resolve" | "claim";
}

export function parseTransactionError(
  err: unknown,
  options: ErrorFormatOptions = {}
): string {
  if (!err) return "An unexpected error occurred.";

  const {
    chain = "avalanche",
    currency = chain === "stellar" ? "XLM" : chain === "sonic" ? "tokens" : "AVAX",
    action,
  } = options;
  const raw = err instanceof Error ? err.message : String(err);

  // 1. Transaction Rejected / Cancelled in Wallet
  if (
    raw.includes("User rejected") ||
    raw.includes("User denied") ||
    raw.includes("rejected in your wallet") ||
    raw.includes("rejected in wallet") ||
    raw.includes("ACTION_REJECTED") ||
    raw.includes("Transaction was rejected") ||
    raw.includes("UserRejectedRequestError") ||
    raw.includes("Transaction was cancelled") ||
    raw.includes("cancelled by user")
  ) {
    return "Transaction was cancelled in your wallet.";
  }

  // 2. Wrong Network / Chain Mismatch
  if (
    raw.includes("ChainMismatchError") ||
    raw.includes("does not match the target chain") ||
    raw.includes("ChainNotConfiguredError") ||
    raw.includes("UnsupportedChainIdError") ||
    raw.includes("wrong network") ||
    raw.includes("network mismatch") ||
    raw.includes("chain ID mismatch")
  ) {
    const networkName =
      chain === "avalanche"
        ? "Avalanche Fuji (Chain ID 43113)"
        : chain === "sonic"
        ? "Sonic Testnet (Chain ID 14601)"
        : "Stellar Testnet";
    return `Wrong network selected in wallet. Please switch your wallet to ${networkName}.`;
  }

  // 3. Insufficient balance for gas and value
  if (
    raw.includes("insufficient funds") ||
    raw.includes("exceeds balance") ||
    raw.includes("gas required exceeds allowance") ||
    raw.includes("intrinsic gas too low") ||
    raw.includes("out of gas") ||
    raw.includes("InsufficientFundsError") ||
    raw.includes("insufficient funds for transfer") ||
    raw.includes("insufficient funds for gas")
  ) {
    if (chain === "avalanche") {
      return "Insufficient AVAX balance to cover transaction value and gas fees. Please fund your wallet with Fuji AVAX from the faucet.";
    } else if (chain === "sonic") {
      return `Insufficient ${currency} balance. Make sure you have enough S for gas and ${currency} tokens for trading. Use the faucet to get test tokens.`;
    } else {
      return `Insufficient ${currency} balance to complete this purchase (including gas fees and minimum reserve).`;
    }
  }

  // 3a. ERC-20 allowance / approval issues
  if (
    raw.includes("InsufficientStake") ||
    raw.includes("insufficient allowance") ||
    raw.includes("ERC20: insufficient allowance") ||
    raw.includes("SafeERC20FailedOperation")
  ) {
    return `Insufficient ${currency} allowance. Please approve the contract to spend your tokens first.`;
  }

  // 3b. Sonic: fee-on-transfer token rejected
  if (raw.includes("BalanceNotIncreased")) {
    return "Token transfer rejected: the contract only accepts standard ERC-20 tokens (no fee-on-transfer tokens).";
  }

  // 3c. Sonic: empty resolution criteria
  if (raw.includes("EmptyResolutionCriteria")) {
    return "Resolution criteria is required for Sonic markets.";
  }

  // 3d. Sonic: grace period not yet expired
  if (raw.includes("GracePeriodNotExpired")) {
    return "The resolution grace period has not expired yet. Please wait before cancelling an unresolved market.";
  }

  // 3e. Sonic: market already finalised (resolved or cancelled)
  if (raw.includes("MarketAlreadyFinalised")) {
    return "This market has already been resolved or cancelled.";
  }

  // 3f. Sonic: resolution too early (before close time)
  if (raw.includes("ResolutionTooEarly")) {
    return "The market close time has not passed yet. Markets can only be resolved after their close time.";
  }

  // 3g. Sonic: refund on non-cancelled market
  if (raw.includes("MarketNotCancelled")) {
    return "Refunds are only available for cancelled markets.";
  }

  // 3h. Sonic: nothing to refund
  if (raw.includes("NothingToRefund")) {
    return "You have no stake to refund in this cancelled market.";
  }

  // 4. Contract Ownership / Unauthorized
  if (
    raw.includes("OwnableUnauthorizedAccount") ||
    raw.includes("caller is not the owner") ||
    raw.includes("onlyOwner")
  ) {
    const act = action === "create" ? "create markets" : action === "resolve" ? "resolve markets" : "perform this action";
    return `Access restricted: Only the contract owner can ${act} on ${chain === "avalanche" ? "Avalanche" : "Stellar"}.`;
  }

  // 5. Market Custom Errors (Avalanche & Stellar)
  if (raw.includes("MarketNotFound")) {
    return "Market does not exist on the smart contract.";
  }
  if (raw.includes("MarketNotOpen")) {
    return "This market is closed or has already been resolved.";
  }
  if (raw.includes("MarketExpired")) {
    return "This market has expired and is no longer accepting trades.";
  }
  if (raw.includes("ZeroDeposit")) {
    return `Amount must be greater than 0 ${currency}.`;
  }
  if (raw.includes("MarketNotResolved")) {
    return "This market has not been resolved yet.";
  }
  if (raw.includes("NoWinningShares")) {
    return "You have no winning shares to claim in this market.";
  }
  if (raw.includes("TransferFailed")) {
    return "Payout transfer failed on-chain.";
  }
  if (raw.includes("InvalidEndTime")) {
    return "Resolution date must be in the future.";
  }
  if (raw.includes("EmptyQuestion")) {
    return "Market question cannot be empty.";
  }

  // 6. Wallet Connection Requirements
  if (raw.includes("WalletClient is required") || raw.includes("Caller address / account is required")) {
    const chainName = chain === "avalanche" ? "Avalanche" : chain === "sonic" ? "Sonic" : "Stellar";
    return `Please connect your ${chainName} wallet to continue.`;
  }
  if (raw.includes("not configured")) {
    return raw;
  }

  // 7. Sonic-specific contract errors
  if (raw.includes("InsufficientStake")) {
    return "Amount is below the minimum stake required by the Sonic market contract.";
  }
  if (raw.includes("InvalidOutcomeCount")) {
    return "Invalid number of outcomes. Markets require between 2 and 32 outcomes.";
  }
  if (raw.includes("EmptyResolutionCriteria")) {
    return "Resolution criteria cannot be empty on Sonic.";
  }
  if (raw.includes("ResolutionTooEarly")) {
    return "Market close time has not passed yet. Resolution is only allowed after the close time.";
  }
  if (raw.includes("GracePeriodNotExpired")) {
    return "The grace period after close time has not expired. You can cancel the market once it passes.";
  }
  if (raw.includes("NothingToRefund")) {
    return "No stake to refund in this cancelled market.";
  }
  if (raw.includes("MarketNotCancelled")) {
    return "This market is not cancelled. Only cancelled markets allow refunds.";
  }
  if (raw.includes("MarketAlreadyFinalised")) {
    return "This market has already been resolved or cancelled.";
  }
  if (raw.includes("BalanceNotIncreased")) {
    return "Token transfer check failed. Fee-on-transfer tokens are not supported.";
  }
  if (raw.includes("SafeERC20FailedOperation")) {
    return "ERC-20 token transfer failed. Ensure you have approved the market contract to spend your tokens.";
  }

  // 8. Nonce / Underpriced / RPC rate limit
  if (raw.includes("nonce too low") || raw.includes("replacement transaction underpriced")) {
    return "Transaction underpriced or nonce conflict. Please reset your wallet activity or try again.";
  }

  return raw;
}
