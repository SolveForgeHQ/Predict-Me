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
  chain?: "avalanche" | "stellar";
  currency?: string;
  action?: "trade" | "create" | "resolve" | "claim";
}

export function parseTransactionError(
  err: unknown,
  options: ErrorFormatOptions = {}
): string {
  if (!err) return "An unexpected error occurred.";

  const { chain = "avalanche", currency = chain === "avalanche" ? "AVAX" : "XLM", action } = options;
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
    return `Wrong network selected in wallet. Please switch your wallet to ${
      chain === "avalanche" ? "Avalanche Fuji (Chain ID 43113)" : "Stellar Testnet"
    }.`;
  }

  // 3. Insufficient AVAX / XLM for Gas and Value
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
    } else {
      return `Insufficient ${currency} balance to complete this purchase (including gas fees and minimum reserve).`;
    }
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
    return `Please connect your ${chain === "avalanche" ? "Avalanche" : "Stellar"} wallet to continue.`;
  }
  if (raw.includes("not configured")) {
    return raw;
  }

  // 7. Nonce / Underpriced / RPC rate limit
  if (raw.includes("nonce too low") || raw.includes("replacement transaction underpriced")) {
    return "Transaction underpriced or nonce conflict. Please reset your wallet activity or try again.";
  }

  return raw;
}
