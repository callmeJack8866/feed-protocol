# Feed Engine Deployment Notes

This document is the release-oriented deployment checklist for the current Feed Engine codebase.

## 1. Services

You need:

- PostgreSQL
- Redis
- Backend service from `F:\Unstandardized_Products\FeedEngine\feed-engine-backend`
- Frontend build from `F:\Unstandardized_Products\FeedEngine\feed-engine`
- Access to the target BSC RPC endpoint

## 2. Backend Environment

Start from:

- `F:\Unstandardized_Products\FeedEngine\feed-engine-backend\.env.example`

Mandatory before production boot:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `BSC_RPC_URL`
- `CHAIN_RPC_URL`
- `FEED_ENGINE_CONTRACT`
- `FEED_TOKEN_CONTRACT`
- `FEEDER_LICENSE_NFT_CONTRACT`
- `FEED_CONSENSUS_CONTRACT`
- `REWARD_PENALTY_CONTRACT`
- `USDT_TOKEN_CONTRACT`
- `PLATFORM_WALLET`
- `DAO_TREASURY_WALLET`

Mandatory for on-chain write actions:

- `BACKEND_PRIVATE_KEY`

Mandatory for badge minting:

- `BADGE_NFT_CONTRACT`
- `MINTER_PRIVATE_KEY`

Mandatory for NST integration:

- `NST_OPTIONS_CORE_CONTRACT`
- `NST_FEED_PROTOCOL_CONTRACT`
- `NST_FEED_SUBMITTER_PRIVATE_KEY`
- `PROTOCOL_API_KEYS`
- `WEBHOOK_SECRET`

Recommended:

- `PINATA_JWT`
- `PINATA_GATEWAY`
- `ADMIN_ADDRESSES`

## 3. Frontend Environment

Start from:

- `F:\Unstandardized_Products\FeedEngine\feed-engine\.env.example`

Set:

- `VITE_API_URL`
- `VITE_WS_URL`

Use the same backend origin style that is present in `FRONTEND_URL`. Do not mix `localhost` and `127.0.0.1` unless both are explicitly allowed.

## 4. Backend Deployment

```bash
cd F:\Unstandardized_Products\FeedEngine\feed-engine-backend
npm install
copy .env.example .env
npm run db:generate
npm run db:push
npm run build
npm run start
```

Checks:

- `GET /health` returns `status: ok`
- Redis health is connected
- contract addresses in `/api/chain/contracts` match the target deployment

## 5. Frontend Deployment

```bash
cd F:\Unstandardized_Products\FeedEngine\feed-engine
npm install
copy .env.example .env.local
npm run build
```

Deploy the generated `dist/` directory with your static hosting layer or reverse proxy.

## 6. Pre-Release Verification

Backend smoke:

```bash
cd F:\Unstandardized_Products\FeedEngine\feed-engine-backend
npm run smoke:mainflow
```

Browser realtime smoke:

```bash
cd F:\Unstandardized_Products\FeedEngine\feed-engine
npm run smoke:browser-realtime
```

Browser mainflow smoke:

```bash
cd F:\Unstandardized_Products\FeedEngine\feed-engine
npm run smoke:browser-mainflow
```

Release only if all three pass.

## 7. Final Launch Checklist

- PostgreSQL database migrated and reachable
- Redis connected
- Backend and frontend built from the current release branch
- All placeholder secrets replaced
- Wallet keys loaded from secure deployment storage
- BSC RPC endpoint reachable and rate limits confirmed
- `USDT_TOKEN_CONTRACT` matches the actual deployment token
- `FRONTEND_URL` matches the public frontend origin
- mainflow smoke passed against the target environment
- browser mainflow smoke passed against the target environment
