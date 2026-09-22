# Meme Coin Hype & Risk Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, read-only Next.js dashboard that tracks trending Solana meme coins and shows a risk score for each, built from on-chain data, social hype signals, and OSINT-style investigation of the deployer/project.

**Architecture:** A Vercel Cron job hits an API route every 5–15 minutes, pulling on-chain (Birdeye), social (LunarCrush), and OSINT (Helius RPC + WHOIS) data per tracked coin and writing an append-only snapshot row to Postgres via Prisma. The Next.js frontend reads the latest snapshots and history to render a trending list and per-coin detail pages. Risk scoring, spike detection, correlation, and cluster detection are all pure functions, unit-tested independently of any live API or database.

**Tech Stack:** Next.js (App Router, TypeScript), Prisma + Postgres (Supabase), Vitest, Vercel Cron, plain `fetch` for all external API clients (no heavy SDKs).

## Global Constraints

- Solana only — no other chains in v1 (spec: Non-goals)
- No wallet connection, trading, or order execution of any kind (spec: Non-goals)
- No user accounts or login (spec: Non-goals)
- No investigation of private individuals — only on-chain wallet addresses and project-published public accounts/domains (spec: Non-goals)
- Snapshots are append-only — never overwritten (spec: Ingestion cron)
- Every page carries a disclaimer: informational only, not financial advice, no data source guaranteed accurate (spec: Frontend)
- A single data-source failure for one coin/snapshot must not block other coins — log and skip, retry next cron run (spec: Error handling)
- Missing OSINT data renders as "unknown," never as a false-positive risk flag (spec: Error handling)
- Risk score is always shown with its full flag breakdown, never as a bare number (spec: Risk score)

---

## File Structure

```
memewatch/
  package.json
  tsconfig.json
  vitest.config.ts
  vercel.json
  .env.example
  prisma/
    schema.prisma
  src/
    lib/
      db.ts                    # Prisma client singleton
      risk-score.ts            # computeRiskScore (pure)
      hype-signals.ts          # detectSpike, socialPriceCorrelation (pure)
      clusters.ts              # detectClusters (pure)
      trending-list.ts         # formatTrendingList (pure, feeds home page)
      sources/
        birdeye.ts             # on-chain client + parser
        lunarcrush.ts          # social client + parser
        helius.ts              # deployer wallet history + clustering
        whois.ts               # domain age lookup
    app/
      layout.tsx                # root layout + disclaimer banner
      page.tsx                  # home page: trending list
      coin/[mintAddress]/page.tsx  # coin detail page
      api/
        cron/
          ingest/route.ts       # cron entrypoint, orchestrates ingestion
  tests/
    lib/
      risk-score.test.ts
      hype-signals.test.ts
      clusters.test.ts
      trending-list.test.ts
    lib/sources/
      birdeye.test.ts
      lunarcrush.test.ts
      helius.test.ts
      whois.test.ts
    app/
      cron-ingest.test.ts
    fixtures/
      birdeye-token.json
      lunarcrush-topic.json
      helius-transfers.json
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `vercel.json`, `.env.example`
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Produces: a working `npm test` and `npm run build` command every later task relies on.

- [ ] **Step 1: Scaffold the Next.js app**

```bash
npx create-next-app@latest . --typescript --app --eslint --no-tailwind --src-dir --import-alias "@/*" --use-npm
```

Answer "Yes" if prompted to use in the current (non-empty) directory.

- [ ] **Step 2: Install project dependencies**

```bash
npm install prisma @prisma/client whois-json
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 3: Add the Vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Add the test script to package.json**

Edit `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 5: Write a smoke test**

```typescript
// tests/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test suite, verify it passes**

Run: `npm test`
Expected: `tests/smoke.test.ts` passes, 1 test total.

- [ ] **Step 7: Add environment variable template**

```bash
# .env.example
DATABASE_URL="postgresql://user:password@host:5432/memewatch"
BIRDEYE_API_KEY=""
LUNARCRUSH_API_KEY=""
HELIUS_API_KEY=""
CRON_SECRET=""
```

- [ ] **Step 8: Add the Vercel Cron config**

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts vercel.json .env.example tests/smoke.test.ts src/app
git commit -m "chore: scaffold Next.js app with Vitest and Prisma"
```

---

### Task 2: Database schema

**Files:**
- Create: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Coin`, `Snapshot`, `OsintProfile` Prisma models, used by every ingestion and frontend task below.

- [ ] **Step 1: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and a `.env` (already covered by `.env.example`; don't commit `.env`).

- [ ] **Step 2: Write the schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Coin {
  id             String         @id @default(cuid())
  mintAddress    String         @unique
  symbol         String
  name           String
  deployerWallet String
  discoveredAt   DateTime       @default(now())
  trendingSince  DateTime       @default(now())
  websiteUrl     String?
  twitterHandle  String?
  snapshots      Snapshot[]
  osint          OsintProfile?

  @@index([trendingSince])
}

model Snapshot {
  id                    String   @id @default(cuid())
  coinId                String
  coin                  Coin     @relation(fields: [coinId], references: [id])
  takenAt               DateTime @default(now())
  priceUsd              Float
  liquidityUsd          Float
  liquidityLocked       Boolean
  mintAuthorityActive   Boolean
  freezeAuthorityActive Boolean
  top10HolderPct        Float
  socialVolume          Int
  socialSentiment       Float
  tradeVolume24h        Float

  @@index([coinId, takenAt])
}

model OsintProfile {
  id                    String   @id @default(cuid())
  coinId                String   @unique
  coin                  Coin     @relation(fields: [coinId], references: [id])
  deployerPriorLaunches Int
  deployerRugCount      Int
  walletClusterFlag     Boolean
  twitterAccountAgeDays Int?
  domainAgeDays         Int?
  refreshedAt           DateTime @default(now())
}
```

- [ ] **Step 3: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Generate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Add the Prisma client singleton**

```typescript
// src/lib/db.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/db.ts .gitignore
git commit -m "feat: add Prisma schema for coins, snapshots, and OSINT profiles"
```

---

### Task 3: Risk scoring engine

**Files:**
- Create: `src/lib/risk-score.ts`
- Test: `tests/lib/risk-score.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, plain inputs).
- Produces: `computeRiskScore(inputs: RiskInputs): RiskResult`, used by Task 9 (ingestion) and Task 11 (coin detail page).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/risk-score.test.ts
import { describe, it, expect } from 'vitest';
import { computeRiskScore, type RiskInputs } from '@/lib/risk-score';

