# memewatch

A public, read-only dashboard for trending Solana meme coins — combining
on-chain data, social hype signals, and OSINT-style investigation of the
deployer/project into one risk assessment per coin.

Informational only. Not financial advice. No wallet connection, no
trading.

See [`docs/superpowers/specs/2026-09-22-memecoin-risk-scanner-design.md`](docs/superpowers/specs/2026-09-22-memecoin-risk-scanner-design.md)
for the full design.

## Running locally

1. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — a Postgres connection string (Supabase free tier works)
   - `BIRDEYE_API_KEY`, `LUNARCRUSH_API_KEY`, `HELIUS_API_KEY` — free-tier keys from each service
   - `CRON_SECRET` — any random string; the cron route checks this as a bearer token
2. `npx prisma migrate dev --name init` — creates the database tables
3. `npm run dev` — starts the app at http://localhost:3000
4. `npm test` — runs the unit test suite (no live API keys or database required)

## Deploying

Deploy to Vercel and set the same environment variables in the project settings.
`vercel.json` already schedules `/api/cron/ingest` to run every 10 minutes; Vercel
sends the `CRON_SECRET` automatically as a bearer token when it calls scheduled routes.
