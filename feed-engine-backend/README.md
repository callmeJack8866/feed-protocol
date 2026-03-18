# Feed Engine Backend

Backend service for the Feed Engine human-oracle workflow.

## Stack

- Node.js 20+
- TypeScript
- Express + Socket.IO
- Prisma
- PostgreSQL or SQLite
- Redis (recommended, app can degrade without it)
- ethers v6

## Quick Start

```bash
npm install
copy .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

The service starts on `http://127.0.0.1:3001` by default.

## Required Configuration

At minimum, set these values in `F:\Unstandardized_Products\FeedEngine\feed-engine-backend\.env`:

- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `BSC_RPC_URL`
- `FEED_ENGINE_CONTRACT`
- `FEED_TOKEN_CONTRACT`
- `FEEDER_LICENSE_NFT_CONTRACT`
- `FEED_CONSENSUS_CONTRACT`
- `REWARD_PENALTY_CONTRACT`

If you want on-chain submission, NFT minting, NST callback writeback, or reward wallet settlement, also set:

- `BACKEND_PRIVATE_KEY`
- `MINTER_PRIVATE_KEY`
- `BADGE_NFT_CONTRACT`
- `USDT_TOKEN_CONTRACT`
- `NST_OPTIONS_CORE_CONTRACT`
- `NST_FEED_PROTOCOL_CONTRACT`
- `PROTOCOL_API_KEYS`
- `WEBHOOK_SECRET`
- `PLATFORM_WALLET`
- `DAO_TREASURY_WALLET`

## Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run smoke:mainflow
```

## Runtime Notes

- `FRONTEND_URL` accepts a comma-separated allowlist. Keep both `localhost` and `127.0.0.1` during local testing to avoid SIWE/CORS mismatches.
- Redis is recommended for production WebSocket stability. If Redis is down, `/health` reports degraded status and the app falls back to in-memory behavior.
- `PROTOCOL_API_KEYS` uses the format `key:PROTOCOL,key2:PROTOCOL2`.
- `PINATA_JWT` is preferred over legacy `PINATA_API_KEY` + `PINATA_SECRET_KEY`.

## Smoke Verification

After the backend is running and the database is seeded, verify the main path with:

```bash
npm run smoke:mainflow
```

That script covers:

- wallet login
- staking
- order creation
- grab
- commit
- reveal
- consensus settlement
- season rank update
- achievement unlock

## API Areas

- `/api/auth`
- `/api/orders`
- `/api/feeders`
- `/api/arbitration`
- `/api/staking`
- `/api/training`
- `/api/seasons`
- `/api/achievements`
- `/api/chain`
- `/api/nst`
- `/api/admin`

## Production Checklist

- Configure PostgreSQL instead of the local dev database.
- Run with Redis enabled.
- Replace all placeholder secrets and wallets.
- Confirm contract addresses match the target chain.
- Run `npm run build`.
- Run `npm run smoke:mainflow` against the deployment environment before opening traffic.
