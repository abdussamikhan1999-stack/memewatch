# Meme Coin Hype & Risk Scanner — Design

Date: 2026-09-22
Status: Approved for planning

## Problem

Meme coins on Solana launch and trend within minutes, driven by a mix of
on-chain trading activity and social media buzz. There's no single public
tool that combines *what's trending right now* with *how risky it looks*
and *who's actually behind it* — traders have to manually cross-reference
a DEX screener, a social-sentiment tool, and a block explorer.

## Goal

A public, read-only web dashboard that surfaces trending Solana meme coins
and, for each one, a risk assessment built from on-chain data, social
signals, and OSINT-style investigation of the deployer/project — sourced
entirely from public data, no wallet connection or trading required.

## Non-goals (out of scope for v1)

- No wallet connection, trading, or order execution of any kind
- No user accounts or login
- No coverage of chains other than Solana
- No investigation of private individuals — only on-chain wallet addresses
  and project-published public accounts/domains

## Architecture

```
                    ┌─────────────────────┐
                    │   Ingestion cron     │  (every 5–15 min)
                    │  (Vercel Cron job)   │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌───────────────┐    ┌──────────────────┐   ┌──────────────────┐
│ On-chain data  │    │  Social data     │   │  OSINT enrichment │
│ Birdeye /      │    │  LunarCrush API  │   │  Helius RPC,      │
│ DexScreener API│    │                  │   │  WHOIS API        │
└───────┬────────┘    └─────────┬────────┘   └─────────┬────────┘
        └──────────────┬────────┴──────────────────────┘
                        ▼
              ┌───────────────────┐
              │  Postgres (Supabase)│  snapshots + derived scores
              └─────────┬─────────┘
                        ▼
              ┌───────────────────┐
              │  Next.js app       │  dashboard + coin detail pages
              │  (Vercel)          │
              └───────────────────┘
```

## Components

### 1. Ingestion cron

A scheduled job (Vercel Cron) runs every 5–15 minutes. For each active
coin being tracked (see "coin discovery" below), it pulls fresh data from
the three sources below and writes a timestamped snapshot row to
Postgres. Snapshots are append-only — history is never overwritten, since
the hype timeline depends on it.

**Coin discovery:** each run also queries Birdeye/DexScreener for newly
launched or currently-trending Solana tokens and adds any not already
tracked to the coin table.

### 2. On-chain data (Birdeye / DexScreener)

Per coin, per snapshot: price, trade volume, liquidity pool size,
liquidity-lock/burn status, mint authority status, freeze authority
status, top-10 holder concentration (% of supply).

### 3. Social data (LunarCrush)

Per coin, per snapshot: social volume (mention count), sentiment score,
whether the coin's associated topic is currently trending on LunarCrush's
own trending list.

### 4. OSINT enrichment (Helius RPC + WHOIS)

Computed less frequently than price/social snapshots (on coin discovery,
then refreshed daily), since this data changes slowly:

- **Deployer wallet history** — every other SPL token this wallet has
  deployed, and each one's outcome, inferred from liquidity/price history
  (rugged = liquidity pulled to near-zero shortly after launch, abandoned
  = no activity for 30+ days, active = still trading).
- **Wallet clustering** — trace the funding transactions that funded the
  top-10 holder wallets; flag if multiple top holders were funded from
  the same source wallet (i.e., the deployer secretly controls "distinct"
  holders).
- **Social account signals** — creation date of the project's linked X/
  Telegram account (pulled from LunarCrush's coin metadata where
  available), flagged if under 7 days old at coin discovery time.
- **Domain age** — WHOIS registration date of the project's website (if
  one is linked in on-chain/social metadata), flagged if registered
  within 7 days of the coin's launch.

### 5. Risk score

A composite score (0–100, lower = riskier) computed from the signals
above, always displayed with its full breakdown — never just a bare
number, since the "why" is the actual value to a user deciding whether to
trust a coin. Each contributing factor is shown as a labeled flag
(green/yellow/red) with the underlying value (e.g. "Top 10 holders: 78%
of supply — red").

### 6. Hype tracking

- **Per-coin timeline** — chart of social volume and price over the
  coin's tracked history.
- **Spike alerts** — flagged on the coin detail page when a snapshot's
  social volume or trade volume exceeds its trailing rolling average
  (e.g. last 6 snapshots) by a fixed multiplier (starting threshold:
  3x — tunable once real data is flowing).
- **Meme-cluster detection** — coins that entered "trending" status
  within the same rolling time window (e.g. 1 hour) are grouped and
  shown together as a cluster, surfacing sector-wide hype waves.
- **Social-vs-price correlation** — per coin, a simple rolling
  correlation coefficient between social-volume deltas and price deltas
  across its snapshot history, shown as a "hype actually moves price:
  yes/no/unclear" indicator once enough history exists (minimum ~20
  snapshots).

### 7. Frontend (Next.js on Vercel)

- **Home page** — live list of trending coins, sortable by hype score /
  risk score / recency, with meme-cluster groupings surfaced at the top.
- **Coin detail page** — risk score breakdown, OSINT panel, hype
  timeline chart, cluster membership.
- Disclaimer footer/banner on every page: informational only, not
  financial advice, no data source is guaranteed accurate or complete.

## Data flow summary

1. Cron wakes up → discovers new trending coins, refreshes tracked list
2. For each tracked coin → pull on-chain + social snapshot, write to DB
3. Daily → refresh OSINT signals for coins discovered that day or with
   stale (>24h) OSINT data
4. Frontend reads latest snapshot + history per coin from DB on request
   (server-rendered / ISR — no need for a live websocket in v1)

## Error handling

- Any single data-source failure for a given coin/snapshot should not
  block snapshots for other coins — log and skip, retry next cron run.
- Missing OSINT data (e.g. no linked website) renders as "unknown" for
  that signal, not as a false-positive risk flag.
- Rate-limit backoff on all three external APIs, since free tiers are the
  starting point.

## Testing

- Unit tests for the risk-scoring function: given a fixed set of input
  signals, assert the correct score and flag breakdown.
- Unit tests for spike-detection and correlation math against known
  synthetic snapshot sequences.
- Integration test for the ingestion cron's parsing of each API's
  response shape (using recorded fixture responses, not live API calls).

## Open questions for later (not blocking v1 build)

- Exact free-tier rate limits for Birdeye/DexScreener/LunarCrush/Helius
  may force lower polling frequency or a smaller tracked-coin cap —
  confirm once API keys are in hand.
- Whether to add a public API/RSS feed for the trending list once the
  dashboard itself is working.
