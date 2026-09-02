# Architecture

The `predict-me` project is a monorepo containing a web frontend, a Cloudflare Workers backend, and smart contracts for both Avalanche and Stellar.

## Packages
- `apps/web`: Next.js frontend
- `backend`: Hono API on Cloudflare Workers
- `packages/core`: Shared logic
- `packages/types`: Shared types
- `blockchain/avalanche`: Foundry contracts for Avalanche
- `blockchain/stellar`: Soroban contracts for Stellar
