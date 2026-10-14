# AMM Dynamic Pricing for Predict-Me (Soroban Smart Contract)

## Overview
This document specifies the dynamic pricing curve implemented for binary prediction markets on Soroban (Stellar) in `predict-me`.

The implementation replaces fixed pooled odds with a **Constant Product Prediction Market AMM (CP-PMM)**, ensuring instantaneous price discovery, continuous liquidity, and strict pool solvency without relying on floating-point approximations.

---

## 1. Mathematical Model

### A. State Variables & Invariant
For any active market, the contract maintains virtual reserves $(R_{yes}, R_{no})$ and tracks total collateral $C$:

$$\text{Invariant: } k = R_{yes} \times R_{no} = B^2$$

where $B$ is the initial virtual liquidity parameter (default $B = 10,000$ base units).

### B. Instantaneous Spot Price
The spot price for each outcome is derived strictly from reserve ratios:

$$P_{yes} = \frac{R_{no}}{R_{yes} + R_{no}}$$

$$P_{no} = \frac{R_{yes}}{R_{yes} + R_{no}}$$

Normalized identity holds identically at all times:
$$P_{yes} + P_{no} = 1.0 \quad (10,000 \text{ basis points})$$

At market creation ($R_{yes} = R_{no} = B$):
$$P_{yes} = 5,000 \text{ bps } (50.00\%), \quad P_{no} = 5,000 \text{ bps } (50.00\%)$$

---

## 2. Trading & Pricing Dynamics

When a trader spends $dx$ collateral to buy outcome shares:

### Buying YES (side = 0):
1. The incoming collateral $dx$ increases the virtual NO reserve:
   $$R_{no}' = R_{no} + dx$$
2. The new virtual YES reserve is determined by the constant product invariant:
   $$R_{yes}' = \left\lceil \frac{k}{R_{no}'} \right\rceil = \frac{k + R_{no}' - 1}{R_{no}'}$$
3. The trader receives:
   $$\text{shares}_{\text{out}} = dx + (R_{yes} - R_{yes}')$$
4. State updates:
   $$R_{yes} \leftarrow R_{yes}', \quad R_{no} \leftarrow R_{no}', \quad C \leftarrow C + dx$$

### Price Impact:
Because $R_{no}' > R_{no}$ and $R_{yes}' < R_{yes}$, the subsequent spot price $P_{yes}' = \frac{R_{no}'}{R_{yes}' + R_{no}'}$ increases monotonically with trade size. Subsequent buyers on YES pay higher effective prices per share.

### Mean Reversion:
If an opposing trader buys NO, $R_{yes}$ increases and $R_{no}$ decreases, shifting $P_{yes}$ back toward 50%.

---

## 3. Solvency & Anti-Drain Guarantees

1. **No-Drain Guarantee**:
   All user payouts at resolution are strictly bounded by total collateral deposited:
   $$\text{Payout} = \frac{\text{caller\_shares} \times C}{S_{win}}$$
   $$\sum \text{Payouts} \le C$$
   The contract can never become insolvent, regardless of trade sequence, frequency, or volume.
2. **Ceiling Division Invariant Protection**:
   Virtual reserve updates use integer ceiling division, ensuring $R_{yes} \times R_{no} \ge k$ monotonically.

---

## 4. Backward Compatibility

- Existing markets initialized without an AMM record (`storage::get_amm` returning `None`) transparently fall back to the v1 pooled betting calculation.
- Function signatures for `create_market`, `buy_shares`, `resolve_market`, and `claim_winnings` remain 100% backward compatible.