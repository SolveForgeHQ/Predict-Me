# Avalanche Fuji — Prediction Market Deployment Guide

This is the complete guide to deploying the `PredictionMarket.sol` contract to the Avalanche
Fuji testnet, running the test suite locally, and wiring the deployed address into the frontend
and backend.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Contract Reference](#contract-reference)
3. [Payout Formula](#payout-formula)
4. [Fuji Testnet Details](#fuji-testnet-details)
5. [Step 1 — Install Prerequisites](#step-1--install-prerequisites)
6. [Step 2 — Initialize Git Submodules](#step-2--initialize-git-submodules)
7. [Step 3 — Set Up Environment Variables](#step-3--set-up-environment-variables)
8. [Step 4 — Run Tests Locally](#step-4--run-tests-locally)
9. [Step 5 — Deploy to Fuji](#step-5--deploy-to-fuji)
10. [Step 6 — Wire the Contract Address](#step-6--wire-the-contract-address)
11. [Step 7 — Verify on Snowtrace (Optional)](#step-7--verify-on-snowtrace-optional)
12. [Step 8 — Create Your First Market](#step-8--create-your-first-market)
13. [Frontend Integration Reference](#frontend-integration-reference)
14. [Error Reference](#error-reference)
15. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js Frontend (apps/web)                                    │
│  ┌──────────────┐  ┌───────────────────┐  ┌─────────────────┐  │
│  │ ChainContext  │  │  WalletContext     │  │ Avalanche       │  │
│  │ chain=       │  │  evmAddress        │  │ MarketClient    │  │
│  │ "avalanche"  │  │  isWrongNetwork    │  │ (viem)          │  │
│  └──────┬───────┘  └────────┬──────────┘  └────────┬────────┘  │
│         └───────────────────┴────────────────────── ┘           │
└────────────────────────────────┬────────────────────────────────┘
                                 │ JSON-RPC (viem WalletClient)
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│  Avalanche Fuji C-Chain  (Chain ID 43113)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PredictionMarket.sol                                    │  │
│  │  createMarket  buyShares(payable)  resolveMarket(owner)  │  │
│  │  claimWinnings  getMarket  getPosition  getPoolTotals    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Contract Reference

**Source:** `blockchain/avalanche/contracts/src/PredictionMarket.sol`

Inherits `Ownable` and `ReentrancyGuard` from OpenZeppelin. The deployer wallet becomes the
owner and is the only address that can call `createMarket` and `resolveMarket`.

### Market Struct

```solidity
struct Market {
    string question;
    uint256 endTime;      // Unix timestamp — trading closes at this point
    MarketStatus status;  // Open | Resolved
    bool outcome;         // true = YES won, false = NO won (set on resolution)
    uint256 yesPool;      // total AVAX deposited on YES (in wei)
    uint256 noPool;       // total AVAX deposited on NO  (in wei)
    uint256 totalPool;    // yesPool + noPool
}
```

### Functions

| Function | Access | Description |
|---|---|---|
| `createMarket(question, endTime)` | `onlyOwner` | Creates a new binary market, returns `marketId` |
| `buyShares(marketId, isYes) payable` | anyone | Buy YES/NO shares by sending AVAX with the call |
| `resolveMarket(marketId, outcome)` | `onlyOwner` | Resolves market to YES (`true`) or NO (`false`) |
| `claimWinnings(marketId)` | anyone | Pays out winning shares proportionally; zeroes balance before transfer |
| `getMarket(marketId)` | view | Returns full `Market` struct |
| `getPosition(marketId, user)` | view | Returns `(yesBalance, noBalance)` in wei |
| `getPoolTotals(marketId)` | view | Returns `(yesPool, noPool, totalPool)` in wei |

### Events

| Event | Emitted By |
|---|---|
| `MarketCreated(marketId, question, endTime)` | `createMarket` |
| `SharesBought(marketId, buyer, isYes, amount)` | `buyShares` |
| `MarketResolved(marketId, outcome)` | `resolveMarket` |
| `WinningsClaimed(marketId, claimer, payout)` | `claimWinnings` |

### Custom Errors

| Error | Thrown When |
|---|---|
| `EmptyQuestion` | `question` is an empty string |
| `InvalidEndTime` | `endTime` is in the past |
| `MarketNotFound` | `marketId` is 0 or greater than `marketCount` |
| `MarketNotOpen` | Buying/resolving on a non-Open market |
| `MarketExpired` | Buying after `endTime` |
| `MarketNotResolved` | Claiming on an unresolved market |
| `ZeroDeposit` | `msg.value == 0` when buying shares |
| `NoWinningShares` | Claimer holds no winning shares (or already claimed) |
| `TransferFailed` | Native AVAX transfer to winner failed |

---

## Payout Formula

```
payout = (userWinningShares × totalPool) / winningPool
```

Shares are 1:1 with AVAX in wei — sending 1 AVAX gives you 1e18 shares.

**Example — Single winner:**
- Alice: 40 AVAX YES, Bob: 60 AVAX NO → YES wins
- `totalPool = 100 AVAX`, `yesPool = 40 AVAX`
- Alice payout: `(40 × 100) / 40 = 100 AVAX` (+60 profit)

**Example — Two winners:**
- Alice: 20 AVAX YES, Carol: 60 AVAX YES, Bob: 120 AVAX NO → YES wins
- `totalPool = 200 AVAX`, `yesPool = 80 AVAX`
- Alice payout: `(20 × 200) / 80 = 50 AVAX` (+30 profit)
- Carol payout: `(60 × 200) / 80 = 150 AVAX` (+90 profit)

> Solidity integer division truncates remainders. Any dust (≤ 1 wei per claimer) stays in the
> contract.

---

## Fuji Testnet Details

| Property | Value |
|---|---|
| Network Name | Avalanche Fuji C-Chain |
| Chain ID | `43113` |
| RPC URL | `https://api.avax-test.network/ext/bc/C/rpc` |
| Block Explorer | https://testnet.snowtrace.io |
| Native Currency | AVAX |
| Faucet | https://faucet.avax.network — select **"Fuji"** |

---

## Step 1 — Install Prerequisites

### 1a. Install Foundry

Foundry provides `forge` (build/test/deploy) and `cast` (contract calls).

**Windows (PowerShell):**
```powershell
irm https://foundry.paradigm.xyz | iex
```

This installs to `$env:USERPROFILE\.foundry\bin`. Either add that folder to your PATH, or
prefix every command below with the full path:

```powershell
# Check it works
& "$env:USERPROFILE\.foundry\bin\forge.exe" --version
# forge 0.x.x (...)
```

**macOS / Linux:**
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge --version
```

### 1b. Get a Fuji Wallet and Test AVAX

1. Open MetaMask (or any EVM wallet) and add the Fuji network:
   - RPC: `https://api.avax-test.network/ext/bc/C/rpc`
   - Chain ID: `43113`
   - Currency: `AVAX`
2. Copy your wallet address.
3. Go to https://faucet.avax.network, select **Fuji**, and request test AVAX.
4. Wait ~30 seconds — you need at least **0.5 AVAX** to cover deployment gas.

> ⚠️ **Never use a mainnet private key for testnet deployment.**  
> Create a dedicated throwaway wallet for Fuji deployments.

---

## Step 2 — Initialize Git Submodules

The Avalanche contracts share the `lib/` folder (OpenZeppelin, forge-std) with the Stellar
contracts via a relative path in `foundry.toml`. Both submodules must be present before
`forge` can build.

```bash
# From the repo root
git submodule update --init --recursive
```

Expected output:
```
Submodule 'blockchain/stellar/contracts/lib/forge-std' (...) registered
Submodule 'blockchain/stellar/contracts/lib/openzeppelin-contracts' (...) registered
Cloning into '...'
```

If you cloned with `--recurse-submodules` already, you can skip this step. Verify with:

```bash
ls blockchain/stellar/contracts/lib/
# forge-std   openzeppelin-contracts
```

---

## Step 3 — Set Up Environment Variables

```bash
cp blockchain/avalanche/contracts/.env.example blockchain/avalanche/contracts/.env
```

Open `blockchain/avalanche/contracts/.env` and fill in:

```env
# Your deployer wallet private key — WITHOUT the 0x prefix
PRIVATE_KEY=abc123...your64hexchars

# Fuji RPC (the default works, no API key needed)
FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc

# Optional — only needed for Step 7 (contract verification on Snowtrace)
SNOWTRACE_API_KEY=
```

> ⚠️ The `.env` file is listed in `.gitignore`. Never commit it.  
> Your private key gives full control of your deployer wallet.

---

## Step 4 — Run Tests Locally

Always run the test suite before deploying to confirm the contract behaves correctly.

**Navigate to the contracts directory:**
```bash
cd blockchain/avalanche/contracts
```

**Run all tests:**

Windows PowerShell:
```powershell
& "$env:USERPROFILE\.foundry\bin\forge.exe" test
```

macOS / Linux:
```bash
forge test
```

**Run with full execution traces:**
```bash
forge test -vvv
```

**Run a specific test:**
```bash
forge test --match-test test_Integration_FullFlow_MultiWinner_ProportionalSplit -vvv
```

### Test Files

| File | Coverage |
|---|---|
| `test/PredictionMarket.t.sol` | Unit tests — individual functions, access control, revert cases |
| `test/PredictionMarketIntegration.t.sol` | Integration tests — full market lifecycle scenarios |

### Expected Output

```
Running 20 tests for test/PredictionMarket.t.sol:PredictionMarketTest
[PASS] test_BuyShares_EmitsEvent() ...
[PASS] test_BuyShares_NoShares_UpdatesBalance() ...
[PASS] test_BuyShares_RevertsWhenExpired() ...
[PASS] test_BuyShares_YesShares_UpdatesBalance() ...
[PASS] test_ClaimWinnings_RevertsIfNoShares() ...
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

> **Note:** `via_ir = true` is set in `foundry.toml`. This enables the IR-based compiler
> pipeline, which handles functions with many local variables. Compilation takes ~30–60 seconds
> — this is expected.

---

## Step 5 — Deploy to Fuji

Make sure you are in the contracts directory:
```bash
cd blockchain/avalanche/contracts
```

### Dry Run (no broadcast — free, no gas)

Run this first to confirm everything resolves correctly before spending real (test) AVAX:

**Windows:**
```powershell
$env:PRIVATE_KEY = "your_private_key_here"
& "$env:USERPROFILE\.foundry\bin\forge.exe" script script/DeployPredictionMarket.s.sol:DeployPredictionMarket `
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc `
  -vvvv
```

**macOS / Linux:**
```bash
source .env
forge script script/DeployPredictionMarket.s.sol:DeployPredictionMarket \
  --rpc-url $FUJI_RPC_URL \
  -vvvv
```

You should see the deployer address, its AVAX balance, and the chain ID printed — but no
transaction is broadcast.

### Live Deploy (broadcast — spends test AVAX)

**Windows:**
```powershell
$env:PRIVATE_KEY = "your_private_key_here"
& "$env:USERPROFILE\.foundry\bin\forge.exe" script script/DeployPredictionMarket.s.sol:DeployPredictionMarket `
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc `
  --private-key $env:PRIVATE_KEY `
  --broadcast `
  -vvvv
```

**macOS / Linux:**
```bash
source .env
forge script script/DeployPredictionMarket.s.sol:DeployPredictionMarket \
  --rpc-url $FUJI_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  -vvvv
```

### Expected Output

```
==================================================
Deploying PredictionMarket to Avalanche Fuji Testnet
Deployer Address: 0xYourDeployerAddress
Deployer Balance: 500000000000000000
Chain ID:         43113
==================================================

## Setting up (1) EVMs.
...

==================================================
 Deployment Successful!
==================================================
Contract Address: 0xABCDEF1234567890abcdef1234567890ABCDEF12
Contract Owner:   0xYourDeployerAddress
==================================================
```

**Copy the `Contract Address` — you'll need it in the next step.**

You can confirm the deployment on the block explorer:
`https://testnet.snowtrace.io/address/0xYourContractAddress`

---

## Step 6 — Wire the Contract Address

You need to update three places with the deployed address.

### 6a. Frontend `.env.local`

Create or edit `apps/web/.env.local`:

```env
NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS=0xYourContractAddress
NEXT_PUBLIC_AVALANCHE_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
```

### 6b. Backend `wrangler.toml`

Edit `backend/wrangler.toml`, under `[vars]`:

```toml
[vars]
AVALANCHE_CONTRACT_ADDRESS = "0xYourContractAddress"
AVALANCHE_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc"
```

### 6c. Restart Both Dev Servers

The frontend reads env vars at build time, so a restart is required:

```bash
# Terminal 1 — frontend
pnpm dev:web

# Terminal 2 — backend
pnpm dev:backend
```

To verify the frontend picked up the address, open the app, switch to Avalanche in the chain
switcher, and open the browser console — any contract call will show the address it's
targeting.

---

## Step 7 — Verify on Snowtrace (Optional)

Verifying publishes your source code to Snowtrace so anyone can read the contract, and
enables the "Read/Write Contract" UI on the explorer page.

Get a free API key at https://snowtrace.io/myapikey (sign up required).

**Windows:**
```powershell
& "$env:USERPROFILE\.foundry\bin\forge.exe" verify-contract 0xYourContractAddress PredictionMarket `
  --chain-id 43113 `
  --etherscan-api-key $env:SNOWTRACE_API_KEY `
  --compiler-version 0.8.20
```

**macOS / Linux:**
```bash
forge verify-contract 0xYourContractAddress PredictionMarket \
  --chain-id 43113 \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  --compiler-version 0.8.20
```

After a minute or two, visit your contract page on Snowtrace and the **Contract** tab should
show a green checkmark and the verified source.

---

## Step 8 — Create Your First Market

Once deployed, use `cast` to create a market directly from the command line to confirm
everything is working end-to-end.

**Compute an `endTime`** (Unix timestamp 7 days from now):

```bash
# macOS / Linux
date -d "+7 days" +%s

# Windows PowerShell
[int][double]::Parse((Get-Date).AddDays(7).ToString("yyyyMMddHHmmss") | ForEach-Object { (Get-Date -Date (Get-Date) -UFormat %s) }) 
# Easier: just use an online Unix timestamp calculator and add 604800 (7 days in seconds)
```

**Call `createMarket`:**

```bash
cast send 0xYourContractAddress \
  "createMarket(string,uint256)" \
  "Will AVAX reach $100 by end of 2027?" \
  1798761600 \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --private-key $PRIVATE_KEY
```

**Verify the market was created:**

```bash
cast call 0xYourContractAddress \
  "getMarket(uint256)" 1 \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc
```

You can also create markets from the `/admin` page in the frontend once both the contract
address and your wallet (as the owner) are wired in.

---

## Frontend Integration Reference

The frontend connects to the contract via `AvalancheMarketClient` in
`packages/core/src/avalanche.ts`, instantiated inside `ChainContext` when
`chain === "avalanche"`.

### Switching to Avalanche

Users toggle chains via the **ChainSwitcher** in the top bar. When Avalanche is active:
- Transactions are signed via RainbowKit / Wagmi (MetaMask, Core, Coinbase, WalletConnect)
- The app auto-detects wrong network (`chainId !== 43113`) and surfaces a **Switch Network** banner
- All market reads go through `publicClient.readContract()` (no wallet needed)
- All market writes go through `walletClient.writeContract()` (wallet required)

### Key Context Hooks

```tsx
import { useChain } from "@/context/ChainContext";
import { useWallet } from "@/context/WalletContext";

const { chain, chainMetadata, client } = useChain();
// client is an AvalancheMarketClient when chain === "avalanche"

const { evmAddress, isWrongNetwork, switchNetwork } = useWallet();
```

### Chain Metadata

```tsx
// chainMetadata when chain === "avalanche":
{
  id: "avalanche",
  name: "Avalanche Fuji",
  shortName: "Avalanche",
  currency: "AVAX",
  color: "#E84142",
}
```

---

## Error Reference

| Scenario | User-Facing Message |
|---|---|
| Wallet on wrong EVM network | "Wrong network — please switch to Avalanche Fuji Testnet" |
| Insufficient AVAX for gas | "Insufficient AVAX balance to cover this transaction and gas fees" |
| Transaction rejected in wallet | "Transaction rejected — please approve the transaction in your wallet" |
| `MarketNotOpen` revert | "Market is not open for trading" |
| `MarketExpired` revert | "Market trading period has ended" |
| `MarketNotResolved` revert | "Market has not been resolved yet" |
| `NoWinningShares` revert | "No winning shares to claim for this market" |
| Contract address not set | "Avalanche contract address is not configured. Please set NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS in .env.local" |

All Avalanche transaction errors flow through `parseTransactionError` in
`apps/web/lib/errors.ts`, which normalises viem errors, MetaMask rejections, and raw revert
strings into a consistent user-readable message.

---

## Troubleshooting

### `forge: command not found`

Foundry was installed but not added to PATH. Use the full path on Windows:
```powershell
& "$env:USERPROFILE\.foundry\bin\forge.exe" <command>
```
Or add `$env:USERPROFILE\.foundry\bin` to your system PATH permanently.

### `Library not found` / `File not found` during build

Submodules are missing. Run:
```bash
git submodule update --init --recursive
```

### `Error: No wallet to mine with`

The `--private-key` flag was omitted from the broadcast command, or the env var is not set.
Double-check `$env:PRIVATE_KEY` is populated in your terminal session.

### `Error: insufficient funds`

Your deployer wallet has less AVAX than required for gas. Request more from
https://faucet.avax.network — deployment costs roughly 0.01–0.05 AVAX in gas.

### `InvalidEndTime` on `createMarket`

The `endTime` you passed is less than or equal to the current block timestamp. Make sure you
are passing a future Unix timestamp (seconds, not milliseconds).

### Contract deployed but frontend shows no markets

1. Confirm `NEXT_PUBLIC_AVALANCHE_CONTRACT_ADDRESS` is set correctly in `apps/web/.env.local`
2. Restart the Next.js dev server — env vars are baked in at startup
3. Confirm you are on the **Avalanche** chain in the chain switcher
4. Check the browser console for any RPC errors

### Backend still returning old/no markets

1. Update `AVALANCHE_CONTRACT_ADDRESS` in `backend/wrangler.toml`
2. Restart `pnpm dev:backend`
3. The backend has a 30-second in-memory cache — wait one cache cycle or call
   `GET /markets?chain=avalanche` directly to confirm
