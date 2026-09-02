# Makefile — shortcuts for the predict-me Soroban contract
# Run all commands from the contracts/ directory.

.DEFAULT_GOAL := build

# ── Build ─────────────────────────────────────────────────────────────────────

.PHONY: build
build:
	stellar contract build
	@echo ""
	@ls -lh target/wasm32v1-none/release/*.wasm

# ── Test ──────────────────────────────────────────────────────────────────────

.PHONY: test
test: build
	cargo test

# ── Format ────────────────────────────────────────────────────────────────────

.PHONY: fmt
fmt:
	cargo fmt --all

# ── Lint ──────────────────────────────────────────────────────────────────────

.PHONY: lint
lint:
	cargo clippy -- -D warnings

# ── Deploy to Testnet ─────────────────────────────────────────────────────────
# Requires: stellar CLI configured with a funded testnet identity
# Usage: make deploy IDENTITY=my-key

.PHONY: deploy
deploy: build
	stellar contract deploy \
		--wasm target/wasm32v1-none/release/predict_me.wasm \
		--source $(IDENTITY) \
		--network testnet

# ── Clean ─────────────────────────────────────────────────────────────────────

.PHONY: clean
clean:
	cargo clean
