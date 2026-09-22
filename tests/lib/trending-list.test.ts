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
