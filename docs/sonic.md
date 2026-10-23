# Sonic Testnet — Prediction Market Deployment Guide

This document covers the ERC-20 prediction market contract deployed on the Sonic
testnet, how to get test tokens, how to deploy your own instance, and the
environment variables required.

---

## Table of Contents

1. [Sonic Testnet Details](#sonic-testnet-details)
2. [Deployed Contracts](#deployed-contracts)
3. [Test Token Warning](#test-token-warning)
4. [Getting Test S for Gas](#getting-test-s-for-gas)
5. [Getting Test USDC (Mock Token)](#getting-test-usdc-mock-token)
6. [Environment Variables](#environment-variables)
7. [Deploying to Sonic Testnet](#deploying-to-sonic-testnet)
8. [After Deployment](#after-deployment)

---

## Sonic Testnet Details

| Property | Value |
|---|---|
| Network Name | Sonic Testnet |
| Chain ID | `14601` |
| RPC URL | `https://rpc.testnet.soniclabs.com` |
| Block Explorer | https://testnet.sonicscan.org |
| Native Currency | S (18 decimals) |
| Faucet | https://testnet.soniclabs.com/account |

### Add to MetaMask

- **Network name:** Sonic Testnet
- **RPC URL:** `https://rpc.testnet.soniclabs.com`
- **Chain ID:** `14601`
- **Currency symbol:** S
- **Block explorer:** `https://testnet.sonicscan.org`

---

## Deployed Contracts

| Contract | Address |
|---|---|
| `PredictionMarketERC20` | `0x25D035CB295d94A073107aAB9Ac86a3655a5614E` |
| `MockERC20` (test token, 6 decimals) | `0x96Ef7Fb36E31445920EFC305Cc0D9C0288af7D02` |

Verify on the explorer:
- Market: https://testnet.sonicscan.org/address/0x25D035CB295d94A073107aAB9Ac86a3655a5614E
- Token: https://testnet.sonicscan.org/address/0x96Ef7Fb36E31445920EFC305Cc0D9C0288af7D02

---

## Test Token Warning

> ⚠️ **The deployed token (`MockERC20`) is a test-only contract.** It has a
> public `mint()` function — anyone can mint unlimited tokens. **Never use it
> to represent real value.**

The deploy script deploys a `MockERC20` automatically when `TOKEN_ADDRESS` is
not set. This is intentional for local testing. For a production deployment you
must supply a real ERC-20 token address.

### Switching to Official Testnet USDC

The Sonic testnet may have an official USDC deployment. Before using any
USDC address you find referenced online:

1. Go to https://testnet.sonicscan.org
2. Search for the token contract address
3. Verify it is a legitimate USDC deployment (check contract name, deployer,
   and decimals — USDC always has 6 decimals)
4. **Do not use an unverified address as the staking token** — a malicious
   token could block user funds

Once you have confirmed a legitimate address, set `TOKEN_ADDRESS` in your `.env`
before deploying (see [Environment Variables](#environment-variables)).

---

## Getting Test S for Gas

The Sonic testnet faucet gives you test S tokens for gas fees.

1. Go to https://testnet.soniclabs.com/account
2. Connect your wallet or paste an address
3. Click **"Get test tokens"** — this sends test S to the address
4. Wait ~30 seconds for the transaction to confirm

You need test S in both your **deployer** wallet (for deployment gas) and your
**owner** wallet (for creating and resolving markets).

> **Tip:** 1 S is more than enough for dozens of testnet transactions. Request
> it for each key you will use.

---

## Getting Test USDC (Mock Token)

The deployed `MockERC20` has a public `mint(address, uint256)` function. You
can call it directly from the Sonic testnet explorer or with `cast`:

```bash
# Mint 1000 mUSDC (6 decimals, so 1000_000000 base units) to your address
cast send 0x96Ef7Fb36E31445920EFC305Cc0D9C0288af7D02 \
  "mint(address,uint256)" \
  <your_address> \
  1000000000 \
  --rpc-url https://rpc.testnet.soniclabs.com \
  --private-key $PRIVATE_KEY
```

Or via the "Write Contract" tab on
https://testnet.sonicscan.org/address/0x96Ef7Fb36E31445920EFC305Cc0D9C0288af7D02
after verifying the contract.

---

## Environment Variables

Copy the example file and fill in your values:

```bash
cp blockchain/sonic/contracts/.env.example blockchain/sonic/contracts/.env
```

`.env.example` contents:

```env
# Deployer private key (with or without 0x prefix)
PRIVATE_KEY=your_private_key_here

# ERC-20 token address for staking (leave empty to deploy MockERC20)
TOKEN_ADDRESS=

# Market owner address (defaults to deployer if not set)
OWNER_ADDRESS=

# Minimum stake in token base units (default: 1_000_000 = 1 USDC at 6 decimals)
MIN_STAKE=1000000

# Resolution grace period in seconds (default: 604800 = 7 days)
GRACE_PERIOD=604800
```

> ⚠️ Never commit `.env` files. They are already listed in `.gitignore`.

### Frontend / Backend variables

Add these to `apps/web/.env.local`:

```env
NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS=0x25D035CB295d94A073107aAB9Ac86a3655a5614E
NEXT_PUBLIC_SONIC_TOKEN_ADDRESS=0x96Ef7Fb36E31445920EFC305Cc0D9C0288af7D02
NEXT_PUBLIC_SONIC_RPC_URL=https://rpc.testnet.soniclabs.com
```

Add these to `backend/wrangler.toml` under `[vars]`:

```toml
SONIC_RPC_URL = "https://rpc.testnet.soniclabs.com"
SONIC_CONTRACT_ADDRESS = "0x25D035CB295d94A073107aAB9Ac86a3655a5614E"
SONIC_TOKEN_ADDRESS = "0x96Ef7Fb36E31445920EFC305Cc0D9C0288af7D02"
```

---

## Deploying to Sonic Testnet

### Prerequisites

- [Foundry](https://getfoundry.sh) — `forge`, `cast`
- A Sonic testnet wallet with test S ([faucet](https://testnet.soniclabs.com/account))
- Git submodules initialized (shared OpenZeppelin / forge-std libs):

```bash
git submodule update --init --recursive
```

### Run Tests First

Always run the test suite before deploying:

```bash
cd blockchain/sonic/contracts
forge test
```

Expected output: `24 passed; 0 failed`

### Deploy

```bash
cd blockchain/sonic/contracts

# Copy and fill in your .env
cp .env.example .env
# Edit .env — set PRIVATE_KEY and optionally OWNER_ADDRESS

# Load env vars
source .env   # Git Bash / Linux / macOS

# Dry run (no gas spent)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url sonic_testnet \
  -vvvv

# Live deploy
forge script script/Deploy.s.sol:Deploy \
  --rpc-url sonic_testnet \
  --private-key $PRIVATE_KEY \
  --broadcast \
  -vvvv
```

The script prints:

```
WARNING: TOKEN_ADDRESS not set.
         Deploying MockERC20 as a test token.
         DO NOT use this in production!

MockERC20 deployed at:        0x...
Contract Address:             0x...
Token Address:                0x...
Owner:                        0x...
Min Stake:                    1000000
Grace Period:                 604800
Chain ID:                     14601
```

---

## After Deployment

1. Copy the **Contract Address** and **Token Address** from the output.

2. Update `apps/web/.env.local`:
   ```env
   NEXT_PUBLIC_SONIC_CONTRACT_ADDRESS=0xYourMarketContract
   NEXT_PUBLIC_SONIC_TOKEN_ADDRESS=0xYourToken
   ```

3. Update `backend/wrangler.toml` under `[vars]`:
   ```toml
   SONIC_CONTRACT_ADDRESS = "0xYourMarketContract"
   SONIC_TOKEN_ADDRESS    = "0xYourToken"
   ```

4. Apply the D1 migration for the backend cache:
   ```bash
   cd backend
   npx wrangler d1 execute predict-me-db --file=migrations/0001_init.sql --remote
   npx wrangler d1 execute predict-me-db --file=migrations/0002_sonic_columns.sql --remote
   ```

5. Deploy the backend:
   ```bash
   cd backend
   npx wrangler deploy
   ```

6. Verify on the explorer:
   ```
   https://testnet.sonicscan.org/address/<your_contract_address>
   ```
