# Avalanche Fuji — Prediction Market Integration

This document covers the EVM-based prediction market contract deployed on the Avalanche Fuji
testnet, how to run the Foundry test suite locally, and how to deploy your own instance.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Contract: PredictionMarket.sol](#contract-predictionmarketsol)
3. [Trading Flow](#trading-flow)
4. [Payout Formula](#payout-formula)
5. [Fuji Testnet Details](#fuji-testnet-details)
6. [Environment Setup](#environment-setup)
7. [Running Tests Locally](#running-tests-locally)
8. [Deploying to Fuji](#deploying-to-fuji)
9. [Frontend Integration](#frontend-integration)
10. [Error Reference](#error-reference)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js Frontend (apps/web)                                    │
│  ┌──────────────┐  ┌───────────────────┐  ┌─────────────────┐  │
│  │ ChainContext  │  │  WalletContext     │  │ AvalancheMarket │  │
│  │ chain=       │  │ evmAddress         │  │ Client (viem)   │  │
│  │ "avalanche"  │  │ isWrongNetwork     │  │                 │  │
│  └──────┬───────┘  └────────┬──────────┘  └────────┬────────┘  │
│         └───────────────────┴─────────────────────┘            │
└────────────────────────────────┬────────────────────────────────┘
                                 │ JSON-RPC (viem WalletClient)
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│  Avalanche Fuji C-Chain (Chain ID 43113)                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PredictionMarket.sol                                    │  │
│  │  ┌─────────────┐  ┌────────────┐  ┌──────────────────┐  │  │
│  │  │createMarket │  │ buyShares  │  │ resolveMarket    │  │  │
│  │  │             │  │ (payable)  │  │ (onlyOwner)      │  │  │
│  │  └─────────────┘  └────────────┘  └──────────────────┘  │  │
│  │  ┌──────────────────┐                                    │  │
│  │  │  claimWinnings   │                                    │  │
│  │  └──────────────────┘                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Contract: PredictionMarket.sol

**Source:** [`blockchain/avalanche/contracts/src/PredictionMarket.sol`](../blockchain/avalanche/contracts/src/PredictionMarket.sol)

### Storage

| Field | Type | Description |
|---|---|---|
| `marketCount` | `uint256` | Auto-incrementing market ID (starts at 1) |
| `markets` | `mapping(uint256 => Market)` | Market state by ID |
| `yesShares` | `mapping(uint256 => mapping(address => uint256))` | YES share balances |
| `noShares` | `mapping(uint256 => mapping(address => uint256))` | NO share balances |

### Market Struct

```solidity
struct Market {
    string question;
    uint256 endTime;
    uint256 yesPool;
    uint256 noPool;
    uint256 totalPool;
    MarketStatus status;   // Open | Resolved
    bool outcome;          // true = YES, false = NO
}
```

### Custom Errors

| Error | Thrown When |
|---|---|
| `MarketNotOpen` | Buying on a non-Open market |
| `MarketExpired` | Buying after `endTime` |
| `MarketNotResolved` | Claiming on an unresolved market |
| `NoWinningShares` | Claimer holds no winning shares (or already claimed) |
| `InvalidAmount` | `msg.value == 0` |

---

## Trading Flow

### 1. `createMarket(string question, uint256 endTime) → uint256 marketId`

Only callable by the contract **owner** (the deployer address). Creates a new binary prediction market.

```solidity
uint256 marketId = market.createMarket(
    "Will AVAX reach $100 by end of 2026?",
    block.timestamp + 7 days
);
```

Emits: `MarketCreated(marketId, question, endTime)`

---

### 2. `buyShares(uint256 marketId, bool isYes) payable`

Any address may buy YES or NO shares by sending AVAX with the call. Shares are denominated 1:1 with AVAX (1 share = 1 wei of AVAX sent).

```solidity
// Buy 1 AVAX worth of YES shares
market.buyShares{value: 1 ether}(marketId, true);

// Buy 2 AVAX worth of NO shares
market.buyShares{value: 2 ether}(marketId, false);
```

Emits: `SharesBought(marketId, buyer, isYes, amount)`

**Constraints:**
- `msg.value > 0`
- `market.status == Open`
- `block.timestamp < market.endTime`

---

### 3. `resolveMarket(uint256 marketId, bool outcome) onlyOwner`

Resolves the market to a YES (`true`) or NO (`false`) outcome. Only callable by the owner. Can be called before or after `endTime`.

```solidity
market.resolveMarket(marketId, true); // YES wins
```

Emits: `MarketResolved(marketId, outcome)`

---

### 4. `claimWinnings(uint256 marketId)`

Winners call this to collect their proportional share of the total pool. Shares are zeroed before the ETH transfer (CEI pattern — prevents reentrancy).

```solidity
market.claimWinnings(marketId);
```

Emits: `WinningsClaimed(marketId, claimer, payout)`

---

## Payout Formula

Payouts are proportional to a winner's share of the winning pool:

```
payout = (userWinningShares × totalPool) / winningPool
```

**Example — Single winner:**
- Alice: 40 AVAX YES, Bob: 60 AVAX NO → YES wins
- `totalPool = 100 AVAX`, `yesPool = 40 AVAX`
- Alice payout: `(40 × 100) / 40 = 100 AVAX` (+60 AVAX profit)

**Example — Two winners:**
- Alice: 20 AVAX YES, Carol: 60 AVAX YES, Bob: 120 AVAX NO → YES wins
- `totalPool = 200 AVAX`, `yesPool = 80 AVAX`
- Alice payout: `(20 × 200) / 80 = 50 AVAX` (+30 profit)
- Carol payout: `(60 × 200) / 80 = 150 AVAX` (+90 profit)

> **Note:** Solidity integer division truncates remainings. Any dust (≤ 1 wei) remains in the contract.

---

## Fuji Testnet Details

| Property | Value |
|---|---|
| Network Name | Avalanche Fuji C-Chain |
| Chain ID | `43113` |
| RPC URL | `https://api.avax-test.network/ext/bc/C/rpc` |
| Block Explorer | https://testnet.snowtrace.io |
| Native Currency | AVAX |
| Faucet | https://faucet.avax.network (select "Fuji") |

### Contract Address

> ⚠️ **Not yet deployed.** The contract address is currently a placeholder (`0x000...000`).
> Follow the [Deploying to Fuji](#deploying-to-fuji) section below to deploy your own instance,
> then update `NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS` in `apps/web/.env.local`.

---

## Environment Setup

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) — `forge`, `cast`, `anvil`
- Node.js ≥ 18 and pnpm
- A Fuji wallet with test AVAX ([faucet](https://faucet.avax.network))

### Install Foundry (Windows)

```powershell
irm https://foundry.paradigm.xyz | iex
```

Foundry is installed to `$env:USERPROFILE\.foundry\bin`. Add it to PATH or use the full path:

```powershell
& "$env:USERPROFILE\.foundry\bin\forge.exe" --version
```

### Install Contract Dependencies

Dependencies are resolved via git submodules in `blockchain/stellar/contracts/lib/` and shared
with the Avalanche contracts via a relative path in `foundry.toml`. No additional installation
is required if the repo was cloned with `--recurse-submodules`.

If submodules are missing:

```bash
git submodule update --init --recursive
```

### Contract Environment Variables

Copy the example file and fill in your deployer private key:

```bash
cp blockchain/avalanche/contracts/.env.example blockchain/avalanche/contracts/.env
```

`.env.example`:

```env
# Private key of the Fuji deployer / owner wallet (no 0x prefix)
PRIVATE_KEY=your_private_key_here

# Fuji RPC (default works without an API key)
FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc

# Optional: Snowtrace API key for contract verification
SNOWTRACE_API_KEY=
```

---

## Running Tests Locally

All tests live in `blockchain/avalanche/contracts/test/`.

| File | Coverage |
|---|---|
| `PredictionMarket.t.sol` | 20 unit tests (individual functions, access control, error cases) |
| `PredictionMarketIntegration.t.sol` | 6 integration tests (full lifecycle scenarios) |

### Run All Tests

```bash
cd blockchain/avalanche/contracts

# Linux / macOS
forge test

# Windows PowerShell
& "$env:USERPROFILE\.foundry\bin\forge.exe" test
```

### Run With Verbosity

```bash
# -v   = show emitted events
# -vvv = show full execution traces
forge test -vvv
```

### Run a Specific Test

```bash
forge test --match-test test_Integration_FullFlow_MultiWinner_ProportionalSplit -vvv
```

### Expected Output

```
Running 26 tests for test/PredictionMarket.t.sol:PredictionMarketTest
[PASS] test_BuyShares_EmitsEvent() ...
...
Running 6 tests for test/PredictionMarketIntegration.t.sol:PredictionMarketIntegrationTest
[PASS] test_Integration_CannotBuyAfterExpiration() ...
[PASS] test_Integration_CannotClaimBeforeResolution() ...
[PASS] test_Integration_FullFlow_MultiWinner_ProportionalSplit() ...
[PASS] test_Integration_FullFlow_SingleWinner_NO() ...
[PASS] test_Integration_FullFlow_SingleWinner_YES() ...
[PASS] test_Integration_NonOwnerCannotResolve() ...

Test result: ok. 26 passed; 0 failed; 0 skipped
```

> **Note:** `via_ir = true` is set in `foundry.toml` to enable the IR-based code generator.
> This makes compilation slower (~30–60s) but correctly handles functions with many local variables.

---

## Deploying to Fuji

### Deploy Script

The deploy script is at `blockchain/avalanche/contracts/script/Deploy.s.sol`.

```bash
cd blockchain/avalanche/contracts

# Load environment variables
source .env   # Linux/macOS
# or on Windows: $env:PRIVATE_KEY = "your_key_here"

# Deploy (dry run — no broadcast)
forge script script/Deploy.s.sol --rpc-url $FUJI_RPC_URL

# Deploy (broadcast — actually submits transactions)
forge script script/Deploy.s.sol \
  --rpc-url $FUJI_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### After Deployment

1. Copy the printed contract address.
2. Update `apps/web/.env.local`:
   ```env
   NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS=0xYourContractAddress
   ```
3. Update `backend/wrangler.toml`:
   ```toml
   [vars]
   AVALANCHE_CONTRACT_ADDRESS = "0xYourContractAddress"
   ```
4. Verify the contract on Snowtrace (optional):
   ```bash
   forge verify-contract 0xYourContractAddress PredictionMarket \
     --chain-id 43113 \
     --etherscan-api-key $SNOWTRACE_API_KEY
   ```

---

## Frontend Integration

The frontend connects via [viem](https://viem.sh) using the `AvalancheMarketClient` in
`apps/web/lib/avalancheMarketClient.ts`. The active chain is controlled by `ChainContext`.

### Switching to Avalanche

Users can toggle between Stellar and Avalanche using the chain switcher in the top bar.
When Avalanche is selected:

- The wallet connects via **MetaMask** (or any EIP-1193 provider)
- Transactions are signed and broadcast through viem's `WalletClient`
- The app detects if the wallet is on the wrong network and prompts to switch

### Key Context Hooks

```tsx
import { useChain } from "@/context/ChainContext";
import { useWallet } from "@/context/WalletContext";

const { chain, chainMetadata, client } = useChain();
const { evmAddress, isWrongNetwork, switchNetwork } = useWallet();
```

---

## Error Reference

| Scenario | User-Facing Message |
|---|---|
| Wallet on wrong EVM network | "Wrong network — please switch to Avalanche Fuji Testnet" |
| Insufficient AVAX for gas | "Insufficient AVAX balance to cover this transaction and gas fees" |
| Transaction rejected by user | "Transaction rejected — please approve the transaction in your wallet" |
| Contract revert (general) | "Transaction failed: \<revert reason\>" |
| Market already resolved | "Market is not open" |
| No winning shares to claim | "No winning shares to claim for this market" |

### parseTransactionError

All Avalanche transaction errors in the frontend flow through `parseTransactionError` in
`apps/web/lib/errors.ts`. It normalizes viem errors, MetaMask errors, and raw revert strings
into a consistent user-readable message:

```ts
import { parseTransactionError } from "@/lib/errors";

try {
  await client.buyShares(marketId, true, amount);
} catch (err) {
  const message = parseTransactionError(err, { chain: "avalanche" });
  setError(message);
}
```