const safeInputs: RiskInputs = {
  liquidityLocked: true,
  mintAuthorityActive: false,
  freezeAuthorityActive: false,
  top10HolderPct: 20,
  deployerRugCount: 0,
  walletClusterFlag: false,
  twitterAccountAgeDays: 400,
  domainAgeDays: 400,
};

describe('computeRiskScore', () => {
  it('scores a clean coin near 100', () => {
    const result = computeRiskScore(safeInputs);
    expect(result.score).toBe(100);
    expect(result.flags.every((f) => f.level !== 'red')).toBe(true);
  });

  it('penalizes unlocked liquidity as red', () => {
    const result = computeRiskScore({ ...safeInputs, liquidityLocked: false });
    expect(result.score).toBe(75);
    expect(result.flags.find((f) => f.label === 'Liquidity lock')?.level).toBe('red');
  });

  it('penalizes an active mint authority as red', () => {
    const result = computeRiskScore({ ...safeInputs, mintAuthorityActive: true });
    expect(result.score).toBe(80);
  });

  it('flags high holder concentration red, moderate as yellow', () => {
    const high = computeRiskScore({ ...safeInputs, top10HolderPct: 80 });
    const moderate = computeRiskScore({ ...safeInputs, top10HolderPct: 50 });
    expect(high.flags.find((f) => f.label === 'Holder concentration')?.level).toBe('red');
    expect(moderate.flags.find((f) => f.label === 'Holder concentration')?.level).toBe('yellow');
  });

  it('caps the rug-history deduction at 30 points', () => {
    const result = computeRiskScore({ ...safeInputs, deployerRugCount: 10 });
    expect(result.score).toBe(70);
  });

  it('flags unknown social/domain age as yellow, not red', () => {
    const result = computeRiskScore({
      ...safeInputs,
      twitterAccountAgeDays: null,
      domainAgeDays: null,
    });
    expect(result.flags.find((f) => f.label === 'Social account age')?.level).toBe('yellow');
    expect(result.flags.find((f) => f.label === 'Domain age')?.level).toBe('yellow');
  });

  it('never returns a score below 0', () => {
    const result = computeRiskScore({
      liquidityLocked: false,
      mintAuthorityActive: true,
      freezeAuthorityActive: true,
      top10HolderPct: 95,
      deployerRugCount: 10,
      walletClusterFlag: true,
      twitterAccountAgeDays: 1,
      domainAgeDays: 1,
    });
    expect(result.score).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test -- risk-score`
Expected: FAIL — `Cannot find module '@/lib/risk-score'`

- [ ] **Step 3: Implement the risk scoring function**

```typescript
// src/lib/risk-score.ts
export interface RiskInputs {
  liquidityLocked: boolean;
  mintAuthorityActive: boolean;
  freezeAuthorityActive: boolean;
  top10HolderPct: number;
  deployerRugCount: number;
  walletClusterFlag: boolean;
  twitterAccountAgeDays: number | null;
  domainAgeDays: number | null;
}

export type FlagLevel = 'green' | 'yellow' | 'red';

export interface RiskFlag {
  label: string;
  level: FlagLevel;
  detail: string;
}

export interface RiskResult {
  score: number;
  flags: RiskFlag[];
}

const YOUNG_ACCOUNT_DAYS = 7;

export function computeRiskScore(inputs: RiskInputs): RiskResult {
  const flags: RiskFlag[] = [];
  let deduction = 0;

  if (inputs.liquidityLocked) {
    flags.push({ label: 'Liquidity lock', level: 'green', detail: 'Liquidity is locked or burned' });
  } else {
    deduction += 25;
    flags.push({ label: 'Liquidity lock', level: 'red', detail: 'Liquidity is not locked — creator can withdraw it' });
  }

  if (inputs.mintAuthorityActive) {
    deduction += 20;
    flags.push({ label: 'Mint authority', level: 'red', detail: 'Creator can still mint new supply' });
  } else {
    flags.push({ label: 'Mint authority', level: 'green', detail: 'Mint authority renounced' });
  }

  if (inputs.freezeAuthorityActive) {
    deduction += 15;
    flags.push({ label: 'Freeze authority', level: 'red', detail: 'Creator can still freeze holder wallets' });
  } else {
    flags.push({ label: 'Freeze authority', level: 'green', detail: 'Freeze authority renounced' });
  }

  if (inputs.top10HolderPct > 70) {
    deduction += 20;
    flags.push({
      label: 'Holder concentration',
      level: 'red',
      detail: `Top 10 holders own ${inputs.top10HolderPct}% of supply`,
    });
  } else if (inputs.top10HolderPct > 40) {
    deduction += 10;
    flags.push({
      label: 'Holder concentration',
      level: 'yellow',
      detail: `Top 10 holders own ${inputs.top10HolderPct}% of supply`,
    });
  } else {
    flags.push({
      label: 'Holder concentration',
      level: 'green',
      detail: `Top 10 holders own ${inputs.top10HolderPct}% of supply`,
    });
  }

  if (inputs.deployerRugCount > 0) {
    deduction += Math.min(inputs.deployerRugCount * 15, 30);
    flags.push({
      label: 'Deployer history',
      level: 'red',
      detail: `Deployer wallet linked to ${inputs.deployerRugCount} prior rugged token(s)`,
    });
  } else {
    flags.push({ label: 'Deployer history', level: 'green', detail: 'No prior rugged tokens found for this deployer' });
  }

  if (inputs.walletClusterFlag) {
    deduction += 10;
    flags.push({
      label: 'Wallet clustering',
      level: 'red',
      detail: 'Multiple top holders trace back to the same funding wallet',
    });
  } else {
    flags.push({ label: 'Wallet clustering', level: 'green', detail: 'No shared funding source detected among top holders' });
  }

  flags.push(ageFlag('Social account age', inputs.twitterAccountAgeDays));
  flags.push(ageFlag('Domain age', inputs.domainAgeDays));
  if (inputs.twitterAccountAgeDays !== null && inputs.twitterAccountAgeDays < YOUNG_ACCOUNT_DAYS) deduction += 5;
  if (inputs.domainAgeDays !== null && inputs.domainAgeDays < YOUNG_ACCOUNT_DAYS) deduction += 5;

  const score = Math.max(0, Math.min(100, 100 - deduction));
  return { score, flags };
}

function ageFlag(label: string, ageDays: number | null): RiskFlag {
  if (ageDays === null) {
    return { label, level: 'yellow', detail: 'Not found — could not verify' };
  }
  if (ageDays < YOUNG_ACCOUNT_DAYS) {
    return { label, level: 'red', detail: `Only ${ageDays} day(s) old` };
  }
  return { label, level: 'green', detail: `${ageDays} day(s) old` };
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test -- risk-score`
Expected: PASS — 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/risk-score.ts tests/lib/risk-score.test.ts
git commit -m "feat: add risk scoring engine with flag breakdown"
```

---

### Task 4: Hype signal detection

**Files:**
- Create: `src/lib/hype-signals.ts`
- Test: `tests/lib/hype-signals.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions over plain snapshot arrays).
- Produces: `detectSpike(history: SnapshotPoint[]): SpikeResult` and `socialPriceCorrelation(history: SnapshotPoint[]): number | null`, used by Task 9 (ingestion, to flag spikes at write time) and Task 11 (coin detail page).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/hype-signals.test.ts
import { describe, it, expect } from 'vitest';
import { detectSpike, socialPriceCorrelation, type SnapshotPoint } from '@/lib/hype-signals';

function point(overrides: Partial<SnapshotPoint>): SnapshotPoint {
  return {
    takenAt: new Date(),
    socialVolume: 100,
    tradeVolume24h: 1000,
    priceUsd: 1,
    ...overrides,
  };
}

describe('detectSpike', () => {
  it('returns no spike with too little history', () => {
    const result = detectSpike([point({})]);
    expect(result).toEqual({ social: false, volume: false });
  });

  it('flags a social spike when volume exceeds 3x the trailing average', () => {
    const history = [
      point({ socialVolume: 100 }),
      point({ socialVolume: 100 }),
      point({ socialVolume: 100 }),
      point({ socialVolume: 100 }),
      point({ socialVolume: 100 }),
      point({ socialVolume: 100 }),
      point({ socialVolume: 400 }), // latest: 4x the trailing average of 100
    ];
    const result = detectSpike(history);
    expect(result.social).toBe(true);
  });

  it('does not flag a spike within normal range', () => {
    const history = Array.from({ length: 6 }, () => point({ socialVolume: 100 })).concat(
      point({ socialVolume: 150 })
    );
    const result = detectSpike(history);
    expect(result.social).toBe(false);
  });
});

describe('socialPriceCorrelation', () => {
  it('returns null with fewer than 20 snapshots', () => {
    const history = Array.from({ length: 19 }, (_, i) => point({ socialVolume: i, priceUsd: i }));
    expect(socialPriceCorrelation(history)).toBeNull();
  });

  it('returns close to 1 for perfectly correlated series', () => {
    const history = Array.from({ length: 25 }, (_, i) => point({ socialVolume: i, priceUsd: i * 2 }));
    const correlation = socialPriceCorrelation(history);
    expect(correlation).not.toBeNull();
    expect(correlation as number).toBeGreaterThan(0.99);
  });

  it('returns close to 0 for uncorrelated series', () => {
    const pattern = [1, 5, 2, 8, 3, 9, 1, 6, 4, 7];
    const history = Array.from({ length: 25 }, (_, i) =>
      point({ socialVolume: pattern[i % pattern.length], priceUsd: (i * 37) % 11 })
    );
    const correlation = socialPriceCorrelation(history);
    expect(correlation).not.toBeNull();
    expect(Math.abs(correlation as number)).toBeLessThan(0.4);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test -- hype-signals`
Expected: FAIL — `Cannot find module '@/lib/hype-signals'`

- [ ] **Step 3: Implement the hype signal functions**

```typescript
// src/lib/hype-signals.ts
export interface SnapshotPoint {
  takenAt: Date;
  socialVolume: number;
  tradeVolume24h: number;
  priceUsd: number;
}

export interface SpikeResult {
  social: boolean;
  volume: boolean;
}

const SPIKE_WINDOW = 6;
const SPIKE_MULTIPLIER = 3;
const MIN_CORRELATION_SAMPLES = 20;

export function detectSpike(history: SnapshotPoint[]): SpikeResult {
  if (history.length < SPIKE_WINDOW + 1) {
    return { social: false, volume: false };
  }

  const latest = history[history.length - 1];
  const window = history.slice(-SPIKE_WINDOW - 1, -1);

  const avgSocial = average(window.map((p) => p.socialVolume));
  const avgVolume = average(window.map((p) => p.tradeVolume24h));

  return {
    social: avgSocial > 0 && latest.socialVolume > avgSocial * SPIKE_MULTIPLIER,
    volume: avgVolume > 0 && latest.tradeVolume24h > avgVolume * SPIKE_MULTIPLIER,
  };
}

export function socialPriceCorrelation(history: SnapshotPoint[]): number | null {
  if (history.length < MIN_CORRELATION_SAMPLES) {
    return null;
  }

  const socialDeltas: number[] = [];
  const priceDeltas: number[] = [];
  for (let i = 1; i < history.length; i++) {
    socialDeltas.push(history[i].socialVolume - history[i - 1].socialVolume);
    priceDeltas.push(history[i].priceUsd - history[i - 1].priceUsd);
  }

  return pearsonCorrelation(socialDeltas, priceDeltas);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = average(a);
  const meanB = average(b);

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }

  const denominator = Math.sqrt(denomA * denomB);
  if (denominator === 0) return 0;
  return numerator / denominator;
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test -- hype-signals`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hype-signals.ts tests/lib/hype-signals.test.ts
git commit -m "feat: add spike detection and social/price correlation"
```

---

### Task 5: Meme-cluster detection

**Files:**
- Create: `src/lib/clusters.ts`
- Test: `tests/lib/clusters.test.ts`

**Interfaces:**
- Consumes: nothing (pure function).
- Produces: `detectClusters(entries: TrendingEntry[]): Cluster[]`, used by Task 10 (home page) to group coins trending together.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/clusters.test.ts
import { describe, it, expect } from 'vitest';
import { detectClusters, type TrendingEntry } from '@/lib/clusters';

function entry(coinId: string, minutesAgo: number): TrendingEntry {
  return { coinId, trendingSince: new Date(Date.now() - minutesAgo * 60_000) };
}

describe('detectClusters', () => {
  it('groups coins that started trending within the window', () => {
    const entries: TrendingEntry[] = [entry('a', 50), entry('b', 40), entry('c', 30)];
    const clusters = detectClusters(entries, 60 * 60_000);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].coinIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('splits coins into separate clusters when gaps exceed the window', () => {
    const entries: TrendingEntry[] = [entry('a', 200), entry('b', 190), entry('c', 10), entry('d', 5)];
    const clusters = detectClusters(entries, 60 * 60_000);
    expect(clusters).toHaveLength(2);
  });

  it('excludes single-coin groups — a cluster needs at least 2', () => {
    const entries: TrendingEntry[] = [entry('a', 500), entry('b', 10)];
    const clusters = detectClusters(entries, 60 * 60_000);
    expect(clusters).toHaveLength(0);
  });

  it('returns no clusters for an empty list', () => {
    expect(detectClusters([], 60 * 60_000)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test -- clusters`
Expected: FAIL — `Cannot find module '@/lib/clusters'`

- [ ] **Step 3: Implement cluster detection**

```typescript
// src/lib/clusters.ts
export interface TrendingEntry {
  coinId: string;
  trendingSince: Date;
}

export interface Cluster {
  coinIds: string[];
  windowStart: Date;
  windowEnd: Date;
}

export function detectClusters(entries: TrendingEntry[], windowMs: number): Cluster[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.trendingSince.getTime() - b.trendingSince.getTime());

  const groups: TrendingEntry[][] = [];
  let currentGroup: TrendingEntry[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].trendingSince.getTime() - sorted[i - 1].trendingSince.getTime();
    if (gap <= windowMs) {
      currentGroup.push(sorted[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  groups.push(currentGroup);

  return groups
    .filter((group) => group.length >= 2)
    .map((group) => ({
      coinIds: group.map((e) => e.coinId),
      windowStart: group[0].trendingSince,
      windowEnd: group[group.length - 1].trendingSince,
    }));
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test -- clusters`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clusters.ts tests/lib/clusters.test.ts
git commit -m "feat: add meme-cluster detection over trending timestamps"
```

---

### Task 6: On-chain data source (Birdeye)

**Files:**
- Create: `src/lib/sources/birdeye.ts`
- Create: `tests/fixtures/birdeye-token.json`
- Test: `tests/lib/sources/birdeye.test.ts`

**Interfaces:**
- Consumes: `BIRDEYE_API_KEY` env var.
- Produces: `parseBirdeyeToken(raw: unknown): OnChainData` and `fetchBirdeyeToken(mintAddress: string): Promise<OnChainData>`, used by Task 9 (ingestion).

- [ ] **Step 1: Add the fixture**

```json
// tests/fixtures/birdeye-token.json
{
  "data": {
    "address": "So11111111111111111111111111111111111111",
    "symbol": "TESTCOIN",
    "name": "Test Coin",
    "price": 0.00042,
    "liquidity": 15000.5,
    "v24hUSD": 82000,
    "mintAuthority": null,
    "freezeAuthority": "SomeAuthorityAddressXXXXXXXXXXXXXXXXXXXXX",
    "lpBurned": true,
    "top10HolderPercent": 34.2
  }
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/lib/sources/birdeye.test.ts
import { describe, it, expect } from 'vitest';
import { parseBirdeyeToken } from '@/lib/sources/birdeye';
import fixture from '../../fixtures/birdeye-token.json';

describe('parseBirdeyeToken', () => {
  it('parses a raw Birdeye response into OnChainData', () => {
    const result = parseBirdeyeToken(fixture);
    expect(result).toEqual({
      priceUsd: 0.00042,
      liquidityUsd: 15000.5,
      tradeVolume24h: 82000,
      liquidityLocked: true,
      mintAuthorityActive: false,
      freezeAuthorityActive: true,
      top10HolderPct: 34.2,
    });
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npm test -- birdeye`
Expected: FAIL — `Cannot find module '@/lib/sources/birdeye'`

- [ ] **Step 4: Implement the Birdeye client**

```typescript
// src/lib/sources/birdeye.ts
export interface OnChainData {
  priceUsd: number;
  liquidityUsd: number;
  tradeVolume24h: number;
  liquidityLocked: boolean;
  mintAuthorityActive: boolean;
  freezeAuthorityActive: boolean;
  top10HolderPct: number;
}

interface BirdeyeTokenResponse {
  data: {
    price: number;
    liquidity: number;
    v24hUSD: number;
    mintAuthority: string | null;
    freezeAuthority: string | null;
    lpBurned: boolean;
    top10HolderPercent: number;
  };
}

export function parseBirdeyeToken(raw: unknown): OnChainData {
  const response = raw as BirdeyeTokenResponse;
  const d = response.data;
  return {
    priceUsd: d.price,
    liquidityUsd: d.liquidity,
    tradeVolume24h: d.v24hUSD,
    liquidityLocked: d.lpBurned,
    mintAuthorityActive: d.mintAuthority !== null,
    freezeAuthorityActive: d.freezeAuthority !== null,
    top10HolderPct: d.top10HolderPercent,
  };
}

export async function fetchBirdeyeToken(mintAddress: string): Promise<OnChainData> {
  const res = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${mintAddress}`, {
    headers: {
      'X-API-KEY': process.env.BIRDEYE_API_KEY ?? '',
      'x-chain': 'solana',
    },
  });
  if (!res.ok) {
    throw new Error(`Birdeye request failed: ${res.status} ${res.statusText}`);
  }
  return parseBirdeyeToken(await res.json());
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm test -- birdeye`
Expected: PASS — 1 test passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sources/birdeye.ts tests/lib/sources/birdeye.test.ts tests/fixtures/birdeye-token.json
git commit -m "feat: add Birdeye on-chain data client"
```

**Note:** the fixture shape is a best-effort approximation of Birdeye's real response — confirm field names against Birdeye's live docs once an API key is obtained, and adjust `parseBirdeyeToken` and the fixture together if they differ.

---

### Task 7: Social data source (LunarCrush)

**Files:**
- Create: `src/lib/sources/lunarcrush.ts`
- Create: `tests/fixtures/lunarcrush-topic.json`
- Test: `tests/lib/sources/lunarcrush.test.ts`

**Interfaces:**
- Consumes: `LUNARCRUSH_API_KEY` env var.
- Produces: `parseLunarCrushTopic(raw: unknown): SocialData` and `fetchLunarCrushTopic(symbol: string): Promise<SocialData>`, used by Task 9 (ingestion).

- [ ] **Step 1: Add the fixture**

```json
// tests/fixtures/lunarcrush-topic.json
{
  "data": {
    "symbol": "TESTCOIN",
    "interactions_24h": 5400,
    "sentiment": 78,
    "trending": true
  }
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/lib/sources/lunarcrush.test.ts
import { describe, it, expect } from 'vitest';
import { parseLunarCrushTopic } from '@/lib/sources/lunarcrush';
import fixture from '../../fixtures/lunarcrush-topic.json';

describe('parseLunarCrushTopic', () => {
  it('parses a raw LunarCrush response into SocialData', () => {
    const result = parseLunarCrushTopic(fixture);
    expect(result).toEqual({
      socialVolume: 5400,
      socialSentiment: 78,
      isTrending: true,
    });
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npm test -- lunarcrush`
Expected: FAIL — `Cannot find module '@/lib/sources/lunarcrush'`

- [ ] **Step 4: Implement the LunarCrush client**

```typescript
// src/lib/sources/lunarcrush.ts
export interface SocialData {
  socialVolume: number;
  socialSentiment: number;
  isTrending: boolean;
}

interface LunarCrushResponse {
  data: {
    interactions_24h: number;
    sentiment: number;
    trending: boolean;
  };
}

export function parseLunarCrushTopic(raw: unknown): SocialData {
  const response = raw as LunarCrushResponse;
  const d = response.data;
  return {
    socialVolume: d.interactions_24h,
    socialSentiment: d.sentiment,
    isTrending: d.trending,
  };
}

export async function fetchLunarCrushTopic(symbol: string): Promise<SocialData> {
  const res = await fetch(`https://lunarcrush.com/api4/public/coins/${symbol}/v1`, {
    headers: { Authorization: `Bearer ${process.env.LUNARCRUSH_API_KEY ?? ''}` },
  });
  if (!res.ok) {
    throw new Error(`LunarCrush request failed: ${res.status} ${res.statusText}`);
  }
  return parseLunarCrushTopic(await res.json());
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm test -- lunarcrush`
Expected: PASS — 1 test passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sources/lunarcrush.ts tests/lib/sources/lunarcrush.test.ts tests/fixtures/lunarcrush-topic.json
git commit -m "feat: add LunarCrush social data client"
```

**Note:** confirm the real LunarCrush v4 response shape against their live docs once an API key is obtained, same caveat as Task 6.

---

### Task 8: OSINT enrichment (deployer history, clustering, domain age)

**Files:**
- Create: `src/lib/sources/helius.ts`, `src/lib/sources/whois.ts`
- Create: `tests/fixtures/helius-transfers.json`
- Test: `tests/lib/sources/helius.test.ts`, `tests/lib/sources/whois.test.ts`

**Interfaces:**
- Consumes: `HELIUS_API_KEY` env var; `whois-json` package.
- Produces: `analyzeDeployerHistory(mintAddress: string, deployerWallet: string): Promise<DeployerHistory>`, `detectWalletCluster(holderWallets: string[]): Promise<boolean>`, `lookupDomainAgeDays(domain: string): Promise<number | null>`. All used by Task 9 (ingestion).

- [ ] **Step 1: Add the Helius fixture**

```json
// tests/fixtures/helius-transfers.json
[
  { "source": "DeployerWalletXXXXXXXXXXXXXXXXXXXXXXXXXXX", "destination": "HolderWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "amount": 5000000 },
  { "source": "DeployerWalletXXXXXXXXXXXXXXXXXXXXXXXXXXX", "destination": "HolderWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBB", "amount": 3000000 },
  { "source": "SomeUnrelatedWalletYYYYYYYYYYYYYYYYYYYYYYY", "destination": "HolderWalletCCCCCCCCCCCCCCCCCCCCCCCCCCCC", "amount": 1000000 }
]
```

- [ ] **Step 2: Write the failing tests**

```typescript
// tests/lib/sources/helius.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectWalletCluster, parseDeployerHistory } from '@/lib/sources/helius';
import transfersFixture from '../../fixtures/helius-transfers.json';

describe('parseDeployerHistory', () => {
  it('counts prior launches and rugs from a list of token outcomes', () => {
    const result = parseDeployerHistory([
      { outcome: 'rugged' },
      { outcome: 'active' },
      { outcome: 'rugged' },
      { outcome: 'abandoned' },
    ]);
    expect(result).toEqual({ priorLaunches: 4, rugCount: 2 });
  });

  it('handles a deployer with no prior launches', () => {
    expect(parseDeployerHistory([])).toEqual({ priorLaunches: 0, rugCount: 0 });
  });
});

describe('detectWalletCluster', () => {
  it('flags true when two or more holders share a funding source', async () => {
    const fetchTransfers = vi.fn().mockResolvedValue(transfersFixture);
    const result = await detectWalletCluster(
      ['HolderWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'HolderWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'HolderWalletCCCCCCCCCCCCCCCCCCCCCCCCCCCC'],
      fetchTransfers
    );
    expect(result).toBe(true);
  });

  it('flags false when every holder has a distinct funding source', async () => {
    const distinctTransfers = [
      { source: 'WalletOneXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', destination: 'HolderWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAA', amount: 1 },
      { source: 'WalletTwoXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', destination: 'HolderWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBB', amount: 1 },
    ];
    const fetchTransfers = vi.fn().mockResolvedValue(distinctTransfers);
    const result = await detectWalletCluster(
      ['HolderWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'HolderWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBB'],
      fetchTransfers
    );
    expect(result).toBe(false);
  });
});
```

```typescript
// tests/lib/sources/whois.test.ts
import { describe, it, expect, vi } from 'vitest';
import { computeDomainAgeDays } from '@/lib/sources/whois';

describe('computeDomainAgeDays', () => {
  it('computes days since the creation date', () => {
    const created = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeDomainAgeDays(created)).toBe(10);
  });

  it('returns null for a missing creation date', () => {
    expect(computeDomainAgeDays(null)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests, verify they fail**

Run: `npm test -- helius whois`
Expected: FAIL — both modules not found.

- [ ] **Step 4: Implement the Helius client**

```typescript
// src/lib/sources/helius.ts
export interface DeployerHistory {
  priorLaunches: number;
  rugCount: number;
}

export interface TokenOutcome {
  outcome: 'rugged' | 'abandoned' | 'active';
}

export function parseDeployerHistory(outcomes: TokenOutcome[]): DeployerHistory {
  return {
    priorLaunches: outcomes.length,
    rugCount: outcomes.filter((o) => o.outcome === 'rugged').length,
  };
}

interface Transfer {
  source: string;
  destination: string;
  amount: number;
}

type FetchTransfersFn = (destinations: string[]) => Promise<Transfer[]>;

export async function detectWalletCluster(
  holderWallets: string[],
  fetchTransfers: FetchTransfersFn = defaultFetchTransfers
): Promise<boolean> {
  const transfers = await fetchTransfers(holderWallets);
  const sourceCounts = new Map<string, Set<string>>();

  for (const t of transfers) {
    if (!holderWallets.includes(t.destination)) continue;
    const destinations = sourceCounts.get(t.source) ?? new Set<string>();
    destinations.add(t.destination);
    sourceCounts.set(t.source, destinations);
  }

  for (const destinations of sourceCounts.values()) {
    if (destinations.size >= 2) return true;
  }
  return false;
}

async function defaultFetchTransfers(destinations: string[]): Promise<Transfer[]> {
  const res = await fetch(`https://api.helius.xyz/v0/addresses/batch-transfers?api-key=${process.env.HELIUS_API_KEY ?? ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses: destinations }),
  });
  if (!res.ok) {
    throw new Error(`Helius request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
```

- [ ] **Step 5: Implement the WHOIS client**

```typescript
// src/lib/sources/whois.ts
import whois from 'whois-json';

export function computeDomainAgeDays(creationDate: string | null): number | null {
  if (!creationDate) return null;
  const created = new Date(creationDate).getTime();
  const now = Date.now();
  return Math.floor((now - created) / (24 * 60 * 60 * 1000));
}

export async function lookupDomainAgeDays(domain: string): Promise<number | null> {
  try {
    const result = await whois(domain);
    const creationDate = (result as Record<string, unknown>).creationDate as string | undefined;
    return computeDomainAgeDays(creationDate ?? null);
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run the tests, verify they pass**

Run: `npm test -- helius whois`
Expected: PASS — 4 tests passing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sources/helius.ts src/lib/sources/whois.ts tests/lib/sources/helius.test.ts tests/lib/sources/whois.test.ts tests/fixtures/helius-transfers.json
git commit -m "feat: add OSINT enrichment — deployer history, wallet clustering, domain age"
```

**Note:** `detectWalletCluster`'s outcome classification (`parseDeployerHistory`'s rugged/abandoned/active) requires deriving outcomes from a deployer's other tokens' liquidity/price history per the spec — that derivation logic belongs in Task 9's orchestration, since it needs the same Birdeye client from Task 6 applied to each of the deployer's other mints.

---

### Task 9: Ingestion cron orchestration

**Files:**
- Create: `src/app/api/cron/ingest/route.ts`
- Test: `tests/app/cron-ingest.test.ts`

**Interfaces:**
- Consumes: `computeRiskScore` (Task 3), `detectSpike` (Task 4), `fetchBirdeyeToken` (Task 6), `fetchLunarCrushTopic` (Task 7), `detectWalletCluster`/`parseDeployerHistory` (Task 8), `lookupDomainAgeDays` (Task 8), `db` (Task 2).
- Produces: `POST /api/cron/ingest` — the endpoint Vercel Cron calls. Also exports `ingestCoin(coin, deps)` for direct testing without HTTP.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/cron-ingest.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ingestCoin, type IngestDeps } from '@/app/api/cron/ingest/route';

describe('ingestCoin', () => {
  it('writes a snapshot with data pulled from all three sources', async () => {
    const createSnapshot = vi.fn().mockResolvedValue(undefined);
    const deps: IngestDeps = {
      fetchOnChain: vi.fn().mockResolvedValue({
        priceUsd: 1,
        liquidityUsd: 5000,
        tradeVolume24h: 2000,
        liquidityLocked: true,
        mintAuthorityActive: false,
        freezeAuthorityActive: false,
        top10HolderPct: 25,
      }),
      fetchSocial: vi.fn().mockResolvedValue({ socialVolume: 300, socialSentiment: 60, isTrending: true }),
      createSnapshot,
    };

    await ingestCoin({ id: 'coin-1', mintAddress: 'Mint111', symbol: 'TST' }, deps);

    expect(createSnapshot).toHaveBeenCalledWith({
      coinId: 'coin-1',
      priceUsd: 1,
      liquidityUsd: 5000,
      tradeVolume24h: 2000,
      liquidityLocked: true,
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      top10HolderPct: 25,
      socialVolume: 300,
      socialSentiment: 60,
    });
  });

  it('skips the coin without throwing when a source fails', async () => {
    const createSnapshot = vi.fn();
    const deps: IngestDeps = {
      fetchOnChain: vi.fn().mockRejectedValue(new Error('Birdeye down')),
      fetchSocial: vi.fn().mockResolvedValue({ socialVolume: 300, socialSentiment: 60, isTrending: true }),
      createSnapshot,
    };

    await expect(ingestCoin({ id: 'coin-1', mintAddress: 'Mint111', symbol: 'TST' }, deps)).resolves.toBeUndefined();
    expect(createSnapshot).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- cron-ingest`
Expected: FAIL — `Cannot find module '@/app/api/cron/ingest/route'`

- [ ] **Step 3: Implement the ingestion route**

```typescript
// src/app/api/cron/ingest/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fetchBirdeyeToken, type OnChainData } from '@/lib/sources/birdeye';
import { fetchLunarCrushTopic, type SocialData } from '@/lib/sources/lunarcrush';

export interface CoinRef {
  id: string;
  mintAddress: string;
  symbol: string;
}

export interface IngestDeps {
  fetchOnChain: (mintAddress: string) => Promise<OnChainData>;
  fetchSocial: (symbol: string) => Promise<SocialData>;
  createSnapshot: (data: {
    coinId: string;
    priceUsd: number;
    liquidityUsd: number;
    tradeVolume24h: number;
    liquidityLocked: boolean;
    mintAuthorityActive: boolean;
    freezeAuthorityActive: boolean;
    top10HolderPct: number;
    socialVolume: number;
    socialSentiment: number;
  }) => Promise<void>;
}

const liveDeps: IngestDeps = {
  fetchOnChain: fetchBirdeyeToken,
  fetchSocial: fetchLunarCrushTopic,
  createSnapshot: async (data) => {
    await db.snapshot.create({ data });
  },
};

export async function ingestCoin(coin: CoinRef, deps: IngestDeps): Promise<void> {
  let onChain: OnChainData;
  let social: SocialData;
  try {
    [onChain, social] = await Promise.all([
      deps.fetchOnChain(coin.mintAddress),
      deps.fetchSocial(coin.symbol),
    ]);
  } catch (err) {
    console.error(`Skipping snapshot for ${coin.symbol}:`, err);
    return;
  }

  await deps.createSnapshot({
    coinId: coin.id,
    priceUsd: onChain.priceUsd,
    liquidityUsd: onChain.liquidityUsd,
    tradeVolume24h: onChain.tradeVolume24h,
    liquidityLocked: onChain.liquidityLocked,
    mintAuthorityActive: onChain.mintAuthorityActive,
    freezeAuthorityActive: onChain.freezeAuthorityActive,
    top10HolderPct: onChain.top10HolderPct,
    socialVolume: social.socialVolume,
    socialSentiment: social.socialSentiment,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const coins = await db.coin.findMany({ select: { id: true, mintAddress: true, symbol: true } });
  await Promise.all(coins.map((coin) => ingestCoin(coin, liveDeps)));

  return NextResponse.json({ ingested: coins.length });
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- cron-ingest`
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/ingest/route.ts tests/app/cron-ingest.test.ts
git commit -m "feat: add cron ingestion route orchestrating on-chain and social snapshots"
```

**Note:** coin discovery (finding newly trending mints to add to the `Coin` table) and the daily OSINT refresh (Task 8's functions) are deliberately left out of this route to keep the task testable in isolation — add them as a follow-up task once this vertical slice is confirmed working end-to-end against real API keys, since both depend on de-duplication logic best designed against real Birdeye discovery-endpoint output.

---

### Task 10: Home page — trending list

**Files:**
- Create: `src/lib/trending-list.ts`
- Create: `src/app/page.tsx`
- Test: `tests/lib/trending-list.test.ts`

**Interfaces:**
- Consumes: `detectClusters` (Task 5).
- Produces: `formatTrendingList(coins: CoinWithLatestSnapshot[]): TrendingListItem[]`, rendered by `src/app/page.tsx`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/trending-list.test.ts
import { describe, it, expect } from 'vitest';
import { formatTrendingList, type CoinWithLatestSnapshot } from '@/lib/trending-list';

function coin(overrides: Partial<CoinWithLatestSnapshot>): CoinWithLatestSnapshot {
  return {
    id: 'coin-1',
    symbol: 'TST',
    name: 'Test Coin',
    mintAddress: 'Mint111',
    trendingSince: new Date(),
    latestSnapshot: {
      socialVolume: 100,
      tradeVolume24h: 1000,
      priceUsd: 1,
      riskScore: 80,
    },
    ...overrides,
  };
}

describe('formatTrendingList', () => {
  it('sorts coins by risk score ascending (riskiest first)', () => {
    const coins = [coin({ id: 'a', latestSnapshot: { socialVolume: 1, tradeVolume24h: 1, priceUsd: 1, riskScore: 90 } }), coin({ id: 'b', latestSnapshot: { socialVolume: 1, tradeVolume24h: 1, priceUsd: 1, riskScore: 40 } })];
    const result = formatTrendingList(coins);
    expect(result.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('assigns cluster labels to coins trending together', () => {
    const now = Date.now();
    const coins = [
      coin({ id: 'a', trendingSince: new Date(now - 5 * 60_000) }),
      coin({ id: 'b', trendingSince: new Date(now - 3 * 60_000) }),
    ];
    const result = formatTrendingList(coins);
    expect(result[0].clusterId).not.toBeNull();
    expect(result[0].clusterId).toBe(result[1].clusterId);
  });
}); 
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- trending-list`
Expected: FAIL — `Cannot find module '@/lib/trending-list'`

- [ ] **Step 3: Implement the formatting function**

```typescript
// src/lib/trending-list.ts
import { detectClusters } from '@/lib/clusters';

export interface CoinWithLatestSnapshot {
  id: string;
  symbol: string;
  name: string;
  mintAddress: string;
  trendingSince: Date;
  latestSnapshot: {
    socialVolume: number;
    tradeVolume24h: number;
    priceUsd: number;
    riskScore: number;
  };
}

export interface TrendingListItem extends CoinWithLatestSnapshot {
  clusterId: number | null;
}

const CLUSTER_WINDOW_MS = 60 * 60_000;

export function formatTrendingList(coins: CoinWithLatestSnapshot[]): TrendingListItem[] {
  const clusters = detectClusters(
    coins.map((c) => ({ coinId: c.id, trendingSince: c.trendingSince })),
    CLUSTER_WINDOW_MS
  );

  const clusterByCoinId = new Map<string, number>();
  clusters.forEach((cluster, index) => {
    cluster.coinIds.forEach((coinId) => clusterByCoinId.set(coinId, index));
  });

  return [...coins]
    .sort((a, b) => a.latestSnapshot.riskScore - b.latestSnapshot.riskScore)
    .map((c) => ({ ...c, clusterId: clusterByCoinId.get(c.id) ?? null }));
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- trending-list`
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Build the home page**

```tsx
// src/app/page.tsx
import Link from 'next/link';
import { db } from '@/lib/db';
import { computeRiskScore } from '@/lib/risk-score';
import { formatTrendingList, type CoinWithLatestSnapshot } from '@/lib/trending-list';

export const revalidate = 60;

async function getTrendingCoins(): Promise<CoinWithLatestSnapshot[]> {
  const coins = await db.coin.findMany({
    include: {
      snapshots: { orderBy: { takenAt: 'desc' }, take: 1 },
      osint: true,
    },
  });

  return coins
    .filter((c) => c.snapshots.length > 0)
    .map((c) => {
      const snap = c.snapshots[0];
      const { score } = computeRiskScore({
        liquidityLocked: snap.liquidityLocked,
        mintAuthorityActive: snap.mintAuthorityActive,
        freezeAuthorityActive: snap.freezeAuthorityActive,
        top10HolderPct: snap.top10HolderPct,
        deployerRugCount: c.osint?.deployerRugCount ?? 0,
        walletClusterFlag: c.osint?.walletClusterFlag ?? false,
        twitterAccountAgeDays: c.osint?.twitterAccountAgeDays ?? null,
        domainAgeDays: c.osint?.domainAgeDays ?? null,
      });
      return {
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        mintAddress: c.mintAddress,
        trendingSince: c.trendingSince,
        latestSnapshot: {
          socialVolume: snap.socialVolume,
          tradeVolume24h: snap.tradeVolume24h,
          priceUsd: snap.priceUsd,
          riskScore: score,
        },
      };
    });
}

export default async function HomePage() {
  const coins = await getTrendingCoins();
  const list = formatTrendingList(coins);

  return (
    <main>
      <h1>Trending Solana meme coins</h1>
      <ul>
        {list.map((coin) => (
          <li key={coin.id}>
            <Link href={`/coin/${coin.mintAddress}`}>
              {coin.symbol} — risk score {coin.latestSnapshot.riskScore}
              {coin.clusterId !== null ? ` (cluster #${coin.clusterId})` : ''}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/trending-list.ts src/app/page.tsx tests/lib/trending-list.test.ts
git commit -m "feat: add home page trending list with risk scores and clusters"
```

---

### Task 11: Coin detail page and disclaimer layout

**Files:**
- Create: `src/app/coin/[mintAddress]/page.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `computeRiskScore` (Task 3), `socialPriceCorrelation` (Task 4), `db` (Task 2).
- Produces: the `/coin/[mintAddress]` route; no further tasks depend on this one.

- [ ] **Step 1: Add the disclaimer to the root layout**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'memewatch',
  description: 'Trending Solana meme coin hype & risk scanner',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <strong>memewatch</strong> — informational only, not financial advice. Data
          sources are best-effort and not guaranteed accurate or complete.
        </header>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Build the coin detail page**

```tsx
// src/app/coin/[mintAddress]/page.tsx
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { computeRiskScore } from '@/lib/risk-score';
import { socialPriceCorrelation, type SnapshotPoint } from '@/lib/hype-signals';

export const revalidate = 60;

export default async function CoinDetailPage({ params }: { params: { mintAddress: string } }) {
  const coin = await db.coin.findUnique({
    where: { mintAddress: params.mintAddress },
    include: { snapshots: { orderBy: { takenAt: 'asc' } }, osint: true },
  });

  if (!coin || coin.snapshots.length === 0) {
    notFound();
  }

  const latest = coin.snapshots[coin.snapshots.length - 1];
  const { score, flags } = computeRiskScore({
    liquidityLocked: latest.liquidityLocked,
    mintAuthorityActive: latest.mintAuthorityActive,
    freezeAuthorityActive: latest.freezeAuthorityActive,
    top10HolderPct: latest.top10HolderPct,
    deployerRugCount: coin.osint?.deployerRugCount ?? 0,
    walletClusterFlag: coin.osint?.walletClusterFlag ?? false,
    twitterAccountAgeDays: coin.osint?.twitterAccountAgeDays ?? null,
    domainAgeDays: coin.osint?.domainAgeDays ?? null,
  });

  const history: SnapshotPoint[] = coin.snapshots.map((s) => ({
    takenAt: s.takenAt,
    socialVolume: s.socialVolume,
    tradeVolume24h: s.tradeVolume24h,
    priceUsd: s.priceUsd,
  }));
  const correlation = socialPriceCorrelation(history);

  return (
    <main>
      <h1>
        {coin.name} ({coin.symbol})
      </h1>
      <p>Risk score: {score} / 100</p>
      <ul>
        {flags.map((flag) => (
          <li key={flag.label}>
            [{flag.level}] {flag.label}: {flag.detail}
          </li>
        ))}
      </ul>

      <h2>Hype vs. price</h2>
      <p>
        {correlation === null
          ? 'Not enough history yet to tell if hype predicts price movement.'
          : `Social/price correlation: ${correlation.toFixed(2)} (${
              Math.abs(correlation) > 0.5 ? 'hype tracks price' : 'no clear relationship'
            })`}
      </p>

      <h2>Price/social history</h2>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Price</th>
            <th>Social volume</th>
          </tr>
        </thead>
        <tbody>
          {coin.snapshots.map((s) => (
            <tr key={s.id}>
              <td>{s.takenAt.toISOString()}</td>
              <td>{s.priceUsd}</td>
              <td>{s.socialVolume}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 3: Verify the project builds**

Run: `npm run build`
Expected: Build succeeds with no type errors. (A live `DATABASE_URL` is not required for `next build` to type-check and compile server components — it's only needed at request time.)

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx "src/app/coin/[mintAddress]/page.tsx"
git commit -m "feat: add coin detail page with risk breakdown and hype history"
```

---

### Task 12: Deployment wiring

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: documented deployment steps — final task, nothing depends on it.

- [ ] **Step 1: Document required environment variables and deployment steps in the README**

Add to `README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document local setup and deployment steps"
```

- [ ] **Step 3: Push the branch**

```bash
git push
```
