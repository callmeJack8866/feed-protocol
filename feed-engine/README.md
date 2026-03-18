# Feed Engine Frontend

Frontend application for the Feed Engine oracle workflow.

## Stack

- React
- TypeScript
- Vite
- Socket.IO client
- ethers v6
- Playwright smoke scripts

## Local Setup

```bash
npm install
copy .env.example .env.local
npm run dev
```

Default local app URL: `http://127.0.0.1:5173`

## Environment Variables

Create `F:\Unstandardized_Products\FeedEngine\feed-engine\.env.local` with:

```env
VITE_API_URL=http://127.0.0.1:3001
VITE_WS_URL=http://127.0.0.1:3001
```

Use the same host style as the backend allowlist. If the backend is configured with `127.0.0.1`, do not switch the frontend to `localhost` unless both are present in `FRONTEND_URL`.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run smoke:browser-realtime
npm run smoke:browser-mainflow
```

## Smoke Verification

`npm run smoke:browser-realtime`

- verifies Dashboard refresh while the page stays open
- verifies Quest Hall receives WebSocket order updates without a list refetch

`npm run smoke:browser-mainflow`

- opens the app in a real browser
- injects login state
- grabs an order from Quest Hall
- enters FeedModal
- submits price
- completes commit / reveal / settlement
- verifies Dashboard values update

## Production Notes

- Deploy the built `dist/` output behind a static server or reverse proxy.
- `npm run preview` is only for local verification, not the production serving strategy.
- Keep `VITE_API_URL` and `VITE_WS_URL` pointed at the same backend origin unless you intentionally split HTTP and WebSocket routing.
- If browser smoke tests fail locally, confirm the backend is running and `FRONTEND_URL` includes the frontend origin.
