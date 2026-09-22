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
