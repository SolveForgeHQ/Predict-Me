## What does this PR do?

<!-- A clear, one or two sentence summary of the change. -->

---

## Type of change

<!-- Check all that apply -->

- [ ] Bug fix
- [ ] New contract function / feature
- [ ] Refactor (no behaviour change)
- [ ] Docs only
- [ ] Breaking change (storage schema, function signature, or return type changes)

---

## Checklist

- [ ] `make build` passes
- [ ] `make test` passes — all tests green
- [ ] `make lint` passes with no warnings (`cargo clippy -- -D warnings`)
- [ ] `make fmt` applied (`cargo fmt --all`)
- [ ] New contract function has a doc comment describing caller restrictions and state changes
- [ ] Tests added for both success path and at least one unauthorised / invalid-state path
- [ ] Storage schema changes documented in `src/storage.rs` and `ARCHITECTURE.md`
- [ ] No secrets, private keys, or `.env` values committed

---

## Related issue

Closes #

---

## Screenshots / recordings

<!-- Not typically needed for contract PRs.
     If this PR changes on-chain behaviour in a testable way, paste the
     `stellar contract invoke` output or test run results here instead. -->

<details>
<summary>Test output (optional)</summary>

```
paste cargo test output here
```

</details>
