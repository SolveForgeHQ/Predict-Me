---
name: Bug report
about: Report a bug in the predict-me Soroban contract
labels: bug
---

## Description

<!-- A clear, concise description of what the bug is. -->

---

## Steps to reproduce

1. Deploy contract to testnet
2. Call `stellar contract invoke ... -- <function> <args>`
3. See unexpected result or panic

---

## Expected behaviour

<!-- What the contract should have done — return value, state change, etc. -->

---

## Actual behaviour

<!-- What actually happened. Include the full error message or unexpected return value. -->

---

## Environment

| Field | Value |
|---|---|
| Rust version | `rustc --version` |
| Stellar CLI version | `stellar --version` |
| soroban-sdk version | from `Cargo.toml` |
| Stellar network | Testnet / Mainnet |
| Contract id | (deployed address if applicable) |
| OS | e.g. Ubuntu 22.04, macOS 14 |

---

## Reproduction

<!-- Paste the `stellar contract invoke` command that triggers the bug,
     or the failing test from `tests/market_test.rs`. -->

<details>
<summary>Command / test output</summary>

```
paste here
```

</details>

---

## Additional context

<!-- Any other relevant info — specific market id, transaction hash, ledger number, etc. -->
