# Stellar Soroban Contract

Predict-Me prediction market contract deployed to Stellar Testnet (Soroban).

## Deployed Contract

| Network | Contract ID |
|---|---|
| **Stellar Testnet** | `CCGM6LQRQNQGMUXMXHICCH73CDBYOTMV5LEJ7JWWXUBXLRFZJCPAHHXI` |

Deployed: October 2026 using the `deployer` Stellar CLI identity.

## Environment Variables

Set these in `apps/web/.env.local`:

```env
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_MARKET_CONTRACT_ID=CCGM6LQRQNQGMUXMXHICCH73CDBYOTMV5LEJ7JWWXUBXLRFZJCPAHHXI
# G-address of the wallet that deployed the contract (controls admin functions)
NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS=<your-deployer-G-address>
```

## Contract Interface

The contract at `blockchain/stellar/contracts/contracts/predict-me/` implements:

```rust
// Create a new market — any caller. Returns market_id (u32).
create_market(env, question: String, end_timestamp: u64, category: String) -> u32

// Buy YES (side=0) or NO (side=1) shares. amount is in stroops (1 XLM = 10_000_000).
buy_shares(env, market_id: u32, side: u32, amount: i128, caller: Address)

// Resolve a market — any caller can call, but the /admin UI restricts to owner.
// outcome: 0 = YES, 1 = NO
resolve_market(env, market_id: u32, outcome: u32)

// Claim winnings — must have winning shares. Returns payout in stroops (i128).
claim_winnings(env, market_id: u32, caller: Address) -> i128
```

## Storage Layout

| Key | Value | Storage type |
|---|---|---|
| `DataKey::Admin` | `Address` | Instance |
| `DataKey::MarketCount` | `u32` | Instance |
| `DataKey::Market(id)` | `MarketState` | Persistent |
| `DataKey::Shares(market_id, addr, side)` | `i128` (stroops) | Persistent |

**MarketState fields:** `question`, `category`, `end_timestamp`, `yes_pool`, `no_pool`, `status`
- `status`: `0` = Open, `1` = ResolvedYes, `2` = ResolvedNo

## Amount Conversion

- All share amounts on-chain use **stroops** (`i128`): `1 XLM = 10,000,000 stroops`
- The frontend (`StellarMarketClient`) converts: `amount_xlm × 10_000_000 → stroops` on write, and `stroops / 10_000_000 → XLM` on read

## Testing the Full Flow (Testnet)

The following end-to-end flow has been verified working on Stellar Testnet:

### Prerequisites
- [Freighter wallet](https://www.freighter.app/) browser extension installed and set to **Testnet**
- Fund your wallet via [Stellar Testnet Friendbot](https://friendbot.stellar.org/?addr=<your-address>)
- Your deployer G-address set as `NEXT_PUBLIC_STELLAR_ADMIN_ADDRESS`

### Flow

1. **Connect wallet** — Click Connect in the app header, select Freighter, switch Freighter to Testnet if prompted.

2. **Create a market** (`/admin`)
   - Fill in Question, Category, and Resolution Date
   - Click **Create Market on Stellar**
   - Approve the transaction in Freighter
   - Market ID is returned from the contract's `create_market` return value

3. **Buy YES shares** (wallet A)
   - Navigate to the market page
   - Enter an XLM amount in the YES tab and click Buy
   - Freighter prompts to sign; `buy_shares(market_id, side=0, amount_in_stroops, caller)` is called

4. **Buy NO shares** (wallet B, or same wallet)
   - Switch Freighter to a second funded account (or repeat with a second browser)
   - Enter an XLM amount in the NO tab and click Buy

5. **Resolve the market** (`/admin`)
   - Click **Resolve YES** or **Resolve NO**
   - `resolve_market(market_id, outcome)` is called on-chain

6. **Claim winnings** (winning wallet)
   - Reconnect the winning wallet
   - Go to the market page — the Position Card shows winning shares
   - Click **Claim Winnings**
   - `claim_winnings(market_id, caller)` returns the payout in stroops
   - The app displays the claimed XLM amount

### Payout Formula
$$\text{payout} = \frac{\text{callerWinningShares} \times \text{totalPool}}{\text{winningPool}}$$

All arithmetic is done in stroops (integer i128) on-chain. The frontend divides by 10,000,000 to display XLM.

## Rebuilding & Redeploying

From `blockchain/stellar/contracts`:

```bash
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/predict_me.wasm \
  --source deployer \
  --network testnet
```

Update `NEXT_PUBLIC_MARKET_CONTRACT_ID` in `.env.local` with the new address after redeployment.
